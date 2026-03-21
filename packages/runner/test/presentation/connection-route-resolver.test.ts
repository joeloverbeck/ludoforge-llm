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

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
    }));

    expect(result.connectionRoutes).toEqual([
      expect.objectContaining({
        zoneId: 'loc-alpha-beta:none',
        endpointZoneIds: ['alpha:none', 'beta:none'],
        touchingZoneIds: [],
        connectedConnectionIds: [],
        connectionStyleKey: 'highway',
      }),
    ]);
    expect(result.filteredZones.map((zone) => zone.id)).toEqual(['alpha:none', 'beta:none', 'gamma:none']);
    expect(result.filteredAdjacencies).toEqual([makeAdjacency('alpha:none', 'gamma:none')]);
  });

  it('uses explicit endpoint overrides for multi-neighbor routes and preserves touching zones', () => {
    const zones = [
      makeZone('can-tho:none'),
      makeZone('ba-xuyen:none'),
      makeZone('kien-hoa-vinh-binh:none'),
      makeZone('loc-can-tho-long-phu:none', 'connection', 'mekong'),
    ];
    const adjacencies = [
      makeAdjacency('loc-can-tho-long-phu:none', 'can-tho:none'),
      makeAdjacency('loc-can-tho-long-phu:none', 'ba-xuyen:none'),
      makeAdjacency('loc-can-tho-long-phu:none', 'kien-hoa-vinh-binh:none'),
    ];

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
      endpointOverrides: new Map([
        ['loc-can-tho-long-phu:none', ['can-tho:none', 'ba-xuyen:none'] as const],
      ]),
    }));

    expect(result.connectionRoutes).toEqual([
      expect.objectContaining({
        zoneId: 'loc-can-tho-long-phu:none',
        endpointZoneIds: ['can-tho:none', 'ba-xuyen:none'],
        touchingZoneIds: ['kien-hoa-vinh-binh:none'],
        connectionStyleKey: 'mekong',
      }),
    ]);
    expect(result.filteredZones.map((zone) => zone.id)).toEqual([
      'can-tho:none',
      'ba-xuyen:none',
      'kien-hoa-vinh-binh:none',
    ]);
    expect(result.filteredAdjacencies).toEqual([]);
  });

  it('falls back to zone-id parsing only when that yields exactly two known endpoints', () => {
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
    }));

    expect(result.connectionRoutes).toEqual([
      expect.objectContaining({
        zoneId: 'loc-hue-da-nang:none',
        endpointZoneIds: ['da-nang:none', 'hue:none'],
        touchingZoneIds: ['quang-nam:none'],
      }),
    ]);
    expect(result.filteredZones.map((zone) => zone.id)).toEqual([
      'da-nang:none',
      'hue:none',
      'quang-nam:none',
    ]);
  });

  it('leaves ambiguous connection zones untouched when endpoints cannot be resolved', () => {
    const zones = [
      makeZone('can-tho:none'),
      makeZone('ba-xuyen:none'),
      makeZone('kien-hoa-vinh-binh:none'),
      makeZone('loc-can-tho-long-phu:none', 'connection'),
    ];
    const adjacencies = [
      makeAdjacency('loc-can-tho-long-phu:none', 'can-tho:none'),
      makeAdjacency('loc-can-tho-long-phu:none', 'ba-xuyen:none'),
      makeAdjacency('loc-can-tho-long-phu:none', 'kien-hoa-vinh-binh:none'),
    ];

    const result = resolveConnectionRoutes(makeOptions({
      zones,
      adjacencies,
    }));

    expect(result.connectionRoutes).toEqual([]);
    expect(result.junctions).toEqual([]);
    expect(result.filteredZones).toEqual(zones);
    expect(result.filteredAdjacencies).toEqual(adjacencies);
  });

  it('creates junctions for directly adjacent resolved connection routes', () => {
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
    expect(result.junctions).toEqual([
      {
        id: 'junction:loc-alpha-beta:none::loc-beta-gamma:none',
        connectionIds: ['loc-alpha-beta:none', 'loc-beta-gamma:none'],
        position: { x: 20, y: 40 },
      },
    ]);
    expect(result.filteredAdjacencies).toEqual([makeAdjacency('alpha:none', 'gamma:none')]);
  });

  it('returns empty outputs for empty input', () => {
    expect(resolveConnectionRoutes(makeOptions())).toEqual({
      connectionRoutes: [],
      junctions: [],
      filteredZones: [],
      filteredAdjacencies: [],
    });
  });
});
