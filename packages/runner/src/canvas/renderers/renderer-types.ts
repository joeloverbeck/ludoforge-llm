import type { PlayerId } from '@ludoforge/engine';
import type { Container } from 'pixi.js';

import type {
  RenderAdjacency,
  RenderMapSpace,
  RenderToken,
  RenderZone,
} from '../../model/render-model';

export interface Position {
  readonly x: number;
  readonly y: number;
}

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
