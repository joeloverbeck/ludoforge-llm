import forceAtlas2 from 'graphology-layout-forceatlas2';
import type { GameDef } from '@ludoforge/engine/runtime';

import { buildLayoutGraph, partitionZones } from './build-layout-graph.js';
import type { LayoutMode, LayoutResult } from './layout-types.js';

const EMPTY_BOUNDS = { minX: 0, minY: 0, maxX: 0, maxY: 0 } as const;
const GRAPH_ITERATIONS = 100;
const GRAPH_MIN_SPACING = 60;
const GRAPH_NORMALIZED_EXTENT = 1000;
const GRAPH_SPACING_RELAXATION_PASSES = 6;
const SEED_JITTER = 18;
const SEED_RADIUS_BASE = 160;
const SEED_RADIUS_STEP = 90;

interface MutablePosition {
  x: number;
  y: number;
}

export function computeLayout(def: GameDef, mode: LayoutMode): LayoutResult {
  switch (mode) {
    case 'graph':
      return computeGraphLayout(def);
    case 'table':
      throw new Error('Table layout not yet implemented');
    case 'track':
      throw new Error('Track layout not yet implemented');
    case 'grid':
      throw new Error('Grid layout not yet implemented');
  }
}

function computeGraphLayout(def: GameDef): LayoutResult {
  const { board } = partitionZones(def);
  const graph = buildLayoutGraph(board);
  const nodeIDs = [...graph.nodes()].sort((left, right) => left.localeCompare(right));

  if (nodeIDs.length === 0) {
    return {
      positions: new Map(),
      mode: 'graph',
      boardBounds: EMPTY_BOUNDS,
    };
  }

  seedInitialPositions(graph, nodeIDs);
  forceAtlas2.assign(graph, {
    iterations: GRAPH_ITERATIONS,
    settings: {
      barnesHutOptimize: nodeIDs.length >= 50,
    },
  });

  const positions = new Map<string, MutablePosition>();
  for (const nodeID of nodeIDs) {
    const attributes = graph.getNodeAttributes(nodeID) as { x?: unknown; y?: unknown };
    const x = typeof attributes.x === 'number' && Number.isFinite(attributes.x) ? attributes.x : 0;
    const y = typeof attributes.y === 'number' && Number.isFinite(attributes.y) ? attributes.y : 0;
    positions.set(nodeID, { x, y });
  }

  normalizeToExtent(positions, GRAPH_NORMALIZED_EXTENT);
  enforceMinimumSpacing(positions, GRAPH_MIN_SPACING, GRAPH_SPACING_RELAXATION_PASSES);
  centerOnOrigin(positions);

  return {
    positions,
    mode: 'graph',
    boardBounds: computeBounds(positions),
  };
}

function seedInitialPositions(
  graph: ReturnType<typeof buildLayoutGraph>,
  sortedNodeIDs: readonly string[],
): void {
  const categoryBuckets = new Map<string, string[]>();

  for (const nodeID of sortedNodeIDs) {
    const category = graph.getNodeAttribute(nodeID, 'category');
    const key = typeof category === 'string' && category.length > 0 ? category : '__uncategorized__';
    const bucket = categoryBuckets.get(key);
    if (bucket === undefined) {
      categoryBuckets.set(key, [nodeID]);
      continue;
    }
    bucket.push(nodeID);
  }

  const categories = [...categoryBuckets.keys()].sort((left, right) => left.localeCompare(right));
  for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
    const category = categories[categoryIndex];
    if (category === undefined) {
      continue;
    }
    const bucket = categoryBuckets.get(category);
    if (bucket === undefined) {
      continue;
    }

    const sectorAngle = (Math.PI * 2 * categoryIndex) / Math.max(1, categories.length);
    for (let index = 0; index < bucket.length; index += 1) {
      const nodeID = bucket[index];
      if (nodeID === undefined) {
        continue;
      }

      const radius = SEED_RADIUS_BASE + SEED_RADIUS_STEP * Math.floor(index / 8);
      const angleOffset = ((index % 8) / 8) * (Math.PI / 3);
      const jitterX = deterministicJitter(`${nodeID}:x`) * SEED_JITTER;
      const jitterY = deterministicJitter(`${nodeID}:y`) * SEED_JITTER;
      const x = Math.cos(sectorAngle + angleOffset) * radius + jitterX;
      const y = Math.sin(sectorAngle + angleOffset) * radius + jitterY;

      graph.setNodeAttribute(nodeID, 'x', x);
      graph.setNodeAttribute(nodeID, 'y', y);
    }
  }
}

function normalizeToExtent(positions: Map<string, MutablePosition>, targetExtent: number): void {
  if (positions.size <= 1) {
    return;
  }

  const bounds = computeBounds(positions);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const largestDimension = Math.max(width, height);
  if (!Number.isFinite(largestDimension) || largestDimension <= 0) {
    return;
  }

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const scale = targetExtent / largestDimension;
  for (const position of positions.values()) {
    position.x = (position.x - centerX) * scale;
    position.y = (position.y - centerY) * scale;
  }
}

function enforceMinimumSpacing(
  positions: Map<string, MutablePosition>,
  minSpacing: number,
  passes: number,
): void {
  if (positions.size <= 1) {
    return;
  }

  const entries = [...positions.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (let pass = 0; pass < passes; pass += 1) {
    let moved = false;

    for (let leftIndex = 0; leftIndex < entries.length - 1; leftIndex += 1) {
      const [leftID, leftPosition] = entries[leftIndex] ?? [];
      if (leftID === undefined || leftPosition === undefined) {
        continue;
      }

      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
        const [rightID, rightPosition] = entries[rightIndex] ?? [];
        if (rightID === undefined || rightPosition === undefined) {
          continue;
        }

        const deltaX = rightPosition.x - leftPosition.x;
        const deltaY = rightPosition.y - leftPosition.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance >= minSpacing) {
          continue;
        }

        const gap = minSpacing - distance;
        if (distance > 1e-9) {
          const unitX = deltaX / distance;
          const unitY = deltaY / distance;
          leftPosition.x -= unitX * (gap / 2);
          leftPosition.y -= unitY * (gap / 2);
          rightPosition.x += unitX * (gap / 2);
          rightPosition.y += unitY * (gap / 2);
          moved = true;
          continue;
        }

        const angle = deterministicAngle(`${leftID}::${rightID}`);
        const unitX = Math.cos(angle);
        const unitY = Math.sin(angle);
        leftPosition.x -= unitX * (minSpacing / 2);
        leftPosition.y -= unitY * (minSpacing / 2);
        rightPosition.x += unitX * (minSpacing / 2);
        rightPosition.y += unitY * (minSpacing / 2);
        moved = true;
      }
    }

    if (!moved) {
      return;
    }
  }
}

function centerOnOrigin(positions: Map<string, MutablePosition>): void {
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

function computeBounds(positions: ReadonlyMap<string, MutablePosition>): LayoutResult['boardBounds'] {
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

function deterministicJitter(seed: string): number {
  return (hashUnit(seed) * 2) - 1;
}

function deterministicAngle(seed: string): number {
  return hashUnit(seed) * Math.PI * 2;
}

function hashUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 1_000_000) / 1_000_000;
}
