import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { asZoneId, buildAdjacencyGraph, type ZoneDef, validateAdjacency } from '../../src/kernel/index.js';

const zone = (id: string, adjacentTo?: readonly string[]): ZoneDef => ({
  id: asZoneId(id),
  owner: 'none',
  visibility: 'public',
  ordering: 'set',
  ...(adjacentTo ? { adjacentTo: adjacentTo.map((entry) => asZoneId(entry)) } : {}),
});

interface FitlMapPayload {
  readonly spaces: ReadonlyArray<{
    readonly id: string;
    readonly adjacentTo: readonly string[];
  }>;
}

const loadFitlMapZones = (): readonly ZoneDef[] => {
  const distRelativeAssetPath = fileURLToPath(new URL('../../../data/fitl/map/foundation.v1.json', import.meta.url));
  const sourceRelativeAssetPath = fileURLToPath(new URL('../../data/fitl/map/foundation.v1.json', import.meta.url));
  const assetPath = existsSync(distRelativeAssetPath) ? distRelativeAssetPath : sourceRelativeAssetPath;
  const asset = JSON.parse(readFileSync(assetPath, 'utf8')) as { readonly payload: FitlMapPayload };
  return asset.payload.spaces.map((space) => zone(space.id, space.adjacentTo));
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
