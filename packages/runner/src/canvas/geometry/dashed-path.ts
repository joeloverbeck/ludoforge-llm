import type { Graphics } from 'pixi.js';

import type { Point2D } from './point2d.js';

export interface DashedPathOptions {
  readonly closed?: boolean;
}

const EPSILON = 1e-10;

export function drawDashedPath(
  graphics: Graphics,
  points: readonly Point2D[],
  dashLength: number,
  gapLength: number,
  options: DashedPathOptions = {},
): void {
  const segmentCount = resolveSegmentCount(points.length, options.closed === true);
  if (segmentCount === 0) {
    return;
  }

  let drawing = true;
  let remaining = dashLength;

  for (let index = 0; index < segmentCount; index += 1) {
    const from = points[index]!;
    const to = points[(index + 1) % points.length]!;
    let dx = to.x - from.x;
    let dy = to.y - from.y;
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
        graphics.moveTo(currentX, currentY);
        graphics.lineTo(nextX, nextY);
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
}

function resolveSegmentCount(pointCount: number, closed: boolean): number {
  if (pointCount < 2) {
    return 0;
  }
  return closed ? pointCount : pointCount - 1;
}
