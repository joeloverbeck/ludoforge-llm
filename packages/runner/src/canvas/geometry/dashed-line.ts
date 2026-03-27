import type { Graphics } from 'pixi.js';

import { drawDashedPath } from './dashed-path.js';
import type { Point2D } from './point2d.js';

export function drawDashedLine(
  graphics: Graphics,
  from: Point2D,
  to: Point2D,
  dashLength: number,
  gapLength: number,
): void {
  drawDashedPath(graphics, [from, to], dashLength, gapLength);
}
