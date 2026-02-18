import type { PlayerId } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

import type { Position } from '../geometry';
import type {
  RenderAdjacency,
  RenderToken,
  RenderZone,
} from '../../model/render-model';

export interface ZoneRenderer {
  update(
    zones: readonly RenderZone[],
    positions: ReadonlyMap<string, Position>,
  ): void;
  getContainerMap(): ReadonlyMap<string, Container>;
  destroy(): void;
}

export interface TokenRenderer {
  update(
    tokens: readonly RenderToken[],
    zoneContainers: ReadonlyMap<string, Container>,
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

export interface FactionColorProvider {
  getTokenTypeColor(tokenTypeId: string): string | null;
  getColor(factionId: string | null, playerId: PlayerId): string;
}
