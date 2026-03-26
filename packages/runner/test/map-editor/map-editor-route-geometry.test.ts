import { describe, expect, it } from 'vitest';

import {
  findNearestRouteSegment,
  nearestPointOnQuadratic,
  nearestPointOnStraight,
  resolveEndpointPosition,
  resolveRouteGeometry,
} from '../../src/map-editor/map-editor-route-geometry.js';
import type { ConnectionRouteDefinition } from '../../src/map-editor/map-editor-types.js';

describe('map-editor-route-geometry', () => {
  it('resolves zone and anchor endpoints from the editor document state', () => {
    const zonePositions = new Map([
      ['zone:a', { x: 10, y: 20 }],
    ]);
    const anchors = new Map([
      ['anchor:1', { x: 30, y: 40 }],
    ]);
    const zoneVisuals = new Map([
      ['zone:a', { shape: 'circle' as const, width: 80, height: 80 }],
    ]);

    expect(resolveEndpointPosition({ kind: 'zone', zoneId: 'zone:a' }, zonePositions, anchors, zoneVisuals)).toEqual({ x: 10, y: 20 });
    expect(resolveEndpointPosition({ kind: 'anchor', anchorId: 'anchor:1' }, zonePositions, anchors, zoneVisuals)).toEqual({ x: 30, y: 40 });
  });

  it('offsets anchored zone endpoints to the authored edge position and fails closed without visuals', () => {
    const zonePositions = new Map([
      ['zone:a', { x: 100, y: 120 }],
    ]);
    const zoneVisuals = new Map([
      ['zone:a', { shape: 'circle' as const, width: 100, height: 100 }],
    ]);

    expect(
      resolveEndpointPosition(
        { kind: 'zone', zoneId: 'zone:a', anchor: 90 },
        zonePositions,
        new Map(),
        zoneVisuals,
      ),
    ).toEqual({ x: 100, y: 70 });

    expect(
      resolveEndpointPosition(
        { kind: 'zone', zoneId: 'zone:a', anchor: 90 },
        zonePositions,
        new Map(),
        new Map(),
      ),
    ).toBeNull();
  });

  it('resolves inline and anchor-backed quadratic controls into shared geometry', () => {
    const geometry = resolveRouteGeometry(
      {
        points: [
          { kind: 'zone', zoneId: 'zone:a' },
          { kind: 'anchor', anchorId: 'anchor:mid' },
          { kind: 'zone', zoneId: 'zone:b' },
        ],
        segments: [
          { kind: 'quadratic', control: { kind: 'position', x: 30, y: 15 } },
          { kind: 'quadratic', control: { kind: 'anchor', anchorId: 'anchor:ctrl' } },
        ],
      },
      new Map([
        ['zone:a', { x: 0, y: 0 }],
        ['zone:b', { x: 80, y: 0 }],
      ]),
      new Map([
        ['anchor:mid', { x: 40, y: 20 }],
        ['anchor:ctrl', { x: 60, y: 25 }],
      ]),
      new Map([
        ['zone:a', { shape: 'rectangle' as const, width: 120, height: 80 }],
        ['zone:b', { shape: 'rectangle' as const, width: 120, height: 80 }],
      ]),
    );

    expect(geometry?.segments[0]).toMatchObject({
      kind: 'quadratic',
      controlPoint: {
        kind: 'position',
        id: null,
        position: { x: 30, y: 15 },
      },
    });
    expect(geometry?.segments[1]).toMatchObject({
      kind: 'quadratic',
      controlPoint: {
        kind: 'anchor',
        id: 'anchor:ctrl',
        position: { x: 60, y: 25 },
      },
    });
  });

  it('resolves curvature controls against segment endpoints', () => {
    const geometry = resolveRouteGeometry(
      {
        points: [
          { kind: 'zone', zoneId: 'zone:a' },
          { kind: 'zone', zoneId: 'zone:b' },
        ],
        segments: [
          { kind: 'quadratic', control: { kind: 'curvature', offset: 0.25, angle: 90 } },
        ],
      },
      new Map([
        ['zone:a', { x: 0, y: 0 }],
        ['zone:b', { x: 80, y: 0 }],
      ]),
      new Map(),
      new Map([
        ['zone:a', { shape: 'rectangle' as const, width: 120, height: 80 }],
        ['zone:b', { shape: 'rectangle' as const, width: 120, height: 80 }],
      ]),
    );

    expect(geometry?.segments[0]).toMatchObject({
      kind: 'quadratic',
      controlPoint: {
        kind: 'curvature',
        id: null,
      },
    });
    const segment = geometry?.segments[0];
    expect(segment?.kind).toBe('quadratic');
    if (segment?.kind === 'quadratic') {
      expect(segment.controlPoint.position.x).toBeCloseTo(40);
      expect(segment.controlPoint.position.y).toBeCloseTo(-20);
    }
  });

  it('samples multi-segment routes into a polyline and hit polygon', () => {
    const geometry = resolveRouteGeometry(
      makeRouteDefinition(),
      new Map([
        ['zone:a', { x: 0, y: 0 }],
        ['zone:b', { x: 80, y: 0 }],
      ]),
      new Map([
        ['anchor:mid', { x: 40, y: 20 }],
      ]),
      new Map([
        ['zone:a', { shape: 'rectangle' as const, width: 120, height: 80 }],
        ['zone:b', { shape: 'rectangle' as const, width: 120, height: 80 }],
      ]),
      {
        curveSegments: 6,
        hitAreaPadding: 10,
        strokeWidth: 4,
      },
    );

    expect(geometry).not.toBeNull();
    expect(geometry?.sampledPath.length).toBeGreaterThan(3);
    expect(geometry?.sampledPath[0]).toEqual({ x: 0, y: 0 });
    expect(geometry?.sampledPath.at(-1)).toEqual({ x: 80, y: 0 });
    expect(geometry?.hitAreaPoints.length).toBeGreaterThan(geometry?.sampledPath.length ?? 0);
  });

  it('samples anchored routes from resolved edge endpoints instead of zone centers', () => {
    const geometry = resolveRouteGeometry(
      {
        points: [
          { kind: 'zone', zoneId: 'zone:a', anchor: 0 },
          { kind: 'zone', zoneId: 'zone:b', anchor: 180 },
        ],
        segments: [
          { kind: 'straight' },
        ],
      },
      new Map([
        ['zone:a', { x: 0, y: 0 }],
        ['zone:b', { x: 120, y: 0 }],
      ]),
      new Map(),
      new Map([
        ['zone:a', { shape: 'rectangle' as const, width: 40, height: 20 }],
        ['zone:b', { shape: 'rectangle' as const, width: 40, height: 20 }],
      ]),
    );

    expect(geometry?.sampledPath[0]).toEqual({ x: 20, y: 0 });
    expect(geometry?.sampledPath.at(-1)).toEqual({ x: 100, y: 0 });
  });

  it('projects nearest points onto straight segments and clamps to endpoints', () => {
    expect(
      nearestPointOnStraight({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 3 }),
    ).toEqual({
      position: { x: 5, y: 0 },
      t: 0.5,
    });

    expect(
      nearestPointOnStraight({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 4 }),
    ).toEqual({
      position: { x: 10, y: 0 },
      t: 1,
    });
  });

  it('finds a stable nearest point on quadratic curves', () => {
    const result = nearestPointOnQuadratic(
      { x: 0, y: 0 },
      { x: 20, y: 20 },
      { x: 40, y: 0 },
      { x: 20, y: 8 },
      80,
    );

    expect(result.t).toBeGreaterThan(0.2);
    expect(result.t).toBeLessThan(0.8);
    expect(result.position.y).toBeGreaterThan(8);
  });

  it('finds the nearest segment on multi-segment routes', () => {
    const geometry = resolveRouteGeometry(
      {
        points: [
          { kind: 'zone', zoneId: 'zone:a' },
          { kind: 'anchor', anchorId: 'anchor:mid' },
          { kind: 'zone', zoneId: 'zone:b' },
        ],
        segments: [
          { kind: 'straight' },
          { kind: 'quadratic', control: { kind: 'position', x: 60, y: 30 } },
        ],
      },
      new Map([
        ['zone:a', { x: 0, y: 0 }],
        ['zone:b', { x: 80, y: 0 }],
      ]),
      new Map([
        ['anchor:mid', { x: 40, y: 0 }],
      ]),
      new Map([
        ['zone:a', { shape: 'rectangle' as const, width: 120, height: 80 }],
        ['zone:b', { shape: 'rectangle' as const, width: 120, height: 80 }],
      ]),
    );

    expect(geometry).not.toBeNull();
    expect(findNearestRouteSegment(geometry!, { x: 15, y: 4 })?.segmentIndex).toBe(0);
    expect(findNearestRouteSegment(geometry!, { x: 62, y: 14 })?.segmentIndex).toBe(1);
  });
});

function makeRouteDefinition(): ConnectionRouteDefinition {
  return {
    points: [
      { kind: 'zone', zoneId: 'zone:a' },
      { kind: 'anchor', anchorId: 'anchor:mid' },
      { kind: 'zone', zoneId: 'zone:b' },
    ],
    segments: [
      { kind: 'quadratic', control: { kind: 'position', x: 20, y: 30 } },
      { kind: 'straight' },
    ],
  };
}
