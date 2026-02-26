import type { ScopeKind } from './model-utils.js';

export type ScopeEndpointKind = Exclude<ScopeKind, undefined>;
type EndpointPayloadField = 'from' | 'to';

export interface TransferEndpointPayloadObject {
  readonly scope?: unknown;
  readonly varName?: unknown;
  readonly player?: unknown;
  readonly zone?: unknown;
}

export type NormalizedTransferEndpoint =
  | Readonly<{
      scope: 'global';
      varName: string;
      playerId: undefined;
      zoneId: undefined;
    }>
  | Readonly<{
      scope: 'perPlayer';
      varName: string;
      playerId: number;
      zoneId: undefined;
    }>
  | Readonly<{
      scope: 'zone';
      varName: string;
      playerId: undefined;
      zoneId: string;
    }>;

interface TransferEndpointLabelResolvers {
  readonly scope: ScopeKind;
  readonly playerId: number | undefined;
  readonly zoneId: string | undefined;
  readonly resolvePlayerName: (playerId: number) => string;
  readonly resolveZoneName: (zoneId: string) => string;
}

export type TransferEndpointDisplayInput =
  | Readonly<{
      scope: 'global';
      playerId: number | undefined;
      zoneId: string | undefined;
    }>
  | Readonly<{
      scope: 'perPlayer';
      playerId: number;
      zoneId: string | undefined;
    }>
  | Readonly<{
      scope: 'zone';
      playerId: number | undefined;
      zoneId: string;
    }>;

export function formatTransferEndpointDisplay(
  input: Omit<TransferEndpointLabelResolvers, 'scope' | 'playerId' | 'zoneId'> & TransferEndpointDisplayInput,
): string {
  switch (input.scope) {
    case 'global':
      return 'Global';
    case 'perPlayer': {
      if (typeof input.playerId !== 'number') {
        return missingEndpointIdentity(input.scope, 'playerId');
      }
      return input.resolvePlayerName(input.playerId);
    }
    case 'zone':
      if (typeof input.zoneId !== 'string') {
        return missingEndpointIdentity(input.scope, 'zoneId');
      }
      return input.resolveZoneName(input.zoneId);
    default:
      return invalidTransferEndpointScope((input as { readonly scope?: unknown }).scope);
  }
}

function missingEndpointIdentity(scope: ScopeEndpointKind, field: 'playerId' | 'zoneId'): never {
  throw new Error(`Missing endpoint identity for ${scope} scope: ${field}`);
}

export function invalidTransferEndpointScope(scope: unknown): never {
  throw new Error(`Invalid transfer endpoint scope: ${String(scope)}`);
}

export function endpointPayloadMustBeObject(field: EndpointPayloadField): never {
  throw new Error(`Invalid transfer endpoint payload: ${field} must be an object`);
}

export function endpointVarNameMustBeString(field: EndpointPayloadField): never {
  throw new Error(`Invalid transfer endpoint payload: ${field}.varName must be a string`);
}

export function asTransferEndpointPayloadObject(
  endpoint: unknown,
  field: EndpointPayloadField,
): TransferEndpointPayloadObject {
  if (typeof endpoint !== 'object' || endpoint === null) {
    return endpointPayloadMustBeObject(field);
  }
  return endpoint as TransferEndpointPayloadObject;
}

export function endpointVarNameAsString(
  endpoint: TransferEndpointPayloadObject,
  field: EndpointPayloadField,
): string {
  if (typeof endpoint.varName !== 'string') {
    return endpointVarNameMustBeString(field);
  }
  return endpoint.varName;
}

export function normalizeTransferEndpoint(endpoint: unknown, field: EndpointPayloadField): NormalizedTransferEndpoint {
  const payload = asTransferEndpointPayloadObject(endpoint, field);
  const varName = endpointVarNameAsString(payload, field);

  switch (payload.scope) {
    case 'global':
      return {
        scope: 'global',
        varName,
        playerId: undefined,
        zoneId: undefined,
      };

    case 'perPlayer': {
      const playerId = toFiniteNumberOrUndefined(payload.player);
      if (playerId === undefined) {
        return missingEndpointIdentity('perPlayer', 'playerId');
      }
      return {
        scope: 'perPlayer',
        varName,
        playerId,
        zoneId: undefined,
      };
    }

    case 'zone': {
      const zoneId = typeof payload.zone === 'string' ? payload.zone : undefined;
      if (zoneId === undefined) {
        return missingEndpointIdentity('zone', 'zoneId');
      }
      return {
        scope: 'zone',
        varName,
        playerId: undefined,
        zoneId,
      };
    }

    default:
      return invalidTransferEndpointScope(payload.scope);
  }
}

function toFiniteNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}
