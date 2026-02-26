import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  queryAdjacentZones,
  type ZoneDef,
  type ZoneId,
} from '../../src/kernel/index.js';

const makeLinearZones = (count: number): ZoneDef[] =>
  Array.from({ length: count }, (_, idx) => ({
    id: `zone-${idx}` as ZoneId,
    owner: 'none' as const,
    visibility: 'public' as const,
    ordering: 'set' as const,
    adjacentTo: [
      ...(idx > 0 ? [{ to: `zone-${idx - 1}` as ZoneId, direction: 'bidirectional' as const }] : []),
      ...(idx < count - 1 ? [{ to: `zone-${idx + 1}` as ZoneId, direction: 'bidirectional' as const }] : []),
    ],
  }));

const makeGridZones = (side: number): ZoneDef[] => {
  const zones: ZoneDef[] = [];
  for (let row = 0; row < side; row += 1) {
    for (let col = 0; col < side; col += 1) {
      const id = `zone-${row}-${col}` as ZoneId;
      const neighbors: Array<{ to: ZoneId; direction: 'bidirectional' }> = [];
      if (row > 0) neighbors.push({ to: `zone-${row - 1}-${col}` as ZoneId, direction: 'bidirectional' });
      if (col > 0) neighbors.push({ to: `zone-${row}-${col - 1}` as ZoneId, direction: 'bidirectional' });
      if (row < side - 1) neighbors.push({ to: `zone-${row + 1}-${col}` as ZoneId, direction: 'bidirectional' });
      if (col < side - 1) neighbors.push({ to: `zone-${row}-${col + 1}` as ZoneId, direction: 'bidirectional' });
      neighbors.sort((a, b) => a.to.localeCompare(b.to));
      zones.push({ id, owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: neighbors });
    }
  }
  return zones;
};

describe('spatial graph performance', () => {
  it('buildAdjacencyGraph for 10 zones within 50ms', () => {
    const zones = makeLinearZones(10);
    const start = performance.now();
    const graph = buildAdjacencyGraph(zones);
    const elapsed = performance.now() - start;

    assert.equal(graph.zoneCount, 10);
    assert.ok(elapsed < 50, `10 zones took ${elapsed.toFixed(1)}ms, expected < 50ms`);
  });

  it('buildAdjacencyGraph for 50 zones within 200ms', () => {
    const zones = makeLinearZones(50);
    const start = performance.now();
    const graph = buildAdjacencyGraph(zones);
    const elapsed = performance.now() - start;

    assert.equal(graph.zoneCount, 50);
    assert.ok(elapsed < 200, `50 zones took ${elapsed.toFixed(1)}ms, expected < 200ms`);
  });

  it('buildAdjacencyGraph for 200 zones within 2s', () => {
    const zones = makeLinearZones(200);
    const start = performance.now();
    const graph = buildAdjacencyGraph(zones);
    const elapsed = performance.now() - start;

    assert.equal(graph.zoneCount, 200);
    assert.ok(elapsed < 2000, `200 zones took ${elapsed.toFixed(1)}ms, expected < 2000ms`);
  });

  it('buildAdjacencyGraph for 14x14 grid (196 zones) within 2s', () => {
    const zones = makeGridZones(14);
    const start = performance.now();
    const graph = buildAdjacencyGraph(zones);
    const elapsed = performance.now() - start;

    assert.equal(graph.zoneCount, 196);
    assert.ok(elapsed < 2000, `14x14 grid took ${elapsed.toFixed(1)}ms, expected < 2000ms`);
  });

  it('queryAdjacentZones for various graph sizes within 100ms total', () => {
    const sizes = [10, 50, 200];
    const queriesPerSize = 1000;

    const start = performance.now();
    for (const size of sizes) {
      const zones = makeLinearZones(size);
      const graph = buildAdjacencyGraph(zones);
      for (let query = 0; query < queriesPerSize; query += 1) {
        const zoneIdx = query % size;
        queryAdjacentZones(graph, `zone-${zoneIdx}` as ZoneId);
      }
    }
    const elapsed = performance.now() - start;

    assert.ok(elapsed < 100, `Adjacent zone queries took ${elapsed.toFixed(1)}ms, expected < 100ms`);
  });

  it('scaling: 200-zone graph builds in sub-quadratic time relative to 50-zone', () => {
    const zones50 = makeLinearZones(50);
    const zones200 = makeLinearZones(200);

    const start50 = performance.now();
    for (let iteration = 0; iteration < 10; iteration += 1) {
      buildAdjacencyGraph(zones50);
    }
    const elapsed50 = (performance.now() - start50) / 10;

    const start200 = performance.now();
    for (let iteration = 0; iteration < 10; iteration += 1) {
      buildAdjacencyGraph(zones200);
    }
    const elapsed200 = (performance.now() - start200) / 10;

    const sizeRatio = 200 / 50;
    const timeRatio = elapsed200 / Math.max(elapsed50, 0.001);
    const quadraticRatio = sizeRatio * sizeRatio;

    assert.ok(
      timeRatio < quadraticRatio,
      `Time ratio ${timeRatio.toFixed(1)} should be less than quadratic ratio ${quadraticRatio} (sub-quadratic scaling)`,
    );
  });
});
