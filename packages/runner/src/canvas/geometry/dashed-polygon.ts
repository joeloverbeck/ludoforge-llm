import type { Graphics } from 'pixi.js';
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
  const n = points.length;
  if (n < 2) {
    return;
  }

  let drawing = true;
  let remaining = dashLength;

  for (let i = 0; i < n; i += 1) {
    const from = points[i]!;
    const to = points[(i + 1) % n]!;
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    let edgeLen = Math.sqrt(dx * dx + dy * dy);

    if (edgeLen < 1e-10) {
      continue;
    }

    const ux = dx / edgeLen;
    const uy = dy / edgeLen;
    let cx = from.x;
    let cy = from.y;

    while (edgeLen > 1e-10) {
      const step = Math.min(remaining, edgeLen);
      const nx = cx + ux * step;
      const ny = cy + uy * step;

      if (drawing) {
        graphics.moveTo(cx, cy);
        graphics.lineTo(nx, ny);
      }

      cx = nx;
      cy = ny;
      edgeLen -= step;
      remaining -= step;

      if (remaining < 1e-10) {
        drawing = !drawing;
        remaining = drawing ? dashLength : gapLength;
      }
    }
  }
}
