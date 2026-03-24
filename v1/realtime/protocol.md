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
  - `GET /inbox` (server ordering)
  - `GET /messages/thread/:threadId` and related thread endpoints

---

## Authentication

- Client sends a short-lived JWT (same as HTTP/identity-service) during connection establishment.
- Gateway validates JWT signature/expiry using the **same secret** as identity-service (`JWT_ACCESS_SECRET`) and extracts `org_id` and `sub` (user_id). It does **not** call identity-service per message.
- **How to send the token (v1)**:
  - **Query param**: `?access_token=<jwt>` on the WebSocket URL (e.g. `ws://host/path?access_token=...`).
  - **First message**: if the client connects without a query token, it may send a single message `{ "type": "auth", "request_id": "<string>", "payload": { "access_token": "<jwt>" } }`. The gateway validates it and then accepts `subscribe` / `unsubscribe`; there is no separate ack frame for `auth`.
- **On auth failure**: gateway sends `{ "type": "error", "request_id": null, "payload": { "code": "auth_failed", "message": "Invalid or expired token" } }` and may close the connection with code `4003` and reason `auth_failed`.

---

## Subscription model

### Client → Gateway messages

All frames are JSON objects with:

- `type` (string)
- `request_id` (string, client-generated; used for ack correlation)
- `payload` (object)

Supported `type` values (v1):

- `auth` (optional first message when token is not in query)
  - `payload`: `{ "access_token": "<jwt>" }`
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
    - `code` (string) — e.g. `auth_failed`, `auth_required`, `invalid_message`, `invalid_payload`, `forbidden`, `unknown_type`
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
  - client should schedule a refresh of `GET /inbox` (debounced, not per-event).
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

