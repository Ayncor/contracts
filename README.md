# @ayncor/contracts

Versioned, implementation-independent contracts for the Ayncor platform.

## What lives here

- `v1/openapi/`: OpenAPI 3.1 specs for HTTP APIs
- `v1/events/`: JSON Schemas for event envelopes + event payloads
- `v1/realtime/`: protocol docs for the stateless realtime-gateway
- `v1/domain/`: domain invariants and cross-service conventions

## Install

This package is intended to be published privately (or installed locally during early development).

## Usage

Consumers typically need **paths to contract files** on disk (for validation, codegen, etc.).

```ts
import { V1 } from "@ayncor/contracts";

console.log(V1.openapi.identityService);
console.log(V1.events.envelopeSchema);
```

