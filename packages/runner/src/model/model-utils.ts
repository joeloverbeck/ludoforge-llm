export function optionalPlayerId(playerId: number | undefined): { readonly playerId?: number } {
  if (playerId === undefined) {
    return {};
  }
  return { playerId };
}

export type ScopeKind = 'global' | 'perPlayer' | 'zone' | undefined;

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
