# Realtime (v1)

The realtime-gateway is a **thin WebSocket fan-out layer**. It validates the same JWT as identity-service (same `JWT_ACCESS_SECRET`) and does not call identity-service per message.

See `protocol.md` for:

- **Authentication**: token via query `?access_token=...` or first message `{ "type": "auth", "payload": { "access_token": "..." } }`
- **Subscription model**: `subscribe` / `unsubscribe` with `org_id`, `topic` (`inbox` | `thread`), and `thread_id` when `topic=thread`
- **Gateway → client**: `subscribed`, `unsubscribed`, `event` (envelope), `error` (code + message)
- **Allowed events** and reconciliation rules (HTTP is source of truth)

