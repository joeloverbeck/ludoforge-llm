import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateGrid, generateHex } from '../../../src/cnl/index.js';
import {
  asPhaseId,
  asPlayerId,
  buildAdjacencyGraph,
  queryConnectedZones,
  type EvalContext,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';

const makeState = (zoneIds: readonly string[]): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: Object.fromEntries(zoneIds.map((zoneId) => [zoneId, []])),
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {},
});

const makeCtx = (def: GameDef): EvalContext => ({
  def,
  adjacencyGraph: buildAdjacencyGraph(def.zones),
  state: makeState(def.zones.map((zone) => String(zone.id))),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
});

const makeDef = (id: string, zones: GameDef['zones']): GameDef => ({
  metadata: { id, players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones,
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }], activePlayerOrder: 'roundRobin' },
  actions: [],
  triggers: [],
  endConditions: [],
});

describe('spatial property-style invariants', () => {
  it('generated grid/hex topologies have symmetric adjacency and valid references', () => {
    const zoneSets = [
      generateGrid(1, 1),
      generateGrid(2, 3),
      generateGrid(4, 2),
      generateHex(0),
      generateHex(1),
      generateHex(2),
    ];

    for (const zones of zoneSets) {
      const graph = buildAdjacencyGraph(zones);
      const zoneIdSet = new Set(zones.map((zone) => String(zone.id)));

      for (const [zoneId, neighbors] of Object.entries(graph.neighbors)) {
        for (const neighborId of neighbors) {
          const neighborKey = String(neighborId);
          assert.equal(zoneIdSet.has(neighborKey), true, `Unknown adjacent zone ${neighborKey} from ${zoneId}`);
          assert.equal(
            graph.neighbors[neighborKey]?.some((entry) => String(entry) === zoneId) ?? false,
            true,
            `Missing reverse edge ${neighborKey} -> ${zoneId}`,
          );
        }
      }
    }
  });

  it('connectedZones output is unique and subset of all zones for representative generated topologies', () => {
    const defs = [
      makeDef('grid-3x3-property', generateGrid(3, 3)),
      makeDef('hex-2-property', generateHex(2)),
    ];

    for (const def of defs) {
      const ctx = makeCtx(def);
      const allZones = new Set(def.zones.map((zone) => String(zone.id)));

      for (const zone of def.zones) {
        const connected = queryConnectedZones(ctx.adjacencyGraph, ctx.state, zone.id, ctx);
        assert.equal(new Set(connected).size, connected.length, `connectedZones duplicates from ${String(zone.id)}`);
        assert.equal(
          connected.every((entry) => allZones.has(String(entry))),
          true,
          `connectedZones includes unknown zone from ${String(zone.id)}`,
        );
      }
    }
  });

  it('repeated evaluations of connectedZones produce identical deterministic ordering', () => {
    const def = makeDef('grid-4x3-determinism-property', generateGrid(4, 3));
    const ctx = makeCtx(def);

    for (const zone of def.zones) {
      const first = queryConnectedZones(ctx.adjacencyGraph, ctx.state, zone.id, ctx);
      for (let repeat = 0; repeat < 8; repeat += 1) {
        const next = queryConnectedZones(ctx.adjacencyGraph, ctx.state, zone.id, ctx);
        assert.deepEqual(next, first);
      }
    }
  });
});
