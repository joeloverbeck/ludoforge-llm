import type { PlayerId } from '@ludoforge/engine/runtime';

import type {
  ResolvedStackBadgeStyle,
  ResolvedTokenPresentation,
  ResolvedTokenSymbols,
  ResolvedTokenVisual,
  ResolvedZoneTokenLayout,
  VisualConfigProvider,
} from '../../config/visual-config-provider.js';
import type { TokenRenderStyleProvider } from './renderer-types';
import { DEFAULT_FACTION_PALETTE } from '../../config/visual-config-defaults.js';
import type { CardTemplate, LayoutRole } from '../../config/visual-config-types.js';
import { VisualConfigProvider as RuntimeVisualConfigProvider } from '../../config/visual-config-provider.js';

export { DEFAULT_FACTION_PALETTE };

export class DefaultTokenRenderStyleProvider implements TokenRenderStyleProvider {
  private readonly provider = new RuntimeVisualConfigProvider(null);

  getTokenTypeVisual(tokenTypeId: string): ResolvedTokenVisual {
    return this.provider.getTokenTypeVisual(tokenTypeId);
  }

  getTokenTypePresentation(tokenTypeId: string): ResolvedTokenPresentation {
    return this.provider.getTokenTypePresentation(tokenTypeId);
  }

  resolveZoneTokenLayout(zoneId: string, category: string | null): ResolvedZoneTokenLayout {
    return this.provider.resolveZoneTokenLayout(zoneId, category);
  }

  getStackBadgeStyle(): ResolvedStackBadgeStyle {
    return this.provider.getStackBadgeStyle();
  }

  getZoneLayoutRole(zoneId: string): LayoutRole | null {
    return this.provider.getLayoutRole(zoneId);
  }

  isSharedZone(_zoneId: string): boolean {
    return false;
  }

  resolveTokenSymbols(
    tokenTypeId: string,
    tokenProperties: Readonly<Record<string, string | number | boolean>>,
  ): ResolvedTokenSymbols {
    return this.provider.resolveTokenSymbols(tokenTypeId, tokenProperties);
  }

  getCardTemplateForTokenType(_tokenTypeId: string): CardTemplate | null {
    return null;
  }

  getColor(factionId: string | null, playerId: PlayerId): string {
    if (factionId !== null) {
      return this.provider.getFactionColor(factionId);
    }
    return this.provider.getFactionColor(`player-${playerId}`);
  }
}

export class VisualConfigTokenRenderStyleProvider implements TokenRenderStyleProvider {
  constructor(private readonly provider: VisualConfigProvider) {}

  getTokenTypeVisual(tokenTypeId: string): ResolvedTokenVisual {
    return this.provider.getTokenTypeVisual(tokenTypeId);
  }

  getTokenTypePresentation(tokenTypeId: string): ResolvedTokenPresentation {
    return this.provider.getTokenTypePresentation(tokenTypeId);
  }

  resolveZoneTokenLayout(zoneId: string, category: string | null): ResolvedZoneTokenLayout {
    return this.provider.resolveZoneTokenLayout(zoneId, category);
  }

  getStackBadgeStyle(): ResolvedStackBadgeStyle {
    return this.provider.getStackBadgeStyle();
  }

  getZoneLayoutRole(zoneId: string): LayoutRole | null {
    return this.provider.getLayoutRole(zoneId);
  }

  isSharedZone(zoneId: string): boolean {
    const cardAnimation = this.provider.getCardAnimation();
    return cardAnimation?.zoneRoles.shared.includes(zoneId) ?? false;
  }

  resolveTokenSymbols(
    tokenTypeId: string,
    tokenProperties: Readonly<Record<string, string | number | boolean>>,
  ): ResolvedTokenSymbols {
    return this.provider.resolveTokenSymbols(tokenTypeId, tokenProperties);
  }

  getCardTemplateForTokenType(tokenTypeId: string): CardTemplate | null {
    return this.provider.getCardTemplateForTokenType(tokenTypeId);
  }

  getColor(factionId: string | null, playerId: PlayerId): string {
    if (factionId !== null) {
      return this.provider.getFactionColor(factionId);
    }
    return this.provider.getFactionColor(`player-${playerId}`);
  }
}
