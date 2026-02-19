import { beforeEach, describe, expect, it } from 'vitest';
import { asZoneId, type GameDef, type ZoneDef } from '@ludoforge/engine/runtime';

import { clearLayoutCache, getOrComputeLayout } from '../../src/layout/layout-cache';

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

    const first = getOrComputeLayout(def);
    const second = getOrComputeLayout(def);

    expect(second).toBe(first);
    expect(second.positionMap.positions.size).toBe(3);
  });

  it('keeps separate cache entries per GameDef metadata id', () => {
    const first = getOrComputeLayout(makeDef('game-a', [zone('a', { zoneKind: 'board' })], 'table'));
    const second = getOrComputeLayout(makeDef('game-b', [zone('a', { zoneKind: 'board' })], 'table'));

    expect(second).not.toBe(first);
  });

  it('recomputes when GameDef content changes under the same metadata id', () => {
    const first = getOrComputeLayout(makeDef('game-a', [
      zone('board-a', { zoneKind: 'board', owner: 'none' }),
      zone('hand:0', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
    ], 'table'));

    const second = getOrComputeLayout(makeDef('game-a', [
      zone('board-a', { zoneKind: 'board', owner: 'none' }),
      zone('hand:0', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
      zone('hand:1', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
    ], 'table'));

    expect(second).not.toBe(first);
    expect(second.positionMap.positions.size).toBe(3);
  });

  it('returns the cached entry for equivalent GameDef content with the same metadata id', () => {
    const first = getOrComputeLayout(makeDef('game-a', [
      zone('board-a', { zoneKind: 'board', owner: 'none' }),
      zone('hand:0', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
    ], 'table'));

    const second = getOrComputeLayout(makeDef('game-a', [
      zone('board-a', { zoneKind: 'board', owner: 'none' }),
      zone('hand:0', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
    ], 'table'));

    expect(second).toBe(first);
  });

  it('recomputes after clearLayoutCache', () => {
    const def = makeDef('game-a', [zone('a', { zoneKind: 'board' })], 'table');

    const first = getOrComputeLayout(def);
    clearLayoutCache();
    const second = getOrComputeLayout(def);

    expect(second).not.toBe(first);
  });

  it('merges board and aux positions into a unified ZonePositionMap and bounds', () => {
    const def = makeDef('game-a', [
      zone('board-a', { zoneKind: 'board', owner: 'none' }),
      zone('board-b', { zoneKind: 'board', owner: 'none' }),
      zone('deck:none', { zoneKind: 'aux', ordering: 'stack' }),
      zone('hand:0', { zoneKind: 'aux', owner: 'player', visibility: 'owner' }),
    ], 'table');

    const result = getOrComputeLayout(def);

    expect([...result.positionMap.positions.keys()].sort()).toEqual(['board-a', 'board-b', 'deck:none', 'hand:0']);

    for (const position of result.positionMap.positions.values()) {
      expect(position.x).toBeGreaterThanOrEqual(result.positionMap.bounds.minX);
      expect(position.x).toBeLessThanOrEqual(result.positionMap.bounds.maxX);
      expect(position.y).toBeGreaterThanOrEqual(result.positionMap.bounds.minY);
      expect(position.y).toBeLessThanOrEqual(result.positionMap.bounds.maxY);
    }
  });

  it('preserves the resolved layout mode', () => {
    const def = makeDef('game-a', [
      zone('track-0', { zoneKind: 'board', adjacentTo: ['track-1'] }),
      zone('track-1', { zoneKind: 'board', adjacentTo: ['track-0'] }),
    ], 'track');

    const result = getOrComputeLayout(def);

    expect(result.mode).toBe('track');
    expect(result.positionMap.positions.size).toBe(2);
  });

  it('returns empty positions with zero-area bounds for empty zone lists', () => {
    const result = getOrComputeLayout(makeDef('game-a', [], 'table'));

    expect(result.positionMap.positions.size).toBe(0);
    expect(result.positionMap.bounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
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
  readonly adjacentTo?: readonly string[];
  readonly owner?: ZoneDef['owner'];
  readonly ownerPlayerIndex?: ZoneDef['ownerPlayerIndex'];
  readonly visibility?: ZoneDef['visibility'];
  readonly ordering?: ZoneDef['ordering'];
}

function zone(id: string, overrides: ZoneOverrides = {}): ZoneDef {
  const normalizedAdjacentTo = overrides.adjacentTo?.map((zoneID) => asZoneId(zoneID));

  return {
    id: asZoneId(id),
    owner: 'none',
    visibility: 'public',
    ordering: 'set',
    ...overrides,
    ...(normalizedAdjacentTo === undefined ? {} : { adjacentTo: normalizedAdjacentTo }),
  } as ZoneDef;
}
