import { beforeEach, describe, expect, it } from 'vitest';
import { asZoneId, type GameDef, type ZoneDef } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider';
import { clearLayoutCache, getOrComputeLayout } from '../../src/layout/layout-cache';
import { ZONE_HALF_WIDTH, ZONE_HALF_HEIGHT } from '../../src/layout/layout-constants';

const NULL_PROVIDER = new VisualConfigProvider(null);

describe('layout-cache', () => {
  beforeEach(() => {
    clearLayoutCache();
  });

  it('computes on cache miss and returns the same object on cache hit', () => {
    const def = makeDef('game-a', [
      zone('board-a', { zoneKind: 'board', owner: 'none' }),
      zone('board-b', { zoneKind: 'board', owner: 'none' }),
      zone('hand:0', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
    ], 'table');

    const first = getOrComputeLayout(def, NULL_PROVIDER);
    const second = getOrComputeLayout(def, NULL_PROVIDER);

    expect(second).toBe(first);
    expect(second.worldLayout.positions.size).toBe(3);
  });

  it('keeps separate cache entries per GameDef metadata id', () => {
    const first = getOrComputeLayout(makeDef('game-a', [zone('a', { zoneKind: 'board' })], 'table'), NULL_PROVIDER);
    const second = getOrComputeLayout(makeDef('game-b', [zone('a', { zoneKind: 'board' })], 'table'), NULL_PROVIDER);

    expect(second).not.toBe(first);
  });

  it('recomputes when GameDef content changes under the same metadata id', () => {
    const first = getOrComputeLayout(makeDef('game-a', [
      zone('board-a', { zoneKind: 'board', owner: 'none' }),
      zone('hand:0', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
    ], 'table'), NULL_PROVIDER);

    const second = getOrComputeLayout(makeDef('game-a', [
      zone('board-a', { zoneKind: 'board', owner: 'none' }),
      zone('hand:0', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
      zone('hand:1', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
    ], 'table'), NULL_PROVIDER);

    expect(second).not.toBe(first);
    expect(second.worldLayout.positions.size).toBe(3);
  });

  it('returns the cached entry for equivalent GameDef content with the same metadata id', () => {
    const first = getOrComputeLayout(makeDef('game-a', [
      zone('board-a', { zoneKind: 'board', owner: 'none' }),
      zone('hand:0', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
    ], 'table'), NULL_PROVIDER);

    const second = getOrComputeLayout(makeDef('game-a', [
      zone('board-a', { zoneKind: 'board', owner: 'none' }),
      zone('hand:0', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
    ], 'table'), NULL_PROVIDER);

    expect(second).toBe(first);
  });

  it('recomputes after clearLayoutCache', () => {
    const def = makeDef('game-a', [zone('a', { zoneKind: 'board' })], 'table');

    const first = getOrComputeLayout(def, NULL_PROVIDER);
    clearLayoutCache();
    const second = getOrComputeLayout(def, NULL_PROVIDER);

    expect(second).not.toBe(first);
  });

  it('merges board and aux positions into a unified ZonePositionMap and bounds', () => {
    const def = makeDef('game-a', [
      zone('board-a', { zoneKind: 'board', owner: 'none' }),
      zone('board-b', { zoneKind: 'board', owner: 'none' }),
      zone('deck:none', { zoneKind: 'aux', ordering: 'stack' }),
      zone('hand:0', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
    ], 'table');

    const result = getOrComputeLayout(def, NULL_PROVIDER);

    expect([...result.worldLayout.positions.keys()].sort()).toEqual(['board-a', 'board-b', 'deck:none', 'hand:0']);

    for (const position of result.worldLayout.positions.values()) {
      expect(position.x).toBeGreaterThanOrEqual(result.worldLayout.bounds.minX);
      expect(position.x).toBeLessThanOrEqual(result.worldLayout.bounds.maxX);
      expect(position.y).toBeGreaterThanOrEqual(result.worldLayout.bounds.minY);
      expect(position.y).toBeLessThanOrEqual(result.worldLayout.bounds.maxY);
    }
  });

  it('preserves the resolved layout mode', () => {
    const def = makeDef('game-a', [
      zone('track-0', { zoneKind: 'board', adjacentTo: [{ to: 'track-1' }] }),
      zone('track-1', { zoneKind: 'board', adjacentTo: [{ to: 'track-0' }] }),
    ]);

    const result = getOrComputeLayout(def, providerWithLayoutMode('track'));

    expect(result.mode).toBe('track');
    expect(result.worldLayout.positions.size).toBe(2);
  });

  it('returns empty positions with zero-area bounds for empty zone lists', () => {
    const result = getOrComputeLayout(makeDef('game-a', [], 'table'), NULL_PROVIDER);

    expect(result.worldLayout.positions.size).toBe(0);
    expect(result.worldLayout.bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('unified bounds pad by half zone dimensions beyond position extremes', () => {
    const def = makeDef('bounds-pad', [
      zone('board-a', { zoneKind: 'board', owner: 'none' }),
      zone('board-b', { zoneKind: 'board', owner: 'none' }),
    ], 'table');

    const result = getOrComputeLayout(def, NULL_PROVIDER);
    const rawPositions = [...result.worldLayout.positions.values()];
    const rawMinX = Math.min(...rawPositions.map((p) => p.x));
    const rawMaxX = Math.max(...rawPositions.map((p) => p.x));
    const rawMinY = Math.min(...rawPositions.map((p) => p.y));
    const rawMaxY = Math.max(...rawPositions.map((p) => p.y));

    expect(result.worldLayout.bounds.minX).toBeLessThanOrEqual(rawMinX - ZONE_HALF_WIDTH);
    expect(result.worldLayout.bounds.maxX).toBeGreaterThanOrEqual(rawMaxX + ZONE_HALF_WIDTH);
    expect(result.worldLayout.bounds.minY).toBeLessThanOrEqual(rawMinY - ZONE_HALF_HEIGHT);
    expect(result.worldLayout.bounds.maxY).toBeGreaterThanOrEqual(rawMaxY + ZONE_HALF_HEIGHT);
  });

  it('single-position unified bounds still pads by half zone dimensions', () => {
    const def = makeDef('bounds-single', [
      zone('solo', { zoneKind: 'board', owner: 'none' }),
    ], 'table');

    const result = getOrComputeLayout(def, NULL_PROVIDER);
    const pos = result.worldLayout.positions.get('solo')!;

    expect(result.worldLayout.bounds.minX).toBe(pos.x - ZONE_HALF_WIDTH);
    expect(result.worldLayout.bounds.maxX).toBe(pos.x + ZONE_HALF_WIDTH);
    expect(result.worldLayout.bounds.minY).toBe(pos.y - ZONE_HALF_HEIGHT);
    expect(result.worldLayout.bounds.maxY).toBe(pos.y + ZONE_HALF_HEIGHT);
  });

  it('recomputes when visual config identity changes for the same GameDef', () => {
    const def = makeDef('game-a', [
      zone('track-0', { zoneKind: 'board', adjacentTo: [{ to: 'track-1' }] }),
      zone('track-1', { zoneKind: 'board', adjacentTo: [{ to: 'track-0' }] }),
    ]);

    const first = getOrComputeLayout(def, providerWithLayoutMode('table'));
    const second = getOrComputeLayout(def, providerWithLayoutMode('graph'));

    expect(second).not.toBe(first);
    expect(first.mode).toBe('table');
    expect(second.mode).toBe('graph');
  });

  it('keeps cache hits deterministic across distinct null-config providers', () => {
    const def = makeDef('game-a', [zone('a', { zoneKind: 'board' })]);
    const first = getOrComputeLayout(def, new VisualConfigProvider(null));
    const second = getOrComputeLayout(def, new VisualConfigProvider(null));

    expect(second).toBe(first);
  });

  it('promotes card-role zones into board layout so they are not placed in the aux sidebar', () => {
    const def = makeDef('poker-layout', [
      zone('draw:none', { owner: 'none', ordering: 'stack' }),
      zone('shared:none', { owner: 'none' }),
      zone('discard:none', { owner: 'none', ordering: 'set' }),
      zone('bench:none', { owner: 'none' }),
    ], 'table');

    const result = getOrComputeLayout(def, providerWithCardAnimationRoles({
      draw: ['draw:none'],
      hand: [],
      shared: ['shared:none'],
      burn: [],
      discard: ['discard:none'],
    }));

    const draw = result.worldLayout.positions.get('draw:none');
    const shared = result.worldLayout.positions.get('shared:none');
    const discard = result.worldLayout.positions.get('discard:none');
    const bench = result.worldLayout.positions.get('bench:none');

    expect(draw).toBeDefined();
    expect(shared).toBeDefined();
    expect(discard).toBeDefined();
    expect(bench).toBeDefined();
    expect(draw!.x).toBeLessThan(bench!.x);
    expect(shared!.x).toBeLessThan(bench!.x);
    expect(discard!.x).toBeLessThan(bench!.x);
  });

  it('exposes boardBounds separately from unified bounds including aux zones', () => {
    const def = makeDef('board-bounds-split', [
      zone('community:none', { zoneKind: 'board', owner: 'none' }),
      zone('deck:none', { zoneKind: 'aux', owner: 'none', ordering: 'stack' }),
      zone('bench:none', { zoneKind: 'aux', owner: 'none' }),
    ], 'table');

    const result = getOrComputeLayout(def, NULL_PROVIDER);

    expect(result.worldLayout.boardBounds.maxX).toBeLessThan(result.worldLayout.bounds.maxX);
  });

  it('forwards fixed layout hints from the visual config provider into graph layout', () => {
    const def = makeDef('fixed-graph', [
      zone('a', { zoneKind: 'board', adjacentTo: [{ to: 'b' }] }),
      zone('b', { zoneKind: 'board', adjacentTo: [{ to: 'a' }] }),
    ], 'graph');

    const result = getOrComputeLayout(def, new VisualConfigProvider({
      version: 1,
      layout: {
        mode: 'graph',
        hints: {
          fixed: [{ zone: 'a', x: 100, y: 200 }],
        },
      },
    }));

    expect(result.worldLayout.positions.get('a')).toEqual({ x: 100, y: 200 });
    expect(result.worldLayout.positions.get('b')).toBeDefined();
  });

  it('excludes connection-shaped zones from computed layout positions', () => {
    const def = makeDef('connection-layout', [
      zone('alpha:none', { zoneKind: 'board', adjacentTo: [{ to: 'loc-alpha-beta:none' }] }),
      zone('beta:none', { zoneKind: 'board', adjacentTo: [{ to: 'loc-alpha-beta:none' }] }),
      zone('loc-alpha-beta:none', {
        zoneKind: 'board',
        adjacentTo: [{ to: 'alpha:none' }, { to: 'beta:none' }],
      }),
    ], 'graph');

    const result = getOrComputeLayout(def, new VisualConfigProvider({
      version: 1,
      zones: {
        categoryStyles: {
          loc: { shape: 'connection', connectionStyleKey: 'highway' },
        },
        overrides: {
          'loc-alpha-beta:none': { shape: 'connection', connectionStyleKey: 'highway' },
        },
      },
    }));

    expect(result.worldLayout.positions.get('alpha:none')).toBeDefined();
    expect(result.worldLayout.positions.get('beta:none')).toBeDefined();
    expect(result.worldLayout.positions.get('loc-alpha-beta:none')).toBeUndefined();
  });
});

function makeDef(
  id: string,
  zones: readonly ZoneDef[],
  layoutMode?: 'graph' | 'table' | 'track' | 'grid',
): GameDef {
  return {
    metadata: {
      id,
      ...(layoutMode === undefined ? {} : { layoutMode }),
    },
    zones,
  } as unknown as GameDef;
}

interface ZoneOverrides {
  readonly zoneKind?: ZoneDef['zoneKind'];
  readonly adjacentTo?: ReadonlyArray<string | { readonly to: string }>;
  readonly owner?: ZoneDef['owner'];
  readonly ownerPlayerIndex?: ZoneDef['ownerPlayerIndex'];
  readonly visibility?: ZoneDef['visibility'];
  readonly ordering?: ZoneDef['ordering'];
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

function providerWithLayoutMode(mode: 'graph' | 'table' | 'track' | 'grid'): VisualConfigProvider {
  return new VisualConfigProvider({
    version: 1,
    layout: {
      mode,
    },
  });
}

function providerWithCardAnimationRoles(
  zoneRoles: {
    readonly draw: readonly string[];
    readonly hand: readonly string[];
    readonly shared: readonly string[];
    readonly burn: readonly string[];
    readonly discard: readonly string[];
  },
): VisualConfigProvider {
  return new VisualConfigProvider({
    version: 1,
    layout: {
      mode: 'table',
    },
    cardAnimation: {
      cardTokenTypes: {},
      zoneRoles: {
        draw: [...zoneRoles.draw],
        hand: [...zoneRoles.hand],
        shared: [...zoneRoles.shared],
        burn: [...zoneRoles.burn],
        discard: [...zoneRoles.discard],
      },
    },
  });
}
