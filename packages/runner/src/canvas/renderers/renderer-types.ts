import type { PlayerId } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

import type { Position } from '../geometry';
import type {
  ResolvedStackBadgeStyle,
  ResolvedTokenPresentation,
  ResolvedTokenVisual,
  ResolvedZoneTokenLayout,
} from '../../config/visual-config-provider.js';
import type { LayoutRole } from '../../config/visual-config-types.js';
import type { CardTemplate } from '../../config/visual-config-types.js';
import type {
  RenderAdjacency,
  RenderToken,
  RenderZone,
} from '../../model/render-model';
import type { PresentationOverlayNode, PresentationRegionNode } from '../../presentation/presentation-scene.js';
import type { PresentationTokenNode } from '../../presentation/token-presentation.js';

export interface ZoneRenderer {
  update(
    zones: readonly RenderZone[],
    positions: ReadonlyMap<string, Position>,
    highlightedZoneIDs?: ReadonlySet<string>,
  ): void;
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}

export interface TokenRenderer {
  update(
    tokens: readonly PresentationTokenNode[],
    zoneContainers: ReadonlyMap<string, Container>,
    highlightedTokenIDs?: ReadonlySet<string>,
  ): void;
  getContainerMap(): ReadonlyMap<string, Container>;
  getFaceControllerMap?(): ReadonlyMap<string, TokenFaceController>;
  reconcileFaceState?(tokens: readonly RenderToken[]): void;
  destroy(): void;
}

export interface TokenFaceController {
  setFaceUp(faceUp: boolean): void;
}

export interface AdjacencyRenderer {
  update(
    adjacencies: readonly RenderAdjacency[],
    positions: ReadonlyMap<string, Position>,
  ): void;
  destroy(): void;
}

export interface TableOverlayRenderer {
  update(items: readonly PresentationOverlayNode[]): void;
  destroy(): void;
}

export interface RegionBoundaryRenderer {
  update(regions: readonly PresentationRegionNode[]): void;
  destroy(): void;
}

export interface TokenRenderStyleProvider {
  getTokenTypeVisual(tokenTypeId: string): ResolvedTokenVisual;
  getTokenTypePresentation(tokenTypeId: string): ResolvedTokenPresentation;
  resolveZoneTokenLayout(zoneId: string, category: string | null): ResolvedZoneTokenLayout;
  getStackBadgeStyle(): ResolvedStackBadgeStyle;
  getZoneLayoutRole(zoneId: string): LayoutRole | null;
  isSharedZone(zoneId: string): boolean;
  resolveTokenSymbols(
    tokenTypeId: string,
    tokenProperties: Readonly<Record<string, string | number | boolean>>,
  ): { readonly symbol: string | null; readonly backSymbol: string | null };
  getCardTemplateForTokenType(tokenTypeId: string): CardTemplate | null;
  getColor(factionId: string | null, playerId: PlayerId): string;
}
