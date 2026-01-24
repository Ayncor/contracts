## Async workflow contract (v1)

This document specifies the **user-level async workflow** so clients don’t drift into “real-time chat” behaviors.

### Goals

- Make **review** and **response** explicit, not inferred from “who spoke last”.
- Provide stable server-side ordering for the inbox (digest-friendly).
- Keep client behavior consistent across web/desktop/mobile.

---

## Core concepts

### Inbox as a queue, not a timeline

The inbox is a **server-ordered work queue** of threads for a user within an org.

- Threads do **not** automatically float to the top on every reply.
- The server provides an ordering optimized for async review, which can consider:
  - `needs_response`
  - unread status
  - explicit urgency (`URGENT` unread)
  - thread lifecycle state (`BLOCKED`, `DECIDED`)
  - user overrides (`priority_override`)
  - snooze windows

The ordering is represented via an opaque `sort_key` for stable pagination.

### `ThreadUserState` is the source of truth

Per-user workflow state is persisted in `ThreadUserState` (see `domain/core-service.md`) and mutated only via explicit user actions or explicit directed requests.

---

## Contracts / behaviors

### Marking read

- A client sets `last_read_message_id` when the user intentionally reviews the thread.
- The server derives unread counts per thread from `last_read_message_id` and message stream.

### Needs response

`needs_response` is **not** inferred from “someone asked a question” heuristics in v1.

In v1 it is set by:

- **User action** (manual): user flags the thread as requiring their response.
- **Explicit message metadata**: a message can set `requires_response=true` with an optional target (future extension).

This avoids unreliable ML/heuristic pressure loops.

### Snooze

- `status=SNOOZED` and `snoozed_until` hides the thread from the default inbox view until the time elapses.
- The server may keep the thread visible in an “All” view if `include_archived=true` (client choice), but default is hidden.

### Decisions and blocked state

Thread lifecycle state affects workflow:

- `BLOCKED` threads should not appear as high priority unless `needs_response=true`.
- `DECIDED` threads default to lower priority; they may still appear if unread or explicitly flagged.
- `ARCHIVED` threads are hidden by default; can be fetched via `include_archived=true`.

---

## API mapping (v1)

- **List inbox**: `GET /orgs/:orgId/inbox`
  - returns `InboxThread[]` with server-defined ordering + `sort_key` paging
- **Mutate workflow state**: `PATCH /orgs/:orgId/threads/:threadId/user-state`
  - can set: `status`, `needs_response`, `snoozed_until`, `last_read_message_id`, `last_reviewed_at`, `priority_override`

---

## Client rules (non-negotiable)

- Do **not** reorder inbox solely on local “latest message time”.
- Treat websocket updates as hints; always reconcile via HTTP (paging + sort_key).
- Do not show presence/typing indicators or other online-pressure elements.

