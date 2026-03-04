import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  buildAdjacencyGraph,
  createCollector,
  createEvalContext,
  createQueryRuntimeCache,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'eval-context-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

describe('createEvalContext', () => {
  it('provides default collector and query runtime cache', () => {
    const def = makeDef();
    const ctx = createEvalContext({
      def,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      state: makeState(),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
    });

    assert.deepEqual(ctx.collector.warnings, []);
    assert.equal(ctx.collector.trace, null);
    assert.ok(ctx.queryRuntimeCache.tokenZoneIndexByState instanceof WeakMap);
  });

  it('preserves provided collector and query runtime cache instances', () => {
    const def = makeDef();
    const collector = createCollector({ trace: true });
    const queryRuntimeCache = createQueryRuntimeCache();
    const ctx = createEvalContext({
      def,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      state: makeState(),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      collector,
      queryRuntimeCache,
    });

    assert.equal(ctx.collector, collector);
    assert.equal(ctx.queryRuntimeCache, queryRuntimeCache);
  });
});
