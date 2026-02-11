import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { generateGrid, generateHex } from '../../src/cnl/index.js';
import { asZoneId, buildAdjacencyGraph, type ZoneDef } from '../../src/kernel/index.js';

const canonicalNeighbors = (
  neighbors: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, readonly string[]>> =>
  Object.fromEntries(
    Object.keys(neighbors)
      .sort((left, right) => left.localeCompare(right))
      .map((zoneId) => [zoneId, [...(neighbors[zoneId] ?? [])]]),
  );

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
  return asset.payload.spaces.map((space) => ({
    id: asZoneId(space.id),
    owner: 'none',
    visibility: 'public',
    ordering: 'set',
    adjacentTo: space.adjacentTo.map((adjacent) => asZoneId(adjacent)),
  }));
};

describe('spatial topology golden coverage', () => {
  it('grid(3,3) has exact canonical zone ids and adjacency lists', () => {
    const zones = generateGrid(3, 3);
    const graph = buildAdjacencyGraph(zones);

    assert.deepEqual(
      zones.map((zone) => String(zone.id)),
      ['cell_0_0', 'cell_0_1', 'cell_0_2', 'cell_1_0', 'cell_1_1', 'cell_1_2', 'cell_2_0', 'cell_2_1', 'cell_2_2'],
    );
    assert.deepEqual(
      canonicalNeighbors(graph.neighbors as Readonly<Record<string, readonly string[]>>),
      {
        cell_0_0: ['cell_0_1', 'cell_1_0'],
        cell_0_1: ['cell_0_0', 'cell_0_2', 'cell_1_1'],
        cell_0_2: ['cell_0_1', 'cell_1_2'],
        cell_1_0: ['cell_0_0', 'cell_1_1', 'cell_2_0'],
        cell_1_1: ['cell_0_1', 'cell_1_0', 'cell_1_2', 'cell_2_1'],
        cell_1_2: ['cell_0_2', 'cell_1_1', 'cell_2_2'],
        cell_2_0: ['cell_1_0', 'cell_2_1'],
        cell_2_1: ['cell_1_1', 'cell_2_0', 'cell_2_2'],
        cell_2_2: ['cell_1_2', 'cell_2_1'],
      },
    );
  });

  it('hex(1) has exact canonical zone ids and adjacency lists', () => {
    const zones = generateHex(1);
    const graph = buildAdjacencyGraph(zones);

    assert.deepEqual(
      zones.map((zone) => String(zone.id)),
      ['hex_n1_0', 'hex_n1_1', 'hex_0_n1', 'hex_0_0', 'hex_0_1', 'hex_1_n1', 'hex_1_0'],
    );
    assert.deepEqual(
      canonicalNeighbors(graph.neighbors as Readonly<Record<string, readonly string[]>>),
      {
        hex_0_0: ['hex_0_1', 'hex_0_n1', 'hex_1_0', 'hex_1_n1', 'hex_n1_0', 'hex_n1_1'],
        hex_0_1: ['hex_0_0', 'hex_1_0', 'hex_n1_1'],
        hex_0_n1: ['hex_0_0', 'hex_1_n1', 'hex_n1_0'],
        hex_1_0: ['hex_0_0', 'hex_0_1', 'hex_1_n1'],
        hex_1_n1: ['hex_0_0', 'hex_0_n1', 'hex_1_0'],
        hex_n1_0: ['hex_0_0', 'hex_0_n1', 'hex_n1_1'],
        hex_n1_1: ['hex_0_0', 'hex_0_1', 'hex_n1_0'],
      },
    );
  });

  it('fitl foundation map asset has exact canonical zone ids and adjacency lists', () => {
    const zones = loadFitlMapZones();
    const graph = buildAdjacencyGraph(zones);

    assert.deepEqual(
      zones.map((zone) => String(zone.id)),
      [
        'cambodia:none',
        'hue:none',
        'laos:none',
        'loc_ho_chi_minh_trail:none',
        'north_vietnam:none',
        'south_vietnam:none',
      ],
    );
    assert.deepEqual(
      canonicalNeighbors(graph.neighbors as Readonly<Record<string, readonly string[]>>),
      {
        'cambodia:none': ['south_vietnam:none'],
        'hue:none': ['loc_ho_chi_minh_trail:none', 'south_vietnam:none'],
        'laos:none': ['north_vietnam:none', 'south_vietnam:none'],
        'loc_ho_chi_minh_trail:none': ['hue:none', 'north_vietnam:none'],
        'north_vietnam:none': ['laos:none', 'loc_ho_chi_minh_trail:none', 'south_vietnam:none'],
        'south_vietnam:none': ['cambodia:none', 'hue:none', 'laos:none', 'north_vietnam:none'],
      },
    );
  });
});
