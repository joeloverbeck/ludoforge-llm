// @test-class: architectural-invariant
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
  evaluateDiscoveryStagePredicateStatus,
  evaluatePipelinePredicateStatus,
  evaluateStagePredicateStatus,
  getCompiledPipelinePredicates,
  type ActionDef,
  type ActionPipelineDef,
  type ActionResolutionStageDef,
  type ConditionAST,
  type EnumerationStateSnapshot,
  type ReadContext,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import {
  decideDiscoveryLegalChoicesPipelineViability,
  evaluateDiscoveryPipelinePredicateStatus,
} from '../../../src/kernel/pipeline-viability-policy.js';
import { makeEvalContext } from '../../helpers/eval-context-test-helpers.js';

const makeState = (resources: number): GameState => ({
  globalVars: { resources },
  perPlayerVars: {
    0: { resources },
    1: { resources: resources + 5 },
  },
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const makeAction = (): ActionDef => ({
  id: asActionId('op'),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
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

const makeEvalCtx = (
  def: GameDef,
  state: GameState,
  bindings: Readonly<Record<string, unknown>> = {},
  options?: { readonly activePlayer?: GameState['activePlayer'] },
): ReadContext => {
  return makeEvalContext({
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    activePlayer: options?.activePlayer ?? state.activePlayer,
    actorPlayer: options?.activePlayer ?? state.activePlayer,
    bindings,
    collector: createCollector(),
  });
};

const makeSnapshot = (
  state: GameState,
  options?: {
    readonly resources?: number;
    readonly perPlayerVars?: GameState['perPlayerVars'];
  },
): EnumerationStateSnapshot => {
  return {
    globalVars: {
      ...state.globalVars,
      ...(options?.resources === undefined ? {} : { resources: options.resources }),
    },
    perPlayerVars: options?.perPlayerVars ?? state.perPlayerVars,
    zoneTotals: { get: (_zoneId: string, _tokenType?: string) => 0 },
    zoneVars: { get: (_zoneId: string, _varName: string) => undefined },
    markerStates: { get: (_spaceId: string, _markerName: string) => undefined },
  };
};

describe('pipeline viability policy', () => {
  it('projects legality failure consistently for all surfaces', () => {
    const action = makeAction();
    const pipeline: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: { op: '>=', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 5 },
      costValidation: { op: '>=', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 1 },
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
      costValidation: { op: '>=', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 5 },
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
      costValidation: { op: '>=', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 5 },
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

describe('evaluateDiscoveryPipelinePredicateStatus()', () => {
  it('returns passed/failed states for fully bound predicates', () => {
    const action = makeAction();
    const profile: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: { op: '>=', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 1 },
      costValidation: { op: '>=', left: { _t: 2, ref: 'binding', name: '$cost' }, right: 2 },
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };
    const def = makeDef(action, profile);

    const passed = evaluateDiscoveryPipelinePredicateStatus(action, profile, makeEvalCtx(def, makeState(3), { '$cost': 3 }));
    assert.equal(passed.legality, 'passed');
    assert.equal(passed.costValidation, 'passed');
    assert.deepStrictEqual(decideDiscoveryLegalChoicesPipelineViability(passed), { kind: 'allowChoiceResolution' });

    const failed = evaluateDiscoveryPipelinePredicateStatus(action, profile, makeEvalCtx(def, makeState(3), { '$cost': 1 }));
    assert.equal(failed.legality, 'passed');
    assert.equal(failed.costValidation, 'failed');
    assert.deepStrictEqual(decideDiscoveryLegalChoicesPipelineViability(failed), {
      kind: 'illegalChoice',
      outcome: 'pipelineAtomicCostValidationFailed',
    });
  });

  it('returns deferred for recoverable missing-binding discovery contexts', () => {
    const action = makeAction();
    const profile: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: { op: '>=', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 1 },
      costValidation: { op: '>=', left: { _t: 2, ref: 'binding', name: '$cost' }, right: 2 },
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };
    const def = makeDef(action, profile);
    const status = evaluateDiscoveryPipelinePredicateStatus(action, profile, makeEvalCtx(def, makeState(3)));

    assert.equal(status.legality, 'passed');
    assert.equal(status.costValidation, 'deferred');
    assert.deepStrictEqual(decideDiscoveryLegalChoicesPipelineViability(status), { kind: 'allowChoiceResolution' });
  });

  it('throws typed runtime errors for nonrecoverable discovery contexts', () => {
    const action = makeAction();
    const profile: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: { op: '>=', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 1 },
      costValidation: { op: '==', left: { _t: 2, ref: 'gvar', var: 'missingVar' }, right: 1 },
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };
    const def = makeDef(action, profile);

    assert.throws(
      () => evaluateDiscoveryPipelinePredicateStatus(action, profile, makeEvalCtx(def, makeState(3))),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED');
        assert.equal(details.context?.actionId, asActionId('op'));
        assert.equal(details.context?.profileId, 'profile');
        assert.equal(details.context?.predicate, 'costValidation');
        return true;
      },
    );
  });
});

describe('pipeline viability predicate fast-path routing', () => {
  it('threads snapshot through execution pipeline checks', () => {
    const action = makeAction();
    const pipeline: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: { op: '==', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 9 },
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    };
    const def = makeDef(action, pipeline);
    const state = makeState(3);
    const snapshot = makeSnapshot(state, { resources: 9 });

    const withoutSnapshot = evaluatePipelinePredicateStatus(action, pipeline, makeEvalCtx(def, state));
    const withSnapshot = evaluatePipelinePredicateStatus(action, pipeline, makeEvalCtx(def, state), { snapshot });

    assert.equal(withoutSnapshot.legalityPassed, false);
    assert.equal(withSnapshot.legalityPassed, true);
  });

  it('threads snapshot through discovery stage checks', () => {
    const action = makeAction();
    const stage: ActionResolutionStageDef = {
      legality: { op: '==', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 9 },
      effects: [],
    };
    const def = makeDef(action, {
      id: 'profile',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [stage],
      atomicity: 'partial',
    });
    const state = makeState(3);
    const snapshot = makeSnapshot(state, { resources: 9 });

    const status = evaluateDiscoveryStagePredicateStatus(
      action,
      'profile',
      stage,
      'partial',
      makeEvalCtx(def, state),
      { snapshot },
    );

    assert.equal(status.legality, 'passed');
  });

  it('uses raw state semantics when snapshot is omitted', () => {
    const action = makeAction();
    const pipeline: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: { op: '==', left: { _t: 2, ref: 'gvar', var: 'resources' }, right: 9 },
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    };
    const def = makeDef(action, pipeline);
    const status = evaluatePipelinePredicateStatus(action, pipeline, makeEvalCtx(def, makeState(3)));

    assert.equal(status.legalityPassed, false);
  });

  it('uses snapshot player vars when evaluation player differs from state.activePlayer', () => {
    const action = makeAction();
    const pipeline: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: { op: '==', left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' }, right: 13 },
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    };
    const def = makeDef(action, pipeline);
    const state = makeState(3);
    const snapshot = makeSnapshot(state, {
      perPlayerVars: {
        ...state.perPlayerVars,
        1: { ...(state.perPlayerVars[1] ?? {}), resources: 13 },
      },
    });

    const withoutSnapshot = evaluatePipelinePredicateStatus(
      action,
      pipeline,
      makeEvalCtx(def, state, {}, { activePlayer: asPlayerId(1) }),
    );
    const withSnapshot = evaluatePipelinePredicateStatus(
      action,
      pipeline,
      makeEvalCtx(def, state, {}, { activePlayer: asPlayerId(1) }),
      { snapshot },
    );

    assert.equal(withoutSnapshot.legalityPassed, false);
    assert.equal(withSnapshot.legalityPassed, true);
  });

  it('evaluates boolean pipeline predicates directly', () => {
    const action = makeAction();
    const pipeline: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: true,
      costValidation: false,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };
    const def = makeDef(action, pipeline);
    const compiledPredicates = getCompiledPipelinePredicates(def);
    const status = evaluatePipelinePredicateStatus(action, pipeline, makeEvalCtx(def, makeState(3)));

    assert.equal(compiledPredicates.size, 0);
    assert.equal(status.legalityPassed, true);
    assert.equal(status.costValidationPassed, false);
  });

  it('evaluates boolean stage predicates directly in discovery mode', () => {
    const action = makeAction();
    const stage: ActionResolutionStageDef = {
      legality: false,
      costValidation: true,
      effects: [],
    };
    const def = makeDef(action, {
      id: 'profile',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [stage],
      atomicity: 'partial',
    });
    const compiledPredicates = getCompiledPipelinePredicates(def);
    const status = evaluateDiscoveryStagePredicateStatus(
      action,
      'profile',
      stage,
      'partial',
      makeEvalCtx(def, makeState(3)),
    );

    assert.equal(compiledPredicates.size, 0);
    assert.equal(status.legality, 'failed');
    assert.equal(status.costValidation, 'passed');
  });

  it('uses cached compiled predicates for execution checks keyed by condition identity', () => {
    const action = makeAction();
    const legality: ConditionAST = {
      op: '>=',
      left: { _t: 2, ref: 'gvar', var: 'resources' },
      right: 2,
    };
    const pipeline: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    };
    const def = makeDef(action, pipeline);
    const compiledPredicates = getCompiledPipelinePredicates(def);

    assert.ok(compiledPredicates.get(legality) !== undefined);

    (legality as { right: number }).right = 99;

    const status = evaluatePipelinePredicateStatus(action, pipeline, makeEvalCtx(def, makeState(3)));

    assert.equal(status.legalityPassed, true);
  });

  it('uses cached compiled predicates in discovery mode and still defers missing bindings', () => {
    const action = makeAction();
    const costValidation: ConditionAST = {
      op: '==',
      left: { _t: 2, ref: 'binding', name: '$cost' },
      right: 2,
    };
    const pipeline: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: null,
      costValidation,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };
    const def = makeDef(action, pipeline);
    const compiledPredicates = getCompiledPipelinePredicates(def);

    assert.ok(compiledPredicates.get(costValidation) !== undefined);

    (costValidation as { left: { ref: string } }).left = { _t: 2, ref: 'gvar', var: 'resources' } as never;
    (costValidation as { right: number }).right = 3;

    const status = evaluateDiscoveryPipelinePredicateStatus(action, pipeline, makeEvalCtx(def, makeState(3)));

    assert.equal(status.legality, 'passed');
    assert.equal(status.costValidation, 'deferred');
  });

  it('propagates wrapped execution errors for compiled missing-binding predicates', () => {
    const action = makeAction();
    const costValidation: ConditionAST = {
      op: '==',
      left: { _t: 2, ref: 'binding', name: '$cost' },
      right: 2,
    };
    const pipeline: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality: null,
      costValidation,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'atomic',
    };
    const def = makeDef(action, pipeline);
    const compiledPredicates = getCompiledPipelinePredicates(def);

    assert.ok(compiledPredicates.get(costValidation) !== undefined);

    (costValidation as { left: { ref: string } }).left = { _t: 2, ref: 'gvar', var: 'resources' } as never;

    assert.throws(
      () => evaluatePipelinePredicateStatus(action, pipeline, makeEvalCtx(def, makeState(3))),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { code?: unknown; context?: Record<string, unknown> };
        assert.equal(details.code, 'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED');
        assert.equal(details.context?.predicate, 'costValidation');
        return true;
      },
    );
  });

  it('uses cached compiled predicates for stage execution checks keyed by condition identity', () => {
    const action = makeAction();
    const stageLegality: ConditionAST = {
      op: '>=',
      left: { _t: 2, ref: 'gvar', var: 'resources' },
      right: 2,
    };
    const stage: ActionResolutionStageDef = {
      legality: stageLegality,
      effects: [],
    };
    const def = makeDef(action, {
      id: 'profile',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [stage],
      atomicity: 'partial',
    });
    const compiledPredicates = getCompiledPipelinePredicates(def);

    assert.ok(compiledPredicates.get(stageLegality) !== undefined);

    (stageLegality as { right: number }).right = 99;

    const status = evaluateStagePredicateStatus(action, 'profile', stage, 'partial', makeEvalCtx(def, makeState(3)));

    assert.equal(status.legalityPassed, true);
  });

  it('falls through to interpreter semantics for non-compilable conditions', () => {
    const action = makeAction();
    const legality: ConditionAST = {
      op: 'adjacent',
      left: 'board:none',
      right: 'board:none',
    };
    const pipeline: ActionPipelineDef = {
      id: 'profile',
      actionId: action.id,
      legality,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [],
      atomicity: 'partial',
    };
    const def = makeDef(action, pipeline);
    const compiledPredicates = getCompiledPipelinePredicates(def);

    assert.equal(compiledPredicates.get(legality as Exclude<ConditionAST, boolean>), undefined);

    const status = evaluatePipelinePredicateStatus(action, pipeline, makeEvalCtx(def, makeState(3)));

    assert.equal(status.legalityPassed, false);
  });
});

describe('stage checkpoint predicate evaluation', () => {
  it('reuses pipeline viability outcomes for atomic stage cost validation', () => {
    const action = makeAction();
    const stage: ActionResolutionStageDef = {
      costValidation: { op: '>=', left: { _t: 2, ref: 'binding', name: '$cost' }, right: 2 },
      effects: [],
    };
    const def = makeDef(action, {
      id: 'profile',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [stage],
      atomicity: 'atomic',
    });
    const status = evaluateStagePredicateStatus(action, 'profile', stage, 'atomic', makeEvalCtx(def, makeState(3), { '$cost': 1 }));

    assert.equal(status.costValidationPassed, false);
    assert.deepStrictEqual(decideApplyMovePipelineViability(status), {
      kind: 'illegalMove',
      costValidationPassed: false,
      outcome: 'pipelineAtomicCostValidationFailed',
      metadataCode: 'OPERATION_COST_BLOCKED',
    });
  });

  it('defers recoverable missing bindings for stage discovery checkpoints', () => {
    const action = makeAction();
    const stage: ActionResolutionStageDef = {
      legality: { op: '==', left: { _t: 2, ref: 'binding', name: '$choice' }, right: 'a' },
      effects: [],
    };
    const def = makeDef(action, {
      id: 'profile',
      actionId: action.id,
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [stage],
      atomicity: 'partial',
    });
    const status = evaluateDiscoveryStagePredicateStatus(action, 'profile', stage, 'partial', makeEvalCtx(def, makeState(3)));

    assert.equal(status.legality, 'deferred');
    assert.deepStrictEqual(decideDiscoveryLegalChoicesPipelineViability(status), {
      kind: 'allowChoiceResolution',
    });
  });
});
