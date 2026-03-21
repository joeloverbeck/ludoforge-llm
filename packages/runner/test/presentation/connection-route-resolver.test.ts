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
        touchingZoneIds: [],
        connectedConnectionIds: [],
        connectionStyleKey: 'highway',
      }),
    ]);
    expect(result.filteredZones.map((zone) => zone.id)).toEqual(['alpha:none', 'beta:none', 'gamma:none']);
    expect(result.filteredAdjacencies).toEqual([makeAdjacency('alpha:none', 'gamma:none')]);
  });

  it('uses explicit mixed zone/anchor endpoint definitions for multi-neighbor routes', () => {
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
      endpointDefinitions: new Map([
        ['loc-hue-khe-sanh:none', [
          { kind: 'zone', zoneId: 'hue:none' },
          { kind: 'anchor', anchorId: 'khe-sanh' },
        ]],
      ]),
    }));

    expect(result.connectionRoutes).toEqual([
      expect.objectContaining({
        zoneId: 'loc-hue-khe-sanh:none',
        path: [
          { kind: 'zone', id: 'hue:none', position: { x: 0, y: 0 } },
          { kind: 'anchor', id: 'khe-sanh', position: { x: 160, y: -40 } },
        ],
        touchingZoneIds: ['central-laos:none', 'quang-tri-thua-thien:none'],
        connectionStyleKey: 'highway',
      }),
    ]);
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
      endpointDefinitions: new Map([
        ['loc-hue-khe-sanh:none', [
          { kind: 'zone', zoneId: 'hue:none' },
          { kind: 'anchor', anchorId: 'khe-sanh' },
        ]],
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
      endpointDefinitions: new Map([
        ['loc-saigon-ban-me-thuot:none', [
          { kind: 'zone', zoneId: 'saigon:none' },
          { kind: 'anchor', anchorId: 'ban-me-thuot' },
        ]],
        ['loc-kontum-ban-me-thuot:none', [
          { kind: 'zone', zoneId: 'kontum:none' },
          { kind: 'anchor', anchorId: 'ban-me-thuot' },
        ]],
        ['loc-cam-ranh-da-lat:none', [
          { kind: 'zone', zoneId: 'cam-ranh:none' },
          { kind: 'anchor', anchorId: 'da-lat' },
        ]],
        ['loc-ban-me-thuot-da-lat:none', [
          { kind: 'anchor', anchorId: 'ban-me-thuot' },
          { kind: 'anchor', anchorId: 'da-lat' },
        ]],
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

  it('prefers explicit path definitions over endpoint definitions and resolves multi-point geometry', () => {
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
      endpointDefinitions: new Map([
        ['loc-saigon-an-loc-ban-me-thuot:none', [
          { kind: 'zone', zoneId: 'saigon:none' },
          { kind: 'anchor', anchorId: 'ban-me-thuot' },
        ]],
      ]),
      pathDefinitions: new Map([
        ['loc-saigon-an-loc-ban-me-thuot:none', [
          { kind: 'zone', zoneId: 'saigon:none' },
          { kind: 'anchor', anchorId: 'an-loc' },
          { kind: 'anchor', anchorId: 'ban-me-thuot' },
        ]],
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
        touchingZoneIds: ['phu-bon:none'],
      }),
    ]);
  });
});
