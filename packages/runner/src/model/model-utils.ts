export function optionalPlayerId(playerId: number | undefined): { readonly playerId?: number } {
  if (playerId === undefined) {
    return {};
  }
  return { playerId };
}

export type ScopeKind = 'global' | 'perPlayer' | 'zone' | undefined;

export type ScopeRenderContext = 'prefix' | 'endpoint';

export function formatScopeDisplay(input: {
  readonly scope: ScopeKind;
  readonly context: ScopeRenderContext;
  readonly playerId: number | undefined;
  readonly zoneId: string | undefined;
  readonly resolvePlayerName: (playerId: number) => string;
  readonly resolveZoneName: (zoneId: string) => string;
}): string {
  if (input.scope === 'perPlayer') {
    const owner = input.playerId === undefined ? 'Player' : input.resolvePlayerName(input.playerId);
    return input.context === 'prefix' ? `${owner}: ` : owner === 'Player' ? 'Per Player' : owner;
  }

  if (input.scope === 'zone') {
    const zone = input.zoneId === undefined ? 'Zone' : input.resolveZoneName(input.zoneId);
    return input.context === 'prefix' ? `${zone}: ` : zone;
  }

  if (input.context === 'endpoint') {
    return 'Global';
  }

  return '';
}
