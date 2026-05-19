import * as assert from 'node:assert/strict';

import { evaluatePolicyMoveCore, type PolicyEvaluationCoreResult } from '../../src/agents/policy-eval.js';
import { emptyOutcomeBreakdown } from '../../src/agents/policy-preview-inner.js';
import { runDeepPass } from '../../src/agents/policy-preview-inner-deepening.js';
import { initializePolicyWasmRuntimeSync } from '../../src/agents/policy-wasm-runtime-node-loader.js';
import {
  __internal_for_tests as policyWasmRuntimeInternals,
  getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts,
} from '../../src/agents/policy-wasm-runtime.js';
import type { PolicyWasmPreviewDriveResult } from '../../src/agents/policy-wasm-preview-drive.js';
import {
  applyDecision,
  asActionId,
  asPhaseId,
  asPlayerId,
  assertValidatedGameDef,
  computeFullHash,
  createGameDefRuntime,
  createTrustedExecutableMove,
  initialState,
  publishMicroturn,
  serializeGameState,
  type ActionDef,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentDependencyRefs,
  type EffectAST,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
import {
  createCatalog as createContinuedDeepeningCatalog,
  createDef as createContinuedDeepeningDef,
  createInput as createContinuedDeepeningInput,
} from '../architecture/preview-deepening/continued-deepening-fixture.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { withCompiledPolicyCatalog } from '../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
const interruptPhaseId = asPhaseId('interrupt');
const projectedStateRefId = 'preview.option.delta.victory.currentMargin.self';

const emptyDeps: CompiledAgentDependencyRefs = {
  parameters: [],
  stateFeatures: [],
  candidateFeatures: [],
  aggregates: [],
  strategicConditions: [],
};

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: Extract<AgentPolicyExpr, { readonly kind: 'ref' }>['ref']): AgentPolicyExpr => ({ kind: 'ref', ref });

export interface UnsupportedPreviewDriveReasonFixture {
  readonly ownerSlug: string;
  readonly unsupportedDriveClass: Extract<PolicyWasmPreviewDriveResult, { readonly kind: 'unsupported' }>['unsupportedDriveClass'];
  readonly unsupportedOwner: string;
  readonly reason: string;
}

export const unsupportedPreviewDriveReasonFixtures = [
  {
    ownerSlug: 'projectedState',
    unsupportedDriveClass: 'unknown',
    unsupportedOwner: 'production-deep-choosenstep-continuation.projectedState',
    reason: 'deep preview-drive reached a terminal boundary before materializing a WASM projected state',
  },
  {
    ownerSlug: 'cardEventAction',
    unsupportedDriveClass: 'unsupported-effect',
    unsupportedOwner: 'production-preview-drive.cardEventAction',
    reason: 'production preview-drive does not route card event action candidates',
  },
  {
    ownerSlug: 'actionBatch',
    unsupportedDriveClass: 'unsupported-effect',
    unsupportedOwner: 'production-preview-drive.actionBatch',
    reason: 'production preview-drive requires deterministic shared scalar runtime bindings',
  },
  {
    ownerSlug: 'chooseN',
    unsupportedDriveClass: 'agent-guided-completion',
    unsupportedOwner: 'production-preview-drive.chooseN',
    reason: 'only origin-seat greedy chooseN publication is supported',
  },
  {
    ownerSlug: 'popInterruptPhase',
    unsupportedDriveClass: 'unsupported-effect',
    unsupportedOwner: 'production-preview-drive.effect.popInterruptPhase',
    reason: 'unsupported production preview-drive effect popInterruptPhase',
  },
  {
    ownerSlug: 'victoryCurrentMarginSeatMatrix',
    unsupportedDriveClass: 'unsupported-effect',
    unsupportedOwner: 'production-preview-drive.previewStateSlots',
    reason: 'unsupported preview surface "victoryCurrentMargin"',
  },
] as const satisfies readonly UnsupportedPreviewDriveReasonFixture[];

export type UnsupportedPreviewDriveOwnerSlug = typeof unsupportedPreviewDriveReasonFixtures[number]['ownerSlug'];
type ScoreParityUnsupportedOwnerSlug = Exclude<UnsupportedPreviewDriveOwnerSlug, 'projectedState'>;

export const unsupportedPreviewDriveReasonFor = (
  ownerSlug: UnsupportedPreviewDriveOwnerSlug,
): UnsupportedPreviewDriveReasonFixture => {
  const fixture = unsupportedPreviewDriveReasonFixtures.find((candidate) => candidate.ownerSlug === ownerSlug);
  if (fixture === undefined) {
    throw new Error(`Unknown unsupported preview-drive owner slug "${ownerSlug}".`);
  }
  return fixture;
};

export const assertProductionUnsupportedReasonScoreParity = (
  ownerSlug: ScoreParityUnsupportedOwnerSlug,
): void => {
  const reason = unsupportedPreviewDriveReasonFor(ownerSlug);
  policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(initializePolicyWasmRuntimeSync());
  policyWasmRuntimeInternals.resetProductionScoreRowCounters();
  try {
    const wasmResult = evaluateUnsupportedReasonPolicy(ownerSlug);
    const reasonCounts = getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts();
    assert.equal(reasonCount(reasonCounts, reason), 1);
    assert.equal(wasmResult.kind, 'success');
    assert.ok(
      wasmResult.metadata.candidates.every((candidate) => Number.isFinite(candidate.score)),
      `${ownerSlug}: TS fallback should assign finite candidate scores after WASM preview-drive returns unsupported`,
    );

    policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(null);
    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
    const tsResult = evaluateUnsupportedReasonPolicy(ownerSlug);
    assert.deepEqual(projectPolicyResultForParity(wasmResult), projectPolicyResultForParity(tsResult));
  } finally {
    policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(null);
    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
  }
};

export const assertDeepProjectedStateUnsupportedParity = (): void => {
  const reason = unsupportedPreviewDriveReasonFor('projectedState');
  policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(initializePolicyWasmRuntimeSync());
  policyWasmRuntimeInternals.resetProductionScoreRowCounters();
  try {
    const wasmPreview = captureProjectedStateUnsupportedPreview();
    const reasonCounts = getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts();
    assert.equal(reasonCount(reasonCounts, reason), 1);

    policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(null);
    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
    const tsPreview = captureProjectedStateUnsupportedPreview();

    assert.deepEqual(
      [...wasmPreview.refsByOptionKey.keys()],
      [...tsPreview.refsByOptionKey.keys()],
    );
    assert.deepEqual(
      [...wasmPreview.projectedStateByOptionKey.keys()],
      [...tsPreview.projectedStateByOptionKey.keys()],
    );
    for (const [stableMoveKey, wasmProjected] of wasmPreview.projectedStateByOptionKey) {
      const tsProjected = tsPreview.projectedStateByOptionKey.get(stableMoveKey);
      assert.ok(tsProjected);
      assert.equal(wasmProjected.outcome, tsProjected.outcome);
      assert.equal(wasmProjected.driveDepth, tsProjected.driveDepth);
      assert.equal(wasmProjected.capClass, tsProjected.capClass);
      assert.equal(wasmProjected.completionPolicy, tsProjected.completionPolicy);
      assert.deepEqual(
        wasmProjected.state === undefined ? undefined : serializeGameState(wasmProjected.state),
        tsProjected.state === undefined ? undefined : serializeGameState(tsProjected.state),
      );
    }
  } finally {
    policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(null);
    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
  }
};

const captureProjectedStateUnsupportedPreview = () => {
  const catalog = createContinuedDeepeningCatalog('continuedDeepening');
  const def = createContinuedDeepeningDef(catalog);
  const firstChooseN = (((def.actionPipelines?.[0]?.stages[0]?.effects[0] as {
    chooseN?: { n?: number };
  } | undefined)?.chooseN));
  if (firstChooseN === undefined) {
    throw new Error('projectedState fixture expected a chooseN effect');
  }
  firstChooseN.n = 1;

  const initial = initialState(def, 164, 2);
  const actionSelection = publishMicroturn(def, initial.state);
  const firstAction = actionSelection.legalActions[0];
  if (firstAction === undefined) {
    throw new Error('projectedState fixture expected an initial legal action');
  }
  const afterAction = applyDecision(def, initial.state, firstAction).state;
  const microturn = publishMicroturn(def, afterAction);
  if (microturn.kind !== 'chooseNStep') {
    throw new Error(`projectedState fixture expected chooseNStep, got ${microturn.kind}`);
  }
  const addDecision = microturn.legalActions.find((decision) =>
    decision.kind === 'chooseNStep' && decision.command === 'add');
  if (addDecision === undefined || addDecision.kind !== 'chooseNStep') {
    throw new Error('projectedState fixture expected an add decision');
  }
  const afterAdd = applyDecision(def, afterAction, addDecision).state;
  const confirmMicroturn = publishMicroturn(def, afterAdd);
  const confirmDecision = confirmMicroturn.legalActions.find((decision) =>
    decision.kind === 'chooseNStep' && decision.command === 'confirm');
  if (confirmDecision === undefined || confirmDecision.kind !== 'chooseNStep') {
    throw new Error('projectedState fixture expected a confirm decision after add');
  }
  const optionState = applyDecision(def, afterAdd, confirmDecision).state;
  const stableMoveKey = `${addDecision.kind}:${String(addDecision.decisionKey)}:${addDecision.command}:${JSON.stringify(addDecision.value ?? null)}`;
  const result = runDeepPass(
    ({
      ...createContinuedDeepeningInput(def, afterAction, microturn),
      seatId: 'us',
      playerId: asPlayerId(0),
      catalog,
      profile: catalog.profiles.baseline!,
      refs: [{ kind: 'previewOptionRef', refKind: 'deltaVictoryCurrentMarginSelf' }],
    }) as Parameters<typeof runDeepPass>[0],
    {
      options: [{
        decision: addDecision,
        stableMoveKey,
        state: optionState,
        resolvedRefs: new Map([[projectedStateRefId, { kind: 'unavailable' as const, reason: 'depthCap' }]]),
        driveDepth: 1,
        outcome: 'depthCap',
        previewDrive: { depth: 1, completionPolicy: 'policyGuided', syntheticDecisions: [] },
        completionPolicyFallbackCount: 0,
        continuationBeam: null,
      }],
      outcomeBreakdown: emptyOutcomeBreakdown(),
      evaluatedCandidateCount: 1,
    },
    {
      refIds: [projectedStateRefId],
      terms: [{ id: 'preferProjectedMargin', refIds: [projectedStateRefId] }],
      options: [{
        stableMoveKey,
        unavailableRefs: new Map([[projectedStateRefId, 'depthCap']]),
        contributionByTermId: new Map(),
      }],
    },
  );
  return {
    refsByOptionKey: new Map(result.run.options.map((option) => [option.stableMoveKey, option.resolvedRefs])),
    projectedStateByOptionKey: new Map(result.run.options.map((option) => [option.stableMoveKey, {
      outcome: option.outcome,
      driveDepth: option.driveDepth,
      capClass: 'deep1024',
      completionPolicy: option.previewDrive.completionPolicy,
      state: option.state,
    }])),
  };
};

const reasonCount = (
  counts: ReturnType<typeof getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts>,
  expected: UnsupportedPreviewDriveReasonFixture,
): number =>
  counts.find((row) =>
    row.unsupportedDriveClass === expected.unsupportedDriveClass
    && row.unsupportedOwner === expected.unsupportedOwner
    && row.reason === expected.reason)?.count ?? 0;

const evaluateUnsupportedReasonPolicy = (
  ownerSlug: ScoreParityUnsupportedOwnerSlug,
): PolicyEvaluationCoreResult => {
  const def = createUnsupportedReasonDef(ownerSlug);
  const runtime = createGameDefRuntime(def);
  const initial = initialState(def, 175, 2, undefined, runtime).state;
  const state = ownerSlug === 'popInterruptPhase'
    ? withInterruptState(def, initial, runtime)
    : initial;
  const moves = createUnsupportedReasonMoves(ownerSlug);
  const trustedMoveIndex = new Map(moves.map((move) => [
    toMoveIdentityKey(def, move),
    createTrustedExecutableMove(move, state.stateHash, 'enumerateLegalMoves'),
  ]));

  return evaluatePolicyMoveCore({
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves: moves,
    trustedMoveIndex,
    rng: { state: state.rng },
    runtime,
    diagnosticsMode: 'enabled',
    selectionGrouping: 'none',
  });
};

const withInterruptState = (
  def: GameDef,
  state: GameState,
  runtime: ReturnType<typeof createGameDefRuntime>,
): GameState => {
  const next = {
    ...state,
    currentPhase: interruptPhaseId,
    interruptPhaseStack: [{ phase: interruptPhaseId, resumePhase: phaseId }],
  };
  const stateHash = computeFullHash(runtime.zobristTable, next);
  return { ...next, stateHash, _runningHash: stateHash };
};

const projectPolicyResultForParity = (
  result: PolicyEvaluationCoreResult,
) => ({
  kind: result.kind,
  selectedStableMoveKey: result.metadata.selectedStableMoveKey,
  finalScore: result.metadata.finalScore,
  candidates: result.metadata.candidates.map((candidate) => ({
    stableMoveKey: candidate.stableMoveKey,
    score: candidate.score,
    previewOutcome: candidate.previewOutcome,
    unknownPreviewRefs: candidate.unknownPreviewRefs,
    selectionReason: candidate.selectionReason,
  })),
});

const createUnsupportedReasonMoves = (
  ownerSlug: ScoreParityUnsupportedOwnerSlug,
): readonly Move[] => ownerSlug === 'actionBatch'
  ? [
      { actionId: asActionId('score'), params: { rank: 1 } },
      { actionId: asActionId('score'), params: { rank: 2 } },
    ]
  : [{ actionId: asActionId('score'), params: { rank: 1 } }];

const createUnsupportedReasonDef = (
  ownerSlug: ScoreParityUnsupportedOwnerSlug,
): GameDef => {
  const catalog = createScoreParityCatalog(ownerSlug);
  const phase = ownerSlug === 'popInterruptPhase' ? interruptPhaseId : phaseId;
  return assertValidatedGameDef({
    metadata: { id: `policy-wasm-preview-drive-equivalence-${ownerSlug}`, players: { min: 2, max: 2 } },
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 100 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: {
      phases: [{ id: phaseId }],
      interrupts: [{ id: interruptPhaseId }],
    },
    agents: catalog,
    actions: [{
      id: asActionId('score'),
      actor: 'active',
      executor: 'actor',
      phase: [phase],
      capabilities: ownerSlug === 'cardEventAction' ? ['cardEvent'] : [],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }] satisfies ActionDef[],
    actionPipelines: [{
      id: `score-${ownerSlug}`,
      actionId: asActionId('score'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{
        effects: createUnsupportedReasonEffects(ownerSlug),
      }],
      atomicity: 'partial',
    }],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'alpha', value: { _t: 2 as const, ref: 'gvar', var: 'score' } },
        { seat: 'beta', value: 0 },
      ],
    },
  });
};

const createUnsupportedReasonEffects = (
  ownerSlug: ScoreParityUnsupportedOwnerSlug,
): readonly EffectAST[] => {
  switch (ownerSlug) {
    case 'chooseN':
      return [
        eff({
          chooseN: {
            internalDecisionId: 'decision:$otherSeatPick',
            bind: '$otherSeatPick',
            chooser: { id: asPlayerId(1) },
            options: { query: 'enums', values: ['left', 'right'] },
            n: 1,
          },
        }),
        eff({ addVar: { scope: 'global', var: 'score', delta: 3 } }),
      ];
    case 'popInterruptPhase':
      return [
        eff({ popInterruptPhase: {} }),
        eff({ addVar: { scope: 'global', var: 'score', delta: 3 } }),
      ];
    default:
      return [eff({ addVar: { scope: 'global', var: 'score', delta: 3 } })];
  }
};

const createScoreParityCatalog = (
  ownerSlug: ScoreParityUnsupportedOwnerSlug,
): AgentPolicyCatalog => withCompiledPolicyCatalog({
  schemaVersion: 2,
  catalogFingerprint: `policy-wasm-preview-drive-equivalence-${ownerSlug}`,
  surfaceVisibility: {
    globalVars: {
      score: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
    },
    globalMarkers: {},
    perPlayerVars: {},
    derivedMetrics: {},
    victory: {
      currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
      currentRank: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    },
    activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
    activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
  },
  parameterDefs: {},
  candidateParamDefs: { rank: { type: 'number' } },
  library: {
    stateFeatures: {
      score: {
        type: 'number',
        costClass: 'state',
        expr: refExpr({ kind: 'currentSurface', family: 'globalVar', id: 'score' }),
        dependencies: emptyDeps,
      },
    },
    candidateFeatures: {
      projectedScoreFeature: {
        type: 'number',
        costClass: 'preview',
        expr: ownerSlug === 'victoryCurrentMarginSeatMatrix'
          ? {
              kind: 'seatAgg',
              over: 'opponents',
              expr: refExpr({
                kind: 'previewSurface',
                family: 'victoryCurrentMargin',
                id: 'currentMargin',
                selector: { kind: 'role', seatToken: '$seat' },
                visibility: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
              } as never),
              aggOp: 'sum',
              availability: 'selfAndTargetReady',
            }
          : refExpr({ kind: 'library', refKind: 'previewStateFeature', id: 'score' } as never),
        dependencies: {
          parameters: [],
          stateFeatures: ['score'],
          candidateFeatures: [],
          aggregates: [],
          strategicConditions: [],
        },
      },
    },
    candidateAggregates: {},
    guardrails: {},
    considerations: {
      moveRank: {
        scopes: ['move'],
        costClass: 'state',
        weight: literal(1),
        value: refExpr({ kind: 'candidateParam', id: 'rank', onMissing: 'unavailable' }),
        dependencies: emptyDeps,
      },
      projectedScore: {
        scopes: ['move'],
        costClass: 'preview',
        weight: literal(1),
        value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedScoreFeature' }),
        dependencies: {
          parameters: [],
          stateFeatures: ['score'],
          candidateFeatures: ['projectedScoreFeature'],
          aggregates: [],
          strategicConditions: [],
        },
      },
    },
    tieBreakers: { stable: { kind: 'stableMoveKey', costClass: 'state', dependencies: emptyDeps } },
    strategicConditions: {},
  },
  profiles: {
    baseline: {
      fingerprint: `policy-wasm-preview-drive-equivalence-${ownerSlug}`,
      params: {},
      preview: { mode: 'exactWorld', budget: { strategy: 'balancedCoverage', fullCandidateCap: 4, minPerGroup: 1 } },
      selection: { mode: 'argmax' },
      use: { guardrails: [], considerations: ['moveRank', 'projectedScore'], tieBreakers: ['stable'] },
      plan: {
        stateFeatures: [],
        candidateFeatures: ['projectedScoreFeature'],
        candidateAggregates: [],
        considerations: ['moveRank', 'projectedScore'],
      },
    },
  },
  bindingsBySeat: { alpha: 'baseline' },
});
