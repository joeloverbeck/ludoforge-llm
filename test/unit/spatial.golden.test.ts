import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateGrid, generateHex } from '../../src/cnl/index.js';
import { buildAdjacencyGraph } from '../../src/kernel/index.js';

const canonicalNeighbors = (
  neighbors: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, readonly string[]>> =>
  Object.fromEntries(
    Object.keys(neighbors)
      .sort((left, right) => left.localeCompare(right))
      .map((zoneId) => [zoneId, [...(neighbors[zoneId] ?? [])]]),
  );

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
});
