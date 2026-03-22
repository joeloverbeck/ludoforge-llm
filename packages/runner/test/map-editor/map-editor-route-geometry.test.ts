import { describe, expect, it } from 'vitest';

import {
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

    expect(resolveEndpointPosition({ kind: 'zone', zoneId: 'zone:a' }, zonePositions, anchors)).toEqual({ x: 10, y: 20 });
    expect(resolveEndpointPosition({ kind: 'anchor', anchorId: 'anchor:1' }, zonePositions, anchors)).toEqual({ x: 30, y: 40 });
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
