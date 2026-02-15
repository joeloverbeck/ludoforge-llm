import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  decideApplyMovePipelineViability,
  decideLegalChoicesPipelineViability,
  decideLegalMovesPipelineViability,
  evaluatePipelinePredicateStatus,
  type ActionDef,
  type ActionPipelineDef,
  type EvalContext,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';

const makeState = (resources: number): GameState => ({
  globalVars: { resources },
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

const makeAction = (): ActionDef => ({
  id: asActionId('op'),
  actor: 'active',
  executor: 'actor',
  phase: asPhaseId('main'),
  params: [],
  pre: null,
  cost: [],
  effects: [],
  limits: [],
});

const makeDef = (action: ActionDef, pipeline: ActionPipelineDef): GameDef =>
  ({
    metadata: { id: 'pipeline-viability-policy-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 100 }],
    perPlayerVars: [],
    zones: [{ id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [action],
    actionPipelines: [pipeline],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeEvalCtx = (def: GameDef, state: GameState): EvalContext => ({
  def,
  adjacencyGraph: buildAdjacencyGraph(def.zones),
  state,
  activePlayer: state.activePlayer,
  actorPlayer: state.activePlayer,
  bindings: {},
  collector: createCollector(),
});

describe('pipeline viability policy', () => {
  it('projects legality failure consistently for all surfaces', () => {
    const action = makeAction();
    const pipeline: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: { op: '>=', left: { ref: 'gvar', var: 'resources' }, right: 5 },
      costValidation: { op: '>=', left: { ref: 'gvar', var: 'resources' }, right: 1 },
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    };
    const def = makeDef(action, pipeline);
    const status = evaluatePipelinePredicateStatus(action, pipeline, makeEvalCtx(def, makeState(0)));

    assert.equal(status.legalityPassed, false);
    assert.deepEqual(decideLegalMovesPipelineViability(status), {
      kind: 'excludeTemplate',
      outcome: 'pipelineLegalityFailed',
    });
    assert.deepEqual(decideLegalChoicesPipelineViability(status), {
      kind: 'illegalChoice',
      outcome: 'pipelineLegalityFailed',
    });
    assert.deepEqual(decideApplyMovePipelineViability(status), {
      kind: 'illegalMove',
      costValidationPassed: false,
      outcome: 'pipelineLegalityFailed',
      metadataCode: 'OPERATION_LEGALITY_FAILED',
    });
  });

  it('treats atomic cost failure as discoverability-blocking and applyMove-illegal when not free', () => {
    const action = makeAction();
    const pipeline: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: null,
      costValidation: { op: '>=', left: { ref: 'gvar', var: 'resources' }, right: 5 },
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };
    const def = makeDef(action, pipeline);
    const status = evaluatePipelinePredicateStatus(action, pipeline, makeEvalCtx(def, makeState(0)));

    assert.equal(status.costValidationPassed, false);
    assert.deepEqual(decideLegalMovesPipelineViability(status), {
      kind: 'excludeTemplate',
      outcome: 'pipelineAtomicCostValidationFailed',
    });
    assert.deepEqual(decideLegalChoicesPipelineViability(status), { kind: 'allowChoiceResolution' });
    assert.deepEqual(decideApplyMovePipelineViability(status), {
      kind: 'illegalMove',
      costValidationPassed: false,
      outcome: 'pipelineAtomicCostValidationFailed',
      metadataCode: 'OPERATION_COST_BLOCKED',
    });
    assert.deepEqual(decideApplyMovePipelineViability(status, { isFreeOperation: true }), {
      kind: 'allowExecution',
      costValidationPassed: true,
    });
  });

  it('allows partial cost failure while preserving skipped-cost signal for applyMove', () => {
    const action = makeAction();
    const pipeline: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: null,
      costValidation: { op: '>=', left: { ref: 'gvar', var: 'resources' }, right: 5 },
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    };
    const def = makeDef(action, pipeline);
    const status = evaluatePipelinePredicateStatus(action, pipeline, makeEvalCtx(def, makeState(0)));

    assert.deepEqual(decideLegalMovesPipelineViability(status), { kind: 'includeTemplate' });
    assert.deepEqual(decideLegalChoicesPipelineViability(status), { kind: 'allowChoiceResolution' });
    assert.deepEqual(decideApplyMovePipelineViability(status), {
      kind: 'allowExecution',
      costValidationPassed: false,
    });
  });
});
