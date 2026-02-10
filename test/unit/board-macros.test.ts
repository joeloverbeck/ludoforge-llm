import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expandBoardMacro, generateGrid, generateHex } from '../../src/cnl/index.js';
import { buildAdjacencyGraph } from '../../src/kernel/index.js';

function assertSymmetricAdjacency(neighbors: Readonly<Record<string, readonly string[]>>): void {
  for (const [zoneId, zoneNeighbors] of Object.entries(neighbors)) {
    for (const neighborId of zoneNeighbors) {
      const reverse = neighbors[neighborId];
      assert.ok(reverse?.includes(zoneId), `Expected reverse edge for ${zoneId} -> ${neighborId}`);
    }
  }
}

describe('board macros', () => {
  it('generateGrid(3,3) returns row-major ids and 4-neighbor symmetric topology', () => {
    const zones = generateGrid(3, 3);
    const graph = buildAdjacencyGraph(zones);

    assert.equal(zones.length, 9);
    assert.deepEqual(
      zones.map((zone) => String(zone.id)),
      [
        'cell_0_0',
        'cell_0_1',
        'cell_0_2',
        'cell_1_0',
        'cell_1_1',
        'cell_1_2',
        'cell_2_0',
        'cell_2_1',
        'cell_2_2',
      ],
    );

    assert.deepEqual(graph.neighbors['cell_1_1'], ['cell_0_1', 'cell_1_0', 'cell_1_2', 'cell_2_1']);
    assert.deepEqual(graph.neighbors['cell_0_0'], ['cell_0_1', 'cell_1_0']);
    assertSymmetricAdjacency(graph.neighbors as Readonly<Record<string, readonly string[]>>);
  });

  it('generateGrid(1,1) yields a single isolated zone with default attrs', () => {
    const zones = generateGrid(1, 1);
    const graph = buildAdjacencyGraph(zones);

    assert.equal(zones.length, 1);
    assert.equal(String(zones[0]?.id), 'cell_0_0');
    assert.equal(zones[0]?.owner, 'none');
    assert.equal(zones[0]?.visibility, 'public');
    assert.equal(zones[0]?.ordering, 'set');
    assert.deepEqual(graph.neighbors['cell_0_0'], []);
  });

  it('generateHex(radius) satisfies zone-count formula and symmetric adjacency', () => {
    const radius0 = generateHex(0);
    const radius1 = generateHex(1);
    const radius2 = generateHex(2);

    assert.equal(radius0.length, 1);
    assert.equal(radius1.length, 7);
    assert.equal(radius2.length, 19);

    const graph0 = buildAdjacencyGraph(radius0);
    const graph1 = buildAdjacencyGraph(radius1);
    const graph2 = buildAdjacencyGraph(radius2);

    assert.deepEqual(graph0.neighbors['hex_0_0'], []);
    assert.equal(graph1.neighbors['hex_0_0']?.length, 6);

    const degreeCounts = Object.values(graph2.neighbors).reduce(
      (acc, entries) => {
        acc[entries.length] = (acc[entries.length] ?? 0) + 1;
        return acc;
      },
      {} as Record<number, number>,
    );

    assert.equal(degreeCounts[3], 6);
    assert.equal(degreeCounts[4], 6);
    assert.equal(degreeCounts[6], 7);
    assertSymmetricAdjacency(graph1.neighbors as Readonly<Record<string, readonly string[]>>);
    assertSymmetricAdjacency(graph2.neighbors as Readonly<Record<string, readonly string[]>>);
  });

  it('generateHex encodes negative coordinates with n-prefix', () => {
    const ids = new Set(generateHex(1).map((zone) => String(zone.id)));

    assert.ok(ids.has('hex_n1_0'));
    assert.ok(ids.has('hex_0_n1'));
    assert.ok(ids.has('hex_n1_1'));
    assert.ok([...ids].every((id) => !id.includes('-')));
  });

  it('expandBoardMacro reports diagnostics for invalid grid and hex args', () => {
    const invalidGridRows = expandBoardMacro('grid', [0, 3], 'macros[0]');
    const invalidGridCols = expandBoardMacro('grid', [2, -1], 'macros[1]');
    const invalidGridFloat = expandBoardMacro('grid', [2.5, 3], 'macros[2]');
    const invalidHexNegative = expandBoardMacro('hex', [-1], 'macros[3]');
    const invalidHexFloat = expandBoardMacro('hex', [1.2], 'macros[4]');

    assert.equal(invalidGridRows.zones.length, 0);
    assert.equal(invalidGridCols.zones.length, 0);
    assert.equal(invalidGridFloat.zones.length, 0);
    assert.equal(invalidHexNegative.zones.length, 0);
    assert.equal(invalidHexFloat.zones.length, 0);

    assert.equal(invalidGridRows.diagnostics[0]?.code, 'CNL_BOARD_MACRO_INVALID_ARGUMENT');
    assert.equal(invalidGridCols.diagnostics[0]?.path, 'macros[1].args[1]');
    assert.equal(invalidGridFloat.diagnostics[0]?.path, 'macros[2].args[0]');
    assert.equal(invalidHexNegative.diagnostics[0]?.path, 'macros[3].args[0]');
    assert.equal(invalidHexFloat.diagnostics[0]?.code, 'CNL_BOARD_MACRO_INVALID_ARGUMENT');
  });
});
