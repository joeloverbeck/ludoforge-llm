import type { PlayerId } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

import type { Position } from '../geometry';
import type { ResolvedTokenVisual } from '../../config/visual-config-provider.js';
import type { CardTemplate } from '../../config/visual-config-types.js';
import type {
  RenderAdjacency,
  RenderModel,
  RenderToken,
  RenderZone,
} from '../../model/render-model';

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
    tokens: readonly RenderToken[],
    zoneContainers: ReadonlyMap<string, Container>,
    highlightedTokenIDs?: ReadonlySet<string>,
  ): void;
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}

export interface AdjacencyRenderer {
  update(
    adjacencies: readonly RenderAdjacency[],
    positions: ReadonlyMap<string, Position>,
  ): void;
  destroy(): void;
}

export interface TableOverlayRenderer {
  update(
    renderModel: RenderModel | null,
    positions: ReadonlyMap<string, Position>,
  ): void;
  destroy(): void;
}

export interface FactionColorProvider {
  getTokenTypeVisual(tokenTypeId: string): ResolvedTokenVisual;
  resolveTokenSymbols(
    tokenTypeId: string,
    tokenProperties: Readonly<Record<string, string | number | boolean>>,
  ): { readonly symbol: string | null; readonly backSymbol: string | null };
  getCardTemplateForTokenType(tokenTypeId: string): CardTemplate | null;
  getColor(factionId: string | null, playerId: PlayerId): string;
}
