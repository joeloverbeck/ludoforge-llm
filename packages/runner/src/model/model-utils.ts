export function optionalPlayerId(playerId: number | undefined): { readonly playerId?: number } {
  if (playerId === undefined) {
    return {};
  }
  return { playerId };
}

export type ScopeKind = 'global' | 'perPlayer' | 'zone' | undefined;
export type ScopeEndpointKind = Exclude<ScopeKind, undefined>;

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

export function formatScopeEndpointDisplay(input: Omit<ScopeLabelResolvers, 'scope'> & { readonly scope: ScopeEndpointKind }): string {
  switch (input.scope) {
    case 'global':
      return 'Global';
    case 'perPlayer': {
      const owner = input.playerId === undefined ? 'Player' : input.resolvePlayerName(input.playerId);
      return owner === 'Player' ? 'Per Player' : owner;
    }
    case 'zone':
      return input.zoneId === undefined ? 'Zone' : input.resolveZoneName(input.zoneId);
  }

  return invalidEndpointScope(input.scope);
}

function invalidEndpointScope(scope: unknown): never {
  throw new Error(`Invalid endpoint scope for event-log rendering: ${String(scope)}`);
}
