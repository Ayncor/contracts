## core-service (v1) domain model

This service owns **channels**, **threads**, **messages**, **reactions**, **participants**, **user-state**, **inbox**, and the **thread lifecycle state machine**.

### API and org scoping

The API uses **JWT-based org scoping**: there is no `orgId` path parameter. The validated JWT supplies `org_id`, `user_id`, and optionally `membership_id`. All endpoints (except health) require `Authorization: Bearer <access_token>`. Paths are unscoped by org in the URL, e.g. `GET /channels`, `GET /inbox`, `GET /threads/channel/:channelId`, `GET /threads/:threadId/user-state`. See OpenAPI spec for the full surface.

### Global invariants

- **Tenant isolation**: all records include `org_id`.
- **Threads are first-class**: a thread exists independently of its messages; a message must belong to exactly one thread.
- **Async-first defaults**:
  - creating a message does **not** imply notifying everyone immediately.
  - “latest reply wins” ordering is **not** the default UI contract; the system provides an explicit **inbox/review queue**.
- **Messages are immutable**:
  - edits create a new `MessageVersion`.
  - deletes are soft deletes.
- **Lifecycle is explicit**: thread state changes happen via commands, not inference.

---

## Entities

### Channel

**Purpose**: container for threads; not a chat room.

**Fields**

- `id` (uuid, pk)
- `org_id` (uuid, required)
- `name` (string, required, 2..120)
- `slug` (string, required, 2..60, pattern `[a-z0-9-]+`) — unique per org, used in URLs
- `visibility` (enum: `ORG` | `PRIVATE`, required)
- `created_by` (uuid, required) — user id
- `created_at` (timestamp, required)
- `updated_at` (timestamp, required)
- `archived_at` (timestamp, nullable)

**Constraints**

- Unique `(org_id, slug)` among non-archived channels.

---

### Thread

**Purpose**: async conversation unit with a purpose, participants, and a lifecycle.

**Fields**

- `id` (uuid, pk)
- `org_id` (uuid, required)
- `channel_id` (uuid, required)
- `title` (string, required, 1..140)
- `purpose` (string, nullable, 0..1000) — the “why” of the thread
- `state` (enum: `OPEN` | `BLOCKED` | `DECIDED` | `ARCHIVED`, required)
- `created_by` (uuid, required)
- `created_at` (timestamp, required)
- `updated_at` (timestamp, required)
- `last_activity_at` (timestamp, required) — last event time in this thread (used for context, not “bubble to top”)
- `archived_at` (timestamp, nullable)

**Constraints**

- `state=ARCHIVED` implies `archived_at` set.
- `last_activity_at` updates on message/reaction/state-change events (append-only history still preserved elsewhere).

---

### ThreadParticipant

**Purpose**: explicit participant set; supports “channel as container” while preserving async intent.

**Fields**

- `id` (uuid, pk)
- `org_id` (uuid, required)
- `thread_id` (uuid, required)
- `user_id` (uuid, required)
- `role` (enum: `OWNER` | `PARTICIPANT` | `OBSERVER`, required)
- `joined_at` (timestamp, required)
- `left_at` (timestamp, nullable)
- `muted_until` (timestamp, nullable)

**Constraints**

- Unique `(org_id, thread_id, user_id)` for participants with `left_at IS NULL`.

**API**

- `POST /threads/:threadId/participants` — add participant (body: `user_id`, optional `role`). Creates ThreadUserState when missing.
- `GET /threads/:threadId/participants` — list participants (active only, by default).
- `PATCH /threads/:threadId/participants/:userId` — update role or `muted_until`.
- `DELETE /threads/:threadId/participants/:userId` — remove participant.

**Notes**

- Membership in org is a prerequisite (enforced at API boundary).

---

### Message

**Purpose**: immutable message record; content lives in `MessageVersion`.

**Fields**

- `id` (uuid, pk)
- `org_id` (uuid, required)
- `thread_id` (uuid, required)
- `author_id` (uuid, required)
- `created_at` (timestamp, required)
- `kind` (enum: `TEXT` | `SYSTEM`, required)
- `urgency` (enum: `NORMAL` | `URGENT`, required, default `NORMAL`)
- `requires_response` (bool, required, default `false`)
- `reply_to_message_id` (uuid, nullable) — for quoting/reply semantics (optional v1)
- `metadata_json` (json, required, default `{}`) — extensibility (no secrets)
- `deleted_at` (timestamp, nullable)
- `deleted_by` (uuid, nullable)

**Constraints**

- Append-only for `Message` rows; edits do not update `Message`.
- `kind=SYSTEM` messages must be authored by `author_id` representing a system user/service principal (implementation detail) but are still auditable.

**API (messages)**

- `POST /messages` — create message (body: `thread_id`, `body`, optional `kind`, `urgency`, `requires_response`, `reply_to_message_id`, `metadata_json`). Creates version 1.
- `GET /messages/thread/:threadId` — list messages in thread with latest version.
- `POST /messages/:messageId/versions` — create new version (body: `body`, optional `format`). Version increments 1,2,3…
- `GET /messages/:messageId/versions` — list versions (oldest first).

---

### MessageVersion

**Purpose**: immutable versions of message content.

**Fields**

- `id` (uuid, pk)
- `org_id` (uuid, required)
- `message_id` (uuid, required)
- `version` (int, required, starts at 1)
- `body` (string, required, 0..20000)
- `format` (enum: `PLAIN` | `MARKDOWN`, required, default `MARKDOWN`)
- `created_at` (timestamp, required)
- `created_by` (uuid, required)

**Constraints**

- Unique `(org_id, message_id, version)`.
- New versions increment `version` by 1; old versions remain readable for audit/history.

---

### Reaction

**Purpose**: lightweight feedback, not a notification trigger.

**Fields**

- `id` (uuid, pk)
- `org_id` (uuid, required)
- `message_id` (uuid, required)
- `user_id` (uuid, required)
- `emoji` (string, required, 1..64) — canonical form (e.g. `:+1:`) or unicode
- `created_at` (timestamp, required)
- `removed_at` (timestamp, nullable) — soft-remove for toggle semantics

**Constraints**

- Unique `(org_id, message_id, user_id, emoji)` to prevent duplicates. Toggle adds or sets `removed_at`.

**API**

- `POST /reactions` — toggle (body: `message_id`, `emoji`). Returns `action: added | removed` and reaction.
- `GET /reactions/message/:messageId` — list reactions on message.

---

## Thread workflow (async review queue)

To prevent “latest reply wins”, the system provides an explicit per-user thread workflow state.

### ThreadUserState

**Purpose**: per-user workflow metadata for a thread (review, snooze, needs response).

**Fields**

- `id` (uuid, pk)
- `org_id` (uuid, required)
- `thread_id` (uuid, required)
- `user_id` (uuid, required)
- `status` (enum: `IN_INBOX` | `ARCHIVED` | `SNOOZED`, required, default `IN_INBOX`)
- `needs_response` (bool, required, default `false`) — set by user or by explicit `requires_response` messages directed at them
- `snoozed_until` (timestamp, nullable)
- `last_read_message_id` (uuid, nullable)
- `last_reviewed_at` (timestamp, nullable)
- `priority_override` (enum: `NONE` | `LOW` | `HIGH`, required, default `NONE`) — user-controlled, not automatic
- `created_at` (timestamp, required)
- `updated_at` (timestamp, required)

**Constraints**

- Unique `(org_id, thread_id, user_id)`.
- If `status=SNOOZED`, `snoozed_until` must be set (API returns 400 if missing).

**API**

- `GET /threads/:threadId/user-state` — get-or-create current user’s state for the thread.
- `PATCH /threads/:threadId/user-state` — update status, needs_response, snoozed_until, last_read_message_id, last_reviewed_at, priority_override. When `status=SNOOZED`, `snoozed_until` is required.

### Inbox view (query contract)

`GET /inbox` (org and user from JWT) returns **InboxItem** entries: a flat list of threads where the current user has `ThreadUserState.status = IN_INBOX`. Each item includes:

- `thread_id`, `thread_title`, `thread_purpose`, `thread_state`, `thread_last_activity_at`
- `user_status`, `needs_response`, `has_urgent_unread`, `unread_count`, `latest_message_preview`
- `next_action` (enum: `REVIEW` | `RESPOND` | `WAIT` | `NONE`)
- `priority_override`, `sort_key` (opaque, for stable ordering)

Query params: `limit` (default 50, max 100), `cursor` (for future cursor-based paging). Ordering: `priority_override` (HIGH before NONE/LOW), `needs_response` desc, `last_activity_at` desc. The ordering is **not** “latest message time desc”.

---

## Thread state machine (v1)

### States

- `OPEN`: active discussion
- `BLOCKED`: awaiting an external dependency; intent is “don’t churn”
- `DECIDED`: decision reached; discussion may continue but defaults to lower priority
- `ARCHIVED`: closed; immutable except for admin restore (optional later)

### Transition rules

- Transitions are performed via a **command** containing:
  - `from_state`, `to_state`
  - `reason` (string, required, 1..500)
  - `actor_user_id`
  - `occurred_at`
- Allowed transitions (v1):
  - `OPEN -> BLOCKED | DECIDED | ARCHIVED`
  - `BLOCKED -> OPEN | DECIDED | ARCHIVED`
  - `DECIDED -> ARCHIVED` (re-open is a later feature; keep path open)

