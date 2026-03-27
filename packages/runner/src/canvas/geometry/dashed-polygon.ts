import type { Graphics } from 'pixi.js';

import { buildDashedSegments } from './dashed-segments.js';
import type { Point2D } from './point2d.js';

/**
 * Draw dashed line segments along a closed polygon path.
 */
export function drawDashedPolygon(
  graphics: Graphics,
  points: readonly Point2D[],
  dashLength: number,
  gapLength: number,
): void {
  const segments = buildDashedSegments(points, dashLength, gapLength, { closed: true });
  for (const segment of segments) {
    graphics.moveTo(segment.from.x, segment.from.y);
    graphics.lineTo(segment.to.x, segment.to.y);
  }
}
