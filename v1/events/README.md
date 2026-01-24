# Events (v1)

This directory defines the **event contracts** emitted by services via an **outbox pattern**.

## Non-negotiable semantics

- **Delivery**: at-least-once. Consumers **must be idempotent**.
- **Ordering**: only best-effort globally; producers should provide an **ordering key** (aggregate id) so consumers can order per aggregate when needed.
- **Schema evolution**: additive within v1. Breaking changes require `contracts/v2/`.

## Outbox pattern (producer)

1. The service writes its business transaction (e.g. create message).
2. In the **same DB transaction**, it appends an outbox row containing the event envelope + payload.
3. A relay publishes outbox rows to the broker (or pulls via HTTP) and marks them dispatched.

This guarantees **no “write succeeded but event lost”** and avoids dual-write race conditions.

## Consumer requirements

- Deduplicate by `event_id` (store last-seen ids or use broker de-dupe if available).
- If the consumer maintains derived state, it should also de-dupe by `(event_type, entity_ref, occurred_at)` only as a fallback.
- Treat all fields as immutable; never “update” an event.

## Files

- `envelope.schema.json`: base envelope schema used by all events
- `identity.*.schema.json`: identity-service event schemas
- `core.*.schema.json`: core-service event schemas

