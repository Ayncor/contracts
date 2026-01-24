const path = require("node:path");

const CONTRACTS_SCHEMA_VERSION = "v1";

function contractsRoot() {
  // package root (this file lives at the root)
  return __dirname;
}

function v1Path(...segments) {
  return path.join(contractsRoot(), "v1", ...segments);
}

const V1 = {
  openapi: {
    identityService: v1Path("openapi", "identity-service.openapi.yaml"),
    coreService: v1Path("openapi", "core-service.openapi.yaml"),
  },
  events: {
    directory: v1Path("events"),
    envelopeSchema: v1Path("events", "envelope.schema.json"),
    eventTypesDoc: v1Path("events", "event-types.md"),
  },
  realtime: {
    directory: v1Path("realtime"),
    protocolDoc: v1Path("realtime", "protocol.md"),
  },
};

module.exports = {
  CONTRACTS_SCHEMA_VERSION,
  contractsRoot,
  v1Path,
  V1,
};

