import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPhaseId,
  asPlayerId,
  buildAdjacencyGraph,
  createCollector,
  createEvalContext,
  createEvalRuntimeResources,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';
import { getTokenStateIndexEntry } from '../../src/kernel/token-state-index.js';

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
  it('requires explicit runtime resources and uses them as the eval context carrier', () => {
    const def = makeDef();
    const resources = createEvalRuntimeResources();
    const ctx = createEvalContext({
      def,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      state: makeState(),
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      resources,
    });

    assert.equal(ctx.resources, resources);
    assert.equal(ctx.collector, resources.collector);
  });

  it('preserves provided collector instance', () => {
    const def = makeDef();
    const collector = createCollector({ trace: true });
    const resources = createEvalRuntimeResources({
      collector,
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
  });

  it('keeps contexts isolated when created with different runtime resources', () => {
    const def = makeDef();
    const state = makeState();
    const adjacencyGraph = buildAdjacencyGraph(def.zones);
    const firstResources = createEvalRuntimeResources();
    const secondResources = createEvalRuntimeResources();

    const first = createEvalContext({
      def,
      adjacencyGraph,
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      resources: firstResources,
    });
    const second = createEvalContext({
      def,
      adjacencyGraph,
      state,
      activePlayer: asPlayerId(0),
      actorPlayer: asPlayerId(0),
      bindings: {},
      resources: secondResources,
    });

    assert.notEqual(first.collector, second.collector);
  });
});

describe('token-state-index canonical helper', () => {
  it('derives canonical token state index entries directly from state', () => {
    const state = {
      ...makeState(),
      zones: {
        'hand:0': [{ id: 'shared-token', type: 'card', props: {} }],
        'bench:1': [{ id: 'shared-token', type: 'card', props: {} }],
      },
    } as unknown as GameState;

    const tokenStateEntry = getTokenStateIndexEntry(state, 'shared-token');
    assert.notEqual(tokenStateEntry, undefined);
    assert.equal(tokenStateEntry?.zoneId, 'hand:0');
    assert.equal(tokenStateEntry?.occurrenceCount, 2);
    assert.deepEqual(tokenStateEntry?.occurrenceZoneIds, ['hand:0', 'bench:1']);
  });
});
