import type { Position } from '../../spatial/position-types.js';
import type { PresentationAdjacencyNode, PresentationZoneNode } from '../../presentation/presentation-scene.js';

/** Half the gap width (in pixels) between adjacent province polygons. */
const BORDER_GAP_HALF = 2;
/** Angular cone half-width (radians) for identifying facing vertices. */
const FACING_CONE_HALF = Math.PI / 3; // ±60°
/** Maximum distance a vertex can be extruded from its original position. */
const MAX_EXTRUSION_DISTANCE = 200;

export interface ProvinceBorderSegment {
  /** If true, this vertex was projected onto a bisector (shared border). */
  readonly isBorder: boolean;
}

export interface ModifiedProvincePolygon {
  /** Modified vertex array (flat: [x1, y1, x2, y2, ...]). */
  readonly vertices: readonly number[];
  /** Per-vertex annotation: whether each vertex is a border vertex. */
  readonly segments: readonly ProvinceBorderSegment[];
}

/**
 * Computes modified polygon paths for province zones so that adjacent provinces
 * share straight bisector borders instead of having gaps between them.
 *
 * Non-province zones and provinces without polygon vertices are skipped.
 */
export function computeProvinceBorders(
  zones: readonly PresentationZoneNode[],
  positions: ReadonlyMap<string, Position>,
  adjacencies: readonly PresentationAdjacencyNode[],
): ReadonlyMap<string, ModifiedProvincePolygon> {
  const provinceZones = new Map<string, PresentationZoneNode>();
  for (const zone of zones) {
    if (zone.category === 'province' && zone.visual.shape === 'polygon') {
      const verts = zone.visual.vertices;
      if (verts !== null && verts !== undefined && verts.length >= 6) {
        provinceZones.set(zone.id, zone);
      }
    }
  }

  if (provinceZones.size === 0) {
    return new Map();
  }

  // Collect province-to-province adjacency pairs.
  const adjacencyPairs: Array<{ from: string; to: string }> = [];
  for (const adj of adjacencies) {
    if (provinceZones.has(adj.from) && provinceZones.has(adj.to)) {
      adjacencyPairs.push({ from: adj.from, to: adj.to });
    }
  }

  // Build neighbor map.
  const neighborMap = new Map<string, string[]>();
  for (const pair of adjacencyPairs) {
    getOrCreate(neighborMap, pair.from).push(pair.to);
    getOrCreate(neighborMap, pair.to).push(pair.from);
  }

  const results = new Map<string, ModifiedProvincePolygon>();

  for (const [zoneId, zone] of provinceZones) {
    const pos = positions.get(zoneId);
    const verts = zone.visual.vertices;
    if (pos === undefined || verts === null || verts === undefined) {
      continue;
    }

    const neighbors = neighborMap.get(zoneId) ?? [];
    if (neighbors.length === 0) {
      // No adjacent provinces — keep original vertices, all organic.
      results.set(zoneId, {
        vertices: verts,
        segments: buildUniformSegments(verts.length / 2, false),
      });
      continue;
    }

    // Compute effective radius for this zone.
    const zoneRadius = effectiveRadius(polygonArea(verts));

    // Build bisector info for each neighbor.
    const bisectors: BisectorInfo[] = [];
    for (const neighborId of neighbors) {
      const neighborPos = positions.get(neighborId);
      const neighborZone = provinceZones.get(neighborId);
      if (neighborPos === undefined || neighborZone === undefined) {
        continue;
      }
      const neighborVerts = neighborZone.visual.vertices;
      const neighborRadius = neighborVerts !== null && neighborVerts !== undefined
        ? effectiveRadius(polygonArea(neighborVerts))
        : zoneRadius;
      bisectors.push(computeWeightedBisector(pos, neighborPos, zoneRadius, neighborRadius));
    }

    // Process each vertex.
    const vertexCount = Math.trunc(verts.length / 2);
    const modifiedVerts: number[] = [];
    const segments: ProvinceBorderSegment[] = [];

    for (let i = 0; i < vertexCount; i++) {
      const localX = verts[i * 2]!;
      const localY = verts[i * 2 + 1]!;
      const worldX = pos.x + localX;
      const worldY = pos.y + localY;

      // Find which bisector this vertex should be projected onto.
      let bestBisector: BisectorInfo | null = null;
      let bestAngleDiff = Infinity;

      for (const bisector of bisectors) {
        const angleDiff = angleDifference(
          Math.atan2(worldY - pos.y, worldX - pos.x),
          bisector.angleFromA,
        );
        if (angleDiff <= FACING_CONE_HALF && angleDiff < bestAngleDiff) {
          bestAngleDiff = angleDiff;
          bestBisector = bisector;
        }
      }

      if (bestBisector === null) {
        // Not facing any neighbor — keep original vertex.
        modifiedVerts.push(localX, localY);
        segments.push({ isBorder: false });
        continue;
      }

      // Project world-space vertex onto the bisector line, inset by BORDER_GAP_HALF.
      const projected = projectOntoBisector(worldX, worldY, bestBisector, BORDER_GAP_HALF);

      // Check extrusion distance.
      const extrusionDist = Math.hypot(projected.x - worldX, projected.y - worldY);
      if (extrusionDist > MAX_EXTRUSION_DISTANCE) {
        // Too far — keep original vertex.
        modifiedVerts.push(localX, localY);
        segments.push({ isBorder: false });
        continue;
      }

      // Convert back to local space.
      modifiedVerts.push(projected.x - pos.x, projected.y - pos.y);
      segments.push({ isBorder: true });
    }

    results.set(zoneId, { vertices: modifiedVerts, segments });
  }

  return results;
}

/**
 * Applies Chaikin smoothing only to non-border segments of a polygon.
 * Border segments (straight bisector edges) are preserved as-is.
 */
export function selectiveSmoothPolygon(
  polygon: ModifiedProvincePolygon,
  iterations: number = 2,
): number[] {
  const { vertices, segments } = polygon;
  if (vertices.length < 6 || iterations <= 0) {
    return [...vertices];
  }

  let currentVerts = [...vertices];
  let currentSegments = [...segments];

  for (let iter = 0; iter < iterations; iter++) {
    const pointCount = Math.trunc(currentVerts.length / 2);
    const smoothed: number[] = [];
    const newSegments: ProvinceBorderSegment[] = [];

    for (let i = 0; i < pointCount; i++) {
      const ax = currentVerts[i * 2]!;
      const ay = currentVerts[i * 2 + 1]!;
      const nextIdx = (i + 1) % pointCount;
      const bx = currentVerts[nextIdx * 2]!;
      const by = currentVerts[nextIdx * 2 + 1]!;

      const segA = currentSegments[i];
      const segB = currentSegments[nextIdx];

      if (segA !== undefined && segB !== undefined && segA.isBorder && segB.isBorder) {
        // Both endpoints are border vertices — keep both as-is (no subdivision).
        smoothed.push(ax, ay, bx, by);
        newSegments.push({ isBorder: true }, { isBorder: true });
      } else {
        // At least one endpoint is organic — apply Chaikin subdivision.
        smoothed.push(
          ax * 0.75 + bx * 0.25,
          ay * 0.75 + by * 0.25,
          ax * 0.25 + bx * 0.75,
          ay * 0.25 + by * 0.75,
        );
        // Subdivided points inherit border status from their nearest original vertex.
        newSegments.push(
          { isBorder: segA?.isBorder === true },
          { isBorder: segB?.isBorder === true },
        );
      }
    }

    currentVerts = smoothed;
    currentSegments = newSegments;
  }

  return currentVerts;
}

// --- Internal helpers ---

interface BisectorInfo {
  /** Weighted point on the line between A and B centers. */
  readonly midpoint: Position;
  /** Direction of the bisector line (perpendicular to A→B). */
  readonly direction: Position;
  /** Angle from A's center toward B's center (radians). */
  readonly angleFromA: number;
}

function computeWeightedBisector(
  aCenter: Position,
  bCenter: Position,
  radiusA: number,
  radiusB: number,
): BisectorInfo {
  const dx = bCenter.x - aCenter.x;
  const dy = bCenter.y - aCenter.y;
  const d2 = dx * dx + dy * dy;
  const length = Math.sqrt(d2);
  // Power-diagram weighted parameter: degrades to 0.5 when radii are equal.
  const t = d2 > 0
    ? Math.max(0.1, Math.min(0.9, (d2 + radiusA * radiusA - radiusB * radiusB) / (2 * d2)))
    : 0.5;
  // Perpendicular direction (rotated 90° CCW).
  const perpX = length > 0 ? -dy / length : 0;
  const perpY = length > 0 ? dx / length : 1;
  return {
    midpoint: {
      x: aCenter.x + t * dx,
      y: aCenter.y + t * dy,
    },
    direction: { x: perpX, y: perpY },
    angleFromA: Math.atan2(dy, dx),
  };
}

function projectOntoBisector(
  worldX: number,
  worldY: number,
  bisector: BisectorInfo,
  insetAmount: number,
): Position {
  // Project the point onto the bisector line.
  const toPointX = worldX - bisector.midpoint.x;
  const toPointY = worldY - bisector.midpoint.y;

  // Component along the bisector direction (tangential).
  const tangentialDist = toPointX * bisector.direction.x + toPointY * bisector.direction.y;

  // The projected point on the bisector line.
  const projX = bisector.midpoint.x + bisector.direction.x * tangentialDist;
  const projY = bisector.midpoint.y + bisector.direction.y * tangentialDist;

  // Inset toward the province's side (away from the bisector midpoint toward A's center).
  // The normal to the bisector pointing toward A is the negated A→B unit vector.
  const normalX = -bisector.direction.y; // perpendicular to perpendicular = original direction
  const normalY = bisector.direction.x;

  // Determine which side of the bisector the original point is on.
  const sideSign = toPointX * normalX + toPointY * normalY;
  const insetDir = sideSign >= 0 ? 1 : -1;

  return {
    x: projX + normalX * insetAmount * insetDir,
    y: projY + normalY * insetAmount * insetDir,
  };
}

function angleDifference(a: number, b: number): number {
  let diff = Math.abs(a - b);
  if (diff > Math.PI) {
    diff = 2 * Math.PI - diff;
  }
  return diff;
}

function getOrCreate(map: Map<string, string[]>, key: string): string[] {
  let arr = map.get(key);
  if (arr === undefined) {
    arr = [];
    map.set(key, arr);
  }
  return arr;
}

function buildUniformSegments(count: number, isBorder: boolean): ProvinceBorderSegment[] {
  return Array.from({ length: count }, () => ({ isBorder }));
}

/**
 * Computes the area of a polygon from a flat vertex array [x1,y1,x2,y2,...]
 * using the shoelace formula. Returns absolute area (always positive).
 */
export function polygonArea(vertices: readonly number[]): number {
  const n = Math.trunc(vertices.length / 2);
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = vertices[i * 2]!;
    const yi = vertices[i * 2 + 1]!;
    const xj = vertices[j * 2]!;
    const yj = vertices[j * 2 + 1]!;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) / 2;
}

/** Returns the radius of a circle with equivalent area. */
export function effectiveRadius(area: number): number {
  return Math.sqrt(area / Math.PI);
}
