import type { Graphics } from 'pixi.js';

import { buildDashedSegments } from './dashed-segments.js';
import type { Point2D } from './point2d.js';

export function drawDashedLine(
  graphics: Graphics,
  from: Point2D,
  to: Point2D,
  dashLength: number,
  gapLength: number,
): void {
  const segments = buildDashedSegments([from, to], dashLength, gapLength);
  for (const segment of segments) {
    graphics.moveTo(segment.from.x, segment.from.y);
    graphics.lineTo(segment.to.x, segment.to.y);
  }
}
