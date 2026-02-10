import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asZoneId, buildAdjacencyGraph, type ZoneDef, validateAdjacency } from '../../src/kernel/index.js';

const zone = (id: string, adjacentTo?: readonly string[]): ZoneDef => ({
  id: asZoneId(id),
  owner: 'none',
  visibility: 'public',
  ordering: 'set',
  ...(adjacentTo ? { adjacentTo: adjacentTo.map((entry) => asZoneId(entry)) } : {}),
});

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
      diagnostics.some(
        (diag) =>
          diag.code === 'SPATIAL_ASYMMETRIC_EDGE_NORMALIZED' &&
          diag.path === 'zones[0].adjacentTo[0]' &&
          diag.severity === 'warning' &&
          typeof diag.message === 'string' &&
          typeof diag.suggestion === 'string',
      ),
    );
  });

  it('emits self-loop error', () => {
    const zones = [zone('a:none', ['a:none'])];
    const diagnostics = validateAdjacency(buildAdjacencyGraph(zones), zones);

    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'SPATIAL_SELF_LOOP' && diag.path === 'zones[0].adjacentTo[0]' && diag.severity === 'error',
      ),
    );
  });

  it('deduplicates neighbors and emits duplicate warning', () => {
    const zones = [zone('a:none', ['b:none', 'b:none']), zone('b:none')];
    const graph = buildAdjacencyGraph(zones);
    const diagnostics = validateAdjacency(graph, zones);

    assert.deepEqual(graph.neighbors['a:none'], [asZoneId('b:none')]);
    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'SPATIAL_DUPLICATE_NEIGHBOR' &&
          diag.path === 'zones[0].adjacentTo[1]' &&
          diag.severity === 'warning',
      ),
    );
  });

  it('emits dangling zone reference error', () => {
    const zones = [zone('a:none', ['missing:none'])];
    const diagnostics = validateAdjacency(buildAdjacencyGraph(zones), zones);

    assert.ok(
      diagnostics.some(
        (diag) =>
          diag.code === 'SPATIAL_DANGLING_ZONE_REF' &&
          diag.path === 'zones[0].adjacentTo[0]' &&
          diag.severity === 'error',
      ),
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
});
