import type { PlayerId } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';

import type { Position } from '../geometry';
import type {
  RenderAdjacency,
  RenderMapSpace,
  RenderToken,
  RenderZone,
} from '../../model/render-model';

export interface ZoneRenderer {
  update(
    zones: readonly RenderZone[],
    mapSpaces: readonly RenderMapSpace[],
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
  getColor(factionId: string | null, playerId: PlayerId): string;
}
