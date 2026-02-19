import { describe, expect, it } from 'vitest';
import { asZoneId, type GameDef, type ZoneDef } from '@ludoforge/engine/runtime';

import { VisualConfigProvider } from '../../src/config/visual-config-provider';
import { buildLayoutGraph, partitionZones, resolveLayoutMode } from '../../src/layout/build-layout-graph';

describe('resolveLayoutMode', () => {
  it('uses provider-configured grid mode', () => {
    expect(resolveLayoutMode(makeDef([]), providerWithMode('grid'))).toBe('grid');
  });

  it('uses provider-configured track mode', () => {
    expect(resolveLayoutMode(makeDef([]), providerWithMode('track'))).toBe('track');
  });

  it('auto-detects graph when any zone has adjacency', () => {
    const def = makeDef([
      zone('a', { adjacentTo: [{ to: 'b' }] }),
      zone('b'),
    ]);

    expect(resolveLayoutMode(def, new VisualConfigProvider(null))).toBe('graph');
  });

  it('auto-detects table when zones have no adjacency', () => {
    const def = makeDef([
      zone('a'),
      zone('b'),
    ]);

    expect(resolveLayoutMode(def, new VisualConfigProvider(null))).toBe('table');
  });

  it('returns table for empty zones', () => {
    expect(resolveLayoutMode(makeDef([]), new VisualConfigProvider(null))).toBe('table');
  });

  it('ignores GameDef metadata.layoutMode and uses provider/fallback behavior', () => {
    const def = makeDef([zone('a', { adjacentTo: [{ to: 'b' }] }), zone('b')], 'grid');
    expect(resolveLayoutMode(def, new VisualConfigProvider(null))).toBe('graph');
  });
});

describe('partitionZones', () => {
  it('partitions explicit zoneKind values', () => {
    const def = makeDef([
      zone('board-1', { zoneKind: 'board' }),
      zone('aux-1', { zoneKind: 'aux' }),
    ]);

    expect(ids(partitionZones(def).board)).toEqual(['board-1']);
    expect(ids(partitionZones(def).aux)).toEqual(['aux-1']);
  });

  it('infers board for zone without zoneKind but with adjacency', () => {
    const def = makeDef([
      zone('board-1', { adjacentTo: [{ to: 'board-2' }] }),
      zone('board-2'),
    ]);

    expect(ids(partitionZones(def).board)).toEqual(['board-1']);
  });

  it('infers aux for zone without zoneKind and without adjacency', () => {
    const def = makeDef([
      zone('aux-1'),
    ]);

    expect(ids(partitionZones(def).aux)).toEqual(['aux-1']);
  });

  it('returns empty arrays for empty zones', () => {
    const partitioned = partitionZones(makeDef([]));

    expect(partitioned.board).toEqual([]);
    expect(partitioned.aux).toEqual([]);
  });

  it('does not mutate the original zones array', () => {
    const zones = [
      zone('a', { zoneKind: 'board' }),
      zone('b', { zoneKind: 'aux' }),
    ];
    const def = makeDef(zones);

    partitionZones(def);

    expect(def.zones).toBe(zones);
    expect(ids(def.zones)).toEqual(['a', 'b']);
  });
});

describe('buildLayoutGraph', () => {
  it('creates one node per board zone', () => {
    const graph = buildLayoutGraph([
      zone('a'),
      zone('b'),
      zone('c'),
    ]);

    expect(graph.order).toBe(3);
    expect(graph.hasNode('a')).toBe(true);
    expect(graph.hasNode('b')).toBe(true);
    expect(graph.hasNode('c')).toBe(true);
  });

  it('adds undirected edges from adjacentTo', () => {
    const graph = buildLayoutGraph([
      zone('a', { adjacentTo: [{ to: 'b' }] }),
      zone('b', { adjacentTo: [{ to: 'a' }] }),
    ]);

    expect(graph.size).toBe(1);
    expect(graph.hasUndirectedEdge('a', 'b')).toBe(true);
  });

  it('adds undirected layout connectivity for unidirectional adjacency entries', () => {
    const graph = buildLayoutGraph([
      zone('a', { adjacentTo: [{ to: 'b', direction: 'unidirectional' }] }),
      zone('b'),
    ]);

    expect(graph.hasUndirectedEdge('a', 'b')).toBe(true);
  });

  it('preserves node category and attributes only', () => {
    const graph = buildLayoutGraph([
      zone('a', {
        category: 'city',
        attributes: { region: 'north', score: 2 },
      }),
    ]);

    expect(graph.getNodeAttributes('a')).toEqual({
      category: 'city',
      attributes: { region: 'north', score: 2 },
    });
  });

  it('skips adjacency edges that target zones outside the board partition', () => {
    const graph = buildLayoutGraph([
      zone('board-a', { adjacentTo: [{ to: 'aux-x' }] }),
    ]);

    expect(graph.size).toBe(0);
  });

  it('returns an empty graph for empty board zones', () => {
    const graph = buildLayoutGraph([]);

    expect(graph.order).toBe(0);
    expect(graph.size).toBe(0);
  });

  it('deduplicates repeated and symmetric adjacency edges', () => {
    const graph = buildLayoutGraph([
      zone('a', { adjacentTo: [{ to: 'b' }, { to: 'b' }, { to: 'c' }] }),
      zone('b', { adjacentTo: [{ to: 'a' }] }),
      zone('c', { adjacentTo: [{ to: 'a' }] }),
    ]);

    expect(graph.size).toBe(2);
    expect(graph.hasUndirectedEdge('a', 'b')).toBe(true);
    expect(graph.hasUndirectedEdge('a', 'c')).toBe(true);
  });

  it('skips self adjacency entries', () => {
    const graph = buildLayoutGraph([
      zone('a', { adjacentTo: [{ to: 'a' }] }),
    ]);

    expect(graph.size).toBe(0);
  });

  it('does not mutate input adjacency arrays', () => {
    const adjacentTo = ['b', 'b'];
    const boardZones = [
      zone('a', { adjacentTo }),
      zone('b'),
    ];

    buildLayoutGraph(boardZones);

    expect(adjacentTo).toEqual(['b', 'b']);
  });
});

function makeDef(
  zones: readonly ZoneDef[],
  layoutMode?: 'graph' | 'table' | 'track' | 'grid',
): GameDef {
  return {
    metadata: {
      id: 'layout-test',
      ...(layoutMode === undefined ? {} : { layoutMode }),
    },
    zones,
  } as unknown as GameDef;
}

interface ZoneOverrides {
  readonly zoneKind?: ZoneDef['zoneKind'];
  readonly adjacentTo?: ReadonlyArray<
    string
    | {
        readonly to: string;
        readonly direction?: 'bidirectional' | 'unidirectional';
      }
  >;
  readonly category?: ZoneDef['category'];
  readonly attributes?: ZoneDef['attributes'];
}

function zone(id: string, overrides: ZoneOverrides = {}): ZoneDef {
  const { adjacentTo, ...restOverrides } = overrides;
  const normalizedAdjacentTo = adjacentTo?.map((entry) => {
    if (typeof entry === 'string') {
      return { to: asZoneId(entry) };
    }
    return {
      to: asZoneId(String(entry.to)),
      ...(entry.direction === undefined ? {} : { direction: entry.direction }),
    };
  });

  return {
    id: asZoneId(id),
    owner: 'none',
    visibility: 'public',
    ordering: 'set',
    ...restOverrides,
    ...(normalizedAdjacentTo === undefined ? {} : { adjacentTo: normalizedAdjacentTo }),
  } as ZoneDef;
}

function ids(zones: readonly ZoneDef[]): string[] {
  return zones.map((zoneDef) => zoneDef.id);
}

function providerWithMode(mode: 'graph' | 'table' | 'track' | 'grid'): VisualConfigProvider {
  return new VisualConfigProvider({
    version: 1,
    layout: {
      mode,
    },
  });
}
