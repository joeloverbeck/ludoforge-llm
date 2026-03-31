/**
 * Pole-of-inaccessibility algorithm — finds the point inside a polygon
 * farthest from any edge. Guarantees the result is always inside the polygon,
 * even for concave shapes. Uses iterative cell subdivision.
 *
 * Based on the approach from mapbox/polylabel (ISC license).
 */

interface Cell {
  readonly x: number;
  readonly y: number;
  readonly halfSize: number;
  readonly distance: number;
  readonly maxDistance: number;
}

const DEFAULT_PRECISION = 1.0;

/**
 * Compute the pole of inaccessibility for a polygon defined by a flat vertex
 * array in local coordinates: `[x0, y0, x1, y1, ...]`.
 *
 * Returns `{ x, y }` in local coordinates — the point inside the polygon
 * farthest from any edge. Falls back to the polygon centroid if the polygon
 * has fewer than 3 vertices.
 */
export function poleOfInaccessibility(
  vertices: readonly number[],
  precision: number = DEFAULT_PRECISION,
): { readonly x: number; readonly y: number } {
  const pointCount = Math.trunc(vertices.length / 2);
  if (pointCount < 3) {
    return { x: 0, y: 0 };
  }

  // Compute bounding box.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pointCount; i++) {
    const px = vertices[i * 2]!;
    const py = vertices[i * 2 + 1]!;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.max(width, height);

  if (cellSize === 0) {
    return { x: minX, y: minY };
  }

  let halfSize = cellSize / 2;

  // Priority queue (simple sorted array — polygon vertex counts are small).
  const queue: Cell[] = [];

  const enqueue = (cell: Cell): void => {
    // Insert in sorted order by maxDistance (descending).
    let lo = 0;
    let hi = queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (queue[mid]!.maxDistance > cell.maxDistance) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    queue.splice(lo, 0, cell);
  };

  // Seed the queue with initial cells covering the bounding box.
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      enqueue(makeCell(x + halfSize, y + halfSize, halfSize, vertices, pointCount));
    }
  }

  // Start with the centroid as the initial best guess.
  let bestCell = makeCentroidCell(vertices, pointCount);

  // Also consider bounding box center.
  const bboxCell = makeCell(minX + width / 2, minY + height / 2, 0, vertices, pointCount);
  if (bboxCell.distance > bestCell.distance) {
    bestCell = bboxCell;
  }

  while (queue.length > 0) {
    const cell = queue.shift()!;

    // Update best cell if this cell's center is better.
    if (cell.distance > bestCell.distance) {
      bestCell = cell;
    }

    // Skip cells that can't improve on the best by more than precision.
    if (cell.maxDistance - bestCell.distance <= precision) {
      continue;
    }

    // Subdivide into 4 children.
    halfSize = cell.halfSize / 2;
    enqueue(makeCell(cell.x - halfSize, cell.y - halfSize, halfSize, vertices, pointCount));
    enqueue(makeCell(cell.x + halfSize, cell.y - halfSize, halfSize, vertices, pointCount));
    enqueue(makeCell(cell.x - halfSize, cell.y + halfSize, halfSize, vertices, pointCount));
    enqueue(makeCell(cell.x + halfSize, cell.y + halfSize, halfSize, vertices, pointCount));
  }

  return { x: bestCell.x, y: bestCell.y };
}

function makeCell(
  x: number,
  y: number,
  halfSize: number,
  vertices: readonly number[],
  pointCount: number,
): Cell {
  const distance = pointToPolygonDistance(x, y, vertices, pointCount);
  return {
    x,
    y,
    halfSize,
    distance,
    maxDistance: distance + halfSize * Math.SQRT2,
  };
}

function makeCentroidCell(
  vertices: readonly number[],
  pointCount: number,
): Cell {
  let cx = 0;
  let cy = 0;
  let area = 0;

  for (let i = 0, j = pointCount - 1; i < pointCount; j = i++) {
    const ax = vertices[i * 2]!;
    const ay = vertices[i * 2 + 1]!;
    const bx = vertices[j * 2]!;
    const by = vertices[j * 2 + 1]!;
    const cross = ax * by - bx * ay;
    cx += (ax + bx) * cross;
    cy += (ay + by) * cross;
    area += cross;
  }

  area *= 0.5;

  if (area === 0) {
    // Degenerate polygon — use average of vertices.
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < pointCount; i++) {
      sx += vertices[i * 2]!;
      sy += vertices[i * 2 + 1]!;
    }
    return makeCell(sx / pointCount, sy / pointCount, 0, vertices, pointCount);
  }

  cx /= 6 * area;
  cy /= 6 * area;
  return makeCell(cx, cy, 0, vertices, pointCount);
}

/**
 * Signed distance from point `(px, py)` to the polygon boundary.
 * Positive if inside, negative if outside.
 */
function pointToPolygonDistance(
  px: number,
  py: number,
  vertices: readonly number[],
  pointCount: number,
): number {
  let inside = false;
  let minDistSq = Infinity;

  for (let i = 0, j = pointCount - 1; i < pointCount; j = i++) {
    const ax = vertices[i * 2]!;
    const ay = vertices[i * 2 + 1]!;
    const bx = vertices[j * 2]!;
    const by = vertices[j * 2 + 1]!;

    // Ray casting for inside/outside test.
    if ((ay > py) !== (by > py) && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
      inside = !inside;
    }

    // Squared distance from point to segment.
    minDistSq = Math.min(minDistSq, segmentDistanceSq(px, py, ax, ay, bx, by));
  }

  return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

function segmentDistanceSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const edgeDx = bx - ax;
  const edgeDy = by - ay;

  let closestX = ax;
  let closestY = ay;

  if (edgeDx !== 0 || edgeDy !== 0) {
    const t = Math.max(0, Math.min(1, ((px - ax) * edgeDx + (py - ay) * edgeDy) / (edgeDx * edgeDx + edgeDy * edgeDy)));
    closestX = ax + t * edgeDx;
    closestY = ay + t * edgeDy;
  }

  const dx = px - closestX;
  const dy = py - closestY;
  return dx * dx + dy * dy;
}
