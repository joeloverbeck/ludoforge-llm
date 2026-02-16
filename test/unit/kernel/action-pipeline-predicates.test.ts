import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evalActionPipelinePredicate,
  evalActionPipelinePredicateForDiscovery,
} from '../../../src/kernel/action-pipeline-predicates.js';
import { createCollector } from '../../../src/kernel/execution-collector.js';
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
import type { EvalContext } from '../../../src/kernel/eval-context.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'action-predicate-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [{
    id: asActionId('op'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  }],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (def: GameDef, state: GameState): EvalContext => ({
  def,
  adjacencyGraph: buildAdjacencyGraph(def.zones),
  state,
  activePlayer: state.activePlayer,
  actorPlayer: state.activePlayer,
  bindings: {},
  collector: createCollector(),
});

describe('evalActionPipelinePredicate()', () => {
  it('wraps predicate evaluation failures with contextual runtime error', () => {
    const def = makeDef();
    const action = def.actions[0] as ActionDef;
    const state = makeState();
    const ctx = makeCtx(def, state);

    assert.throws(
      () => evalActionPipelinePredicate(
        action,
        'broken-profile',
        'legality',
        { op: '==', left: { ref: 'gvar', var: 'missingVar' }, right: 1 },
        ctx,
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED');
        assert.equal(details.context?.actionId, asActionId('op'));
        assert.equal(details.context?.profileId, 'broken-profile');
        assert.equal(details.context?.predicate, 'legality');
        return true;
      },
    );
  });
});

describe('evalActionPipelinePredicateForDiscovery()', () => {
  it('returns deferred for missing binding instead of throwing', () => {
    const def = makeDef();
    const action = def.actions[0] as ActionDef;
    const state = makeState();
    const ctx = makeCtx(def, state);

    const result = evalActionPipelinePredicateForDiscovery(
      action,
      'discovery-profile',
      'costValidation',
      { op: '==', left: { ref: 'binding', name: '$missing' }, right: 1 },
      ctx,
    );
    assert.equal(result, 'deferred');
  });

  it('throws typed runtime error for nonrecoverable evaluation failures', () => {
    const def = makeDef();
    const action = def.actions[0] as ActionDef;
    const state = makeState();
    const ctx = makeCtx(def, state);

    assert.throws(
      () => evalActionPipelinePredicateForDiscovery(
        action,
        'discovery-profile',
        'costValidation',
        { op: '==', left: { ref: 'gvar', var: 'missingVar' }, right: 1 },
        ctx,
      ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED');
        assert.equal(details.context?.actionId, asActionId('op'));
        assert.equal(details.context?.profileId, 'discovery-profile');
        assert.equal(details.context?.predicate, 'costValidation');
        return true;
      },
    );
  });
});
