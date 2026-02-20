import forceAtlas2 from 'graphology-layout-forceatlas2';
import type { GameDef, ZoneDef } from '@ludoforge/engine/runtime';

import type { CardAnimationZoneRoles, CompassPosition, RegionHint } from '../config/visual-config-types.js';
import { buildLayoutGraph, partitionZones } from './build-layout-graph.js';
import { computeGridLayout } from './grid-layout.js';
import { ZONE_RENDER_HEIGHT, ZONE_RENDER_WIDTH } from './layout-constants.js';
import { centerOnOrigin, computeBounds, EMPTY_BOUNDS, type MutablePosition, selectPrimaryLayoutZones } from './layout-helpers.js';
import type { LayoutMode, LayoutResult } from './layout-types.js';
import { computeTrackLayout } from './track-layout.js';

const GRAPH_ITERATIONS = 100;
const GRAPH_NODE_SPACING_FACTOR = 2.5;
const GRAPH_MIN_SPACING_FACTOR = 1.3;
const GRAPH_SPACING_RELAXATION_PASSES = 10;
const GRAPH_MIN_EXTENT = 1000;
const SEED_JITTER = 18;
const SEED_RADIUS_BASE = 160;
const SEED_RADIUS_STEP = 90;
const TABLE_SHARED_SPACING = 140;
const TABLE_CENTER_ROW_GAP = 100;
const TABLE_CENTER_HORIZONTAL_SPACING = 140;
const TABLE_PERIMETER_SPACING = 120;
const TABLE_PERIMETER_MIN_RADIUS_X = 320;
const TABLE_PERIMETER_MIN_RADIUS_Y = 220;
const TABLE_PERIMETER_RADIUS_X_STEP = 70;
const TABLE_PERIMETER_RADIUS_Y_STEP = 50;

const COMPASS_ANGLES: Readonly<Record<CompassPosition, number>> = {
  e: 0,
  se: Math.PI / 4,
  s: Math.PI / 2,
  sw: (3 * Math.PI) / 4,
  w: Math.PI,
  nw: (5 * Math.PI) / 4,
  n: (3 * Math.PI) / 2,
  ne: (7 * Math.PI) / 4,
  center: 0,
};

const CENTER_RADIUS_FRACTION = 0.15;

interface ComputeLayoutOptions {
  readonly regionHints?: readonly RegionHint[] | null;
  readonly boardZones?: readonly ZoneDef[];
  readonly tableZoneRoles?: CardAnimationZoneRoles | null;
}

function computeGraphExtent(nodeCount: number): number {
  const zoneDiagonal = Math.hypot(ZONE_RENDER_WIDTH, ZONE_RENDER_HEIGHT);
  const perNodeSpace = zoneDiagonal * GRAPH_NODE_SPACING_FACTOR;
  return Math.max(GRAPH_MIN_EXTENT, Math.ceil(Math.sqrt(nodeCount)) * perNodeSpace);
}

function computeGraphMinSpacing(): number {
  return Math.ceil(Math.hypot(ZONE_RENDER_WIDTH, ZONE_RENDER_HEIGHT) * GRAPH_MIN_SPACING_FACTOR);
}

export function computeLayout(
  def: GameDef,
  mode: LayoutMode,
  options?: ComputeLayoutOptions,
): LayoutResult {
  switch (mode) {
    case 'graph':
      return computeGraphLayout(def, options?.regionHints ?? null);
    case 'table':
      return computeTableLayout(
        options?.boardZones ?? selectPrimaryLayoutZones(def),
        options?.tableZoneRoles ?? null,
      );
    case 'track':
      return computeTrackLayout(def);
    case 'grid':
      return computeGridLayout(def);
  }
}

function computeTableLayout(
  tableZones: readonly ZoneDef[],
  zoneRoles: CardAnimationZoneRoles | null,
): LayoutResult {
  if (tableZones.length === 0) {
    return {
      positions: new Map(),
      mode: 'table',
      boardBounds: EMPTY_BOUNDS,
    };
  }

  const sharedZones: ZoneDef[] = [];
  const playerZones: ZoneDef[] = [];
  for (const zone of tableZones) {
    if (zone.owner === 'player') {
      playerZones.push(zone);
      continue;
    }
    sharedZones.push(zone);
  }

  sharedZones.sort((left, right) => left.id.localeCompare(right.id));
  playerZones.sort((left, right) => left.id.localeCompare(right.id));

  const positions = new Map<string, MutablePosition>();
  placeSharedZones(sharedZones, positions, zoneRoles);
  placePlayerZones(playerZones, positions);
  centerOnOrigin(positions);

  return {
    positions,
    mode: 'table',
    boardBounds: computeBounds(positions),
  };
}

function computeGraphLayout(
  def: GameDef,
  regionHints: readonly RegionHint[] | null,
): LayoutResult {
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

  seedInitialPositions(graph, nodeIDs, regionHints);
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

  normalizeToExtent(positions, computeGraphExtent(nodeIDs.length));
  enforceMinimumSpacing(positions, computeGraphMinSpacing(), GRAPH_SPACING_RELAXATION_PASSES);
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
  regionHints: readonly RegionHint[] | null,
): void {
  const zoneToCompass = buildZoneToCompassMap(regionHints);

  const categoryBuckets = new Map<string, string[]>();

  for (const nodeID of sortedNodeIDs) {
    const key = buildSeedGroupKey(graph, nodeID);
    const bucket = categoryBuckets.get(key);
    if (bucket === undefined) {
      categoryBuckets.set(key, [nodeID]);
      continue;
    }
    bucket.push(nodeID);
  }

  const categories = [...categoryBuckets.keys()].sort((left, right) => left.localeCompare(right));

  const hintedAngles = new Set<number>();
  const hintedBuckets: Array<{ category: string; angle: number; isCenter: boolean }> = [];
  const unhintedCategories: string[] = [];

  for (const category of categories) {
    const bucket = categoryBuckets.get(category);
    if (bucket === undefined) {
      continue;
    }

    const compass = findBucketCompass(bucket, zoneToCompass);
    if (compass !== null) {
      const angle = COMPASS_ANGLES[compass];
      hintedBuckets.push({ category, angle, isCenter: compass === 'center' });
      hintedAngles.add(angle);
      continue;
    }
    unhintedCategories.push(category);
  }

  const unhintedAngles = distributeUnhintedAngles(unhintedCategories.length, hintedAngles);

  for (const { category, angle, isCenter } of hintedBuckets) {
    const bucket = categoryBuckets.get(category);
    if (bucket === undefined) {
      continue;
    }
    placeBucketNodes(graph, bucket, angle, isCenter);
  }

  for (let index = 0; index < unhintedCategories.length; index += 1) {
    const category = unhintedCategories[index];
    if (category === undefined) {
      continue;
    }
    const bucket = categoryBuckets.get(category);
    if (bucket === undefined) {
      continue;
    }
    const angle = unhintedAngles[index] ?? 0;
    placeBucketNodes(graph, bucket, angle, false);
  }
}

function buildZoneToCompassMap(
  regionHints: readonly RegionHint[] | null,
): Map<string, CompassPosition> {
  const map = new Map<string, CompassPosition>();
  if (regionHints === null) {
    return map;
  }
  for (const region of regionHints) {
    if (region.position === undefined) {
      continue;
    }
    for (const zoneId of region.zones) {
      if (!map.has(zoneId)) {
        map.set(zoneId, region.position);
      }
    }
  }
  return map;
}

function findBucketCompass(
  bucket: readonly string[],
  zoneToCompass: ReadonlyMap<string, CompassPosition>,
): CompassPosition | null {
  for (const nodeID of bucket) {
    const compass = zoneToCompass.get(nodeID);
    if (compass !== undefined) {
      return compass;
    }
  }
  return null;
}

function distributeUnhintedAngles(
  count: number,
  hintedAngles: ReadonlySet<number>,
): readonly number[] {
  if (count === 0) {
    return [];
  }

  const fullCircle = Math.PI * 2;
  const candidates: number[] = [];
  const steps = count + hintedAngles.size;
  const step = fullCircle / Math.max(1, steps);

  for (let index = 0; index < steps; index += 1) {
    const angle = index * step;
    const tooClose = [...hintedAngles].some(
      (hinted) => Math.abs(normalizeAngle(angle - hinted)) < step * 0.5,
    );
    if (!tooClose) {
      candidates.push(angle);
    }
  }

  if (candidates.length >= count) {
    return candidates.slice(0, count);
  }

  const fallback: number[] = [];
  for (let index = 0; index < count; index += 1) {
    fallback.push((fullCircle * index) / count);
  }
  return fallback;
}

function normalizeAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  const normalized = ((angle % twoPi) + twoPi) % twoPi;
  return normalized > Math.PI ? normalized - twoPi : normalized;
}

function placeBucketNodes(
  graph: ReturnType<typeof buildLayoutGraph>,
  bucket: readonly string[],
  sectorAngle: number,
  isCenter: boolean,
): void {
  for (let index = 0; index < bucket.length; index += 1) {
    const nodeID = bucket[index];
    if (nodeID === undefined) {
      continue;
    }

    const baseRadius = isCenter
      ? SEED_RADIUS_BASE * CENTER_RADIUS_FRACTION
      : SEED_RADIUS_BASE + SEED_RADIUS_STEP * Math.floor(index / 8);
    const angleOffset = isCenter
      ? ((index % 8) / 8) * Math.PI * 2
      : ((index % 8) / 8) * (Math.PI / 3);
    const radius = baseRadius + (isCenter ? SEED_RADIUS_STEP * 0.3 * Math.floor(index / 8) : 0);
    const jitterX = deterministicJitter(`${nodeID}:x`) * SEED_JITTER;
    const jitterY = deterministicJitter(`${nodeID}:y`) * SEED_JITTER;
    const x = Math.cos(sectorAngle + angleOffset) * radius + jitterX;
    const y = Math.sin(sectorAngle + angleOffset) * radius + jitterY;

    graph.setNodeAttribute(nodeID, 'x', x);
    graph.setNodeAttribute(nodeID, 'y', y);
  }
}


function buildSeedGroupKey(
  graph: ReturnType<typeof buildLayoutGraph>,
  nodeID: string,
): string {
  const category = graph.getNodeAttribute(nodeID, 'category');
  const categoryStr = typeof category === 'string' && category.length > 0 ? category : '';
  const attributes = graph.getNodeAttribute(nodeID, 'attributes') as Record<string, unknown> | undefined;
  const country = typeof attributes?.country === 'string' ? attributes.country : '';
  if (country.length > 0) {
    return categoryStr.length > 0 ? `${country}:${categoryStr}` : country;
  }
  return categoryStr.length > 0 ? categoryStr : '__ungrouped__';
}

function placeSharedZones(
  zones: readonly ZoneDef[],
  positions: Map<string, MutablePosition>,
  zoneRoles: CardAnimationZoneRoles | null,
): void {
  if (zones.length === 0) {
    return;
  }

  if (zoneRoles !== null) {
    const zoneById = new Map(zones.map((zone) => [zone.id, zone] as const));
    const placedZoneIds = new Set<string>();
    placeRoleRow(positions, resolveRoleZones(zoneRoles.draw, zoneById, placedZoneIds), -TABLE_CENTER_ROW_GAP);
    placeRoleRow(positions, resolveRoleZones(zoneRoles.shared, zoneById, placedZoneIds), 0);
    placeRoleRow(
      positions,
      resolveRoleZones(zoneRoles.burn, zoneById, placedZoneIds),
      TABLE_CENTER_ROW_GAP,
      -TABLE_CENTER_HORIZONTAL_SPACING / 2,
    );
    placeRoleRow(
      positions,
      resolveRoleZones(zoneRoles.discard, zoneById, placedZoneIds),
      TABLE_CENTER_ROW_GAP,
      TABLE_CENTER_HORIZONTAL_SPACING / 2,
    );

    const unassigned = zones.filter((zone) => !placedZoneIds.has(zone.id));
    placeVerticalCenterColumn(unassigned, positions);
    return;
  }

  placeVerticalCenterColumn(zones, positions);
}

function placeVerticalCenterColumn(zones: readonly ZoneDef[], positions: Map<string, MutablePosition>): void {
  const startY = -((zones.length - 1) * TABLE_SHARED_SPACING) / 2;
  for (let index = 0; index < zones.length; index += 1) {
    const zone = zones[index];
    if (zone === undefined) {
      continue;
    }
    positions.set(zone.id, { x: 0, y: startY + (index * TABLE_SHARED_SPACING) });
  }
}

function placeRoleRow(
  positions: Map<string, MutablePosition>,
  zones: readonly ZoneDef[],
  y: number,
  xOffset = 0,
): void {
  if (zones.length === 0) {
    return;
  }

  const startX = xOffset - ((zones.length - 1) * TABLE_CENTER_HORIZONTAL_SPACING) / 2;
  for (let index = 0; index < zones.length; index += 1) {
    const zone = zones[index];
    if (zone === undefined) {
      continue;
    }
    positions.set(zone.id, { x: startX + (index * TABLE_CENTER_HORIZONTAL_SPACING), y });
  }
}

function resolveRoleZones(
  roleZoneIds: readonly string[],
  zoneById: ReadonlyMap<string, ZoneDef>,
  placedZoneIds: Set<string>,
): readonly ZoneDef[] {
  const zones: ZoneDef[] = [];
  for (const zoneId of roleZoneIds) {
    if (placedZoneIds.has(zoneId)) {
      continue;
    }
    const zone = zoneById.get(zoneId);
    if (zone === undefined) {
      continue;
    }
    zones.push(zone);
    placedZoneIds.add(zoneId);
  }

  return zones;
}

function placePlayerZones(zones: readonly ZoneDef[], positions: Map<string, MutablePosition>): void {
  if (zones.length === 0) {
    return;
  }

  const grouped = groupPlayerZones(zones);
  const groupCount = grouped.length;
  const radiusX = TABLE_PERIMETER_MIN_RADIUS_X + (Math.max(0, groupCount - 2) * TABLE_PERIMETER_RADIUS_X_STEP);
  const radiusY = TABLE_PERIMETER_MIN_RADIUS_Y + (Math.max(0, groupCount - 2) * TABLE_PERIMETER_RADIUS_Y_STEP);
  const angularStep = (Math.PI * 2) / groupCount;

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const group = grouped[groupIndex];
    if (group === undefined) {
      continue;
    }

    const angle = (Math.PI / 2) + (groupIndex * angularStep);
    const anchorX = Math.cos(angle) * radiusX;
    const anchorY = Math.sin(angle) * radiusY;
    const tangentX = -Math.sin(angle);
    const tangentY = Math.cos(angle);
    const startOffset = -((group.length - 1) * TABLE_PERIMETER_SPACING) / 2;

    for (let index = 0; index < group.length; index += 1) {
      const zone = group[index];
      if (zone === undefined) {
        continue;
      }
      const offset = startOffset + (index * TABLE_PERIMETER_SPACING);
      positions.set(zone.id, {
        x: anchorX + (tangentX * offset),
        y: anchorY + (tangentY * offset),
      });
    }
  }
}

function groupPlayerZones(zones: readonly ZoneDef[]): readonly (readonly ZoneDef[])[] {
  const groups = new Map<string, { seatIndex: number | null; zones: ZoneDef[] }>();
  for (const zone of zones) {
    if (zone.ownerPlayerIndex === undefined) {
      throw new Error(`Player-owned zone "${zone.id}" is missing required ownerPlayerIndex.`);
    }
    const key = `seat:${zone.ownerPlayerIndex}`;
    const current = groups.get(key);
    if (current === undefined) {
      groups.set(key, { seatIndex: zone.ownerPlayerIndex, zones: [zone] });
      continue;
    }
    current.zones.push(zone);
  }

  const sorted = [...groups.entries()].sort(([leftKey, leftGroup], [rightKey, rightGroup]) => {
    if (leftGroup.seatIndex !== null && rightGroup.seatIndex !== null) {
      return leftGroup.seatIndex - rightGroup.seatIndex;
    }
    if (leftGroup.seatIndex !== null) {
      return -1;
    }
    if (rightGroup.seatIndex !== null) {
      return 1;
    }
    return leftKey.localeCompare(rightKey);
  });

  return sorted.map(([, group]) => group.zones.sort((left, right) => left.id.localeCompare(right.id)));
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
