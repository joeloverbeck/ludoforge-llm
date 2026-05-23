import { asPlayerId, type PlayerId } from '../kernel/branded.js';
import { buildSeatResolutionIndex, resolvePlayerIndexForSeatValue } from '../kernel/identity.js';
import { buildEncodedState, type EncodedStateLayout } from '../kernel/encoded-state/index.js';
import { legalMoves } from '../kernel/legal-moves.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type {
  AgentPreviewMode,
  CompiledAgentPreviewBudgetConfig,
  CompiledAgentPreviewGrantFlowContinuationConfig,
  AgentSelectionMode,
  AgentPolicyCatalog,
  DeepTrigger,
  CompiledPolicyConsideration,
  CompiledPolicyTieBreaker,
  GameDef,
  GameState,
  CandidateParamUnavailabilityReason,
  LookupUnavailabilityReason,
  Move,
  PolicyGuardrailTrace,
  PolicyPlanTrace,
  PolicyModuleTrace,
  PolicyTurnShapeTrace,
  PolicyPreviewOutcomeBreakdownTrace,
  PolicySelectorTraceEntry,
  PolicyPreviewSeatMatrixCellTrace,
  PolicyPreviewSeatMatrixTrace,
  Rng,
  TrustedExecutableMove,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { createRng, stepRng } from '../kernel/prng.js';
import { pickRandom } from './agent-move-selection.js';
import type {
  Phase1ActionPreviewEntry,
  PolicyPreviewDependencies,
  PolicyPreviewGrantedOperation,
  PolicyPreviewDriveTrace,
  PolicyPreviewTraceOutcome,
  PolicyPreviewUnavailabilityReason,
} from './policy-preview.js';
import { type PolicyValue } from './policy-surface.js';
import {
  PolicyEvaluationContext,
  type PolicyEvaluationCandidate,
  type PolicyCandidateParamFallbackFired,
  type PolicyLookupFallbackFired,
  type PolicyPreviewFallbackFired,
  type PolicyScheduleFallbackFired,
  type PolicyScheduleInputRefTrace,
  PolicyRuntimeError,
} from './policy-evaluation-core.js';
import { resolvePolicyBindingSeatId } from './policy-profile-resolution.js';
import { classifyPreviewUtility } from './preview-utility-classifier.js';
import { getInitializedPolicyWasmRuntime } from './policy-wasm-runtime.js';
import { tryScoreMoveConsiderationsWithWasm } from './policy-wasm-score-routing.js';
import {
  allocatePreviewBudget,
  type PreviewWideningDecisionContext,
  type PreviewWideningState,
} from './preview-budget-allocator.js';
import { getPolicyEncodedStateLayout } from './policy-encoded-state-layout-cache.js';
import { resolvePolicyEncodedState } from './policy-encoded-state-cache.js';
import { resolveAllPrunedGuardrailFallback } from './policy-guardrail-fallback.js';
import { dispatchGuardrails } from './policy-guardrail-eval.js';
import { createPolicyEvalCacheBinding } from './policy-evaluation-cache-binding.js';

export { getPolicyEncodedStateLayout } from './policy-encoded-state-layout-cache.js';

const SELECTION_SALT = 0x73656c656374696f6e5f6d6f64655f7274n;
const SELECTION_SEED_MIX = 0x9e3779b97f4a7c15f39cc0605cedc835n;
const TWO_TO_53 = 9007199254740992;
const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const POLICY_EVAL_TRACE_INTERVAL = 25;
const DEFAULT_PREVIEW_BUDGET: CompiledAgentPreviewBudgetConfig = {
  strategy: 'balancedCoverage',
  fullCandidateCap: 4,
  minPerGroup: 1,
};
let policyEvalCallCount = 0;
let policyEvalDepth = 0;
export const getPolicyEvalCallCount = (): number => policyEvalCallCount;
const shouldLogPolicyEvalOomTrace = (): boolean => process.env.ENGINE_OOM_TRACE === '1';
const heapUsedMb = (): number => Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

const shouldEmitPolicyEvalTrace = (
  legalMoveCount: number,
  depth: number,
): boolean => {
  if (!shouldLogPolicyEvalOomTrace()) {
    return false;
  }
  return depth > 1 || legalMoveCount >= 8 || policyEvalCallCount % POLICY_EVAL_TRACE_INTERVAL === 0;
};

const logPolicyEvalOomTrace = (
  label: string,
  depth: number,
  state: GameState,
  legalMoveCount: number,
  extras = '',
): void => {
  if (!shouldEmitPolicyEvalTrace(legalMoveCount, depth)) {
    return;
  }
  console.error(
    `[oom-trace] policy-eval:${label} depth=${depth} turn=${state.turnCount} legalMoves=${legalMoveCount} heapMb=${heapUsedMb()}${extras}`,
  );
};

const evaluatePlannedStrategyModules = (input: {
  readonly profile: AgentPolicyCatalog['profiles'][string];
  readonly catalog: AgentPolicyCatalog;
  readonly evaluation: PolicyEvaluationContext;
  readonly candidates: readonly PolicyEvaluationCandidate[];
}): void => {
  for (const moduleId of input.profile.plan.strategyModules ?? []) {
    const module = input.catalog.compiled.strategyModules?.[moduleId];
    if (module === undefined || module.costClass === 'auditOnly') {
      continue;
    }
    if (module.costClass === 'state') {
      input.evaluation.evaluatePlannedStrategyModule(moduleId);
      continue;
    }
    for (const candidate of input.candidates) {
      input.evaluation.evaluatePlannedStrategyModule(moduleId, candidate);
    }
  }
};

const evaluatePlannedTurnShapeEvaluators = (input: {
  readonly profile: AgentPolicyCatalog['profiles'][string];
  readonly catalog: AgentPolicyCatalog;
  readonly evaluation: PolicyEvaluationContext;
  readonly candidates: readonly PolicyEvaluationCandidate[];
}): ReadonlyMap<string, number> => {
  const penaltiesByStableMoveKey = new Map<string, number>();
  for (const evaluatorId of input.profile.plan.turnShapeEvaluators ?? []) {
    if (input.catalog.compiled.turnShapeEvaluators?.[evaluatorId] === undefined) {
      continue;
    }
    for (const candidate of input.candidates) {
      const result = input.evaluation.evaluatePlannedTurnShapeEvaluator(evaluatorId, candidate);
      if (result.demotePenalty !== undefined) {
        penaltiesByStableMoveKey.set(
          candidate.stableMoveKey,
          (penaltiesByStableMoveKey.get(candidate.stableMoveKey) ?? 0) + result.demotePenalty,
        );
      }
    }
  }
  return penaltiesByStableMoveKey;
};

export interface PolicyPreviewUnknownRef {
  readonly refId: string;
  readonly reason: PolicyPreviewUnavailabilityReason;
}

export interface PolicyLookupUnknownRef {
  readonly refId: string;
  readonly reason: LookupUnavailabilityReason;
}

export interface PolicyCandidateParamUnknownRef {
  readonly refId: string;
  readonly reason: CandidateParamUnavailabilityReason;
}

export const PREVIEW_UTILITY_VALUES = ['none', 'constant', 'lowInformation', 'differentiating'] as const;
export type PreviewUtility = typeof PREVIEW_UTILITY_VALUES[number];

export const SELECTION_REASONS = [
  'coverage',
  'prior',
  'shallowDelta',
  'widening',
  'cache',
  'gated',
  'beamPruned',
  'scored',
  'tiebreak',
  'tiebreakAfterPreviewNoSignal',
  'fallbackExplicit',
] as const;
export type SelectionReason = typeof SELECTION_REASONS[number];

export interface ReadyRefStats {
  readonly readyCount: number;
  readonly distinctValueCount: number;
  readonly min: number | null;
  readonly max: number | null;
  readonly range: number | null;
  readonly allReadyValuesEqual: boolean;
}

export interface PolicyEvaluationFailure {
  readonly code:
    | 'EMPTY_LEGAL_MOVES'
    | 'POLICY_CATALOG_MISSING'
    | 'SEAT_UNRESOLVED'
    | 'PROFILE_BINDING_MISSING'
    | 'PROFILE_MISSING'
    | 'PHASE1_ACTION_FILTER_EMPTY'
    | 'UNSUPPORTED_PREVIEW'
    | 'UNSUPPORTED_RUNTIME_REF'
    | 'UNSUPPORTED_AGGREGATE_OP'
    | 'PRUNING_RULE_EMPTIED_CANDIDATES'
    | 'RUNTIME_EVALUATION_ERROR';
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface PolicyEvaluationCandidateMetadata {
  readonly actionId: string;
  readonly stableMoveKey: string;
  readonly score: number;
  readonly prunedBy: readonly string[];
  readonly scoreContributions: readonly {
    readonly termId: string;
    readonly contribution: number;
  }[];
  readonly previewRefIds: readonly string[];
  readonly unknownPreviewRefs: readonly PolicyPreviewUnknownRef[];
  readonly unknownLookupRefs: readonly PolicyLookupUnknownRef[];
  readonly unknownCandidateParamRefs: readonly PolicyCandidateParamUnknownRef[];
  readonly previewFallbackFired?: PolicyPreviewFallbackFired;
  readonly lookupFallbackFired?: PolicyLookupFallbackFired;
  readonly scheduleFallbackFired?: PolicyScheduleFallbackFired;
  readonly inputRefs?: Readonly<Record<string, PolicyScheduleInputRefTrace>>;
  readonly candidateParamFallbackFired?: Readonly<Record<string, number>>;
  readonly selectionReason: SelectionReason;
  readonly previewOutcome?: PolicyPreviewTraceOutcome;
  readonly previewDrive?: PolicyPreviewDriveTrace;
  readonly grantedOperationSimulated?: boolean;
  readonly grantedOperationMove?: {
    readonly actionId: string;
    readonly params: Readonly<Record<string, unknown>>;
  };
  readonly grantedOperationMarginDelta?: number;
  readonly previewFailureReason?: string;
}

export interface PolicyEvaluationPruningStep {
  readonly ruleId: string;
  readonly remainingCandidateCount: number;
  readonly skippedBecauseEmpty: boolean;
}

export interface PolicyEvaluationTieBreakStep {
  readonly tieBreakerId: string;
  readonly candidateCountBefore: number;
  readonly candidateCountAfter: number;
}

export interface PolicyEvaluationPreviewUsage {
  readonly mode: AgentPreviewMode;
  readonly evaluatedCandidateCount: number;
  readonly completionPolicyFallbackCount: number;
  readonly refIds: readonly string[];
  readonly unknownRefs: readonly PolicyPreviewUnknownRef[];
  readonly readyRefStats: Readonly<Record<string, ReadyRefStats>>;
  readonly seatMatrix?: PolicyPreviewSeatMatrixTrace;
  readonly grantFlowContinuation?: PolicyEvaluationGrantFlowContinuationUsage;
  readonly utility: PreviewUtility;
  readonly widenedBecauseUniform: boolean;
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
  readonly coverage: PolicyPreviewCoverage;
}

export interface PolicyEvaluationGrantFlowContinuationUsage {
  readonly enabled: true;
  readonly postGrantDepthCap: number;
  readonly postGrantCapClass: CompiledAgentPreviewGrantFlowContinuationConfig['postGrantCapClass'];
  readonly freeOperationDepthCap: number;
  readonly freeOperationCapClass: CompiledAgentPreviewGrantFlowContinuationConfig['freeOperationCapClass'];
  readonly extraDepthReached: number;
  readonly exitCounts: {
    readonly completed: number;
    readonly postGrantCap: number;
    readonly freeOperationCap: number;
    readonly stochastic: number;
  };
}

export interface PolicyPreviewCoverage {
  readonly requestedRefCount: number;
  readonly evaluatedRootOptionCount: number;
  readonly readyRootOptionCount: number;
  readonly unavailableRootOptionCount: number;
  readonly allRootsUnavailable: boolean;
  readonly selectedByTieBreakerBecausePreviewUnavailable: boolean;
  readonly strategy: 'singlePass' | 'continuedDeepening';
  readonly capClass: 'standard256' | 'deep1024';
  readonly broad?: PolicyPreviewPhaseCoverage;
  readonly deep?: PolicyPreviewPhaseCoverage;
}

export interface PolicyPreviewPhaseCoverage {
  readonly evaluatedRootOptionCount: number;
  readonly readyRootOptionCount: number;
  readonly unavailableRootOptionCount: number;
  readonly triggerFired?: DeepTrigger;
}

export interface PolicyPreviewSignalUnavailableAdvisory {
  readonly code: 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE';
  readonly profileId: string;
  readonly seatId: string;
  readonly decisionKind: 'chooseOne' | 'chooseNStep';
  readonly decisionKey: string;
  readonly requestedRefs: readonly string[];
  readonly evaluatedRootOptionCount: number;
  readonly unavailableRootOptionCount: number;
  readonly unavailabilityBreakdown: Readonly<Record<Exclude<PolicyPreviewUnavailabilityReason, 'postGrantCap' | 'freeOperationCap' | 'grantFlowPartial'>, number> & {
    readonly postGrantCap?: number;
    readonly freeOperationCap?: number;
    readonly grantFlowPartial?: number;
    readonly afterDeepPass?: number;
  }>;
  readonly selectedStableMoveKey: string;
  readonly selectionReason: 'tiebreakAfterPreviewNoSignal';
}

export interface PolicyEvaluationSelectionTrace {
  readonly mode: AgentSelectionMode;
  readonly temperature?: number;
  readonly candidateCount: number;
  readonly samplingProbabilities?: readonly number[];
  readonly selectedIndex: number;
}
export interface PolicyEvaluationMetadata {
  readonly seatId: string | null;
  readonly requestedProfileId: string | null;
  readonly profileId: string | null;
  readonly profileFingerprint: string | null;
  readonly canonicalOrder: readonly string[];
  readonly candidates: readonly PolicyEvaluationCandidateMetadata[];
  readonly pruningSteps: readonly PolicyEvaluationPruningStep[];
  readonly tieBreakChain: readonly PolicyEvaluationTieBreakStep[];
  readonly previewUsage: PolicyEvaluationPreviewUsage;
  readonly selectedReason?: SelectionReason;
  readonly advisories?: readonly PolicyPreviewSignalUnavailableAdvisory[];
  readonly selectors?: readonly PolicySelectorTraceEntry[];
  readonly modules?: PolicyModuleTrace;
  readonly guardrails?: PolicyGuardrailTrace;
  readonly turnShape?: PolicyTurnShapeTrace;
  readonly selection?: PolicyEvaluationSelectionTrace;
  readonly plan?: PolicyPlanTrace;
  readonly stateFeatures?: Readonly<Record<string, number | string | boolean>>;
  readonly selectedStableMoveKey: string | null;
  readonly finalScore: number | null;
  readonly previewGatedCount?: number;
  readonly previewGatedTopFlipDetected?: boolean;
  readonly candidateParamFallbackFiredCount?: number;
  readonly phase1Score?: number | null;
  readonly phase2Score?: number | null;
  readonly phase1ActionRanking?: readonly string[];
  readonly usedFallback: boolean;
  readonly failure: PolicyEvaluationFailure | null;
}
export interface PolicyEvaluationResult {
  readonly move: Move;
  readonly rng: Rng;
  readonly metadata: PolicyEvaluationMetadata;
}

export interface EvaluatePolicyMoveInput {
  readonly def: GameDef;
  readonly state: GameState;
  readonly playerId: PlayerId;
  readonly legalMoves: readonly Move[];
  readonly trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>;
  readonly phase1ActionPreviewIndex?: ReadonlyMap<string, Phase1ActionPreviewEntry>;
  readonly rng: Rng;
  readonly runtime?: GameDefRuntime;
  readonly fallbackOnError?: boolean;
  readonly profileIdOverride?: string;
  readonly previewDependencies?: PolicyPreviewDependencies;
  readonly selectionGrouping?: 'none' | 'actionId';
  readonly encodedStateMode?: 'enabled' | 'disabled';
  readonly diagnosticsMode?: 'enabled' | 'disabled';
  readonly traceLevel?: 'none' | 'summary' | 'verbose' | 'debug';
  readonly previewWideningState?: PreviewWideningState;
  readonly previewDecisionContext?: PreviewWideningDecisionContext;
}

/**
 * Canonical shape: kind, move, rng, failure, metadata.
 * All construction sites must materialize every property.
 */
export type PolicyEvaluationCoreResult =
  | {
      readonly kind: 'success';
      readonly move: Move;
      readonly rng: Rng;
      readonly failure: undefined;
      readonly metadata: PolicyEvaluationMetadata;
    }
  | {
      readonly kind: 'failure';
      readonly move: Move | undefined;
      readonly rng: Rng | undefined;
      readonly failure: PolicyEvaluationFailure;
      readonly metadata: PolicyEvaluationMetadata;
    };

interface CandidateEntry extends PolicyEvaluationCandidate {
  readonly move: Move;
  readonly stableMoveKey: string;
  readonly actionId: string;
  readonly canonicalIndex: number;
  readonly prunedBy: string[];
  readonly scoreContributions: { readonly termId: string; readonly contribution: number }[];
  previewOutcome?: PolicyPreviewTraceOutcome;
  previewFailureReason?: string;
  previewDrive?: PolicyPreviewDriveTrace;
  grantFlowContinuationDepth?: number;
  completionPolicyFallbackCount?: number;
  previewSeatMatrix?: Map<string, Map<string, PolicyPreviewSeatMatrixCellTrace>>;
  scheduleInputRefs?: Map<string, PolicyScheduleInputRefTrace>;
  candidateParamFallbackFired?: Map<string, number>;
  grantedOperation?: PolicyPreviewGrantedOperation;
  score: number;
  selectionReason?: SelectionReason;
}

const EMPTY_TRUSTED_MOVE_INDEX = new Map<string, TrustedExecutableMove>();

function tryBuildPolicyEncodedState(def: GameDef, state: GameState, runtime?: GameDefRuntime): {
  readonly layout: EncodedStateLayout;
  readonly encoded: ReturnType<typeof buildEncodedState>;
} | undefined {
  try {
    const layout = getPolicyEncodedStateLayout(def);
    const encoded = runtime === undefined
      ? buildEncodedState(state, layout)
      : resolvePolicyEncodedState(runtime, state, layout, (currentState, currentLayout) => buildEncodedState(currentState, currentLayout));
    return encoded === undefined ? undefined : { layout, encoded };
  } catch {
    return undefined;
  }
}

function applyTieBreaker(
  evaluation: PolicyEvaluationContext,
  catalog: AgentPolicyCatalog,
  candidates: readonly CandidateEntry[],
  tieBreakerId: string,
  rng: Rng,
): { readonly candidates: readonly CandidateEntry[]; readonly rng: Rng } {
  const tieBreaker = catalog.compiled.tieBreakers[tieBreakerId];
  if (tieBreaker === undefined) {
    throw new PolicyRuntimeError({
      code: 'RUNTIME_EVALUATION_ERROR',
      message: `Unknown tie-breaker "${tieBreakerId}".`,
      detail: { tieBreakerId },
    });
  }

  switch (tieBreaker.kind) {
    case 'stableMoveKey': {
      const bestKey = candidates.reduce<string | null>((best, candidate) => (
        best === null || candidate.stableMoveKey < best ? candidate.stableMoveKey : best
      ), null);
      return {
        candidates: bestKey === null ? candidates : candidates.filter((candidate) => candidate.stableMoveKey === bestKey),
        rng,
      };
    }
    case 'higherExpr':
    case 'lowerExpr':
      return {
        candidates: selectByScalarExpr(
          candidates,
          (left, right) => (tieBreaker.kind === 'higherExpr' ? left > right : left < right),
          (candidate) => evaluation.evaluateCompiledExpr(tieBreaker.value!, candidate),
        ),
        rng,
      };
    case 'preferredEnumOrder':
    case 'preferredIdOrder':
      return {
        candidates: selectByPreferredOrder(
          candidates,
          tieBreaker,
          (candidate) => evaluation.evaluateCompiledExpr(tieBreaker.value!, candidate),
        ),
        rng,
      };
    case 'rng': {
      const { item, rng: nextRng } = pickRandom(candidates, rng);
      return { candidates: [item], rng: nextRng };
    }
    default:
      throw new PolicyRuntimeError({
        code: 'RUNTIME_EVALUATION_ERROR',
        message: `Unsupported tie-breaker kind "${tieBreaker.kind}".`,
        detail: { tieBreakerId, kind: tieBreaker.kind },
      });
  }
}

function hashString64(input: string): bigint {
  let hash = FNV_OFFSET_BASIS_64;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * FNV_PRIME_64) & ((1n << 64n) - 1n);
  }
  return hash;
}

function deriveVisibleSelectionSeed(
  profileFingerprint: string,
  candidates: readonly CandidateEntry[],
): bigint {
  let seed = SELECTION_SALT ^ hashString64(profileFingerprint);
  for (const candidate of candidates) {
    seed = (seed * SELECTION_SEED_MIX) ^ hashString64(candidate.stableMoveKey);
    seed = (seed * SELECTION_SEED_MIX) ^ hashString64(candidate.score.toString());
  }
  return seed;
}

function deriveSelectionRngFromVisiblePolicyInputs(
  profileFingerprint: string,
  candidates: readonly CandidateEntry[],
): Rng {
  return createRng(deriveVisibleSelectionSeed(profileFingerprint, candidates));
}

function drawUnitInterval(rng: Rng): { readonly value: number; readonly rng: Rng } {
  const [raw, nextRng] = stepRng(rng);
  return {
    value: Number(raw >> 11n) / TWO_TO_53,
    rng: nextRng,
  };
}

function sampleCandidateByProbabilities(
  candidates: readonly CandidateEntry[],
  probabilities: readonly number[],
  rng: Rng,
): { readonly selected: CandidateEntry; readonly rng: Rng } {
  if (candidates.length === 0) {
    throw new PolicyRuntimeError({
      code: 'RUNTIME_EVALUATION_ERROR',
      message: 'Cannot sample from an empty candidate set.',
    });
  }
  if (candidates.length !== probabilities.length) {
    throw new PolicyRuntimeError({
      code: 'RUNTIME_EVALUATION_ERROR',
      message: 'Candidate/probability cardinality mismatch during policy selection.',
      detail: {
        candidateCount: candidates.length,
        probabilityCount: probabilities.length,
      },
    });
  }
  if (candidates.length === 1) {
    return { selected: candidates[0]!, rng };
  }

  const { value, rng: nextRng } = drawUnitInterval(rng);
  let cumulative = 0;
  for (const [index, candidate] of candidates.entries()) {
    cumulative += probabilities[index] ?? 0;
    if (value < cumulative || index === candidates.length - 1) {
      return { selected: candidate, rng: nextRng };
    }
  }

  return { selected: candidates[candidates.length - 1]!, rng: nextRng };
}

function computeSoftmaxProbabilities(
  candidates: readonly CandidateEntry[],
  temperature: number,
): readonly number[] {
  const maxScore = candidates.reduce((best, candidate) => Math.max(best, candidate.score), Number.NEGATIVE_INFINITY);
  const weights = candidates.map((candidate) => Math.exp((candidate.score - maxScore) / temperature));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    throw new PolicyRuntimeError({
      code: 'RUNTIME_EVALUATION_ERROR',
      message: 'Softmax selection produced an invalid probability distribution.',
      detail: { temperature, weights },
    });
  }
  return weights.map((weight) => weight / totalWeight);
}

function computeWeightedSampleProbabilities(candidates: readonly CandidateEntry[]): readonly number[] {
  const minScore = candidates.reduce((best, candidate) => Math.min(best, candidate.score), Number.POSITIVE_INFINITY);
  const weights = candidates.map((candidate) => Math.max(0, candidate.score - minScore));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    return candidates.map(() => 1 / candidates.length);
  }
  return weights.map((weight) => weight / totalWeight);
}

export function evaluatePolicyMoveCore(input: EvaluatePolicyMoveInput): PolicyEvaluationCoreResult {
  policyEvalCallCount += 1;
  policyEvalDepth += 1;
  const collectDiagnostics = input.diagnosticsMode !== 'disabled';
  const candidates = canonicalizeCandidates(input.def, input.legalMoves);
  const currentDepth = policyEvalDepth;
  logPolicyEvalOomTrace('start', currentDepth, input.state, candidates.length);
  const canonicalOrder = collectDiagnostics ? candidates.map((candidate) => candidate.stableMoveKey) : [];
  const requestedProfileId = input.profileIdOverride ?? null;

  try {
    if (candidates.length === 0) {
      return {
        kind: 'failure',
        move: undefined,
        rng: undefined,
        failure: {
          code: 'EMPTY_LEGAL_MOVES',
          message: 'Policy evaluation requires at least one legal move.',
        },
        metadata: {
          seatId: null,
          requestedProfileId,
          profileId: null,
          profileFingerprint: null,
          canonicalOrder,
          candidates: [],
          pruningSteps: [],
          tieBreakChain: [],
          previewUsage: emptyPreviewUsage('exactWorld'),
          selectedStableMoveKey: null,
          finalScore: null,
          usedFallback: false,
          failure: {
            code: 'EMPTY_LEGAL_MOVES',
            message: 'Policy evaluation requires at least one legal move.',
          },
        },
      };
    }

    const catalog = input.def.agents;
    if (catalog === undefined) {
      return failureWithMetadata(candidates, null, requestedProfileId, null, {
        code: 'POLICY_CATALOG_MISSING',
        message: 'GameDef.agents is required to evaluate an authored policy.',
      }, null, collectDiagnostics);
    }

    const seatId = resolvePolicyBindingSeatId(input.def, input.playerId);
    if (seatId === null) {
      return failureWithMetadata(candidates, null, requestedProfileId, null, {
        code: 'SEAT_UNRESOLVED',
        message: `Player ${input.playerId} does not resolve to a canonical seat id for policy binding.`,
        detail: { playerId: input.playerId },
      }, null, collectDiagnostics);
    }

    const profileId = input.profileIdOverride ?? catalog.bindingsBySeat[seatId];
    if (profileId === undefined) {
      return failureWithMetadata(candidates, seatId, requestedProfileId, null, {
        code: 'PROFILE_BINDING_MISSING',
        message: `Seat "${seatId}" is not bound to an authored policy profile.`,
        detail: { seatId },
      }, null, collectDiagnostics);
    }

    const profile = catalog.profiles[profileId];
    if (profile === undefined) {
      return failureWithMetadata(candidates, seatId, requestedProfileId, profileId, {
        code: 'PROFILE_MISSING',
        message: `Compiled policy profile "${profileId}" is missing from GameDef.agents.profiles.`,
        detail: { seatId, profileId },
      }, null, collectDiagnostics);
    }

    let evaluationForDispose: PolicyEvaluationContext | undefined;
    try {
      const previewDependencies = {
        ...createGrantedOperationPreviewDependencies(input.def, profileId),
        ...input.previewDependencies,
      } satisfies PolicyPreviewDependencies;
      const encodedView = input.encodedStateMode === 'disabled'
        ? undefined
        : tryBuildPolicyEncodedState(input.def, input.state, input.runtime);
      const evaluation = new PolicyEvaluationContext({
        def: input.def,
        state: input.state,
        playerId: input.playerId,
        seatId,
        catalog,
        parameterValues: profile.params,
        trustedMoveIndex: input.trustedMoveIndex,
        ...(input.phase1ActionPreviewIndex === undefined ? {} : { phase1ActionPreviewIndex: input.phase1ActionPreviewIndex }),
        previewDependencies,
        cacheBinding: createPolicyEvalCacheBinding(input.runtime, encodedView),
        ...(input.traceLevel === undefined ? {} : { traceLevel: input.traceLevel }),
      }, candidates);
      evaluationForDispose = evaluation;
      let activeCandidates = [...candidates];
      const pruningSteps: PolicyEvaluationPruningStep[] = [];
      const tieBreakChain: PolicyEvaluationTieBreakStep[] = [];

      for (const featureId of profile.plan.stateFeatures) {
        evaluation.evaluateStateFeature(featureId);
      }
      for (const candidate of activeCandidates) {
        for (const featureId of profile.plan.candidateFeatures) {
          const feature = catalog.library.candidateFeatures[featureId];
          if (feature?.costClass === 'preview') {
            continue;
          }
          evaluation.evaluateCandidateFeature(candidate, featureId);
        }
      }
      for (const selectorId of profile.plan.selectors ?? []) {
        const selector = catalog.compiled.selectors?.[selectorId];
        if (selector === undefined || selector.costClass === 'auditOnly') {
          continue;
        }
        if (selector.costClass === 'state') {
          evaluation.evaluatePlannedSelector(selectorId);
          continue;
        }
        for (const candidate of activeCandidates) {
          evaluation.evaluatePlannedSelector(selectorId, candidate);
        }
      }
      evaluatePlannedStrategyModules({ profile, catalog, evaluation, candidates: activeCandidates });
      const guardrailDispatch = dispatchGuardrails({
        profile,
        catalog,
        evaluation,
        activeCandidates,
        collectDiagnostics, traceLevel: input.traceLevel === 'debug' ? 'debug' : input.traceLevel === 'verbose' ? 'verbose' : 'summary',
      });
      const guardrailFallback = resolveAllPrunedGuardrailFallback({
        def: input.def,
        catalog,
        allCandidates: candidates,
        dispatch: guardrailDispatch,
        collectDiagnostics,
      });
      const guardrailTrace = guardrailFallback.trace;
      if (guardrailFallback.kind === 'constructible') {
        activeCandidates = [...guardrailFallback.activeCandidates];
        activeCandidates[0]!.selectionReason = 'fallbackExplicit';
        evaluation.setCurrentCandidates(activeCandidates);
      } else if (guardrailFallback.kind === 'notConstructible') {
        return failureWithMetadata(candidates, seatId, requestedProfileId, profileId, {
          code: 'PRUNING_RULE_EMPTIED_CANDIDATES',
          message: `Guardrail "${guardrailFallback.guardrailId}" removed every candidate and fallback action "${guardrailFallback.actionId}" was not constructible.`,
          detail: {
            guardrailId: guardrailFallback.guardrailId,
            actionId: guardrailFallback.actionId,
            signal: 'POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE',
          },
        }, profile.fingerprint, collectDiagnostics, evaluation, guardrailTrace === undefined ? {} : { guardrails: guardrailTrace });
      } else {
        activeCandidates = [...guardrailFallback.activeCandidates];
      }
      evaluation.setCurrentGuardrailRefView(guardrailDispatch.refView);
      if (activeCandidates.length === 0) {
        const guardrailId = guardrailDispatch.allPrunedGuardrailId;
        throw new PolicyRuntimeError({
          code: 'PRUNING_RULE_EMPTIED_CANDIDATES',
          message: guardrailId === undefined
            ? 'Guardrails removed every candidate.'
            : `Guardrail "${guardrailId}" removed every candidate.`,
          detail: guardrailId === undefined ? {} : { guardrailId },
        });
      }

      evaluatePlannedStrategyModules({ profile, catalog, evaluation, candidates: activeCandidates });
      const turnShapePenaltiesByStableMoveKey =
        evaluatePlannedTurnShapeEvaluators({ profile, catalog, evaluation, candidates: activeCandidates });

      const considerations = catalog.compiled.considerations;
      const moveConsiderationIds = (profile.use.considerations ?? []).filter(
        (considerationId) => considerations[considerationId]?.scopes?.includes('move') === true,
      );
      const moveOnlyConsiderationIds = moveConsiderationIds.filter(
        (considerationId) => considerations[considerationId]?.costClass !== 'preview',
      );
      const allocatorOutput = profile.preview.mode === 'disabled'
        ? {
            allowedKeys: new Set(activeCandidates.map((candidate) => candidate.stableMoveKey)),
            selectionReason: new Map(activeCandidates.map((candidate) => [candidate.stableMoveKey, 'prior' as const])),
            widenedBecauseUniform: false,
            decisionClassKey: undefined,
          }
        : allocatePreviewBudget(
            evaluation,
            considerations,
            activeCandidates,
            moveOnlyConsiderationIds,
            moveConsiderationIds,
            profile.preview.budget ?? DEFAULT_PREVIEW_BUDGET,
            input.previewWideningState,
            input.previewDecisionContext ?? previewDecisionContextFromState(input.state, seatId),
          );
      const previewAllowedKeys = allocatorOutput.allowedKeys;
      for (const candidate of activeCandidates) {
        candidate.selectionReason = candidate.selectionReason === 'fallbackExplicit'
          ? 'fallbackExplicit'
          : allocatorOutput.selectionReason.get(candidate.stableMoveKey) ?? 'gated';
      }
      let previewGatedCount = 0;
      let maxCachedGatedPreviewScore = Number.NEGATIVE_INFINITY;
      if (previewAllowedKeys.size < activeCandidates.length) {
        for (const candidate of activeCandidates) {
          if (!previewAllowedKeys.has(candidate.stableMoveKey)) {
            previewGatedCount += 1;
            if (evaluation.hasMaterializedPreview(candidate)) {
              maxCachedGatedPreviewScore = Math.max(
                maxCachedGatedPreviewScore,
                scoreCandidateForGateFlipProbe(evaluation, considerations, candidate, moveConsiderationIds),
              );
            }
            evaluation.markPreviewGated(candidate);
          }
        }
      }
      const wasmRuntime = getInitializedPolicyWasmRuntime();
      const scoredWithWasm = wasmRuntime !== null && tryScoreMoveConsiderationsWithWasm({
        runtime: wasmRuntime,
        ...(input.runtime === undefined ? {} : { gameDefRuntime: input.runtime }),
        def: input.def,
        state: input.state,
        encodedView,
        evaluation,
        catalog,
        profileId,
        profile,
        seatId,
        playerId: input.playerId,
        candidates: activeCandidates,
        considerationIds: moveConsiderationIds,
      });
      if (!scoredWithWasm) {
        for (const candidate of activeCandidates) {
          candidate.score = moveConsiderationIds.reduce((total, considerationId) => (
            total + evaluation.evaluateConsideration(
              considerations,
              considerationId,
              candidate,
              collectDiagnostics ? (contribution) => {
                candidate.scoreContributions.push({ termId: considerationId, contribution });
              } : undefined,
            )
          ), 0);
        }
      }
      for (const candidate of activeCandidates) {
        candidate.score -= guardrailDispatch.penaltiesByStableMoveKey.get(candidate.stableMoveKey) ?? 0;
        candidate.score -= turnShapePenaltiesByStableMoveKey.get(candidate.stableMoveKey) ?? 0;
        if (!scoredWithWasm) {
          evaluation.finalizePreviewOutcome(candidate);
        }
      }
      let rng = input.rng;
      let selectionCandidates: readonly CandidateEntry[] = [...activeCandidates];
      if (input.selectionGrouping === 'actionId') {
        const groupedSelection = selectRepresentativeCandidatesByActionId(
          evaluation,
          catalog,
          selectionCandidates,
          profile.use.tieBreakers,
          rng,
        );
        selectionCandidates = groupedSelection.candidates;
        rng = groupedSelection.rng;
      }
      let selected: CandidateEntry | undefined;
      let selectionTrace: PolicyEvaluationSelectionTrace | undefined;
      switch (profile.selection.mode) {
        case 'argmax': {
          const bestScore = selectionCandidates.reduce((best, candidate) => Math.max(best, candidate.score), Number.NEGATIVE_INFINITY);
          let bestCandidates = selectionCandidates.filter((candidate) => candidate.score === bestScore);

          for (const tieBreakerId of profile.use.tieBreakers) {
            if (bestCandidates.length <= 1) {
              break;
            }
            const candidateCountBefore = bestCandidates.length;
            const tieBreakResult = applyTieBreaker(evaluation, catalog, bestCandidates, tieBreakerId, rng);
            bestCandidates = [...tieBreakResult.candidates];
            rng = tieBreakResult.rng;
            tieBreakChain.push({
              tieBreakerId,
              candidateCountBefore,
              candidateCountAfter: bestCandidates.length,
            });
          }

          selected = bestCandidates[0] ?? selectionCandidates[0];
          if (collectDiagnostics) {
            selectionTrace = {
              mode: 'argmax',
              candidateCount: selectionCandidates.length,
              selectedIndex: Math.max(0, selectionCandidates.findIndex((candidate) => candidate.stableMoveKey === selected?.stableMoveKey)),
            };
          }
          break;
        }
        case 'softmaxSample': {
          const temperature = profile.selection.temperature;
          if (temperature === undefined) {
            throw new PolicyRuntimeError({
              code: 'RUNTIME_EVALUATION_ERROR',
              message: `Profile "${profileId}" selection.mode "softmaxSample" requires temperature at runtime.`,
              detail: { profileId },
            });
          }
          const probabilities = computeSoftmaxProbabilities(selectionCandidates, temperature);
          selected = sampleCandidateByProbabilities(
            selectionCandidates,
            probabilities,
            deriveSelectionRngFromVisiblePolicyInputs(profile.fingerprint, selectionCandidates),
          ).selected;
          if (collectDiagnostics) {
            selectionTrace = {
              mode: 'softmaxSample',
              temperature,
              candidateCount: selectionCandidates.length,
              samplingProbabilities: probabilities,
              selectedIndex: Math.max(0, selectionCandidates.findIndex((candidate) => candidate.stableMoveKey === selected?.stableMoveKey)),
            };
          }
          break;
        }
        case 'weightedSample': {
          const probabilities = computeWeightedSampleProbabilities(selectionCandidates);
          selected = sampleCandidateByProbabilities(
            selectionCandidates,
            probabilities,
            deriveSelectionRngFromVisiblePolicyInputs(profile.fingerprint, selectionCandidates),
          ).selected;
          if (collectDiagnostics) {
            selectionTrace = {
              mode: 'weightedSample',
              candidateCount: selectionCandidates.length,
              samplingProbabilities: probabilities,
              selectedIndex: Math.max(0, selectionCandidates.findIndex((candidate) => candidate.stableMoveKey === selected?.stableMoveKey)),
            };
          }
          break;
        }
      }

      if (selected === undefined) {
        throw new PolicyRuntimeError({
          code: 'RUNTIME_EVALUATION_ERROR',
          message: 'Policy evaluation did not produce a selectable candidate.',
        });
      }

      const stateFeatures = collectDiagnostics ? evaluation.getEvaluatedStateFeatures() : {};
      const selectorTraces = collectDiagnostics && input.traceLevel !== 'none'
        ? evaluation.getEvaluatedSelectorTraces(input.traceLevel === 'summary' ? 'summary' : 'verbose')
        : [];
      const moduleTrace = collectDiagnostics && input.traceLevel !== 'none'
        ? evaluation.getEvaluatedStrategyModuleTrace(
            input.traceLevel === 'debug' ? 'debug' : input.traceLevel === 'verbose' ? 'verbose' : 'summary',
            selected,
          )
        : undefined;
      const turnShapeTrace = collectDiagnostics && input.traceLevel !== 'none'
        ? evaluation.getEvaluatedTurnShapeTrace(
            input.traceLevel === 'debug' ? 'debug' : input.traceLevel === 'verbose' ? 'verbose' : 'summary',
            selected,
          )
        : undefined;
      logPolicyEvalOomTrace(
        'success',
        currentDepth,
        input.state,
        candidates.length,
        ` selectedCandidates=${selectionCandidates.length} finalScore=${selected.score}`,
      );
      const previewUsageForMemory = summarizePreviewUsage(
        candidates,
        profile.preview.mode,
        evaluation,
        false,
        profile.preview.grantFlowContinuation,
      );
      updatePreviewWideningMemory(
        input.previewWideningState,
        allocatorOutput.decisionClassKey,
        previewUsageForMemory.utility,
        allocatorOutput.widenedBecauseUniform,
      );
      return {
        kind: 'success',
        move: selected.move,
        rng,
        failure: undefined,
        metadata: {
          seatId,
          requestedProfileId,
          profileId,
          profileFingerprint: profile.fingerprint,
          canonicalOrder,
          candidates: collectDiagnostics ? candidates.map(candidateMetadata) : [],
          pruningSteps: collectDiagnostics ? pruningSteps : [],
          tieBreakChain: collectDiagnostics ? tieBreakChain : [],
          previewUsage: collectDiagnostics
            ? { ...previewUsageForMemory, widenedBecauseUniform: allocatorOutput.widenedBecauseUniform }
            : emptyPreviewUsage(profile.preview.mode),
          ...(selected.selectionReason === undefined ? {} : { selectedReason: selected.selectionReason }),
          ...(selectionTrace === undefined ? {} : { selection: selectionTrace }),
          ...(Object.keys(stateFeatures).length > 0 ? { stateFeatures } : {}),
          selectedStableMoveKey: selected.stableMoveKey,
          finalScore: Number.isFinite(selected.score) ? selected.score : null,
          previewGatedCount,
          candidateParamFallbackFiredCount: candidateParamFallbackFiredCountFor(candidates),
          ...(selectorTraces.length === 0 ? {} : { selectors: selectorTraces }),
          ...(moduleTrace === undefined ? {} : { modules: moduleTrace }),
          ...(guardrailTrace === undefined ? {} : { guardrails: guardrailTrace }),
          ...(turnShapeTrace === undefined ? {} : { turnShape: turnShapeTrace }),
          ...(Number.isFinite(maxCachedGatedPreviewScore) && maxCachedGatedPreviewScore > selected.score
            ? { previewGatedTopFlipDetected: true }
            : {}),
          usedFallback: false,
          failure: null,
        },
      };
    } catch (error) {
      const failure = error instanceof PolicyRuntimeError
        ? error.failure as PolicyEvaluationFailure
        : {
            code: 'RUNTIME_EVALUATION_ERROR' as const,
            message: error instanceof Error ? error.message : 'Unknown policy evaluation failure.',
          };
      logPolicyEvalOomTrace(
        'failure',
        currentDepth,
        input.state,
        candidates.length,
        ` code=${failure.code}`,
      );
      return failureWithMetadata(
        candidates,
        seatId,
        requestedProfileId,
        profileId,
        failure,
        profile.fingerprint,
        collectDiagnostics,
        evaluationForDispose,
      );
    } finally {
      evaluationForDispose?.dispose();
    }
  } finally {
    policyEvalDepth -= 1;
  }
}

function createGrantedOperationPreviewDependencies(
  def: GameDef,
  profileId: string,
): PolicyPreviewDependencies {
  return {
    evaluateGrantedOperation: (
      currentDef,
      postEventState,
      agentSeatId,
      runtime,
    ) => {
      const seatResolutionIndex = buildSeatResolutionIndex(currentDef, postEventState.playerCount);
      const grantedPlayerIndex = resolvePlayerIndexForSeatValue(agentSeatId, seatResolutionIndex);
      if (grantedPlayerIndex === null) {
        return undefined;
      }

      const activeSeatId = resolvePolicyBindingSeatId(currentDef, postEventState.activePlayer);
      if (activeSeatId !== agentSeatId) {
        return undefined;
      }

      const availableMoves = legalMoves(currentDef, postEventState, undefined, runtime);
      logPolicyEvalOomTrace(
        'granted-operation-preview',
        policyEvalDepth + 1,
        postEventState,
        availableMoves.length,
        ` activeSeat=${activeSeatId ?? 'null'} grantSeat=${agentSeatId}`,
      );
      if (availableMoves.length === 0) {
        return undefined;
      }

      const result = evaluatePolicyMoveCore({
        def: currentDef,
        state: postEventState,
        playerId: asPlayerId(grantedPlayerIndex),
        legalMoves: availableMoves,
        trustedMoveIndex: EMPTY_TRUSTED_MOVE_INDEX,
        rng: { state: postEventState.rng },
        profileIdOverride: profileId,
        ...(runtime === undefined ? {} : { runtime }),
        diagnosticsMode: 'disabled',
      });

      if (result.kind !== 'success') {
        return undefined;
      }

      return {
        move: result.move,
        score: result.metadata.finalScore ?? 0,
      };
    },
  };
}

export function evaluatePolicyMove(input: EvaluatePolicyMoveInput): PolicyEvaluationResult {
  const core = evaluatePolicyMoveCore(input);
  if (core.kind === 'success') {
    return core;
  }

  const fallbackCandidate = canonicalizeCandidates(input.def, input.legalMoves)[0];
  if (fallbackCandidate === undefined || input.fallbackOnError === false) {
    throw new PolicyRuntimeError(core.failure);
  }

  return {
    move: fallbackCandidate.move,
    rng: input.rng,
    metadata: {
      ...core.metadata,
      selectedStableMoveKey: fallbackCandidate.stableMoveKey,
      finalScore: Number.isFinite(fallbackCandidate.score) ? fallbackCandidate.score : null,
      usedFallback: true,
    },
  };
}

function failureWithMetadata(
  candidates: readonly CandidateEntry[],
  seatId: string | null,
  requestedProfileId: string | null,
  profileId: string | null,
  failure: PolicyEvaluationFailure,
  profileFingerprint: string | null = null,
  collectDiagnostics = true,
  evaluation?: PolicyEvaluationContext,
  extraMetadata: Partial<Pick<PolicyEvaluationMetadata, 'guardrails'>> = {},
): PolicyEvaluationCoreResult {
  return {
    kind: 'failure',
    move: undefined,
    rng: undefined,
    failure,
    metadata: {
      seatId,
      requestedProfileId,
      profileId,
      profileFingerprint,
      canonicalOrder: collectDiagnostics ? candidates.map((candidate) => candidate.stableMoveKey) : [],
      candidates: collectDiagnostics ? candidates.map(candidateMetadata) : [],
      pruningSteps: [],
      tieBreakChain: [],
      previewUsage: collectDiagnostics && evaluation !== undefined
        ? summarizePreviewUsage(candidates, 'exactWorld', evaluation)
        : emptyPreviewUsage('exactWorld'),
      ...extraMetadata,
      selectedStableMoveKey: null,
      finalScore: null,
      usedFallback: false,
      failure,
    },
  };
}

function selectRepresentativeCandidatesByActionId(
  evaluation: PolicyEvaluationContext,
  catalog: AgentPolicyCatalog,
  candidates: readonly CandidateEntry[],
  tieBreakerIds: readonly string[],
  rng: Rng,
): { readonly candidates: readonly CandidateEntry[]; readonly rng: Rng } {
  const actionGroups = new Map<string, CandidateEntry[]>();
  for (const candidate of candidates) {
    const existing = actionGroups.get(candidate.actionId);
    if (existing === undefined) {
      actionGroups.set(candidate.actionId, [candidate]);
      continue;
    }
    existing.push(candidate);
  }

  let nextRng = rng;
  const representativeTieBreakerIds = tieBreakerIds.filter((tieBreakerId) =>
    catalog.compiled.tieBreakers[tieBreakerId]?.kind !== 'stableMoveKey');
  const representatives = [...actionGroups.values()].map((groupCandidates) => {
    const bestScore = groupCandidates.reduce((best, candidate) => Math.max(best, candidate.score), Number.NEGATIVE_INFINITY);
    let bestCandidates = groupCandidates.filter((candidate) => candidate.score === bestScore);
    for (const tieBreakerId of representativeTieBreakerIds) {
      if (bestCandidates.length <= 1) {
        break;
      }
      const tieBreakResult = applyTieBreaker(evaluation, catalog, bestCandidates, tieBreakerId, nextRng);
      bestCandidates = [...tieBreakResult.candidates];
      nextRng = tieBreakResult.rng;
    }
    return [...bestCandidates].sort((left, right) => left.canonicalIndex - right.canonicalIndex)[0] ?? groupCandidates[0]!;
  });

  return {
    candidates: representatives.sort((left, right) => left.canonicalIndex - right.canonicalIndex),
    rng: nextRng,
  };
}

function canonicalizeCandidates(def: GameDef, legalMoves: readonly Move[]): CandidateEntry[] {
  return legalMoves
    .map((move, canonicalIndex) => ({
      move,
      stableMoveKey: toMoveIdentityKey(def, move),
      actionId: String(move.actionId),
      canonicalIndex,
      prunedBy: [],
      scoreContributions: [],
      previewRefIds: new Set<string>(),
      unknownPreviewRefs: new Map<string, PolicyPreviewUnavailabilityReason>(),
      previewSeatMatrix: new Map(),
      unknownLookupRefs: new Map<string, LookupUnavailabilityReason>(),
      unknownCandidateParamRefs: new Map<string, CandidateParamUnavailabilityReason>(),
      score: Number.NEGATIVE_INFINITY,
    }))
    .sort((left, right) => left.stableMoveKey.localeCompare(right.stableMoveKey));
}

function candidateMetadata(candidate: CandidateEntry): PolicyEvaluationCandidateMetadata {
  const grantedOperationMetadata = traceGrantedOperation(candidate.grantedOperation);
  return {
    actionId: candidate.actionId,
    stableMoveKey: candidate.stableMoveKey,
    score: Number.isFinite(candidate.score) ? candidate.score : 0,
    prunedBy: [...candidate.prunedBy],
    scoreContributions: [...candidate.scoreContributions],
    previewRefIds: [...candidate.previewRefIds].sort(),
    unknownPreviewRefs: [...candidate.unknownPreviewRefs.entries()]
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([refId, reason]) => ({ refId, reason })),
    unknownLookupRefs: [...candidate.unknownLookupRefs.entries()]
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([refId, reason]) => ({ refId, reason })),
    unknownCandidateParamRefs: [...candidate.unknownCandidateParamRefs.entries()]
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([refId, reason]) => ({ refId, reason })),
    ...(candidate.previewFallbackFired === undefined ? {} : { previewFallbackFired: candidate.previewFallbackFired }),
    ...(candidate.lookupFallbackFired === undefined ? {} : { lookupFallbackFired: candidate.lookupFallbackFired }),
    ...(candidate.scheduleFallbackFired === undefined ? {} : { scheduleFallbackFired: candidate.scheduleFallbackFired }),
    ...(candidate.scheduleInputRefs === undefined ? {} : { inputRefs: serializeScheduleInputRefs(candidate.scheduleInputRefs) }),
    ...(candidate.candidateParamFallbackFired === undefined
      ? {}
      : { candidateParamFallbackFired: serializeCandidateParamFallbackFired(candidate.candidateParamFallbackFired) }),
    selectionReason: candidate.selectionReason ?? (candidate.previewOutcome === 'gated' ? 'gated' : 'prior'),
    ...(candidate.previewOutcome === undefined ? {} : { previewOutcome: candidate.previewOutcome }),
    ...(candidate.previewDrive === undefined ? {} : { previewDrive: candidate.previewDrive }),
    ...(grantedOperationMetadata ?? {}),
    ...(candidate.previewFailureReason === undefined ? {} : { previewFailureReason: candidate.previewFailureReason }),
  };
}

function scoreCandidateForGateFlipProbe(
  evaluation: PolicyEvaluationContext,
  considerations: Readonly<Record<string, CompiledPolicyConsideration>>,
  candidate: CandidateEntry,
  considerationIds: readonly string[],
): number {
  const probe: CandidateEntry = {
    move: candidate.move,
    stableMoveKey: candidate.stableMoveKey,
    actionId: candidate.actionId,
    canonicalIndex: candidate.canonicalIndex,
    prunedBy: [...candidate.prunedBy],
    scoreContributions: [],
    previewRefIds: new Set(candidate.previewRefIds),
    unknownPreviewRefs: new Map(candidate.unknownPreviewRefs),
    previewSeatMatrix: new Map(
      [...candidate.previewSeatMatrix?.entries() ?? []]
        .map(([refId, seatCells]) => [refId, new Map(seatCells)]),
    ),
    unknownLookupRefs: new Map(candidate.unknownLookupRefs),
    unknownCandidateParamRefs: new Map(candidate.unknownCandidateParamRefs),
    ...(candidate.scheduleInputRefs === undefined ? {} : { scheduleInputRefs: new Map(candidate.scheduleInputRefs) }),
    ...(candidate.candidateParamFallbackFired === undefined
      ? {}
      : { candidateParamFallbackFired: new Map(candidate.candidateParamFallbackFired) }),
    score: candidate.score,
    ...(candidate.previewOutcome === undefined ? {} : { previewOutcome: candidate.previewOutcome }),
    ...(candidate.previewFailureReason === undefined ? {} : { previewFailureReason: candidate.previewFailureReason }),
    ...(candidate.previewDrive === undefined ? {} : { previewDrive: candidate.previewDrive }),
    ...(candidate.grantFlowContinuationDepth === undefined
      ? {}
      : { grantFlowContinuationDepth: candidate.grantFlowContinuationDepth }),
    ...(candidate.grantedOperation === undefined ? {} : { grantedOperation: candidate.grantedOperation }),
  };
  return considerationIds.reduce((total, considerationId) => (
    total + evaluation.evaluateConsideration(considerations, considerationId, probe)
  ), 0);
}

function serializeCandidateParamFallbackFired(
  candidateParamFallbackFired: PolicyCandidateParamFallbackFired,
): Readonly<Record<string, number>> {
  return Object.fromEntries([...candidateParamFallbackFired.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function serializeScheduleInputRefs(
  inputRefs: ReadonlyMap<string, PolicyScheduleInputRefTrace>,
): Readonly<Record<string, PolicyScheduleInputRefTrace>> {
  return Object.fromEntries([...inputRefs.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function candidateParamFallbackFiredCountFor(candidates: readonly CandidateEntry[]): number {
  return candidates.reduce(
    (total, candidate) => total + [...(candidate.candidateParamFallbackFired?.values() ?? [])]
      .reduce((candidateTotal, count) => candidateTotal + count, 0),
    0,
  );
}

function traceGrantedOperation(
  grantedOperation: PolicyPreviewGrantedOperation | undefined,
): Pick<
  PolicyEvaluationCandidateMetadata,
  'grantedOperationSimulated' | 'grantedOperationMove' | 'grantedOperationMarginDelta'
> | undefined {
  if (grantedOperation === undefined) {
    return undefined;
  }

  return {
    grantedOperationSimulated: true,
    grantedOperationMove: {
      actionId: String(grantedOperation.move.actionId),
      params: grantedOperation.move.params,
    },
    ...(grantedOperation.preEventMargin === undefined || grantedOperation.postEventPlusOpMargin === undefined
      ? {}
      : { grantedOperationMarginDelta: grantedOperation.postEventPlusOpMargin - grantedOperation.preEventMargin }),
  };
}

function summarizePreviewUsage(
  candidates: readonly CandidateEntry[],
  mode: AgentPreviewMode,
  evaluation: PolicyEvaluationContext,
  widenedBecauseUniform = false,
  grantFlowContinuation?: CompiledAgentPreviewGrantFlowContinuationConfig,
): PolicyEvaluationPreviewUsage {
  const refIds = new Set<string>();
  const unknownRefs = new Map<string, PolicyPreviewUnavailabilityReason>();
  const evaluatedCandidates = candidates.filter((candidate) => candidate.previewRefIds.size > 0);
  for (const candidate of evaluatedCandidates) {
    candidate.previewRefIds.forEach((refId) => refIds.add(refId));
    candidate.unknownPreviewRefs.forEach((reason, refId) => unknownRefs.set(refId, reason));
  }
  const sortedRefIds = [...refIds].sort();
  const readyRefStats = summarizeReadyRefStats(candidates, sortedRefIds, evaluation);
  const seatMatrix = summarizeSeatMatrix(evaluatedCandidates);
  return {
    mode,
    evaluatedCandidateCount: evaluatedCandidates.length,
    completionPolicyFallbackCount: evaluatedCandidates.reduce(
      (total, candidate) => total + (candidate.completionPolicyFallbackCount ?? 0),
      0,
    ),
    refIds: sortedRefIds,
    unknownRefs: [...unknownRefs.entries()]
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([refId, reason]) => ({ refId, reason })),
    readyRefStats,
    ...(seatMatrix === undefined ? {} : { seatMatrix }),
    ...(grantFlowContinuation?.enabled === true
      ? { grantFlowContinuation: summarizeGrantFlowContinuation(evaluatedCandidates, grantFlowContinuation) }
      : {}),
    utility: classifyPreviewUtility(readyRefStats),
    widenedBecauseUniform,
    outcomeBreakdown: summarizePreviewOutcomes(evaluatedCandidates),
    coverage: {
      requestedRefCount: sortedRefIds.length,
      evaluatedRootOptionCount: evaluatedCandidates.length,
      readyRootOptionCount: evaluatedCandidates.filter((candidate) => candidate.previewOutcome === 'ready').length,
      unavailableRootOptionCount: evaluatedCandidates.filter((candidate) => candidate.previewOutcome !== 'ready').length,
      allRootsUnavailable: sortedRefIds.length > 0
        && evaluatedCandidates.length > 0
        && evaluatedCandidates.every((candidate) => candidate.previewOutcome !== 'ready'),
      selectedByTieBreakerBecausePreviewUnavailable: false,
      strategy: 'singlePass',
      capClass: 'standard256',
    },
  };
}

function summarizeSeatMatrix(evaluatedCandidates: readonly CandidateEntry[]): PolicyPreviewSeatMatrixTrace | undefined {
  const byCandidate: Record<string, PolicyPreviewSeatMatrixTrace['byCandidate'][string]> = {};
  for (const candidate of [...evaluatedCandidates].sort((left, right) => left.stableMoveKey.localeCompare(right.stableMoveKey))) {
    if (candidate.previewSeatMatrix === undefined || candidate.previewSeatMatrix.size === 0) {
      continue;
    }
    const perSeatRefs: Record<string, PolicyPreviewSeatMatrixTrace['byCandidate'][string]['perSeatRefs'][string]> = {};
    for (const [refId, seatCells] of [...candidate.previewSeatMatrix.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      if (seatCells.size === 0) {
        continue;
      }
      perSeatRefs[refId] = Object.fromEntries([...seatCells.entries()].sort(([left], [right]) => left.localeCompare(right)));
    }
    if (Object.keys(perSeatRefs).length > 0) {
      byCandidate[candidate.stableMoveKey] = { perSeatRefs };
    }
  }
  return Object.keys(byCandidate).length === 0 ? undefined : { byCandidate };
}

function summarizeGrantFlowContinuation(
  evaluatedCandidates: readonly CandidateEntry[],
  config: CompiledAgentPreviewGrantFlowContinuationConfig,
): PolicyEvaluationGrantFlowContinuationUsage {
  let completed = 0;
  let postGrantCap = 0;
  let freeOperationCap = 0;
  let stochastic = 0;
  let extraDepthReached = 0;

  for (const candidate of evaluatedCandidates) {
    const postGrantDepth = candidate.grantFlowContinuationDepth ?? 0;
    if (postGrantDepth <= 0) {
      continue;
    }
    extraDepthReached = Math.max(extraDepthReached, postGrantDepth);
    switch (candidate.previewDrive?.kind) {
      case 'completed':
        completed += 1;
        break;
      case 'postGrantCap':
        postGrantCap += 1;
        break;
      case 'freeOperationCap':
        freeOperationCap += 1;
        break;
      case 'stochastic':
        stochastic += 1;
        break;
      case 'depthCap':
      case undefined:
        break;
    }
  }

  return {
    enabled: true,
    postGrantDepthCap: config.postGrantDepthCap,
    postGrantCapClass: config.postGrantCapClass,
    freeOperationDepthCap: config.freeOperationDepthCap,
    freeOperationCapClass: config.freeOperationCapClass,
    extraDepthReached,
    exitCounts: {
      completed,
      postGrantCap,
      freeOperationCap,
      stochastic,
    },
  };
}

function previewDecisionContextFromState(
  state: GameState,
  seatId: string,
): PreviewWideningDecisionContext {
  return {
    turnId: Number(state.nextTurnId ?? state.turnCount),
    seatId,
  };
}

function updatePreviewWideningMemory(
  state: PreviewWideningState | undefined,
  decisionClassKey: string | undefined,
  utility: PreviewUtility,
  widenedBecauseUniform: boolean,
): void {
  if (state === undefined || decisionClassKey === undefined) {
    return;
  }
  const [turnIdPart] = decisionClassKey.split(':', 1);
  const currentTurnId = Number(turnIdPart);
  if (Number.isFinite(currentTurnId)) {
    for (const key of state.keys()) {
      const [entryTurnIdPart] = key.split(':', 1);
      if (Number(entryTurnIdPart) < currentTurnId) {
        state.delete(key);
      }
    }
  }
  const previous = state.get(decisionClassKey);
  state.set(decisionClassKey, {
    lastUtility: utility,
    usedWidenSteps: (previous?.usedWidenSteps ?? 0) + (widenedBecauseUniform ? 1 : 0),
  });
}

function summarizeReadyRefStats(
  candidates: readonly CandidateEntry[],
  refIds: readonly string[],
  evaluation: PolicyEvaluationContext,
): Readonly<Record<string, ReadyRefStats>> {
  const stats: Record<string, ReadyRefStats> = {};
  const canonicalCandidates = [...candidates].sort((left, right) => left.canonicalIndex - right.canonicalIndex);
  for (const refId of refIds) {
    const values: number[] = [];
    for (const candidate of canonicalCandidates) {
      const value = evaluation.getResolvedPreviewRefValue(candidate, refId);
      if (value !== undefined) {
        values.push(value);
      }
    }

    if (values.length === 0) {
      stats[refId] = {
        readyCount: 0,
        distinctValueCount: 0,
        min: null,
        max: null,
        range: null,
        allReadyValuesEqual: true,
      };
      continue;
    }

    let min = values[0]!;
    let max = values[0]!;
    const distinct = new Set<number>();
    for (const value of values) {
      distinct.add(value);
      if (value < min) {
        min = value;
      }
      if (value > max) {
        max = value;
      }
    }

    stats[refId] = {
      readyCount: values.length,
      distinctValueCount: distinct.size,
      min,
      max,
      range: max - min,
      allReadyValuesEqual: distinct.size <= 1,
    };
  }
  return stats;
}

export function emptyPreviewUsage(mode: AgentPreviewMode): PolicyEvaluationPreviewUsage {
  return {
    mode,
    evaluatedCandidateCount: 0,
    completionPolicyFallbackCount: 0,
    refIds: [],
    unknownRefs: [],
    readyRefStats: {},
    utility: 'none',
    widenedBecauseUniform: false,
    outcomeBreakdown: emptyOutcomeBreakdown(),
    coverage: {
      requestedRefCount: 0,
      evaluatedRootOptionCount: 0,
      readyRootOptionCount: 0,
      unavailableRootOptionCount: 0,
      allRootsUnavailable: false,
      selectedByTieBreakerBecausePreviewUnavailable: false,
      strategy: 'singlePass',
      capClass: 'standard256',
    },
  };
}

function summarizePreviewOutcomes(evaluatedCandidates: readonly CandidateEntry[]): PolicyPreviewOutcomeBreakdownTrace {
  if (evaluatedCandidates.length === 0) {
    return emptyOutcomeBreakdown();
  }

  let ready = 0;
  let stochastic = 0;
  let random = 0;
  let hidden = 0;
  let unresolved = 0;
  let depthCap = 0;
  let postGrantCap = 0;
  let freeOperationCap = 0;
  let grantFlowPartial = 0;
  let noPreviewDecision = 0;
  let gated = 0;
  let failed = 0;

  for (const candidate of evaluatedCandidates) {
    const outcome = candidate.previewOutcome;
    if (outcome === 'ready') {
      ready += 1;
      continue;
    }
    if (outcome === 'stochastic') {
      stochastic += 1;
      continue;
    }
    if (outcome === 'random') {
      random += 1;
      continue;
    }
    if (outcome === 'hidden') {
      hidden += 1;
      continue;
    }
    if (outcome === 'unresolved') {
      unresolved += 1;
      continue;
    }
    if (outcome === 'depthCap') {
      depthCap += 1;
      continue;
    }
    if (outcome === 'postGrantCap') {
      postGrantCap += 1;
      continue;
    }
    if (outcome === 'freeOperationCap') {
      freeOperationCap += 1;
      continue;
    }
    if (outcome === 'grantFlowPartial') {
      grantFlowPartial += 1;
      continue;
    }
    if (outcome === 'noPreviewDecision') {
      noPreviewDecision += 1;
      continue;
    }
    if (outcome === 'gated') {
      gated += 1;
      continue;
    }
    failed += 1;
  }

  return {
    ready,
    stochastic,
    unknownRandom: random,
    unknownHidden: hidden,
    unknownUnresolved: unresolved,
    unknownDepthCap: depthCap,
    unknownPostGrantCap: postGrantCap,
    unknownFreeOperationCap: freeOperationCap,
    unknownGrantFlowPartial: grantFlowPartial,
    unknownNoPreviewDecision: noPreviewDecision,
    unknownGated: gated,
    unknownFailed: failed,
  };
}

function emptyOutcomeBreakdown(): PolicyPreviewOutcomeBreakdownTrace {
  return {
    ready: 0,
    stochastic: 0,
    unknownRandom: 0,
    unknownHidden: 0,
    unknownUnresolved: 0,
    unknownDepthCap: 0,
    unknownPostGrantCap: 0,
    unknownFreeOperationCap: 0,
    unknownGrantFlowPartial: 0,
    unknownNoPreviewDecision: 0,
    unknownGated: 0,
    unknownFailed: 0,
  };
}

function selectByScalarExpr(
  candidates: readonly CandidateEntry[],
  isBetter: (left: number, right: number) => boolean,
  evaluate: (candidate: CandidateEntry) => PolicyValue,
): readonly CandidateEntry[] {
  const knownValues = candidates
    .map((candidate) => ({ candidate, value: evaluate(candidate) }))
    .filter((entry): entry is { readonly candidate: CandidateEntry; readonly value: number } => typeof entry.value === 'number');
  if (knownValues.length === 0) {
    return candidates;
  }
  let best = knownValues[0]!.value;
  for (const entry of knownValues.slice(1)) {
    if (isBetter(entry.value, best)) {
      best = entry.value;
    }
  }
  return knownValues
    .filter((entry) => entry.value === best)
    .map((entry) => entry.candidate);
}

function selectByPreferredOrder(
  candidates: readonly CandidateEntry[],
  tieBreaker: CompiledPolicyTieBreaker,
  evaluate: (candidate: CandidateEntry) => PolicyValue,
): readonly CandidateEntry[] {
  const orderIndex = new Map((tieBreaker.order ?? []).map((entry, index): readonly [string, number] => [entry, index]));
  let bestRank = Number.POSITIVE_INFINITY;
  const ranked = candidates.map((candidate) => {
    const value = evaluate(candidate);
    const rank = typeof value === 'string' ? (orderIndex.get(value) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
    if (rank < bestRank) {
      bestRank = rank;
    }
    return { candidate, rank };
  });
  if (!Number.isFinite(bestRank)) {
    return candidates;
  }
  return ranked.filter((entry) => entry.rank === bestRank).map((entry) => entry.candidate);
}
