import type { Point2D } from './point2d.js';

export interface DashedPathOptions {
  readonly closed?: boolean;
}

export interface DashedSegment {
  readonly from: Point2D;
  readonly to: Point2D;
}

const EPSILON = 1e-10;

export function buildDashedSegments(
  points: readonly Point2D[],
  dashLength: number,
  gapLength: number,
  options: DashedPathOptions = {},
): readonly DashedSegment[] {
  validateDashPattern(dashLength, gapLength);

  const segmentCount = resolveSegmentCount(points.length, options.closed === true);
  if (segmentCount === 0) {
    return [];
  }

  const segments: DashedSegment[] = [];
  let drawing = true;
  let remaining = dashLength;

  for (let index = 0; index < segmentCount; index += 1) {
    const from = points[index]!;
    const to = points[(index + 1) % points.length]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let edgeLength = Math.sqrt((dx * dx) + (dy * dy));

    if (edgeLength < EPSILON) {
      continue;
    }

    const ux = dx / edgeLength;
    const uy = dy / edgeLength;
    let currentX = from.x;
    let currentY = from.y;

    while (edgeLength > EPSILON) {
      const step = Math.min(remaining, edgeLength);
      const nextX = currentX + (ux * step);
      const nextY = currentY + (uy * step);

      if (drawing) {
        segments.push({
          from: { x: currentX, y: currentY },
          to: { x: nextX, y: nextY },
        });
      }

      currentX = nextX;
      currentY = nextY;
      edgeLength -= step;
      remaining -= step;

      if (remaining < EPSILON) {
        drawing = !drawing;
        remaining = drawing ? dashLength : gapLength;
      }
    }
  }

  return segments;
}

function resolveSegmentCount(pointCount: number, closed: boolean): number {
  if (pointCount < 2) {
    return 0;
  }
  return closed ? pointCount : pointCount - 1;
}

function validateDashPattern(dashLength: number, gapLength: number): void {
  if (!Number.isFinite(dashLength) || dashLength <= 0) {
    throw new RangeError(`dashLength must be a finite number greater than zero. Received: ${dashLength}`);
  }
  if (!Number.isFinite(gapLength) || gapLength < 0) {
    throw new RangeError(`gapLength must be a finite number greater than or equal to zero. Received: ${gapLength}`);
  }
}
