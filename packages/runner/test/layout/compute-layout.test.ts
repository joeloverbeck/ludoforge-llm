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

  it('routes track mode', () => {
    const layout = computeLayout(makeDef([zone('track-0', { adjacentTo: ['track-1'] }), zone('track-1', { adjacentTo: ['track-0'] })]), 'track');
    expect(layout.mode).toBe('track');
    expect(layout.positions.size).toBe(2);
  });

  it('routes grid mode', () => {
    const layout = computeLayout(makeDef([zone('cell-a', { attributes: { row: 0, col: 0 } })]), 'grid');
    expect(layout.mode).toBe('grid');
    expect(layout.positions.size).toBe(1);
  });
});

describe('computeLayout track mode', () => {
  it('lays out a short linear chain in one horizontal row', () => {
    const layout = computeLayout(makeDef(buildChainZones(5)), 'track');
    const ids = ['track-00', 'track-01', 'track-02', 'track-03', 'track-04'];
    const points = ids.map((id) => layout.positions.get(id));
    expect(points.every((point) => point !== undefined)).toBe(true);

    const y0 = points[0]!.y;
    for (const point of points) {
      expect(Math.abs(point!.y - y0)).toBeLessThan(1e-6);
    }
    for (let index = 1; index < points.length; index += 1) {
      expect(points[index]!.x).toBeGreaterThan(points[index - 1]!.x);
    }
  });

  it('wraps long chains into serpentine rows', () => {
    const layout = computeLayout(makeDef(buildChainZones(20)), 'track');
    const row0IDs = Array.from({ length: 10 }, (_, index) => `track-${String(index).padStart(2, '0')}`);
    const row1IDs = Array.from({ length: 10 }, (_, index) => `track-${String(index + 10).padStart(2, '0')}`);
    const row0 = row0IDs.map((id) => layout.positions.get(id)!);
    const row1 = row1IDs.map((id) => layout.positions.get(id)!);
    const row0Y = row0[0]!.y;
    const row1Y = row1[0]!.y;

    for (const point of row0) {
      expect(Math.abs(point.y - row0Y)).toBeLessThan(1e-6);
    }
    for (const point of row1) {
      expect(Math.abs(point.y - row1Y)).toBeLessThan(1e-6);
    }
    expect(row1Y).toBeGreaterThan(row0Y);
    expect(row0[0]!.x).toBeLessThan(row0[row0.length - 1]!.x);
    expect(row1[0]!.x).toBeGreaterThan(row1[row1.length - 1]!.x);
  });

  it('handles cycles with stable non-overlapping positions', () => {
    const layout = computeLayout(makeDef([
      zone('a', { adjacentTo: ['b', 'f'] }),
      zone('b', { adjacentTo: ['a', 'c'] }),
      zone('c', { adjacentTo: ['b', 'd'] }),
      zone('d', { adjacentTo: ['c', 'e'] }),
      zone('e', { adjacentTo: ['d', 'f'] }),
      zone('f', { adjacentTo: ['e', 'a'] }),
    ]), 'track');

    expect(layout.positions.size).toBe(6);
    const keys = [...layout.positions.keys()];
    for (const id of keys) {
      const point = layout.positions.get(id);
      expect(Number.isFinite(point?.x)).toBe(true);
      expect(Number.isFinite(point?.y)).toBe(true);
    }
    const unique = new Set([...layout.positions.values()].map((point) => `${point.x}:${point.y}`));
    expect(unique.size).toBe(6);
  });

  it('keeps main chain ordering readable when a branch exists', () => {
    const layout = computeLayout(makeDef([
      zone('main-0', { adjacentTo: ['main-1'] }),
      zone('main-1', { adjacentTo: ['main-0', 'main-2'] }),
      zone('main-2', { adjacentTo: ['main-1', 'main-3', 'spur'] }),
      zone('main-3', { adjacentTo: ['main-2'] }),
      zone('spur', { adjacentTo: ['main-2'] }),
    ]), 'track');

    const main0 = layout.positions.get('main-0')!;
    const main1 = layout.positions.get('main-1')!;
    const main2 = layout.positions.get('main-2')!;
    const main3 = layout.positions.get('main-3')!;
    const spur = layout.positions.get('spur')!;

    expect(main0.x).toBeLessThan(main1.x);
    expect(main1.x).toBeLessThan(main2.x);
    expect(main2.x).toBeLessThan(main3.x);
    expect(spur.x === main0.x && spur.y === main0.y).toBe(false);
  });

  it('places single node at origin', () => {
    const layout = computeLayout(makeDef([zone('solo', { zoneKind: 'board' })]), 'track');
    expect(layout.positions.get('solo')).toEqual({ x: 0, y: 0 });
    expect(layout.mode).toBe('track');
  });
});

describe('computeLayout grid mode', () => {
  it('uses row and col attributes for direct positioning', () => {
    const layout = computeLayout(makeDef([
      zone('cell-a', { attributes: { row: 0, col: 0 } }),
      zone('cell-b', { attributes: { row: 0, col: 1 } }),
    ]), 'grid');

    const a = layout.positions.get('cell-a')!;
    const b = layout.positions.get('cell-b')!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(1e-6);
    expect(b.x).toBeGreaterThan(a.x);
  });

  it('builds a 3x3 arrangement from row/col metadata', () => {
    const zones = Array.from({ length: 9 }, (_, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      return zone(`cell-${index}`, { attributes: { row, col } });
    });
    const layout = computeLayout(makeDef(zones), 'grid');
    const points = [...layout.positions.values()];
    const xs = [...new Set(points.map((point) => point.x.toFixed(3)))];
    const ys = [...new Set(points.map((point) => point.y.toFixed(3)))];
    expect(xs.length).toBe(3);
    expect(ys.length).toBe(3);
  });

  it('falls back to a square grid when row/col attributes are absent', () => {
    const layout = computeLayout(makeDef([
      zone('a'),
      zone('b'),
      zone('c'),
      zone('d'),
    ]), 'grid');
    const points = [...layout.positions.values()];
    const xs = [...new Set(points.map((point) => point.x.toFixed(3)))];
    const ys = [...new Set(points.map((point) => point.y.toFixed(3)))];
    expect(xs.length).toBe(2);
    expect(ys.length).toBe(2);
  });

  it('honors attributed cells and fills remaining cells for mixed metadata', () => {
    const layout = computeLayout(makeDef([
      zone('anchor', { attributes: { row: 0, col: 0 } }),
      zone('partial-row', { attributes: { row: 2 } }),
      zone('partial-col', { attributes: { col: 2 } }),
      zone('free'),
    ]), 'grid');

    const anchor = layout.positions.get('anchor')!;
    const unique = new Set([...layout.positions.values()].map((point) => `${point.x}:${point.y}`));
    expect(unique.size).toBe(4);

    const topLeftX = Math.min(...[...layout.positions.values()].map((point) => point.x));
    const topLeftY = Math.min(...[...layout.positions.values()].map((point) => point.y));
    expect(anchor.x).toBe(topLeftX);
    expect(anchor.y).toBe(topLeftY);
    expect(layout.mode).toBe('grid');
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
  readonly attributes?: Record<string, unknown>;
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

function buildChainZones(length: number): readonly ZoneDef[] {
  return Array.from({ length }, (_, index) => {
    const id = `track-${String(index).padStart(2, '0')}`;
    const adjacentTo: string[] = [];
    if (index > 0) {
      adjacentTo.push(`track-${String(index - 1).padStart(2, '0')}`);
    }
    if (index < length - 1) {
      adjacentTo.push(`track-${String(index + 1).padStart(2, '0')}`);
    }
    return zone(id, { adjacentTo });
  });
}
