import type { PlayerId } from '@ludoforge/engine/runtime';

import type { ResolvedTokenVisual, VisualConfigProvider } from '../../config/visual-config-provider.js';
import type { FactionColorProvider } from './renderer-types';
import { DEFAULT_FACTION_PALETTE } from '../../config/visual-config-defaults.js';
import { VisualConfigProvider as RuntimeVisualConfigProvider } from '../../config/visual-config-provider.js';

export { DEFAULT_FACTION_PALETTE };

export class DefaultFactionColorProvider implements FactionColorProvider {
  private readonly provider = new RuntimeVisualConfigProvider(null);

  getTokenTypeVisual(tokenTypeId: string): ResolvedTokenVisual {
    return this.provider.getTokenTypeVisual(tokenTypeId);
  }

  getCardTemplateForTokenType(_tokenTypeId: string) {
    return null;
  }

  getColor(factionId: string | null, playerId: PlayerId): string {
    if (factionId !== null) {
      return this.provider.getFactionColor(factionId);
    }
    return this.provider.getFactionColor(`player-${playerId}`);
  }
}

export class VisualConfigFactionColorProvider implements FactionColorProvider {
  constructor(private readonly provider: VisualConfigProvider) {}

  getTokenTypeVisual(tokenTypeId: string): ResolvedTokenVisual {
    return this.provider.getTokenTypeVisual(tokenTypeId);
  }

  getCardTemplateForTokenType(tokenTypeId: string) {
    return this.provider.getCardTemplateForTokenType(tokenTypeId);
  }

  getColor(factionId: string | null, playerId: PlayerId): string {
    if (factionId !== null) {
      return this.provider.getFactionColor(factionId);
    }
    return this.provider.getFactionColor(`player-${playerId}`);
  }
}
