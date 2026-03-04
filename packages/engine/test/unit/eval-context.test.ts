import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  buildAdjacencyGraph,
  createCollector,
  createEvalContext,
  createEvalRuntimeResources,
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
    const resources = createEvalRuntimeResources({
      collector,
      queryRuntimeCache,
    });
    const ctx = createEvalContext({
      def,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      state: makeState(),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      resources,
    });

    assert.equal(ctx.collector, collector);
    assert.equal(ctx.queryRuntimeCache, queryRuntimeCache);
  });

  it('reuses one runtime resource object across multiple contexts', () => {
    const def = makeDef();
    const resources = createEvalRuntimeResources();
    const state = makeState();
    const adjacencyGraph = buildAdjacencyGraph(def.zones);

    const first = createEvalContext({
      def,
      adjacencyGraph,
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      resources,
    });
    const second = createEvalContext({
      def,
      adjacencyGraph,
      state,
      activePlayer: asPlayerId(1),
      actorPlayer: asPlayerId(1),
      bindings: {},
      resources,
    });

    assert.equal(first.collector, second.collector);
    assert.equal(first.queryRuntimeCache, second.queryRuntimeCache);
  });

  it('isolates defaults across independent createEvalContext calls', () => {
    const def = makeDef();
    const state = makeState();
    const adjacencyGraph = buildAdjacencyGraph(def.zones);

    const first = createEvalContext({
      def,
      adjacencyGraph,
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
    });
    const second = createEvalContext({
      def,
      adjacencyGraph,
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
    });

    assert.notEqual(first.collector, second.collector);
    assert.notEqual(first.queryRuntimeCache, second.queryRuntimeCache);
  });
});
