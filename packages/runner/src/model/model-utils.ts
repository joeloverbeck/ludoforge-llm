export function optionalPlayerId(playerId: number | undefined): { readonly playerId?: number } {
  if (playerId === undefined) {
    return {};
  }
  return { playerId };
}

export type ScopeKind = 'global' | 'perPlayer' | 'zone' | undefined;
export type ScopeEndpointKind = Exclude<ScopeKind, undefined>;
type EndpointPayloadField = 'from' | 'to';

export interface ScopeEndpointPayloadObject {
  readonly scope?: unknown;
  readonly player?: unknown;
  readonly zone?: unknown;
}

interface ScopeLabelResolvers {
  readonly scope: ScopeKind;
  readonly playerId: number | undefined;
  readonly zoneId: string | undefined;
  readonly resolvePlayerName: (playerId: number) => string;
  readonly resolveZoneName: (zoneId: string) => string;
}

export function formatScopePrefixDisplay(input: ScopeLabelResolvers): string {
  if (input.scope === 'perPlayer') {
    const owner = input.playerId === undefined ? 'Player' : input.resolvePlayerName(input.playerId);
    return `${owner}: `;
  }

  if (input.scope === 'zone') {
    const zone = input.zoneId === undefined ? 'Zone' : input.resolveZoneName(input.zoneId);
    return `${zone}: `;
  }

  return '';
}

export type ScopeEndpointDisplayInput =
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

export function formatScopeEndpointDisplay(
  input: Omit<ScopeLabelResolvers, 'scope' | 'playerId' | 'zoneId'> & ScopeEndpointDisplayInput,
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
      return invalidEndpointScope((input as { readonly scope?: unknown }).scope);
  }
}

function missingEndpointIdentity(scope: ScopeEndpointKind, field: 'playerId' | 'zoneId'): never {
  throw new Error(`Missing endpoint identity for ${scope} scope: ${field}`);
}

export function invalidEndpointScope(scope: unknown): never {
  throw new Error(`Invalid endpoint scope for event-log rendering: ${String(scope)}`);
}

export function endpointPayloadMustBeObject(field: EndpointPayloadField): never {
  throw new Error(`Invalid endpoint payload for event-log rendering: ${field} must be an object`);
}

export function asScopeEndpointPayloadObject(
  endpoint: unknown,
  field: EndpointPayloadField,
): ScopeEndpointPayloadObject {
  if (typeof endpoint !== 'object' || endpoint === null) {
    return endpointPayloadMustBeObject(field);
  }
  return endpoint as ScopeEndpointPayloadObject;
}
