import { describe, expect, it, vi } from 'vitest';

import {
  computeGridLayout,
  createPositionStore,
} from '../../src/canvas/position-store';
import type { ZonePositionMap } from '../../src/spatial/position-types';

describe('computeGridLayout', () => {
  it('returns empty positions and zero-area bounds for no zones', () => {
    const layout = computeGridLayout([]);

    expect(layout.positions.size).toBe(0);
    expect(layout.bounds).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    });
  });

  it('places a single zone at the origin', () => {
    const layout = computeGridLayout(['a']);

    expect(layout.positions.get('a')).toEqual({ x: 0, y: 0 });
  });

  it('places four zones in a 2x2 grid', () => {
    const layout = computeGridLayout(['a', 'b', 'c', 'd']);

    const positions = mapEntries(layout.positions);
    const uniqueX = new Set(positions.map(([, pos]) => pos.x));
    const uniqueY = new Set(positions.map(([, pos]) => pos.y));

    expect(uniqueX.size).toBe(2);
    expect(uniqueY.size).toBe(2);
    expect(uniqueX.size * uniqueY.size).toBe(4);
  });

  it('produces non-overlapping positions', () => {
    const layout = computeGridLayout(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    const coordinatePairs = new Set(
      [...layout.positions.values()].map((position) => `${position.x},${position.y}`),
    );

    expect(coordinatePairs.size).toBe(layout.positions.size);
  });

  it('computes bounds that enclose all positions with padding', () => {
    const layout = computeGridLayout(['a', 'b', 'c', 'd', 'e']);
    const values = [...layout.positions.values()];
    const xs = values.map((position) => position.x);
    const ys = values.map((position) => position.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    expect(layout.bounds.minX).toBeLessThan(minX);
    expect(layout.bounds.maxX).toBeGreaterThan(maxX);
    expect(layout.bounds.minY).toBeLessThan(minY);
    expect(layout.bounds.maxY).toBeGreaterThan(maxY);
  });

  it('uses ceil(sqrt(n)) columns for representative counts', () => {
    const counts = [1, 4, 5, 9, 10, 25];

    for (const count of counts) {
      const ids = Array.from({ length: count }, (_, index) => `z${index}`);
      const layout = computeGridLayout(ids);
      const uniqueX = new Set([...layout.positions.values()].map((position) => position.x));

      expect(uniqueX.size).toBe(Math.ceil(Math.sqrt(count)));
    }
  });

  it('is deterministic for repeated calls with identical zone IDs', () => {
    const zoneIDs = ['a', 'b', 'c', 'd', 'e', 'f'];

    const first = computeGridLayout(zoneIDs);
    const second = computeGridLayout(zoneIDs);

    expect(first.bounds).toEqual(second.bounds);
    expect(mapEntries(first.positions)).toEqual(mapEntries(second.positions));
  });
});

describe('createPositionStore', () => {
  it('notifies subscribers when layout updates through setZoneIDs', () => {
    const store = createPositionStore();
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    store.setZoneIDs(['a', 'b', 'c']);

    expect(listener).toHaveBeenCalledTimes(1);
    const nextSnapshot = listener.mock.calls[0]?.[0];
    expect(nextSnapshot).toBeDefined();
    expect(nextSnapshot?.zoneIDs).toEqual(['a', 'b', 'c']);

    unsubscribe();
  });

  it('does not notify subscribers for identical ordered zone IDs', () => {
    const store = createPositionStore(['a', 'b']);
    const listener = vi.fn();

    const unsubscribe = store.subscribe(listener);
    store.setZoneIDs(['a', 'b']);

    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('accepts injected layouts via setPositions for future layout-engine handoff', () => {
    const store = createPositionStore(['a']);
    const listener = vi.fn();

    const next: ZonePositionMap = {
      positions: new Map([
        ['a', { x: 10, y: 20 }],
        ['b', { x: 30, y: 40 }],
      ]),
      bounds: {
        minX: 0,
        minY: 0,
        maxX: 100,
        maxY: 100,
      },
    };

    const unsubscribe = store.subscribe(listener);
    store.setPositions(next, ['a', 'b']);

    const snapshot = store.getSnapshot();
    expect(snapshot.zoneIDs).toEqual(['a', 'b']);
    expect(mapEntries(snapshot.positions)).toEqual(mapEntries(next.positions));
    expect(snapshot.bounds).toEqual(next.bounds);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});

function mapEntries(
  positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
): Array<[string, { readonly x: number; readonly y: number }]> {
  return [...positions.entries()].sort(([left], [right]) => left.localeCompare(right));
}
