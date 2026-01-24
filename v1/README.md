# Contracts v1

This directory defines **versioned, implementation-independent contracts** for the async-first communication platform.

## Goals

- **Async-first by default**: contracts make reactive/real-time-by-default behavior hard to accidentally implement.
- **Service boundaries**: each service owns its data and publishes events; no cross-DB querying.
- **Enterprise hygiene**: multi-tenant isolation, auditable state changes, explicit RBAC.

## Structure

- `domain/`: entity definitions and invariants (fields, constraints, lifecycle rules)
- `openapi/`: HTTP APIs (OpenAPI 3.1) for `identity-service` and `core-service`
- `events/`: event envelope + event type schemas (for outbox/event bus)
- `realtime/`: realtime-gateway protocol boundaries (stateless fan-out only)

## Versioning rules

- **v1 contracts are additive only**:
  - Adding fields is allowed (must be optional or have safe defaults).
  - Removing/renaming fields or changing semantics requires a new version (`v2/`).
- Events include `schema_version` and must be backwards compatible within `v1`.

## Common conventions

### IDs

- All IDs are opaque `uuid` strings.
- Every entity is scoped to an `org_id` (multi-tenant isolation).

### Time

- All timestamps are ISO-8601 UTC strings (e.g. `2026-01-24T10:20:30Z`).

### Error model (HTTP)

- Services return a stable error envelope:
  - `code` (machine-readable)
  - `message` (human-readable)
  - `request_id`
  - `details` (optional, structured)

