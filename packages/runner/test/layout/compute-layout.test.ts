import { describe, expect, it, vi } from 'vitest';
import { asZoneId, type GameDef, type ZoneDef } from '@ludoforge/engine/runtime';

const forceAtlas2State = vi.hoisted(() => ({
  assign: vi.fn((graph: { nodes(): string[]; getNodeAttributes(nodeID: string): { x?: number; y?: number }; setNodeAttribute(nodeID: string, key: string, value: number): void }, _params?: unknown) => {
    for (const nodeID of graph.nodes()) {
      const attributes = graph.getNodeAttributes(nodeID);
      graph.setNodeAttribute(nodeID, 'x', attributes.x ?? 0);
      graph.setNodeAttribute(nodeID, 'y', attributes.y ?? 0);
    }
  }),
}));

vi.mock('graphology-layout-forceatlas2', () => ({
  default: {
    assign: forceAtlas2State.assign,
  },
}));

import { computeLayout } from '../../src/layout/compute-layout';

describe('computeLayout graph mode', () => {
  it('produces positions for all board zones only', () => {
    const def = makeDef([
      zone('board-a', { zoneKind: 'board', adjacentTo: ['board-b'] }),
      zone('board-b', { zoneKind: 'board', adjacentTo: ['board-a'] }),
      zone('aux-x', { zoneKind: 'aux' }),
    ]);

    const layout = computeLayout(def, 'graph');

    expect([...layout.positions.keys()].sort()).toEqual(['board-a', 'board-b']);
    expect(layout.positions.has('aux-x')).toBe(false);
    expect(layout.mode).toBe('graph');
  });

  it('returns finite coordinates and non-empty bounds for multiple zones', () => {
    const def = makeDef([
      zone('a', { zoneKind: 'board', adjacentTo: ['b'] }),
      zone('b', { zoneKind: 'board', adjacentTo: ['a', 'c'] }),
      zone('c', { zoneKind: 'board', adjacentTo: ['b'] }),
    ]);

    const layout = computeLayout(def, 'graph');

    for (const position of layout.positions.values()) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
    }

    expect(layout.boardBounds.minX).toBeLessThan(layout.boardBounds.maxX);
    expect(layout.boardBounds.minY).toBeLessThan(layout.boardBounds.maxY);
  });

  it('enforces minimum spacing between all placed nodes', () => {
    const zoneIDs = Array.from({ length: 8 }, (_, index) => `z${index}`);
    const zones = zoneIDs.map((id, index) => zone(id, {
      zoneKind: 'board',
      adjacentTo: zoneIDs.filter((candidate) => candidate !== id && (Math.abs(index - Number(candidate.slice(1))) <= 1)),
    }));
    const layout = computeLayout(makeDef(zones), 'graph');
    const entries = [...layout.positions.values()];

    for (let left = 0; left < entries.length - 1; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const a = entries[left];
        const b = entries[right];
        if (a === undefined || b === undefined) {
          continue;
        }
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(60 - 1e-6);
      }
    }
  });

  it('centers layout on origin', () => {
    const def = makeDef([
      zone('a', { zoneKind: 'board', adjacentTo: ['b'] }),
      zone('b', { zoneKind: 'board', adjacentTo: ['a'] }),
      zone('c', { zoneKind: 'board' }),
    ]);
    const layout = computeLayout(def, 'graph');

    const positions = [...layout.positions.values()];
    const centroidX = positions.reduce((sum, point) => sum + point.x, 0) / positions.length;
    const centroidY = positions.reduce((sum, point) => sum + point.y, 0) / positions.length;

    expect(Math.abs(centroidX)).toBeLessThan(1e-6);
    expect(Math.abs(centroidY)).toBeLessThan(1e-6);
  });

  it('returns origin for single-node graph', () => {
    const layout = computeLayout(makeDef([zone('solo', { zoneKind: 'board' })]), 'graph');
    expect(layout.positions.get('solo')).toEqual({ x: 0, y: 0 });
    expect(layout.boardBounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it('keeps disconnected components', () => {
    const layout = computeLayout(makeDef([
      zone('a1', { zoneKind: 'board', adjacentTo: ['a2'] }),
      zone('a2', { zoneKind: 'board', adjacentTo: ['a1'] }),
      zone('b1', { zoneKind: 'board', adjacentTo: ['b2'] }),
      zone('b2', { zoneKind: 'board', adjacentTo: ['b1'] }),
    ]), 'graph');

    expect(layout.positions.size).toBe(4);
    expect(layout.positions.has('a1')).toBe(true);
    expect(layout.positions.has('a2')).toBe(true);
    expect(layout.positions.has('b1')).toBe(true);
    expect(layout.positions.has('b2')).toBe(true);
  });

  it('enables Barnes-Hut optimization for large graphs', () => {
    forceAtlas2State.assign.mockClear();
    const zoneCount = 50;
    const zones = Array.from({ length: zoneCount }, (_, index) => {
      const id = `z${index}`;
      const prev = index > 0 ? [`z${index - 1}`] : [];
      const next = index < zoneCount - 1 ? [`z${index + 1}`] : [];
      return zone(id, { zoneKind: 'board', adjacentTo: [...prev, ...next] });
    });

    computeLayout(makeDef(zones), 'graph');

    const params = forceAtlas2State.assign.mock.calls[0]?.[1] as { settings?: { barnesHutOptimize?: boolean } } | undefined;
    expect(params?.settings?.barnesHutOptimize).toBe(true);
  });

  it('does not depend on Math.random for seeding', () => {
    const randomSpy = vi.spyOn(Math, 'random');
    computeLayout(makeDef([
      zone('a', { zoneKind: 'board', adjacentTo: ['b'] }),
      zone('b', { zoneKind: 'board', adjacentTo: ['a'] }),
    ]), 'graph');
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it('returns empty layout for empty board zone partition', () => {
    const layout = computeLayout(makeDef([
      zone('aux-a', { zoneKind: 'aux' }),
      zone('aux-b', { zoneKind: 'aux' }),
    ]), 'graph');

    expect(layout.positions.size).toBe(0);
    expect(layout.boardBounds).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});

describe('computeLayout dispatcher', () => {
  it('routes table mode', () => {
    const layout = computeLayout(makeDef([
      zone('community:none', { owner: 'none' }),
      zone('hand:0', { owner: 'player' }),
      zone('hand:1', { owner: 'player' }),
    ]), 'table');

    expect(layout.mode).toBe('table');
    expect(layout.positions.size).toBe(3);
  });

  it('throws for track mode placeholder', () => {
    expect(() => computeLayout(makeDef([]), 'track')).toThrow('Track layout not yet implemented');
  });

  it('throws for grid mode placeholder', () => {
    expect(() => computeLayout(makeDef([]), 'grid')).toThrow('Grid layout not yet implemented');
  });
});

describe('computeLayout table mode', () => {
  it('includes all zones when board partition is empty', () => {
    const layout = computeLayout(makeDef([
      zone('community:none', { owner: 'none' }),
      zone('hand:0', { owner: 'player' }),
      zone('hand:1', { owner: 'player' }),
      zone('burn:none', { owner: 'none' }),
    ]), 'table');

    expect([...layout.positions.keys()].sort()).toEqual(['burn:none', 'community:none', 'hand:0', 'hand:1']);
  });

  it('places shared zones closer to center than player zones', () => {
    const layout = computeLayout(makeDef([
      zone('community:none', { owner: 'none' }),
      zone('hand:0', { owner: 'player' }),
      zone('hand:1', { owner: 'player' }),
      zone('hand:2', { owner: 'player' }),
    ]), 'table');

    const shared = layout.positions.get('community:none');
    const players = ['hand:0', 'hand:1', 'hand:2'].map((id) => layout.positions.get(id)).filter((value) => value !== undefined);
    expect(shared).toBeDefined();
    expect(players.length).toBe(3);

    const sharedDistance = Math.hypot(shared!.x, shared!.y);
    const nearestPlayerDistance = Math.min(...players.map((position) => Math.hypot(position.x, position.y)));
    expect(sharedDistance).toBeLessThan(nearestPlayerDistance);
  });

  it('distributes player seat groups around distinct angles', () => {
    const layout = computeLayout(makeDef([
      zone('hand:0', { owner: 'player' }),
      zone('hand:1', { owner: 'player' }),
      zone('hand:2', { owner: 'player' }),
      zone('hand:3', { owner: 'player' }),
    ]), 'table');

    const angles = ['hand:0', 'hand:1', 'hand:2', 'hand:3']
      .map((id) => layout.positions.get(id))
      .filter((value): value is { x: number; y: number } => value !== undefined)
      .map((position) => Math.atan2(position.y, position.x))
      .sort((left, right) => left - right);

    expect(angles.length).toBe(4);
    for (let index = 1; index < angles.length; index += 1) {
      const delta = Math.abs((angles[index] ?? 0) - (angles[index - 1] ?? 0));
      expect(delta).toBeGreaterThan(0.4);
    }
  });

  it('places single shared zone at origin when no player zones exist', () => {
    const layout = computeLayout(makeDef([zone('community:none', { owner: 'none' })]), 'table');
    expect(layout.positions.get('community:none')).toEqual({ x: 0, y: 0 });
  });

  it('stacks shared zones at center when no player zones exist', () => {
    const layout = computeLayout(makeDef([
      zone('community:none', { owner: 'none' }),
      zone('burn:none', { owner: 'none' }),
      zone('deck:none', { owner: 'none' }),
    ]), 'table');

    const community = layout.positions.get('community:none');
    const burn = layout.positions.get('burn:none');
    const deck = layout.positions.get('deck:none');
    expect(community).toBeDefined();
    expect(burn).toBeDefined();
    expect(deck).toBeDefined();
    expect(Math.abs(community!.x)).toBeLessThan(1e-6);
    expect(Math.abs(burn!.x)).toBeLessThan(1e-6);
    expect(Math.abs(deck!.x)).toBeLessThan(1e-6);
  });

  it('keeps same-seat zones contiguous on the perimeter', () => {
    const layout = computeLayout(makeDef([
      zone('hand:0', { owner: 'player' }),
      zone('bench:0', { owner: 'player' }),
      zone('hand:1', { owner: 'player' }),
    ]), 'table');

    const hand0 = layout.positions.get('hand:0');
    const bench0 = layout.positions.get('bench:0');
    const hand1 = layout.positions.get('hand:1');
    expect(hand0).toBeDefined();
    expect(bench0).toBeDefined();
    expect(hand1).toBeDefined();

    const angle0A = Math.atan2(hand0!.y, hand0!.x);
    const angle0B = Math.atan2(bench0!.y, bench0!.x);
    const angle1 = Math.atan2(hand1!.y, hand1!.x);

    expect(angularDistance(angle0A, angle0B)).toBeLessThan(angularDistance(angle0A, angle1));
  });

  it('returns valid bounds for non-trivial table inputs', () => {
    const layout = computeLayout(makeDef([
      zone('community:none', { owner: 'none' }),
      zone('hand:0', { owner: 'player' }),
      zone('hand:1', { owner: 'player' }),
    ]), 'table');

    expect(layout.boardBounds.minX).toBeLessThan(layout.boardBounds.maxX);
    expect(layout.boardBounds.minY).toBeLessThan(layout.boardBounds.maxY);
  });
});

function makeDef(zones: readonly ZoneDef[]): GameDef {
  return {
    metadata: {
      id: 'layout-test',
    },
    zones,
  } as unknown as GameDef;
}

interface ZoneOverrides {
  readonly zoneKind?: ZoneDef['zoneKind'];
  readonly adjacentTo?: readonly string[];
  readonly category?: ZoneDef['category'];
  readonly owner?: ZoneDef['owner'];
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

function angularDistance(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}
