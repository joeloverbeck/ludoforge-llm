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
  RenderToken,
} from '../../model/render-model';
import type {
  PresentationAdjacencyNode,
  PresentationRegionNode,
  PresentationZoneNode,
} from '../../presentation/presentation-scene.js';
import type { ModifiedProvincePolygon } from './province-border-utils.js';
import type {
  ConnectionRouteNode,
  JunctionNode,
} from '../../presentation/connection-route-resolver.js';
import type { TableOverlaySurfaceNode } from '../../presentation/project-table-overlay-surface.js';
import type { PresentationTokenNode } from '../../presentation/token-presentation.js';

export interface ZoneRenderer {
  update(
    zones: readonly PresentationZoneNode[],
    positions: ReadonlyMap<string, Position>,
    provinceBorders?: ReadonlyMap<string, ModifiedProvincePolygon>,
  ): void;
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}

export interface TokenRenderer {
  update(
    tokens: readonly PresentationTokenNode[],
    zoneContainers: ReadonlyMap<string, Container>,
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
    adjacencies: readonly PresentationAdjacencyNode[],
    positions: ReadonlyMap<string, Position>,
    zones: readonly PresentationZoneNode[],
  ): void;
  destroy(): void;
}

export interface ConnectionRouteRenderer {
  update(
    routes: readonly ConnectionRouteNode[],
    junctions: readonly JunctionNode[],
    positions: ReadonlyMap<string, Position>,
  ): void;
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}

export interface TableOverlayRenderer {
  update(items: readonly TableOverlaySurfaceNode[]): void;
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
