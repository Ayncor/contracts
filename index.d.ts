export const CONTRACTS_SCHEMA_VERSION: "v1";

/**
 * Absolute path to the installed package root.
 */
export function contractsRoot(): string;

/**
 * Absolute path helper rooted at `v1/`.
 */
export function v1Path(...segments: string[]): string;

export const V1: {
  readonly openapi: {
    readonly identityService: string;
    readonly coreService: string;
  };
  readonly events: {
    readonly directory: string;
    readonly envelopeSchema: string;
    readonly eventTypesDoc: string;
  };
  readonly realtime: {
    readonly directory: string;
    readonly protocolDoc: string;
  };
};

