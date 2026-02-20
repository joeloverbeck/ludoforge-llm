import { describe, expect, it, vi } from 'vitest';
import { asZoneId, type GameDef, type ZoneDef } from '@ludoforge/engine/runtime';
import type { CardAnimationZoneRoles, RegionHint } from '../../src/config/visual-config-types';
import {
  ZONE_RENDER_WIDTH,
  ZONE_RENDER_HEIGHT,
} from '../../src/layout/layout-constants';

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
      zone('board-a', { zoneKind: 'board', adjacentTo: [{ to: 'board-b' }] }),
      zone('board-b', { zoneKind: 'board', adjacentTo: [{ to: 'board-a' }] }),
      zone('aux-x', { zoneKind: 'aux' }),
    ]);

    const layout = computeLayout(def, 'graph');

    expect([...layout.positions.keys()].sort()).toEqual(['board-a', 'board-b']);
    expect(layout.positions.has('aux-x')).toBe(false);
    expect(layout.mode).toBe('graph');
  });

  it('returns finite coordinates and non-empty bounds for multiple zones', () => {
    const def = makeDef([
      zone('a', { zoneKind: 'board', adjacentTo: [{ to: 'b' }] }),
      zone('b', { zoneKind: 'board', adjacentTo: [{ to: 'a' }, { to: 'c' }] }),
      zone('c', { zoneKind: 'board', adjacentTo: [{ to: 'b' }] }),
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
      zone('a', { zoneKind: 'board', adjacentTo: [{ to: 'b' }] }),
      zone('b', { zoneKind: 'board', adjacentTo: [{ to: 'a' }] }),
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
      zone('a1', { zoneKind: 'board', adjacentTo: [{ to: 'a2' }] }),
      zone('a2', { zoneKind: 'board', adjacentTo: [{ to: 'a1' }] }),
      zone('b1', { zoneKind: 'board', adjacentTo: [{ to: 'b2' }] }),
      zone('b2', { zoneKind: 'board', adjacentTo: [{ to: 'b1' }] }),
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
      zone('a', { zoneKind: 'board', adjacentTo: [{ to: 'b' }] }),
      zone('b', { zoneKind: 'board', adjacentTo: [{ to: 'a' }] }),
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

  it('minimum spacing between placed nodes exceeds zone diagonal', () => {
    const zoneIDs = Array.from({ length: 12 }, (_, index) => `z${index}`);
    const zones = zoneIDs.map((id, index) => zone(id, {
      zoneKind: 'board',
      adjacentTo: zoneIDs.filter((candidate) => candidate !== id && (Math.abs(index - Number(candidate.slice(1))) <= 1)),
    }));
    const layout = computeLayout(makeDef(zones), 'graph');
    const entries = [...layout.positions.values()];
    const zoneDiagonal = Math.hypot(ZONE_RENDER_WIDTH, ZONE_RENDER_HEIGHT);

    for (let left = 0; left < entries.length - 1; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const a = entries[left];
        const b = entries[right];
        if (a === undefined || b === undefined) {
          continue;
        }
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(zoneDiagonal - 1);
      }
    }
  });

  it('graph extent scales with node count — 20 nodes have wider bounds than 4', () => {
    const small = computeLayout(makeDef(buildLinearChain(4)), 'graph');
    const large = computeLayout(makeDef(buildLinearChain(20)), 'graph');
    const smallSpan = (small.boardBounds.maxX - small.boardBounds.minX)
      + (small.boardBounds.maxY - small.boardBounds.minY);
    const largeSpan = (large.boardBounds.maxX - large.boardBounds.minX)
      + (large.boardBounds.maxY - large.boardBounds.minY);

    expect(largeSpan).toBeGreaterThan(smallSpan * 1.5);
  });

  it('groups same-country zones into the same angular sector via attribute seeding', () => {
    const zones = [
      zone('a1', { zoneKind: 'board', adjacentTo: [{ to: 'a2' }], attributes: { country: 'alpha' }, category: 'city' }),
      zone('a2', { zoneKind: 'board', adjacentTo: [{ to: 'a1' }, { to: 'b1' }], attributes: { country: 'alpha' }, category: 'province' }),
      zone('b1', { zoneKind: 'board', adjacentTo: [{ to: 'a2' }, { to: 'b2' }], attributes: { country: 'beta' }, category: 'city' }),
      zone('b2', { zoneKind: 'board', adjacentTo: [{ to: 'b1' }], attributes: { country: 'beta' }, category: 'province' }),
    ];
    const layout = computeLayout(makeDef(zones), 'graph');

    const centroidAlpha = centroid([layout.positions.get('a1')!, layout.positions.get('a2')!]);
    const centroidBeta = centroid([layout.positions.get('b1')!, layout.positions.get('b2')!]);
    const interGroupDist = Math.hypot(centroidAlpha.x - centroidBeta.x, centroidAlpha.y - centroidBeta.y);

    const intraAlphaDist = Math.hypot(
      layout.positions.get('a1')!.x - layout.positions.get('a2')!.x,
      layout.positions.get('a1')!.y - layout.positions.get('a2')!.y,
    );

    expect(interGroupDist).toBeGreaterThan(intraAlphaDist * 0.5);
  });

  it('falls back to category-only seeding when zones lack grouping attributes', () => {
    const zones = [
      zone('x1', { zoneKind: 'board', adjacentTo: [{ to: 'x2' }], category: 'city' }),
      zone('x2', { zoneKind: 'board', adjacentTo: [{ to: 'x1' }, { to: 'y1' }], category: 'city' }),
      zone('y1', { zoneKind: 'board', adjacentTo: [{ to: 'x2' }, { to: 'y2' }], category: 'province' }),
      zone('y2', { zoneKind: 'board', adjacentTo: [{ to: 'y1' }], category: 'province' }),
    ];
    const layout = computeLayout(makeDef(zones), 'graph');

    expect(layout.positions.size).toBe(4);
    for (const position of layout.positions.values()) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
    }
  });
});

describe('computeLayout graph mode with region hints', () => {
  it('places compass-hinted regions in correct quadrants', () => {
    const zones = [
      zone('nw1', { zoneKind: 'board', adjacentTo: [{ to: 'nw2' }], category: 'province' }),
      zone('nw2', { zoneKind: 'board', adjacentTo: [{ to: 'nw1' }, { to: 'se1' }], category: 'province' }),
      zone('se1', { zoneKind: 'board', adjacentTo: [{ to: 'nw2' }, { to: 'se2' }], category: 'city' }),
      zone('se2', { zoneKind: 'board', adjacentTo: [{ to: 'se1' }], category: 'city' }),
    ];
    const hints: RegionHint[] = [
      { name: 'Northwest', zones: ['nw1', 'nw2'], position: 'nw' },
      { name: 'Southeast', zones: ['se1', 'se2'], position: 'se' },
    ];

    const layout = computeLayout(makeDef(zones), 'graph', { regionHints: hints });

    const nwCentroid = centroid([layout.positions.get('nw1')!, layout.positions.get('nw2')!]);
    const seCentroid = centroid([layout.positions.get('se1')!, layout.positions.get('se2')!]);

    expect(nwCentroid.x).toBeLessThan(seCentroid.x);
    expect(nwCentroid.y).toBeLessThan(seCentroid.y);
  });

  it('center position zones cluster closer to origin than cardinal regions', () => {
    const zones = [
      zone('c1', { zoneKind: 'board', adjacentTo: [{ to: 'c2' }], category: 'city' }),
      zone('c2', { zoneKind: 'board', adjacentTo: [{ to: 'c1' }, { to: 'n1' }], category: 'city' }),
      zone('n1', { zoneKind: 'board', adjacentTo: [{ to: 'c2' }, { to: 'n2' }], category: 'province' }),
      zone('n2', { zoneKind: 'board', adjacentTo: [{ to: 'n1' }, { to: 's1' }], category: 'province' }),
      zone('s1', { zoneKind: 'board', adjacentTo: [{ to: 'n2' }, { to: 's2' }], category: 'other' }),
      zone('s2', { zoneKind: 'board', adjacentTo: [{ to: 's1' }], category: 'other' }),
    ];
    const hints: RegionHint[] = [
      { name: 'Center', zones: ['c1', 'c2'], position: 'center' },
      { name: 'North', zones: ['n1', 'n2'], position: 'n' },
      { name: 'South', zones: ['s1', 's2'], position: 's' },
    ];

    const layout = computeLayout(makeDef(zones), 'graph', { regionHints: hints });

    const centerCentroid = centroid([layout.positions.get('c1')!, layout.positions.get('c2')!]);
    const northCentroid = centroid([layout.positions.get('n1')!, layout.positions.get('n2')!]);

    const centerDist = Math.hypot(centerCentroid.x, centerCentroid.y);
    const northDist = Math.hypot(northCentroid.x, northCentroid.y);

    expect(centerDist).toBeLessThan(northDist);
  });

  it('zones not in any region get valid finite positions', () => {
    const zones = [
      zone('hinted', { zoneKind: 'board', adjacentTo: [{ to: 'unhinted' }], category: 'city' }),
      zone('unhinted', { zoneKind: 'board', adjacentTo: [{ to: 'hinted' }], category: 'province' }),
    ];
    const hints: RegionHint[] = [
      { name: 'North', zones: ['hinted'], position: 'n' },
    ];

    const layout = computeLayout(makeDef(zones), 'graph', { regionHints: hints });

    for (const position of layout.positions.values()) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
    }
    expect(layout.positions.size).toBe(2);
  });

  it('absent region hints preserve existing behavior', () => {
    const zones = [
      zone('a', { zoneKind: 'board', adjacentTo: [{ to: 'b' }] }),
      zone('b', { zoneKind: 'board', adjacentTo: [{ to: 'a' }] }),
    ];

    const withNull = computeLayout(makeDef(zones), 'graph', { regionHints: null });
    const withUndefined = computeLayout(makeDef(zones), 'graph');
    const withEmpty = computeLayout(makeDef(zones), 'graph', { regionHints: [] });

    expect(withNull.positions.size).toBe(2);
    expect(withUndefined.positions.size).toBe(2);
    expect(withEmpty.positions.size).toBe(2);
  });
});

describe('computeLayout dispatcher', () => {
  it('routes table mode', () => {
    const layout = computeLayout(makeDef([
      zone('community:none', { owner: 'none' }),
      zone('hand:0', { owner: 'player', ownerPlayerIndex: 0 }),
      zone('hand:1', { owner: 'player', ownerPlayerIndex: 1 }),
    ]), 'table');

    expect(layout.mode).toBe('table');
    expect(layout.positions.size).toBe(3);
  });

  it('routes track mode', () => {
    const layout = computeLayout(makeDef([zone('track-0', { adjacentTo: [{ to: 'track-1' }] }), zone('track-1', { adjacentTo: [{ to: 'track-0' }] })]), 'track');
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
      zone('a', { adjacentTo: [{ to: 'b' }, { to: 'f' }] }),
      zone('b', { adjacentTo: [{ to: 'a' }, { to: 'c' }] }),
      zone('c', { adjacentTo: [{ to: 'b' }, { to: 'd' }] }),
      zone('d', { adjacentTo: [{ to: 'c' }, { to: 'e' }] }),
      zone('e', { adjacentTo: [{ to: 'd' }, { to: 'f' }] }),
      zone('f', { adjacentTo: [{ to: 'e' }, { to: 'a' }] }),
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
      zone('main-0', { adjacentTo: [{ to: 'main-1' }] }),
      zone('main-1', { adjacentTo: [{ to: 'main-0' }, { to: 'main-2' }] }),
      zone('main-2', { adjacentTo: [{ to: 'main-1' }, { to: 'main-3' }, { to: 'spur' }] }),
      zone('main-3', { adjacentTo: [{ to: 'main-2' }] }),
      zone('spur', { adjacentTo: [{ to: 'main-2' }] }),
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
  it('uses explicit boardZones options instead of re-deriving from def', () => {
    const boardZone = zone('community:none', { owner: 'none', zoneKind: 'board' });
    const auxZone = zone('hand:0', { owner: 'player', ownerPlayerIndex: 0, zoneKind: 'aux' });
    const layout = computeLayout(makeDef([boardZone, auxZone]), 'table', {
      boardZones: [boardZone],
    });

    expect([...layout.positions.keys()].sort()).toEqual(['community:none']);
    expect(layout.positions.has('hand:0')).toBe(false);
  });

  it('includes all zones when board partition is empty', () => {
    const layout = computeLayout(makeDef([
      zone('community:none', { owner: 'none' }),
      zone('hand:0', { owner: 'player', ownerPlayerIndex: 0 }),
      zone('hand:1', { owner: 'player', ownerPlayerIndex: 1 }),
      zone('burn:none', { owner: 'none' }),
    ]), 'table');

    expect([...layout.positions.keys()].sort()).toEqual(['burn:none', 'community:none', 'hand:0', 'hand:1']);
  });

  it('places shared zones closer to center than player zones', () => {
    const layout = computeLayout(makeDef([
      zone('community:none', { owner: 'none' }),
      zone('hand:0', { owner: 'player', ownerPlayerIndex: 0 }),
      zone('hand:1', { owner: 'player', ownerPlayerIndex: 1 }),
      zone('hand:2', { owner: 'player', ownerPlayerIndex: 2 }),
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
      zone('hand:0', { owner: 'player', ownerPlayerIndex: 0 }),
      zone('hand:1', { owner: 'player', ownerPlayerIndex: 1 }),
      zone('hand:2', { owner: 'player', ownerPlayerIndex: 2 }),
      zone('hand:3', { owner: 'player', ownerPlayerIndex: 3 }),
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

  it('places seat 0 at the bottom of the table', () => {
    const layout = computeLayout(makeDef([
      zone('hand:0', { owner: 'player', ownerPlayerIndex: 0 }),
      zone('hand:1', { owner: 'player', ownerPlayerIndex: 1 }),
    ]), 'table');

    const seat0 = layout.positions.get('hand:0');
    expect(seat0).toBeDefined();
    expect(seat0!.y).toBeGreaterThan(0);
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

  it('positions shared zones by card role rows when tableZoneRoles are provided', () => {
    const roles: CardAnimationZoneRoles = {
      draw: ['draw:none'],
      hand: ['hand:0'],
      shared: ['shared-a:none', 'shared-b:none'],
      burn: ['burn:none'],
      discard: ['discard:none'],
    };

    const layout = computeLayout(makeDef([
      zone('draw:none', { owner: 'none' }),
      zone('shared-a:none', { owner: 'none' }),
      zone('shared-b:none', { owner: 'none' }),
      zone('burn:none', { owner: 'none' }),
      zone('discard:none', { owner: 'none' }),
      zone('unassigned:none', { owner: 'none' }),
    ]), 'table', {
      tableZoneRoles: roles,
    });

    const draw = layout.positions.get('draw:none')!;
    const sharedA = layout.positions.get('shared-a:none')!;
    const sharedB = layout.positions.get('shared-b:none')!;
    const burn = layout.positions.get('burn:none')!;
    const discard = layout.positions.get('discard:none')!;
    const unassigned = layout.positions.get('unassigned:none')!;
    const sharedY = (sharedA.y + sharedB.y) / 2;

    expect(draw.y).toBeLessThan(sharedY);
    expect(Math.abs(sharedA.y - sharedB.y)).toBeLessThan(1e-6);
    expect(burn.y).toBeGreaterThan(sharedY);
    expect(discard.y).toBeGreaterThan(sharedY);
    expect(burn.x).toBeLessThan(discard.x);
    expect(unassigned.x).toBe(0);
  });

  it('keeps same-seat zones contiguous on the perimeter', () => {
    const layout = computeLayout(makeDef([
      zone('hand:0', { owner: 'player', ownerPlayerIndex: 0 }),
      zone('bench:0', { owner: 'player', ownerPlayerIndex: 0 }),
      zone('hand:1', { owner: 'player', ownerPlayerIndex: 1 }),
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
      zone('hand:0', { owner: 'player', ownerPlayerIndex: 0 }),
      zone('hand:1', { owner: 'player', ownerPlayerIndex: 1 }),
    ]), 'table');

    expect(layout.boardBounds.minX).toBeLessThan(layout.boardBounds.maxX);
    expect(layout.boardBounds.minY).toBeLessThan(layout.boardBounds.maxY);
  });

  it('throws when a player-owned zone is missing ownerPlayerIndex', () => {
    expect(() =>
      computeLayout(makeDef([
        zone('community:none', { owner: 'none' }),
        zone('hand:0', { owner: 'player' }),
      ]), 'table'),
    ).toThrow(/missing required ownerPlayerIndex/u);
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
  readonly adjacentTo?: ReadonlyArray<string | { readonly to: string }>;
  readonly category?: ZoneDef['category'];
  readonly owner?: ZoneDef['owner'];
  readonly ownerPlayerIndex?: ZoneDef['ownerPlayerIndex'];
  readonly attributes?: Record<string, unknown>;
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

function buildLinearChain(length: number): readonly ZoneDef[] {
  return Array.from({ length }, (_, index) => {
    const id = `n${index}`;
    const adjacentTo: string[] = [];
    if (index > 0) {
      adjacentTo.push(`n${index - 1}`);
    }
    if (index < length - 1) {
      adjacentTo.push(`n${index + 1}`);
    }
    return zone(id, { zoneKind: 'board', adjacentTo });
  });
}

function centroid(points: readonly { x: number; y: number }[]): { x: number; y: number } {
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  return { x: sumX / points.length, y: sumY / points.length };
}
