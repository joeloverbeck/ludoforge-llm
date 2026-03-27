import { describe, expect, it } from 'vitest';

import {
  nearestPointOnPolyline,
  sampleResolvedRoutePath,
} from '../../src/presentation/connection-route-geometry.js';

describe('connection-route-geometry', () => {
  it('samples quadratic route segments into a deterministic polyline', () => {
    const sampled = sampleResolvedRoutePath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        {
          kind: 'quadratic',
          controlPoint: { position: { x: 50, y: 50 } },
        },
      ],
      4,
    );

    expect(sampled).toEqual([
      { x: 0, y: 0 },
      { x: 25, y: 18.75 },
      { x: 50, y: 25 },
      { x: 75, y: 18.75 },
      { x: 100, y: 0 },
    ]);
  });

  it('projects to the nearest point on a polyline and clamps to endpoints', () => {
    const polyline = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];

    expect(nearestPointOnPolyline(polyline, { x: 30, y: 0 })).toEqual({ x: 30, y: 0 });
    expect(nearestPointOnPolyline(polyline, { x: 40, y: 20 })).toEqual({ x: 40, y: 0 });
    expect(nearestPointOnPolyline(polyline, { x: 160, y: 140 })).toEqual({ x: 100, y: 100 });
  });
});
