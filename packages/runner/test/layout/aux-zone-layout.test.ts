import { describe, expect, it } from 'vitest';
import { asZoneId, type ZoneDef } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider';
import { computeAuxLayout } from '../../src/layout/aux-zone-layout';
import { ZONE_RENDER_HEIGHT, ZONE_RENDER_WIDTH } from '../../src/layout/layout-constants';

const BOARD_BOUNDS = { minX: -200, minY: -100, maxX: 500, maxY: 450 } as const;
const NULL_PROVIDER = new VisualConfigProvider(null);

describe('computeAuxLayout', () => {
  it('groups stack zones without adjacency into Cards', () => {
    const result = computeAuxLayout([
      zone('deck:none', { ordering: 'stack' }),
      zone('discard:none', { ordering: 'stack', adjacentTo: [{ to: 'somewhere:none' }] }),
    ], BOARD_BOUNDS, NULL_PROVIDER);

    expect(result.groups).toEqual([
      { label: 'Cards', zoneIds: ['deck:none'] },
      { label: 'Other', zoneIds: ['discard:none'] },
    ]);
  });

  it('groups force pools from explicit layoutRole semantics', () => {
    const provider = providerWithLayoutRoles({
      'Available-Troops:none': 'forcePool',
      'out-of-play-leaders:none': 'forcePool',
      'casualties-guerrillas:0': 'forcePool',
    });
    const result = computeAuxLayout([
      zone('Available-Troops:none'),
      zone('out-of-play-leaders:none'),
      zone('casualties-guerrillas:0'),
    ], BOARD_BOUNDS, provider);

    expect(result.groups).toEqual([
      {
        label: 'Force Pools',
        zoneIds: ['Available-Troops:none', 'casualties-guerrillas:0', 'out-of-play-leaders:none'],
      },
    ]);
  });

  it('uses provider layoutRole precedence over heuristics', () => {
    const provider = providerWithLayoutRoles({
      'stacked:none': 'hand',
      'public-player:none': 'card',
      'misc:none': 'other',
    });
    const result = computeAuxLayout([
      zone('stacked:none', { ordering: 'stack' }),
      zone('public-player:none', { owner: 'player', visibility: 'owner' }),
      zone('misc:none'),
    ], BOARD_BOUNDS, provider);

    expect(result.groups).toEqual([
      { label: 'Cards', zoneIds: ['public-player:none'] },
      { label: 'Hands', zoneIds: ['stacked:none'] },
      { label: 'Other', zoneIds: ['misc:none'] },
    ]);
  });

  it('does not infer force pools from zone id patterns without layoutRole', () => {
    const result = computeAuxLayout([
      zone('available-us:none'),
      zone('out-of-play-us:none'),
      zone('casualties-us:none'),
    ], BOARD_BOUNDS, NULL_PROVIDER);

    expect(result.groups).toEqual([
      {
        label: 'Other',
        zoneIds: ['available-us:none', 'casualties-us:none', 'out-of-play-us:none'],
      },
    ]);
  });

  it('groups player owner-visible zones into Hands', () => {
    const result = computeAuxLayout([
      zone('hand:0', { owner: 'player', visibility: 'owner' }),
      zone('hand:1', { owner: 'player', visibility: 'owner' }),
      zone('shared:none', { owner: 'none', visibility: 'public' }),
    ], BOARD_BOUNDS, NULL_PROVIDER);

    expect(result.groups).toEqual([
      { label: 'Hands', zoneIds: ['hand:0', 'hand:1'] },
      { label: 'Other', zoneIds: ['shared:none'] },
    ]);
  });

  it('omits empty groups and keeps stable group ordering', () => {
    const provider = providerWithLayoutRoles({
      'available-us:none': 'forcePool',
    });
    const result = computeAuxLayout([
      zone('deck:none', { ordering: 'stack' }),
      zone('available-us:none'),
      zone('hand:3', { owner: 'player', visibility: 'owner' }),
      zone('misc:none'),
    ], BOARD_BOUNDS, provider);

    expect(result.groups.map((group) => group.label)).toEqual(['Cards', 'Force Pools', 'Hands', 'Other']);
  });

  it('places all aux positions to the right of board and vertically stacks each group', () => {
    const provider = providerWithLayoutRoles({
      'available-us:none': 'forcePool',
      'available-arvn:none': 'forcePool',
    });
    const result = computeAuxLayout([
      zone('deck:none', { ordering: 'stack' }),
      zone('leader:none', { ordering: 'stack' }),
      zone('available-us:none'),
      zone('available-arvn:none'),
    ], BOARD_BOUNDS, provider);

    for (const position of result.positions.values()) {
      expect(position.x).toBeGreaterThan(BOARD_BOUNDS.maxX);
    }

    const deckPosition = result.positions.get('deck:none');
    const leaderPosition = result.positions.get('leader:none');
    expect(deckPosition).toBeDefined();
    expect(leaderPosition).toBeDefined();
    expect(leaderPosition?.x).toBe(deckPosition?.x);
    expect(leaderPosition?.y).toBeGreaterThan(deckPosition?.y ?? Number.NEGATIVE_INFINITY);
  });

  it('positions every input zone exactly once with unique coordinates', () => {
    const zones = [
      zone('deck:none', { ordering: 'stack' }),
      zone('available-us:none'),
      zone('hand:0', { owner: 'player', visibility: 'owner' }),
      zone('misc:none'),
    ];
    const result = computeAuxLayout(zones, BOARD_BOUNDS, providerWithLayoutRoles({ 'available-us:none': 'forcePool' }));

    expect(result.positions.size).toBe(zones.length);

    const coordinates = new Set([...result.positions.values()].map((position) => `${position.x}:${position.y}`));
    expect(coordinates.size).toBe(zones.length);
  });

  it('returns empty layout for empty aux zone input', () => {
    const result = computeAuxLayout([], BOARD_BOUNDS, NULL_PROVIDER);

    expect(result.positions.size).toBe(0);
    expect(result.groups).toEqual([]);
  });

  it('works with zero-area board bounds', () => {
    const result = computeAuxLayout([zone('deck:none', { ordering: 'stack' })], {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    }, NULL_PROVIDER);

    expect(result.positions.get('deck:none')).toEqual({ x: ZONE_RENDER_WIDTH + 40, y: 0 });
  });

  it('returns deterministic grouping and positions regardless of input order', () => {
    const zones = [
      zone('hand:1', { owner: 'player', visibility: 'owner' }),
      zone('available-vc:none'),
      zone('deck:none', { ordering: 'stack' }),
      zone('hand:0', { owner: 'player', visibility: 'owner' }),
    ];
    const reversed = [...zones].reverse();
    const provider = providerWithLayoutRoles({ 'available-vc:none': 'forcePool' });

    const first = computeAuxLayout(zones, BOARD_BOUNDS, provider);
    const second = computeAuxLayout(reversed, BOARD_BOUNDS, provider);

    expect(second.groups).toEqual(first.groups);
    expect([...second.positions.entries()].sort(([left], [right]) => left.localeCompare(right))).toEqual(
      [...first.positions.entries()].sort(([left], [right]) => left.localeCompare(right)),
    );
  });

  it('vertical spacing between consecutive zones exceeds zone height', () => {
    const result = computeAuxLayout([
      zone('a:none'),
      zone('b:none'),
      zone('c:none'),
    ], BOARD_BOUNDS, providerWithLayoutRoles({
      'a:none': 'forcePool',
      'b:none': 'forcePool',
      'c:none': 'forcePool',
    }));

    const positions = ['a:none', 'b:none', 'c:none'].map((id) => result.positions.get(id)!);
    for (let i = 1; i < positions.length; i += 1) {
      const gap = Math.abs(positions[i]!.y - positions[i - 1]!.y);
      expect(gap).toBeGreaterThanOrEqual(ZONE_RENDER_HEIGHT);
    }
  });

  it('group spacing between different groups exceeds zone height', () => {
    const result = computeAuxLayout([
      zone('deck:none', { ordering: 'stack' }),
      zone('pool:none'),
    ], BOARD_BOUNDS, providerWithLayoutRoles({ 'pool:none': 'forcePool' }));

    const deckPos = result.positions.get('deck:none')!;
    const poolPos = result.positions.get('pool:none')!;
    const gap = Math.abs(poolPos.y - deckPos.y);
    expect(gap).toBeGreaterThan(ZONE_RENDER_HEIGHT);
  });

  it('sidebar X provides clearance so aux zones do not overlap board edge zones', () => {
    const result = computeAuxLayout([
      zone('deck:none', { ordering: 'stack' }),
    ], BOARD_BOUNDS, NULL_PROVIDER);

    const deckPos = result.positions.get('deck:none')!;
    const auxLeftEdge = deckPos.x - ZONE_RENDER_WIDTH / 2;
    const boardRightEdge = BOARD_BOUNDS.maxX + ZONE_RENDER_WIDTH / 2;
    expect(auxLeftEdge).toBeGreaterThanOrEqual(boardRightEdge);
  });

  it('no two aux zones overlap when many zones are present', () => {
    const zones = Array.from({ length: 8 }, (_, i) => zone(`fp${i}:none`));
    const result = computeAuxLayout(
      zones,
      BOARD_BOUNDS,
      providerWithLayoutRoles(
        Object.fromEntries(zones.map((currentZone) => [currentZone.id, 'forcePool'] as const)),
      ),
    );
    const entries = [...result.positions.values()];

    for (let left = 0; left < entries.length - 1; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const a = entries[left]!;
        const b = entries[right]!;
        const verticalGap = Math.abs(a.y - b.y);
        expect(verticalGap).toBeGreaterThanOrEqual(ZONE_RENDER_HEIGHT);
      }
    }
  });
});

interface ZoneOverrides {
  readonly owner?: ZoneDef['owner'];
  readonly visibility?: ZoneDef['visibility'];
  readonly ordering?: ZoneDef['ordering'];
  readonly adjacentTo?: ReadonlyArray<string | { readonly to: string }>;
}

function zone(id: string, overrides: ZoneOverrides = {}): ZoneDef {
  const { adjacentTo, ...restOverrides } = overrides;
  const normalizedAdjacentTo = adjacentTo?.map((entry) => ({
    to: asZoneId(typeof entry === 'string' ? entry : entry.to),
  }));

  return {
    id: asZoneId(id),
    owner: 'none',
    visibility: 'public',
    ordering: 'set',
    ...restOverrides,
    ...(normalizedAdjacentTo === undefined ? {} : { adjacentTo: normalizedAdjacentTo }),
  } as ZoneDef;
}

function providerWithLayoutRoles(layoutRoles: Record<string, 'card' | 'hand' | 'forcePool' | 'other'>): VisualConfigProvider {
  return new VisualConfigProvider({
    version: 1,
    zones: {
      layoutRoles,
    },
  });
}
