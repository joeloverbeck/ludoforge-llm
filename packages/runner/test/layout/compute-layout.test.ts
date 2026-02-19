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
  it('throws for table mode placeholder', () => {
    expect(() => computeLayout(makeDef([]), 'table')).toThrow('Table layout not yet implemented');
  });

  it('throws for track mode placeholder', () => {
    expect(() => computeLayout(makeDef([]), 'track')).toThrow('Track layout not yet implemented');
  });

  it('throws for grid mode placeholder', () => {
    expect(() => computeLayout(makeDef([]), 'grid')).toThrow('Grid layout not yet implemented');
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
