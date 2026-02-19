import type { GameDef, ZoneDef } from '@ludoforge/engine/runtime';

import { partitionZones } from './build-layout-graph.js';
import type { LayoutResult } from './layout-types.js';

export const EMPTY_BOUNDS = { minX: 0, minY: 0, maxX: 0, maxY: 0 } as const;

export interface MutablePosition {
  x: number;
  y: number;
}

export function selectPrimaryLayoutZones(def: GameDef): readonly ZoneDef[] {
  const { board } = partitionZones(def);
  if (board.length > 0) {
    return board;
  }

  return def.zones;
}

export function centerOnOrigin(positions: Map<string, MutablePosition>): void {
  if (positions.size === 0) {
    return;
  }

  let sumX = 0;
  let sumY = 0;
  for (const position of positions.values()) {
    sumX += position.x;
    sumY += position.y;
  }

  const centerX = sumX / positions.size;
  const centerY = sumY / positions.size;
  for (const position of positions.values()) {
    position.x -= centerX;
    position.y -= centerY;
  }
}

export function computeBounds(positions: ReadonlyMap<string, MutablePosition>): LayoutResult['boardBounds'] {
  if (positions.size === 0) {
    return EMPTY_BOUNDS;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const position of positions.values()) {
    if (position.x < minX) {
      minX = position.x;
    }
    if (position.y < minY) {
      minY = position.y;
    }
    if (position.x > maxX) {
      maxX = position.x;
    }
    if (position.y > maxY) {
      maxY = position.y;
    }
  }

  return { minX, minY, maxX, maxY };
}
