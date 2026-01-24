## realtime-gateway protocol boundaries (v1)

The realtime-gateway provides **stateless event fan-out** over WebSocket.

### Non-goals (strict)

- No business logic (no “decide who should be notified”, no ranking, no derived events).
- No data ownership and no persistence.
- No presence / typing / “online” indicators.

### Purpose

- Deliver near-real-time hints so clients can **refresh** via HTTP and reduce perceived latency.
- Support collaborative awareness only through **durable domain events** (e.g. “message created”), never through ephemeral signals.

---

## Trust model

- WebSocket events are **not** authoritative.
- Clients must treat them as **hints** and reconcile via HTTP APIs using:
  - `GET /orgs/:orgId/inbox` (server ordering)
  - `GET /orgs/:orgId/threads/:threadId` and message list endpoints (added later)

---

## Authentication

- Client sends a short-lived JWT (same as HTTP) during connection establishment.
- Gateway validates JWT signature/expiry and extracts `org_id` and `user_id`.
- Gateway does **not** call identity-service synchronously per message; it remains stateless aside from connection session.

---

## Subscription model

### Client → Gateway messages

All frames are JSON objects with:

- `type` (string)
- `request_id` (string, client-generated; used for ack correlation)
- `payload` (object)

Supported `type` values (v1):

- `subscribe`
  - `payload`:
    - `org_id` (uuid, required; must match JWT claim)
    - `topic` (enum: `inbox` | `thread`)
    - `thread_id` (uuid, required if `topic=thread`)
- `unsubscribe`
  - same fields as `subscribe`

### Gateway → Client messages

- `type` (string)
- `request_id` (string, nullable; echoes for acks)
- `payload` (object)

Supported `type` values (v1):

- `subscribed` / `unsubscribed`
- `event`
  - `payload`:
    - `envelope` (EventEnvelopeV1)
- `error`
  - `payload`:
    - `code` (string)
    - `message` (string)

---

## Allowed events (v1)

Gateway forwards only events emitted by services (see `contracts/v1/events/`):

- `Core.MessageCreated`
- `Core.MessageVersionCreated`
- `Core.ThreadCreated`
- `Core.ThreadStateChanged`
- `Core.ReactionAdded`
- (optionally) identity changes that affect access (e.g. `Identity.MembershipChanged`) **only** to trigger client re-auth/reload flows

Gateway must not emit:

- presence, typing, “read receipts” (unless they become explicit durable events later—which is unlikely given async-first philosophy)
- computed notifications (digests/urgent routing are separate services later)

---

## Reconciliation rules (client)

When receiving an `event`:

- If topic is `inbox`:
  - client should schedule a refresh of `GET /orgs/:orgId/inbox` (debounced, not per-event).
- If topic is `thread`:
  - client should refresh thread metadata and new messages via HTTP (endpoints added/extended later).

Clients must not assume that:

- events arrive exactly once
- events arrive in order globally
- the websocket is always connected

---

## Scaling notes (implementation guidance, still a contract boundary)

- Gateway instances are horizontally scaled.
- Fan-out requires a broker/subscription backend (e.g. Redis pub/sub, NATS, Kafka consumer group feeding websockets).
- Any ordering requirements must be defined by the producer via `ordering_key`, not by the gateway.

