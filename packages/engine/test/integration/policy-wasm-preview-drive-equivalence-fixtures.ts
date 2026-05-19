import { createHash } from 'node:crypto';
import * as assert from 'node:assert/strict';

import { applyPreviewMove, createPolicyPreviewRuntime } from '../../src/agents/policy-preview.js';
import { evaluatePolicyMoveCore, type PolicyEvaluationCoreResult } from '../../src/agents/policy-eval.js';
import { initializePolicyWasmRuntimeSync } from '../../src/agents/policy-wasm-runtime-node-loader.js';
import {
  __internal_for_tests as policyWasmRuntimeInternals,
  getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts,
} from '../../src/agents/policy-wasm-runtime.js';
import {
  definePolicyWasmProductionPreviewStateSlots,
  evaluateProductionPreviewDriveBatchWithWasm,
} from '../../src/agents/policy-wasm-production-preview-drive.js';
import type { PolicyWasmProductionPreviewDriveCandidate } from '../../src/agents/policy-wasm-production-preview-drive-types.js';
import type {
  PolicyWasmDecisionStackPublication,
  PolicyWasmPreviewDriveBatchInput,
  PolicyWasmPreviewDriveResult,
  PolicyWasmPreviewDriveRow,
  PolicyWasmPreviewSignalCarrier,
} from '../../src/agents/policy-wasm-preview-drive.js';
import type { PolicyWasmRuntime } from '../../src/agents/policy-wasm-runtime.js';
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
  type ActionPipelineDef,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentDependencyRefs,
  type EffectAST,
  type GameDef,
  type GameState,
  type Move,
  type TrustedExecutableMove,
} from '../../src/kernel/index.js';
import { emptyOutcomeBreakdown } from '../../src/agents/policy-preview-inner.js';
import { runDeepPass } from '../../src/agents/policy-preview-inner-deepening.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { withCompiledPolicyCatalog } from '../helpers/policy-catalog-fixtures.js';
import {
  createCatalog as createContinuedDeepeningCatalog,
  createDef as createContinuedDeepeningDef,
  createInput as createContinuedDeepeningInput,
} from '../architecture/preview-deepening/continued-deepening-fixture.js';

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

const readyContinuedDeepeningCarrier: PolicyWasmPreviewSignalCarrier = {
  previewStatus: 'ready',
  previewBranch: 'continuedDeepening',
  tiebreakAfterPreviewNoSignal: false,
  policyPreviewSignalUnavailable: false,
};

const decisionStackPublication: PolicyWasmDecisionStackPublication = {
  maxDepth: 3,
  frames: [
    {
      frameId: 1,
      parentFrameId: null,
      turnId: 0,
      depth: 0,
      variant: 'actionSelection',
      contextId: 'root',
    },
    {
      frameId: 2,
      parentFrameId: 1,
      turnId: 0,
      depth: 1,
      variant: 'chooseOne',
      contextId: 'branch:$pick',
    },
    {
      frameId: 3,
      parentFrameId: 2,
      turnId: 0,
      depth: 2,
      variant: 'chooseNStep',
      contextId: 'branch:$targets',
    },
  ],
};

export interface PreviewDriveParityFixture {
  readonly def: GameDef;
  readonly state: GameState;
  readonly candidate: PolicyWasmProductionPreviewDriveCandidate;
  readonly referencePreviewState: GameState;
  readonly expected: PreviewDriveRowOracle;
}

export interface PreviewDriveRowOracle {
  readonly stableMoveKey: string;
  readonly outcome: PolicyWasmPreviewDriveRow['outcome'];
  readonly value: number;
  readonly previewStateValues: Readonly<Record<string, number>>;
  readonly previewSignalCarrier: PolicyWasmPreviewSignalCarrier;
  readonly candidateGroup: NonNullable<PolicyWasmPreviewDriveRow['candidateGroup']>;
  readonly decisionStackPublication: PolicyWasmDecisionStackPublication;
  readonly continuedDeepeningCompletionRecords: NonNullable<PolicyWasmPreviewDriveRow['continuedDeepeningCompletionRecords']>;
  readonly previewStateHash: string;
  readonly rowDigest: string;
}

const previewScoreSlot = 'global.score';
const previewVictoryMarginSlot = 'surface.victoryCurrentMargin.self';
const previewOpponentVictoryMarginSlot = 'surface.victoryCurrentMargin.1';

export const previewStateSlots = definePolicyWasmProductionPreviewStateSlots([
  previewScoreSlot,
  previewVictoryMarginSlot,
  previewOpponentVictoryMarginSlot,
]);

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
] as const satisfies readonly UnsupportedPreviewDriveReasonFixture[];

export const unsupportedPreviewDriveReasonFor = (
  ownerSlug: UnsupportedPreviewDriveReasonFixture['ownerSlug'],
): UnsupportedPreviewDriveReasonFixture => {
  const fixture = unsupportedPreviewDriveReasonFixtures.find((candidate) => candidate.ownerSlug === ownerSlug);
  if (fixture === undefined) {
    throw new Error(`Unknown unsupported preview-drive owner slug "${ownerSlug}".`);
  }
  return fixture;
};

export const createSupportedPreviewDriveParityFixtures = (): readonly PreviewDriveParityFixture[] => {
  const def = createSupportedPreviewDriveDef();
  const state = initialState(def, 174, 2).state;
  const trustedMove = trustedMoveFor(state, 'branch');
  return [0, 1].map((index) => {
    const stableMoveKey = `branch:${index}`;
    const candidateGroup = {
      groupId: 'action:branch',
      ordinalInGroup: index,
      groupSize: 2,
    };
    const continuedDeepeningCompletionRecords = [
      { iterationIndex: 0, residualBudget: 5, outcome: 'completed' },
      { iterationIndex: 1, residualBudget: 4, outcome: 'completed' },
    ] as const;
    const candidate: PolicyWasmProductionPreviewDriveCandidate = {
      move: trustedMove.move,
      stableMoveKey,
      actionId: 'branch',
      candidateGroup,
      decisionStackPublication,
      continuedDeepeningCompletionRecords,
    };
    const previewState = createTsPreviewRuntime(def, state, trustedMove).getPreviewState(candidate);
    if (previewState === undefined || typeof previewState.globalVars.score !== 'number') {
      throw new Error('supported preview-drive fixture did not produce a numeric preview state');
    }
    const projectedSelfMargin = previewState.globalVars.score;
    const expected = {
      stableMoveKey,
      outcome: 'completed',
      value: previewState.globalVars.score,
      previewStateValues: {
        [previewScoreSlot]: previewState.globalVars.score,
        [previewVictoryMarginSlot]: projectedSelfMargin,
        [previewOpponentVictoryMarginSlot]: 0,
      },
      previewSignalCarrier: readyContinuedDeepeningCarrier,
      candidateGroup,
      decisionStackPublication,
      continuedDeepeningCompletionRecords,
      previewStateHash: serializeGameState(previewState).stateHash,
    } satisfies Omit<PreviewDriveRowOracle, 'rowDigest'>;
    return {
      def,
      state,
      candidate,
      referencePreviewState: previewState,
      expected: {
        ...expected,
        rowDigest: digestPreviewDriveRow({
          stableMoveKey: expected.stableMoveKey,
          outcome: expected.outcome,
          value: expected.value,
          previewStateValues: expected.previewStateValues,
          previewSignalCarrier: expected.previewSignalCarrier,
          candidateGroup: expected.candidateGroup,
          decisionStackPublication: expected.decisionStackPublication,
          continuedDeepeningCompletionRecords: expected.continuedDeepeningCompletionRecords,
        }),
      },
    };
  });
};

export const evaluateSupportedPreviewDriveWithWasm = (
  wasm: PolicyWasmRuntime,
  fixtures: readonly PreviewDriveParityFixture[],
): PolicyWasmPreviewDriveResult =>
  evaluateProductionPreviewDriveBatchWithWasm({
    runtime: wasm,
    def: fixtures[0]!.def,
    state: fixtures[0]!.state,
    profileId: 'synthetic-preview-drive-parity',
    originSeatId: '0',
    originTurnId: 0,
    depthCap: 8,
    previewBranch: 'continuedDeepening',
    previewStateSlots,
    candidates: fixtures.map((fixture) => fixture.candidate),
  });

export const projectWasmPreviewDriveRow = (
  row: PolicyWasmPreviewDriveRow,
): Omit<PreviewDriveRowOracle, 'previewStateHash' | 'rowDigest'> & { readonly rowDigest: string } => {
  const projected = {
    stableMoveKey: row.stableMoveKey,
    outcome: row.outcome,
    value: row.value,
    previewStateValues: row.previewStateValues ?? {},
    previewSignalCarrier: row.previewSignalCarrier,
    candidateGroup: row.candidateGroup!,
    decisionStackPublication: row.decisionStackPublication!,
    continuedDeepeningCompletionRecords: row.continuedDeepeningCompletionRecords!,
  };
  return {
    ...projected,
    rowDigest: digestPreviewDriveRow(projected),
  };
};

export const evaluateUnsupportedPreviewDriveWithTsOracle = (
  input: PolicyWasmPreviewDriveBatchInput,
): PolicyWasmPreviewDriveResult => {
  const unsupportedStep = input.steps.find((step) => step.kind === 'unsupported');
  if (unsupportedStep === undefined) {
    throw new Error('unsupported preview-drive fixture must include an unsupported step');
  }
  return {
    kind: 'unsupported',
    profileId: input.profileId,
    candidateCount: input.candidates.length,
    unsupportedDriveClass: unsupportedStep.unsupportedClass,
    ...(unsupportedStep.owner === undefined ? {} : { unsupportedOwner: unsupportedStep.owner }),
    reason: `unsupported preview-drive class ${unsupportedStep.unsupportedClass}`,
  };
};

export const createUnsupportedPreviewDriveFixture = (): PolicyWasmPreviewDriveBatchInput => ({
  profileId: 'synthetic-preview-drive-fail-closed',
  originSeatId: '0',
  originTurnId: 0,
  depthCap: 8,
  candidates: [{
    actionId: 'blocked',
    stableMoveKey: 'blocked:0',
    initialValue: 0,
    previewSignalCarrier: {
      previewStatus: 'gated',
      previewBranch: 'continuedDeepening',
      tiebreakAfterPreviewNoSignal: true,
      policyPreviewSignalUnavailable: true,
    },
  }],
  steps: [{
    kind: 'unsupported',
    unsupportedClass: 'gated',
    owner: 'synthetic-preview-drive-fail-closed',
  }],
});

export const assertProductionUnsupportedReasonScoreParity = (
  ownerSlug: 'cardEventAction' | 'actionBatch' | 'chooseN' | 'popInterruptPhase',
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
  ownerSlug: 'cardEventAction' | 'actionBatch' | 'chooseN' | 'popInterruptPhase',
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
  ownerSlug: 'cardEventAction' | 'actionBatch' | 'chooseN' | 'popInterruptPhase',
): readonly Move[] => ownerSlug === 'actionBatch'
  ? [
      { actionId: asActionId('score'), params: { rank: 1 } },
      { actionId: asActionId('score'), params: { rank: 2 } },
    ]
  : [{ actionId: asActionId('score'), params: { rank: 1 } }];

const createUnsupportedReasonDef = (
  ownerSlug: 'cardEventAction' | 'actionBatch' | 'chooseN' | 'popInterruptPhase',
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
    terminal: { conditions: [] },
  });
};

const createUnsupportedReasonEffects = (
  ownerSlug: 'cardEventAction' | 'actionBatch' | 'chooseN' | 'popInterruptPhase',
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
  ownerSlug: 'cardEventAction' | 'actionBatch' | 'chooseN' | 'popInterruptPhase',
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
      currentMargin: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
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
        expr: refExpr({ kind: 'library', refKind: 'previewStateFeature', id: 'score' } as never),
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

const createSupportedPreviewDriveDef = (): GameDef => assertValidatedGameDef({
  metadata: { id: 'policy-wasm-preview-drive-equivalence', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [{
    id: asActionId('branch'),
    actor: 'active',
    executor: 'actor',
    phase: [phaseId],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  }] satisfies ActionDef[],
  actionPipelines: [{
    id: 'branch-preview-drive',
    actionId: asActionId('branch'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{
      effects: [
        eff({ addVar: { scope: 'global', var: 'score', delta: 2 } }),
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$pick',
            bind: '$pick',
            options: { query: 'enums', values: ['left', 'right'] },
          },
        }) as ActionPipelineDef['stages'][number]['effects'][number],
        eff({ addVar: { scope: 'global', var: 'score', delta: 3 } }),
      ],
    }],
    atomicity: 'partial',
  }],
  triggers: [],
  terminal: {
    conditions: [],
    margins: [
      { seat: '0', value: { _t: 2 as const, ref: 'gvar', var: 'score' } },
      { seat: '1', value: 0 },
    ],
  },
});

const trustedMoveFor = (
  state: GameState,
  actionId: string,
): TrustedExecutableMove =>
  createTrustedExecutableMove(
    { actionId: asActionId(actionId), params: {} },
    state.stateHash,
    'enumerateLegalMoves',
  );

const createTsPreviewRuntime = (
  def: GameDef,
  state: GameState,
  trustedMove: TrustedExecutableMove,
) =>
  createPolicyPreviewRuntime({
    def,
    state,
    playerId: asPlayerId(0),
    seatId: '0',
    trustedMoveIndex: new Map([['branch:0', trustedMove], ['branch:1', trustedMove]]),
    previewMode: 'exactWorld',
    completionPolicy: 'greedy',
    completionDepthCap: 8,
    dependencies: { applyMove: applyPreviewMove },
  });

const digestPreviewDriveRow = (
  row: Omit<PreviewDriveRowOracle, 'previewStateHash' | 'rowDigest'>,
): string =>
  createHash('sha256')
    .update(JSON.stringify(row))
    .digest('hex');
