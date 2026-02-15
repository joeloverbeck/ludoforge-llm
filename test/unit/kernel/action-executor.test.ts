import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveActionExecutor } from '../../../src/kernel/action-executor.js';
import { buildAdjacencyGraph } from '../../../src/kernel/spatial.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  type ActionDef,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';

const makeAction = (overrides?: Partial<ActionDef>): ActionDef => ({
  id: asActionId('action'),
  actor: 'active',
  executor: 'actor',
  phase: asPhaseId('main'),
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
  ...overrides,
});

const makeDef = (action: ActionDef): GameDef =>
  ({
    metadata: { id: 'resolve-action-executor-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [action],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

describe('resolveActionExecutor()', () => {
  it('returns applicable with resolved execution player', () => {
    const action = makeAction({ executor: { id: asPlayerId(1) } });
    const def = makeDef(action);
    const state = makeState();

    const result = resolveActionExecutor({
      def,
      state,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      action,
      decisionPlayer: asPlayerId(0),
      bindings: {},
    });

    assert.deepEqual(result, { kind: 'applicable', executionPlayer: asPlayerId(1) });
  });

  it('returns notApplicable when selector targets player outside playerCount', () => {
    const action = makeAction({ executor: { id: asPlayerId(2) } });
    const def = makeDef(action);
    const state = makeState();

    const result = resolveActionExecutor({
      def,
      state,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      action,
      decisionPlayer: asPlayerId(0),
      bindings: {},
    });

    assert.deepEqual(result, { kind: 'notApplicable', reason: 'executorOutsidePlayerCount' });
  });

  it('returns invalidSpec when selector shape is invalid', () => {
    const action = makeAction({ executor: 'all' as unknown as ActionDef['executor'] });
    const def = makeDef(action);
    const state = makeState();

    const result = resolveActionExecutor({
      def,
      state,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      action,
      decisionPlayer: asPlayerId(0),
      bindings: {},
    });

    assert.equal(result.kind, 'invalidSpec');
  });

  it('returns fallback execution player when binding is missing and fallback is enabled', () => {
    const action = makeAction({ executor: { chosen: '$owner' } as unknown as ActionDef['executor'] });
    const def = makeDef(action);
    const state = makeState();

    const result = resolveActionExecutor({
      def,
      state,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      action,
      decisionPlayer: asPlayerId(0),
      bindings: {},
      allowMissingBindingFallback: true,
    });

    assert.deepEqual(result, { kind: 'applicable', executionPlayer: asPlayerId(0) });
  });

  it('returns invalidSpec when binding is missing and fallback is disabled', () => {
    const action = makeAction({ executor: { chosen: '$owner' } as unknown as ActionDef['executor'] });
    const def = makeDef(action);
    const state = makeState();

    const result = resolveActionExecutor({
      def,
      state,
      adjacencyGraph: buildAdjacencyGraph(def.zones),
      action,
      decisionPlayer: asPlayerId(0),
      bindings: {},
      allowMissingBindingFallback: false,
    });

    assert.equal(result.kind, 'invalidSpec');
  });
});
