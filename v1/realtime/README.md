# Realtime (v1)

The realtime-gateway is intentionally a **thin WebSocket fan-out layer**.

See `protocol.md` for:

- subscription model (`inbox`, `thread`)
- allowed event forwarding
- reconciliation rules (HTTP is source of truth)

