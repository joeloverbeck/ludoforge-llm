import type { Graphics } from 'pixi.js';

import type { DashedSegment } from '../geometry/dashed-segments.js';

type StrokeStyle = Parameters<Graphics['stroke']>[0];

export function strokeDashedSegments(
  graphics: Graphics,
  segments: readonly DashedSegment[],
  strokeStyle: StrokeStyle,
): void {
  for (const segment of segments) {
    graphics.moveTo(segment.from.x, segment.from.y);
    graphics.lineTo(segment.to.x, segment.to.y);
    graphics.stroke(strokeStyle);
  }
}
