import type { GameDef } from '@ludoforge/engine/runtime';

import { computeAuxLayout } from './aux-zone-layout.js';
import { partitionZones, resolveLayoutMode } from './build-layout-graph.js';
import { computeLayout } from './compute-layout.js';
import { ZONE_HALF_HEIGHT, ZONE_HALF_WIDTH } from './layout-constants.js';
import { EMPTY_BOUNDS } from './layout-helpers.js';
import type { LayoutMode } from './layout-types.js';
import type { Position, ZonePositionMap } from '../spatial/position-types.js';

export interface FullLayoutResult {
  readonly positionMap: ZonePositionMap;
  readonly mode: LayoutMode;
}

const layoutCache = new Map<string, FullLayoutResult>();

export function getOrComputeLayout(def: GameDef): FullLayoutResult {
  const cacheKey = createLayoutCacheKey(def);
  const cached = layoutCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const mode = resolveLayoutMode(def);
  const partitioned = partitionZones(def);
  const boardLayout = computeLayout(def, mode);
  const auxLayout = computeAuxLayout(partitioned.aux, boardLayout.boardBounds);

  const positions = new Map<string, Position>();
  for (const [zoneID, position] of boardLayout.positions) {
    positions.set(zoneID, { x: position.x, y: position.y });
  }
  for (const [zoneID, position] of auxLayout.positions) {
    positions.set(zoneID, { x: position.x, y: position.y });
  }

  const result: FullLayoutResult = {
    mode,
    positionMap: {
      positions,
      bounds: computeUnifiedBounds(positions),
    },
  };

  layoutCache.set(cacheKey, result);
  return result;
}

export function clearLayoutCache(): void {
  layoutCache.clear();
}

function computeUnifiedBounds(positions: ReadonlyMap<string, Position>): ZonePositionMap['bounds'] {
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

  return {
    minX: minX - ZONE_HALF_WIDTH,
    minY: minY - ZONE_HALF_HEIGHT,
    maxX: maxX + ZONE_HALF_WIDTH,
    maxY: maxY + ZONE_HALF_HEIGHT,
  };
}

function createLayoutCacheKey(def: GameDef): string {
  return `${def.metadata.id}:${fnv1aHash(stableSerialize(def))}`;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`;
}

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
