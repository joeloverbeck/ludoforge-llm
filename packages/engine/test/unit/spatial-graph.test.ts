import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asZoneId, buildAdjacencyGraph, type ZoneDef, validateAdjacency } from '../../src/kernel/index.js';

type ZoneAdjacencyInput =
  | string
  | {
      readonly to: string;
      readonly direction?: 'bidirectional' | 'unidirectional';
    };

const zone = (id: string, adjacentTo?: ReadonlyArray<ZoneAdjacencyInput>): ZoneDef => ({
  id: asZoneId(id),
  owner: 'none',
  visibility: 'public',
  ordering: 'set',
  ...(adjacentTo
    ? {
      adjacentTo: adjacentTo.map((entry) => ({
        to: asZoneId(typeof entry === 'string' ? entry : entry.to),
        direction: typeof entry === 'string' ? 'bidirectional' : (entry.direction ?? 'bidirectional'),
      })),
    }
    : {}),
});

interface FitlMapPayload {
  readonly spaces: ReadonlyArray<{
    readonly id: string;
    readonly adjacentTo: ReadonlyArray<{ readonly to: string }>;
  }>;
}

const fitlMapPayload: FitlMapPayload = {
  spaces: [
    { id: 'cambodia:none', adjacentTo: [{ to: 'south_vietnam:none' }] },
    { id: 'hue:none', adjacentTo: [{ to: 'loc_ho_chi_minh_trail:none' }, { to: 'south_vietnam:none' }] },
    { id: 'laos:none', adjacentTo: [{ to: 'north_vietnam:none' }, { to: 'south_vietnam:none' }] },
    { id: 'loc_ho_chi_minh_trail:none', adjacentTo: [{ to: 'hue:none' }, { to: 'north_vietnam:none' }] },
    { id: 'north_vietnam:none', adjacentTo: [{ to: 'laos:none' }, { to: 'loc_ho_chi_minh_trail:none' }, { to: 'south_vietnam:none' }] },
    { id: 'south_vietnam:none', adjacentTo: [{ to: 'cambodia:none' }, { to: 'hue:none' }, { to: 'laos:none' }, { to: 'north_vietnam:none' }] },
  ],
};

const loadFitlMapZones = (): readonly ZoneDef[] => {
  return fitlMapPayload.spaces.map((space) => zone(space.id, space.adjacentTo));
};

describe('spatial adjacency graph', () => {
  it('preserves symmetric declarations', () => {
    const zones = [zone('a:none', ['b:none']), zone('b:none', ['a:none'])];

    const graph = buildAdjacencyGraph(zones);

    assert.deepEqual(graph.neighbors['a:none'], [asZoneId('b:none')]);
    assert.deepEqual(graph.neighbors['b:none'], [asZoneId('a:none')]);
  });

  it('normalizes asymmetric declarations and emits warning', () => {
    const zones = [zone('a:none', ['b:none']), zone('b:none')];
    const graph = buildAdjacencyGraph(zones);
    const diagnostics = validateAdjacency(graph, zones);

    assert.deepEqual(graph.neighbors['a:none'], [asZoneId('b:none')]);
    assert.deepEqual(graph.neighbors['b:none'], [asZoneId('a:none')]);
    assert.ok(
      diagnostics.some((diag) =>
        diag.code === 'SPATIAL_ASYMMETRIC_EDGE_NORMALIZED'
          && diag.path === 'zones[0].adjacentTo[0].to'
          && diag.severity === 'warning'
          && typeof diag.message === 'string'
          && typeof diag.suggestion === 'string'),
    );
  });

  it('keeps unidirectional edges one-way without asymmetry warning', () => {
    const zones = [
      zone('a:none', [{ to: 'b:none', direction: 'unidirectional' }]),
      zone('b:none'),
    ];
    const graph = buildAdjacencyGraph(zones);
    const diagnostics = validateAdjacency(graph, zones);

    assert.deepEqual(graph.neighbors['a:none'], [asZoneId('b:none')]);
    assert.deepEqual(graph.neighbors['b:none'], []);
    assert.equal(
      diagnostics.some((diag) => diag.code === 'SPATIAL_ASYMMETRIC_EDGE_NORMALIZED'),
      false,
    );
  });

  it('emits self-loop error', () => {
    const zones = [zone('a:none', ['a:none'])];
    const diagnostics = validateAdjacency(buildAdjacencyGraph(zones), zones);

    assert.ok(
      diagnostics.some((diag) => diag.code === 'SPATIAL_SELF_LOOP' && diag.path === 'zones[0].adjacentTo[0].to' && diag.severity === 'error'),
    );
  });

  it('deduplicates neighbors and emits duplicate warning', () => {
    const zones = [zone('a:none', ['b:none', 'b:none']), zone('b:none')];
    const graph = buildAdjacencyGraph(zones);
    const diagnostics = validateAdjacency(graph, zones);

    assert.deepEqual(graph.neighbors['a:none'], [asZoneId('b:none')]);
    assert.ok(
      diagnostics.some((diag) => diag.code === 'SPATIAL_DUPLICATE_NEIGHBOR' && diag.path === 'zones[0].adjacentTo[1].to' && diag.severity === 'warning'),
    );
  });

  it('emits error for conflicting duplicate directions to the same neighbor', () => {
    const zones = [
      zone('a:none', [
        { to: 'b:none', direction: 'bidirectional' },
        { to: 'b:none', direction: 'unidirectional' },
      ]),
      zone('b:none'),
    ];
    const diagnostics = validateAdjacency(buildAdjacencyGraph(zones), zones);

    assert.ok(
      diagnostics.some((diag) =>
        diag.code === 'SPATIAL_CONFLICTING_NEIGHBOR_DIRECTION'
        && diag.path === 'zones[0].adjacentTo[1].direction'
        && diag.severity === 'error'),
    );
  });

  it('emits dangling zone reference error', () => {
    const zones = [zone('a:none', ['missing:none'])];
    const diagnostics = validateAdjacency(buildAdjacencyGraph(zones), zones);

    assert.ok(
      diagnostics.some((diag) => diag.code === 'SPATIAL_DANGLING_ZONE_REF' && diag.path === 'zones[0].adjacentTo[0].to' && diag.severity === 'error'),
    );
  });

  it('includes isolated zones as empty neighbor arrays', () => {
    const zones = [zone('a:none'), zone('b:none')];
    const graph = buildAdjacencyGraph(zones);

    assert.deepEqual(graph.neighbors['a:none'], []);
    assert.deepEqual(graph.neighbors['b:none'], []);
  });

  it('sorts neighbor order lexicographically', () => {
    const zones = [zone('a:none', ['c:none', 'b:none']), zone('b:none'), zone('c:none')];
    const graph = buildAdjacencyGraph(zones);

    assert.deepEqual(graph.neighbors['a:none'], [asZoneId('b:none'), asZoneId('c:none')]);
  });

  it('builds canonical adjacency graph from FITL foundation map asset', () => {
    const zones = loadFitlMapZones();
    const graph = buildAdjacencyGraph(zones);
    const diagnostics = validateAdjacency(graph, zones);

    assert.equal(graph.zoneCount, 6);
    assert.deepEqual(graph.neighbors['south_vietnam:none'], [
      asZoneId('cambodia:none'),
      asZoneId('hue:none'),
      asZoneId('laos:none'),
      asZoneId('north_vietnam:none'),
    ]);
    assert.equal(
      diagnostics.some((diag) => diag.severity === 'error' && diag.code.startsWith('SPATIAL_')),
      false,
    );
  });
});
