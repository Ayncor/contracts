## core-service (v1) domain model

This service owns **channels**, **threads**, **messages**, **reactions**, and the **thread lifecycle state machine**.

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
- `name` (string, required, 1..80)
- `description` (string, nullable, 0..500)
- `visibility` (enum: `ORG` | `PRIVATE`, required)
- `created_by` (uuid, required) — user id
- `created_at` (timestamp, required)
- `updated_at` (timestamp, required)
- `archived_at` (timestamp, nullable)

**Constraints**

- Unique `(org_id, name)` among non-archived channels.

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

**Constraints**

- Unique `(org_id, message_id, user_id, emoji)` to prevent duplicates.

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
- If `status=SNOOZED`, `snoozed_until` must be set.

### Inbox view (query contract)

`GET /orgs/:orgId/inbox` returns **InboxThread** items which are a join of `Thread` + `ThreadUserState` + derived fields:

- `unread_count` (int)
- `latest_message_preview` (string)
- `has_urgent_unread` (bool)
- `next_action` (enum: `REVIEW` | `RESPOND` | `WAIT` | `NONE`)
- `sort_key` (opaque) — server-defined ordering stable for paging

The ordering **may incorporate** `last_activity_at`, `needs_response`, urgency, and user overrides, but is **not** defined as “latest message time desc”.

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

