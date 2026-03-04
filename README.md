# @ayncor/contracts

Versioned, implementation-independent contracts for the Ayncor platform.

**Contracts are the single source of truth.** Backend services (identity-service, core-service, realtime-gateway) implement these contracts. Frontend and API clients should generate types/clients from the OpenAPI specs.

## What lives here

- `v1/openapi/`: OpenAPI 3.1 specs for HTTP APIs
  - `identity-service.openapi.yaml` — Auth (login, refresh, signup), users, orgs, members, invites, roles, audit, health
  - `core-service.openapi.yaml` — Channels, threads, messages, reactions, participants, inbox, user-state
- `v1/events/`: JSON Schemas for event envelopes + event payloads
- `v1/realtime/`: protocol docs for the stateless realtime-gateway (WebSocket)
- `v1/domain/`: domain invariants and cross-service conventions

## Sync with backend services

| Service           | Contract file                    | Consumes @ayncor/contracts |
|-------------------|----------------------------------|----------------------------|
| identity-service  | identity-service.openapi.yaml    | Yes                        |
| core-service      | core-service.openapi.yaml        | Yes                        |
| realtime-gateway  | v1/realtime/protocol.md          | Yes                        |

## Install

This package is intended to be published privately (or installed locally during early development).

## Postman collections

Each backend service includes a Postman collection for API documentation and frontend handover:

| Service           | Collection file                          | Path / baseUrl      |
|-------------------|-------------------------------------------|----------------------|
| identity-service  | `authAPI.postman_collection.json`         | http://localhost:3001 |
| core-service      | `coreAPI.postman_collection.json`         | http://localhost:3002 |
| realtime-gateway  | `realtimeAPI.postman_collection.json`     | http://localhost:3010 |

## Usage

Consumers typically need **paths to contract files** on disk (for validation, codegen, etc.).

```ts
import { V1 } from "@ayncor/contracts";

console.log(V1.openapi.identityService);
console.log(V1.events.envelopeSchema);
```

