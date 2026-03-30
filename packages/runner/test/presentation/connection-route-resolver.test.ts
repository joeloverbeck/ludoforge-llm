import { describe, expect, it } from 'vitest';

import {
  resolveConnectionRoutes,
  type ResolveConnectionRoutesOptions,
} from '../../src/presentation/connection-route-resolver.js';
import type {
  PresentationAdjacencyNode,
  PresentationZoneNode,
} from '../../src/presentation/presentation-scene.js';

function makeZone(
  id: string,
  shape: PresentationZoneNode['visual']['shape'] = 'rectangle',
  connectionStyleKey: string | null = null,
): PresentationZoneNode {
  return {
    id,
    displayName: id,
    ownerID: null,
    isSelectable: false,
    category: null,
    attributes: {},
    visual: {
      shape,
      width: 160,
      height: 100,
      color: null,
      connectionStyleKey,
      vertices: null, strokeColor: null,
    },
    render: {
      fillColor: '#000000',
      stroke: { color: '#111827', width: 1, alpha: 1 },
      hiddenStackCount: 0,
      nameLabel: { text: id, x: 0, y: 0, visible: true },
      markersLabel: { text: '', x: 0, y: 0, visible: false },
      badge: null,
    },
  };
}

function makeAdjacency(from: string, to: string): PresentationAdjacencyNode {
  return {
    from,
    to,
    category: null,
    isHighlighted: false,
  };
}

function makeOptions(overrides: Partial<ResolveConnectionRoutesOptions> = {}): ResolveConnectionRoutesOptions {
  return {
    zones: [],
    adjacencies: [],
    positions: new Map(),
    ...overrides,
  };
}

describe('resolveConnectionRoutes', () => {
  it('resolves a connection zone with exactly two non-connection neighbors', () => {
    const zones = [
      makeZone('alpha:none'),
      makeZone('beta:none'),
      makeZone('gamma:none'),
      makeZone('loc-alpha-beta:none', 'connection', 'highway'),
    ];
    const adjacencies = [
      makeAdjacency('loc-alpha-beta:none', 'alpha:none'),
      makeAdjacency('loc-alpha-beta:none', 'beta:none'),
      makeAdjacency('alpha:none', 'gamma:none'),
    ];
    const positions = new Map([
      ['alpha:none', { x: 0, y: 0 }],
      ['beta:none', { x: 200, y: 0 }],
    ]);

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      positions,
    }));

    expect(result.connectionRoutes).toEqual([
      expect.objectContaining({
        zoneId: 'loc-alpha-beta:none',
        path: [
          { kind: 'zone', id: 'alpha:none', position: { x: 0, y: 0 } },
          { kind: 'zone', id: 'beta:none', position: { x: 200, y: 0 } },
        ],
        segments: [
          { kind: 'straight' },
        ],
        touchingZoneIds: [],
        spurs: [],
        connectionStyleKey: 'highway',
      }),
    ]);
    expect(result.connectionRoutes[0]).not.toHaveProperty('connectedConnectionIds');
    expect(result.filteredZones.map((zone) => zone.id)).toEqual(['alpha:none', 'beta:none', 'gamma:none']);
    expect(result.filteredAdjacencies).toEqual([makeAdjacency('alpha:none', 'gamma:none')]);
  });

  it('uses explicit unified route definitions for multi-neighbor routes', () => {
    const zones = [
      makeZone('hue:none'),
      makeZone('quang-tri-thua-thien:none'),
      makeZone('central-laos:none'),
      makeZone('loc-hue-khe-sanh:none', 'connection', 'highway'),
    ];
    const adjacencies = [
      makeAdjacency('loc-hue-khe-sanh:none', 'hue:none'),
      makeAdjacency('loc-hue-khe-sanh:none', 'quang-tri-thua-thien:none'),
      makeAdjacency('loc-hue-khe-sanh:none', 'central-laos:none'),
    ];

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      positions: new Map([
        ['hue:none', { x: 0, y: 0 }],
        ['quang-tri-thua-thien:none', { x: 100, y: 40 }],
        ['central-laos:none', { x: 220, y: -20 }],
      ]),
      anchorPositions: new Map([
        ['khe-sanh', { x: 160, y: -40 }],
      ]),
      routeDefinitions: new Map([
        ['loc-hue-khe-sanh:none', {
          points: [
            { kind: 'zone', zoneId: 'hue:none' },
            { kind: 'anchor', anchorId: 'khe-sanh' },
          ],
          segments: [
            { kind: 'quadratic', control: { kind: 'position', x: 80, y: -30 } },
          ],
        }],
      ]),
    }));

    expect(result.connectionRoutes).toEqual([
      expect.objectContaining({
        zoneId: 'loc-hue-khe-sanh:none',
        path: [
          { kind: 'zone', id: 'hue:none', position: { x: 0, y: 0 } },
          { kind: 'anchor', id: 'khe-sanh', position: { x: 160, y: -40 } },
        ],
        segments: [
          {
            kind: 'quadratic',
            controlPoint: { kind: 'position', id: null, position: { x: 80, y: -30 } },
          },
        ],
        touchingZoneIds: ['central-laos:none', 'quang-tri-thua-thien:none'],
        spurs: [
          {
            from: { x: 160, y: -40 },
            to: { x: 300, y: 6.666666666666682 },
            targetZoneId: 'central-laos:none',
          },
          {
            from: { x: 83.85739513218846, y: -25.9442581834003 },
            to: { x: 112.23958333333331, y: 90 },
            targetZoneId: 'quang-tri-thua-thien:none',
          },
        ],
        connectionStyleKey: 'highway',
      }),
    ]);
  });

  it('resolves curvature controls from configured route definitions', () => {
    const result = resolveConnectionRoutes(makeOptions({
      zones: [
        makeZone('alpha:none'),
        makeZone('beta:none'),
        makeZone('loc-alpha-beta:none', 'connection', 'highway'),
      ],
      adjacencies: [
        makeAdjacency('loc-alpha-beta:none', 'alpha:none'),
        makeAdjacency('loc-alpha-beta:none', 'beta:none'),
      ],
      positions: new Map([
        ['alpha:none', { x: 0, y: 0 }],
        ['beta:none', { x: 100, y: 0 }],
      ]),
      routeDefinitions: new Map([
        ['loc-alpha-beta:none', {
          points: [
            { kind: 'zone', zoneId: 'alpha:none' },
            { kind: 'zone', zoneId: 'beta:none' },
          ],
          segments: [
            { kind: 'quadratic', control: { kind: 'curvature', offset: 0.2 } },
          ],
        }],
      ]),
    }));

    expect(result.connectionRoutes).toEqual([
      expect.objectContaining({
        segments: [
          {
            kind: 'quadratic',
            controlPoint: { kind: 'curvature', id: null, position: { x: 50, y: 20 } },
          },
        ],
      }),
    ]);
  });

  it('resolves explicit curvature angles in screen coordinates', () => {
    const result = resolveConnectionRoutes(makeOptions({
      zones: [
        makeZone('alpha:none'),
        makeZone('beta:none'),
        makeZone('loc-alpha-beta:none', 'connection'),
      ],
      adjacencies: [
        makeAdjacency('loc-alpha-beta:none', 'alpha:none'),
        makeAdjacency('loc-alpha-beta:none', 'beta:none'),
      ],
      positions: new Map([
        ['alpha:none', { x: 0, y: 0 }],
        ['beta:none', { x: 100, y: 0 }],
      ]),
      routeDefinitions: new Map([
        ['loc-alpha-beta:none', {
          points: [
            { kind: 'zone', zoneId: 'alpha:none' },
            { kind: 'zone', zoneId: 'beta:none' },
          ],
          segments: [
            { kind: 'quadratic', control: { kind: 'curvature', offset: 0.25, angle: 90 } },
          ],
        }],
      ]),
    }));

    const segment = result.connectionRoutes[0]?.segments[0];
    expect(segment).toMatchObject({
      kind: 'quadratic',
      controlPoint: { kind: 'curvature', id: null },
    });
    expect(segment?.kind).toBe('quadratic');
    if (segment?.kind === 'quadratic') {
      expect(segment.controlPoint.position.x).toBeCloseTo(50);
      expect(segment.controlPoint.position.y).toBeCloseTo(-25);
    }
  });

  it('fails closed when configured anchor geometry is missing', () => {
    const zones = [
      makeZone('hue:none'),
      makeZone('central-laos:none'),
      makeZone('loc-hue-khe-sanh:none', 'connection'),
    ];
    const adjacencies = [
      makeAdjacency('loc-hue-khe-sanh:none', 'hue:none'),
      makeAdjacency('loc-hue-khe-sanh:none', 'central-laos:none'),
    ];

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      positions: new Map([
        ['hue:none', { x: 0, y: 0 }],
        ['central-laos:none', { x: 200, y: 0 }],
      ]),
      routeDefinitions: new Map([
        ['loc-hue-khe-sanh:none', {
          points: [
            { kind: 'zone', zoneId: 'hue:none' },
            { kind: 'anchor', anchorId: 'khe-sanh' },
          ],
          segments: [
            { kind: 'straight' },
          ],
        }],
      ]),
    }));

    expect(result.connectionRoutes).toEqual([]);
    expect(result.junctions).toEqual([]);
    expect(result.filteredZones).toEqual(zones);
    expect(result.filteredAdjacencies).toEqual(adjacencies);
  });

  it('does not fall back to zone-id parsing for ambiguous routes', () => {
    const zones = [
      makeZone('da-nang:none'),
      makeZone('hue:none'),
      makeZone('quang-nam:none'),
      makeZone('loc-hue-da-nang:none', 'connection'),
    ];
    const adjacencies = [
      makeAdjacency('loc-hue-da-nang:none', 'hue:none'),
      makeAdjacency('loc-hue-da-nang:none', 'da-nang:none'),
      makeAdjacency('loc-hue-da-nang:none', 'quang-nam:none'),
    ];

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      positions: new Map([
        ['da-nang:none', { x: 0, y: 0 }],
        ['hue:none', { x: 200, y: 0 }],
        ['quang-nam:none', { x: 100, y: 80 }],
      ]),
    }));

    expect(result.connectionRoutes).toEqual([]);
    expect(result.filteredZones).toEqual(zones);
    expect(result.filteredAdjacencies).toEqual(adjacencies);
  });

  it('does not create midpoint junctions from direct connection-to-connection adjacency alone', () => {
    const zones = [
      makeZone('alpha:none'),
      makeZone('beta:none'),
      makeZone('gamma:none'),
      makeZone('loc-alpha-beta:none', 'connection'),
      makeZone('loc-beta-gamma:none', 'connection'),
    ];
    const adjacencies = [
      makeAdjacency('loc-alpha-beta:none', 'alpha:none'),
      makeAdjacency('loc-alpha-beta:none', 'beta:none'),
      makeAdjacency('loc-beta-gamma:none', 'beta:none'),
      makeAdjacency('loc-beta-gamma:none', 'gamma:none'),
      makeAdjacency('loc-alpha-beta:none', 'loc-beta-gamma:none'),
      makeAdjacency('alpha:none', 'gamma:none'),
    ];
    const positions = new Map([
      ['alpha:none', { x: 0, y: 0 }],
      ['beta:none', { x: 100, y: 0 }],
      ['gamma:none', { x: 200, y: 0 }],
      ['loc-alpha-beta:none', { x: 10, y: 20 }],
      ['loc-beta-gamma:none', { x: 30, y: 60 }],
    ]);

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      positions,
    }));

    expect(result.connectionRoutes.map((route) => route.zoneId)).toEqual([
      'loc-alpha-beta:none',
      'loc-beta-gamma:none',
    ]);
    expect(result.connectionRoutes[0]).not.toHaveProperty('connectedConnectionIds');
    expect(result.connectionRoutes[1]).not.toHaveProperty('connectedConnectionIds');
    expect(result.junctions).toEqual([]);
    expect(result.filteredAdjacencies).toEqual([makeAdjacency('alpha:none', 'gamma:none')]);
  });

  it('creates one shared-anchor junction for every authored anchor referenced by multiple routes', () => {
    const zones = [
      makeZone('saigon:none'),
      makeZone('kontum:none'),
      makeZone('cam-ranh:none'),
      makeZone('loc-saigon-ban-me-thuot:none', 'connection', 'highway'),
      makeZone('loc-kontum-ban-me-thuot:none', 'connection', 'highway'),
      makeZone('loc-cam-ranh-da-lat:none', 'connection', 'highway'),
      makeZone('loc-ban-me-thuot-da-lat:none', 'connection', 'highway'),
    ];
    const adjacencies = [
      makeAdjacency('loc-saigon-ban-me-thuot:none', 'saigon:none'),
      makeAdjacency('loc-kontum-ban-me-thuot:none', 'kontum:none'),
      makeAdjacency('loc-cam-ranh-da-lat:none', 'cam-ranh:none'),
      makeAdjacency('loc-saigon-ban-me-thuot:none', 'loc-kontum-ban-me-thuot:none'),
      makeAdjacency('loc-kontum-ban-me-thuot:none', 'loc-ban-me-thuot-da-lat:none'),
      makeAdjacency('loc-cam-ranh-da-lat:none', 'loc-ban-me-thuot-da-lat:none'),
    ];

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      positions: new Map([
        ['saigon:none', { x: 0, y: 0 }],
        ['kontum:none', { x: 220, y: 0 }],
        ['cam-ranh:none', { x: 440, y: 0 }],
      ]),
      anchorPositions: new Map([
        ['ban-me-thuot', { x: 160, y: 90 }],
        ['da-lat', { x: 320, y: 160 }],
      ]),
      routeDefinitions: new Map([
        ['loc-saigon-ban-me-thuot:none', {
          points: [
            { kind: 'zone', zoneId: 'saigon:none' },
            { kind: 'anchor', anchorId: 'ban-me-thuot' },
          ],
          segments: [
            { kind: 'straight' },
          ],
        }],
        ['loc-kontum-ban-me-thuot:none', {
          points: [
            { kind: 'zone', zoneId: 'kontum:none' },
            { kind: 'anchor', anchorId: 'ban-me-thuot' },
          ],
          segments: [
            { kind: 'straight' },
          ],
        }],
        ['loc-cam-ranh-da-lat:none', {
          points: [
            { kind: 'zone', zoneId: 'cam-ranh:none' },
            { kind: 'anchor', anchorId: 'da-lat' },
          ],
          segments: [
            { kind: 'straight' },
          ],
        }],
        ['loc-ban-me-thuot-da-lat:none', {
          points: [
            { kind: 'anchor', anchorId: 'ban-me-thuot' },
            { kind: 'anchor', anchorId: 'da-lat' },
          ],
          segments: [
            { kind: 'straight' },
          ],
        }],
      ]),
    }));

    expect(result.connectionRoutes.map((route) => route.zoneId)).toEqual([
      'loc-saigon-ban-me-thuot:none',
      'loc-kontum-ban-me-thuot:none',
      'loc-cam-ranh-da-lat:none',
      'loc-ban-me-thuot-da-lat:none',
    ]);
    expect(result.junctions).toEqual([
      {
        id: 'junction:anchor:ban-me-thuot',
        connectionIds: [
          'loc-ban-me-thuot-da-lat:none',
          'loc-kontum-ban-me-thuot:none',
          'loc-saigon-ban-me-thuot:none',
        ],
        position: { x: 160, y: 90 },
      },
      {
        id: 'junction:anchor:da-lat',
        connectionIds: [
          'loc-ban-me-thuot-da-lat:none',
          'loc-cam-ranh-da-lat:none',
        ],
        position: { x: 320, y: 160 },
      },
    ]);
  });

  it('returns empty outputs for empty input', () => {
    expect(resolveConnectionRoutes(makeOptions())).toEqual({
      connectionRoutes: [],
      junctions: [],
      filteredZones: [],
      filteredAdjacencies: [],
    });
  });

  it('resolves explicit multi-point geometry from unified route definitions', () => {
    const zones = [
      makeZone('saigon:none'),
      makeZone('phu-bon:none'),
      makeZone('loc-saigon-an-loc-ban-me-thuot:none', 'connection', 'highway'),
    ];
    const adjacencies = [
      makeAdjacency('loc-saigon-an-loc-ban-me-thuot:none', 'saigon:none'),
      makeAdjacency('loc-saigon-an-loc-ban-me-thuot:none', 'phu-bon:none'),
    ];

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      positions: new Map([
        ['saigon:none', { x: 0, y: 0 }],
        ['phu-bon:none', { x: 260, y: 0 }],
      ]),
      anchorPositions: new Map([
        ['an-loc', { x: 120, y: -20 }],
        ['ban-me-thuot', { x: 240, y: -10 }],
      ]),
      routeDefinitions: new Map([
        ['loc-saigon-an-loc-ban-me-thuot:none', {
          points: [
            { kind: 'zone', zoneId: 'saigon:none' },
            { kind: 'anchor', anchorId: 'an-loc' },
            { kind: 'anchor', anchorId: 'ban-me-thuot' },
          ],
          segments: [
            { kind: 'straight' },
            { kind: 'quadratic', control: { kind: 'position', x: 180, y: -40 } },
          ],
        }],
      ]),
    }));

    expect(result.connectionRoutes).toEqual([
      expect.objectContaining({
        zoneId: 'loc-saigon-an-loc-ban-me-thuot:none',
        path: [
          { kind: 'zone', id: 'saigon:none', position: { x: 0, y: 0 } },
          { kind: 'anchor', id: 'an-loc', position: { x: 120, y: -20 } },
          { kind: 'anchor', id: 'ban-me-thuot', position: { x: 240, y: -10 } },
        ],
        segments: [
          { kind: 'straight' },
          {
            kind: 'quadratic',
            controlPoint: { kind: 'position', id: null, position: { x: 180, y: -40 } },
          },
        ],
        touchingZoneIds: ['phu-bon:none'],
        spurs: [
          {
            from: { x: 240, y: -10 },
            to: { x: 340, y: 40 },
            targetZoneId: 'phu-bon:none',
          },
        ],
      }),
    ]);
  });

  it('derives one spur per touching zone on the nearest sampled route point', () => {
    const result = resolveConnectionRoutes(makeOptions({
      zones: [
        makeZone('alpha:none'),
        makeZone('beta:none'),
        makeZone('gamma:none'),
        makeZone('loc-alpha-beta:none', 'connection', 'highway'),
      ],
      adjacencies: [
        makeAdjacency('loc-alpha-beta:none', 'alpha:none'),
        makeAdjacency('loc-alpha-beta:none', 'beta:none'),
        makeAdjacency('loc-alpha-beta:none', 'gamma:none'),
      ],
      positions: new Map([
        ['alpha:none', { x: 0, y: 0 }],
        ['beta:none', { x: 200, y: 0 }],
        ['gamma:none', { x: 80, y: 60 }],
      ]),
      routeDefinitions: new Map([
        ['loc-alpha-beta:none', {
          points: [
            { kind: 'zone', zoneId: 'alpha:none' },
            { kind: 'zone', zoneId: 'beta:none' },
          ],
          segments: [
            { kind: 'straight' },
          ],
        }],
      ]),
    }));

    expect(result.connectionRoutes[0]?.spurs).toEqual([
      {
        from: { x: 80, y: 0 },
        to: { x: 80, y: 110 },
        targetZoneId: 'gamma:none',
      },
    ]);
  });

  it('skips spurs when touching-zone geometry is incomplete while keeping the route', () => {
    const result = resolveConnectionRoutes(makeOptions({
      zones: [
        makeZone('alpha:none'),
        makeZone('beta:none'),
        makeZone('gamma:none'),
        makeZone('loc-alpha-beta:none', 'connection', 'highway'),
      ],
      adjacencies: [
        makeAdjacency('loc-alpha-beta:none', 'alpha:none'),
        makeAdjacency('loc-alpha-beta:none', 'beta:none'),
        makeAdjacency('loc-alpha-beta:none', 'gamma:none'),
      ],
      positions: new Map([
        ['alpha:none', { x: 0, y: 0 }],
        ['beta:none', { x: 200, y: 0 }],
      ]),
      routeDefinitions: new Map([
        ['loc-alpha-beta:none', {
          points: [
            { kind: 'zone', zoneId: 'alpha:none' },
            { kind: 'zone', zoneId: 'beta:none' },
          ],
          segments: [
            { kind: 'straight' },
          ],
        }],
      ]),
    }));

    expect(result.connectionRoutes).toHaveLength(1);
    expect(result.connectionRoutes[0]?.spurs).toEqual([]);
    expect(result.connectionRoutes[0]?.touchingZoneIds).toEqual(['gamma:none']);
  });

  it('keeps unanchored zone endpoints at zone centers', () => {
    const zones = [
      makeZone('alpha:none', 'circle'),
      makeZone('beta:none'),
      makeZone('loc-alpha-beta:none', 'connection'),
    ];
    const adjacencies = [
      makeAdjacency('loc-alpha-beta:none', 'alpha:none'),
      makeAdjacency('loc-alpha-beta:none', 'beta:none'),
    ];

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      positions: new Map([
        ['alpha:none', { x: 100, y: 120 }],
        ['beta:none', { x: 300, y: 120 }],
      ]),
      routeDefinitions: new Map([
        ['loc-alpha-beta:none', {
          points: [
            { kind: 'zone', zoneId: 'alpha:none' },
            { kind: 'zone', zoneId: 'beta:none' },
          ],
          segments: [
            { kind: 'straight' },
          ],
        }],
      ]),
    }));

    expect(result.connectionRoutes[0]?.path).toEqual([
      { kind: 'zone', id: 'alpha:none', position: { x: 100, y: 120 } },
      { kind: 'zone', id: 'beta:none', position: { x: 300, y: 120 } },
    ]);
  });

  it('offsets anchored circle zone endpoints to the zone edge', () => {
    const zones = [
      makeZone('alpha:none', 'circle'),
      makeZone('beta:none'),
      makeZone('loc-alpha-beta:none', 'connection'),
    ];
    const adjacencies = [
      makeAdjacency('loc-alpha-beta:none', 'alpha:none'),
      makeAdjacency('loc-alpha-beta:none', 'beta:none'),
    ];

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      positions: new Map([
        ['alpha:none', { x: 100, y: 120 }],
        ['beta:none', { x: 300, y: 120 }],
      ]),
      routeDefinitions: new Map([
        ['loc-alpha-beta:none', {
          points: [
            { kind: 'zone', zoneId: 'alpha:none', anchor: 0 },
            { kind: 'zone', zoneId: 'beta:none', anchor: 90 },
          ],
          segments: [
            { kind: 'straight' },
          ],
        }],
      ]),
    }));

    expect(result.connectionRoutes[0]?.path).toEqual([
      { kind: 'zone', id: 'alpha:none', position: { x: 150, y: 120 } },
      { kind: 'zone', id: 'beta:none', position: { x: 300, y: 70 } },
    ]);
  });

  it('supports mixed anchored and center zone endpoints in one route', () => {
    const zones = [
      makeZone('alpha:none', 'circle'),
      makeZone('beta:none', 'rectangle'),
      makeZone('loc-alpha-beta:none', 'connection'),
    ];
    const adjacencies = [
      makeAdjacency('loc-alpha-beta:none', 'alpha:none'),
      makeAdjacency('loc-alpha-beta:none', 'beta:none'),
    ];

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      positions: new Map([
        ['alpha:none', { x: 100, y: 120 }],
        ['beta:none', { x: 300, y: 120 }],
      ]),
      routeDefinitions: new Map([
        ['loc-alpha-beta:none', {
          points: [
            { kind: 'zone', zoneId: 'alpha:none', anchor: 180 },
            { kind: 'zone', zoneId: 'beta:none' },
          ],
          segments: [
            { kind: 'straight' },
          ],
        }],
      ]),
    }));

    expect(result.connectionRoutes[0]?.path).toEqual([
      { kind: 'zone', id: 'alpha:none', position: { x: 50, y: 120 } },
      { kind: 'zone', id: 'beta:none', position: { x: 300, y: 120 } },
    ]);
  });

  it('offsets anchored rectangle zone endpoints to the matching edge midpoint', () => {
    const zones = [
      makeZone('alpha:none', 'rectangle'),
      makeZone('beta:none', 'rectangle'),
      makeZone('loc-alpha-beta:none', 'connection'),
    ];
    const adjacencies = [
      makeAdjacency('loc-alpha-beta:none', 'alpha:none'),
      makeAdjacency('loc-alpha-beta:none', 'beta:none'),
    ];

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      positions: new Map([
        ['alpha:none', { x: 100, y: 120 }],
        ['beta:none', { x: 300, y: 120 }],
      ]),
      routeDefinitions: new Map([
        ['loc-alpha-beta:none', {
          points: [
            { kind: 'zone', zoneId: 'alpha:none', anchor: 270 },
            { kind: 'zone', zoneId: 'beta:none', anchor: 180 },
          ],
          segments: [
            { kind: 'straight' },
          ],
        }],
      ]),
    }));

    expect(result.connectionRoutes[0]?.path).toEqual([
      { kind: 'zone', id: 'alpha:none', position: { x: 100, y: 170 } },
      { kind: 'zone', id: 'beta:none', position: { x: 220, y: 120 } },
    ]);
  });

  it('fails closed when a configured anchored zone endpoint references a missing zone', () => {
    const zones = [
      makeZone('alpha:none'),
      makeZone('beta:none'),
      makeZone('loc-alpha-beta:none', 'connection'),
    ];
    const adjacencies = [
      makeAdjacency('loc-alpha-beta:none', 'alpha:none'),
      makeAdjacency('loc-alpha-beta:none', 'beta:none'),
    ];

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      positions: new Map([
        ['alpha:none', { x: 100, y: 120 }],
        ['beta:none', { x: 300, y: 120 }],
      ]),
      routeDefinitions: new Map([
        ['loc-alpha-beta:none', {
          points: [
            { kind: 'zone', zoneId: 'alpha:none' },
            { kind: 'zone', zoneId: 'missing:none', anchor: 90 },
          ],
          segments: [
            { kind: 'straight' },
          ],
        }],
      ]),
    }));

    expect(result.connectionRoutes).toEqual([]);
    expect(result.filteredZones).toEqual(zones);
    expect(result.filteredAdjacencies).toEqual(adjacencies);
  });
});
