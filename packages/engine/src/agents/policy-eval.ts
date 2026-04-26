import { asPlayerId, type PlayerId } from '../kernel/branded.js';
import { buildSeatResolutionIndex, resolvePlayerIndexForSeatValue } from '../kernel/identity.js';
import { legalMoves } from '../kernel/legal-moves.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type {
  AgentPreviewMode,
  AgentPreviewCompletionPolicy,
  AgentSelectionMode,
  AgentPolicyCatalog,
  CompiledPolicyConsideration,
  CompiledPolicyTieBreaker,
  GameDef,
  GameState,
  Move,
  PolicyPreviewOutcomeBreakdownTrace,
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
  PolicyPreviewTraceOutcome,
  PolicyPreviewUnavailabilityReason,
} from './policy-preview.js';
import { type PolicyValue } from './policy-surface.js';
import { PolicyEvaluationContext, type PolicyEvaluationCandidate, PolicyRuntimeError } from './policy-evaluation-core.js';
import { resolvePolicyBindingSeatId } from './policy-profile-resolution.js';

const SELECTION_SALT = 0x73656c656374696f6e5f6d6f64655f7274n;
const SELECTION_SEED_MIX = 0x9e3779b97f4a7c15f39cc0605cedc835n;
const TWO_TO_53 = 9007199254740992;
const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const POLICY_EVAL_TRACE_INTERVAL = 25;
let policyEvalCallCount = 0;
let policyEvalDepth = 0;

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

export interface PolicyPreviewUnknownRef {
  readonly refId: string;
  readonly reason: PolicyPreviewUnavailabilityReason;
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
  readonly previewOutcome?: PolicyPreviewTraceOutcome;
  readonly previewDriveDepth?: number;
  readonly previewCompletionPolicy?: AgentPreviewCompletionPolicy;
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
  readonly refIds: readonly string[];
  readonly unknownRefs: readonly PolicyPreviewUnknownRef[];
  readonly outcomeBreakdown: PolicyPreviewOutcomeBreakdownTrace;
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
  readonly selection?: PolicyEvaluationSelectionTrace;
  readonly stateFeatures?: Readonly<Record<string, number | string | boolean>>;
  readonly selectedStableMoveKey: string | null;
  readonly finalScore: number | null;
  readonly previewGatedCount?: number;
  readonly previewGatedTopFlipDetected?: boolean;
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
  previewDriveDepth?: number;
  previewCompletionPolicy?: AgentPreviewCompletionPolicy;
  grantedOperation?: PolicyPreviewGrantedOperation;
  score: number;
}

const EMPTY_TRUSTED_MOVE_INDEX = new Map<string, TrustedExecutableMove>();

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
  const candidates = canonicalizeCandidates(input.def, input.legalMoves);
  const currentDepth = policyEvalDepth;
  logPolicyEvalOomTrace('start', currentDepth, input.state, candidates.length);
  const canonicalOrder = candidates.map((candidate) => candidate.stableMoveKey);
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
      });
    }

    const seatId = resolvePolicyBindingSeatId(input.def, input.playerId);
    if (seatId === null) {
      return failureWithMetadata(candidates, null, requestedProfileId, null, {
        code: 'SEAT_UNRESOLVED',
        message: `Player ${input.playerId} does not resolve to a canonical seat id for policy binding.`,
        detail: { playerId: input.playerId },
      });
    }

    const profileId = input.profileIdOverride ?? catalog.bindingsBySeat[seatId];
    if (profileId === undefined) {
      return failureWithMetadata(candidates, seatId, requestedProfileId, null, {
        code: 'PROFILE_BINDING_MISSING',
        message: `Seat "${seatId}" is not bound to an authored policy profile.`,
        detail: { seatId },
      });
    }

    const profile = catalog.profiles[profileId];
    if (profile === undefined) {
      return failureWithMetadata(candidates, seatId, requestedProfileId, profileId, {
        code: 'PROFILE_MISSING',
        message: `Compiled policy profile "${profileId}" is missing from GameDef.agents.profiles.`,
        detail: { seatId, profileId },
      });
    }

    let evaluationForDispose: PolicyEvaluationContext | undefined;
    try {
      const previewDependencies = {
        ...createGrantedOperationPreviewDependencies(input.def, profileId),
        ...input.previewDependencies,
      } satisfies PolicyPreviewDependencies;
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
        ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
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

      for (const pruningRuleId of profile.use.pruningRules) {
        const pruningRule = catalog.compiled.pruningRules[pruningRuleId];
        if (pruningRule === undefined) {
          throw new PolicyRuntimeError({
            code: 'RUNTIME_EVALUATION_ERROR',
            message: `Unknown pruning rule "${pruningRuleId}".`,
            detail: { pruningRuleId },
          });
        }
        const survivors = activeCandidates.filter((candidate) => {
          const shouldPrune = evaluation.evaluateCompiledExpr(pruningRule.when, candidate);
          if (shouldPrune === true) {
            candidate.prunedBy.push(pruningRuleId);
            return false;
          }
          return true;
        });

        if (survivors.length === 0) {
          if (pruningRule.onEmpty === 'skipRule') {
            activeCandidates.forEach((candidate) => {
              if (candidate.prunedBy.at(-1) === pruningRuleId) {
                candidate.prunedBy.pop();
              }
            });
            pruningSteps.push({
              ruleId: pruningRuleId,
              remainingCandidateCount: activeCandidates.length,
              skippedBecauseEmpty: true,
            });
            continue;
          }
          throw new PolicyRuntimeError({
            code: 'PRUNING_RULE_EMPTIED_CANDIDATES',
            message: `Pruning rule "${pruningRuleId}" removed every candidate.`,
            detail: { pruningRuleId },
          });
        }

        if (survivors.length !== activeCandidates.length) {
          activeCandidates = survivors;
          evaluation.setCurrentCandidates(activeCandidates);
        }
        pruningSteps.push({
          ruleId: pruningRuleId,
          remainingCandidateCount: activeCandidates.length,
          skippedBecauseEmpty: false,
        });
      }

      const considerations = catalog.compiled.considerations;
      const moveConsiderationIds = (profile.use.considerations ?? []).filter(
        (considerationId) => considerations[considerationId]?.scopes?.includes('move') === true,
      );
      const moveOnlyConsiderationIds = moveConsiderationIds.filter(
        (considerationId) => considerations[considerationId]?.costClass !== 'preview',
      );
      const previewTopK = profile.preview.mode === 'disabled'
        ? activeCandidates.length
        : Math.min(profile.preview.topK ?? 4, activeCandidates.length);
      const previewAllowedKeys = pickTopKByMoveOnlyScore(
        evaluation,
        considerations,
        activeCandidates,
        moveOnlyConsiderationIds,
        previewTopK,
      );
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
      for (const candidate of activeCandidates) {
        candidate.score = moveConsiderationIds.reduce((total, considerationId) => (
          total + evaluation.evaluateConsideration(
            considerations,
            considerationId,
            candidate,
            (contribution) => {
              candidate.scoreContributions.push({ termId: considerationId, contribution });
            },
          )
        ), 0);
        evaluation.finalizePreviewOutcome(candidate);
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
          selectionTrace = {
            mode: 'argmax',
            candidateCount: selectionCandidates.length,
            selectedIndex: Math.max(0, selectionCandidates.findIndex((candidate) => candidate.stableMoveKey === selected?.stableMoveKey)),
          };
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
          selectionTrace = {
            mode: 'softmaxSample',
            temperature,
            candidateCount: selectionCandidates.length,
            samplingProbabilities: probabilities,
            selectedIndex: Math.max(0, selectionCandidates.findIndex((candidate) => candidate.stableMoveKey === selected?.stableMoveKey)),
          };
          break;
        }
        case 'weightedSample': {
          const probabilities = computeWeightedSampleProbabilities(selectionCandidates);
          selected = sampleCandidateByProbabilities(
            selectionCandidates,
            probabilities,
            deriveSelectionRngFromVisiblePolicyInputs(profile.fingerprint, selectionCandidates),
          ).selected;
          selectionTrace = {
            mode: 'weightedSample',
            candidateCount: selectionCandidates.length,
            samplingProbabilities: probabilities,
            selectedIndex: Math.max(0, selectionCandidates.findIndex((candidate) => candidate.stableMoveKey === selected?.stableMoveKey)),
          };
          break;
        }
      }

      if (selected === undefined) {
        throw new PolicyRuntimeError({
          code: 'RUNTIME_EVALUATION_ERROR',
          message: 'Policy evaluation did not produce a selectable candidate.',
        });
      }

      const stateFeatures = evaluation.getEvaluatedStateFeatures();
      logPolicyEvalOomTrace(
        'success',
        currentDepth,
        input.state,
        candidates.length,
        ` selectedCandidates=${selectionCandidates.length} finalScore=${selected.score}`,
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
          candidates: candidates.map(candidateMetadata),
          pruningSteps,
          tieBreakChain,
          previewUsage: summarizePreviewUsage(candidates, profile.preview.mode),
          ...(selectionTrace === undefined ? {} : { selection: selectionTrace }),
          ...(Object.keys(stateFeatures).length > 0 ? { stateFeatures } : {}),
          selectedStableMoveKey: selected.stableMoveKey,
          finalScore: Number.isFinite(selected.score) ? selected.score : null,
          previewGatedCount,
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
      canonicalOrder: candidates.map((candidate) => candidate.stableMoveKey),
      candidates: candidates.map(candidateMetadata),
      pruningSteps: [],
      tieBreakChain: [],
      previewUsage: summarizePreviewUsage(candidates, 'exactWorld'),
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
    ...(candidate.previewOutcome === undefined ? {} : { previewOutcome: candidate.previewOutcome }),
    ...(candidate.previewDriveDepth === undefined ? {} : { previewDriveDepth: candidate.previewDriveDepth }),
    ...(candidate.previewCompletionPolicy === undefined ? {} : { previewCompletionPolicy: candidate.previewCompletionPolicy }),
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
    score: candidate.score,
    ...(candidate.previewOutcome === undefined ? {} : { previewOutcome: candidate.previewOutcome }),
    ...(candidate.previewFailureReason === undefined ? {} : { previewFailureReason: candidate.previewFailureReason }),
    ...(candidate.previewDriveDepth === undefined ? {} : { previewDriveDepth: candidate.previewDriveDepth }),
    ...(candidate.previewCompletionPolicy === undefined ? {} : { previewCompletionPolicy: candidate.previewCompletionPolicy }),
    ...(candidate.grantedOperation === undefined ? {} : { grantedOperation: candidate.grantedOperation }),
  };
  return considerationIds.reduce((total, considerationId) => (
    total + evaluation.evaluateConsideration(considerations, considerationId, probe)
  ), 0);
}

function pickTopKByMoveOnlyScore(
  evaluation: PolicyEvaluationContext,
  considerations: Readonly<Record<string, CompiledPolicyConsideration>>,
  candidates: readonly CandidateEntry[],
  moveOnlyConsiderationIds: readonly string[],
  topK: number,
): ReadonlySet<string> {
  if (topK >= candidates.length) {
    return new Set(candidates.map((candidate) => candidate.stableMoveKey));
  }
  if (topK <= 0) {
    return new Set();
  }

  const ranked = candidates.map((candidate) => ({
    candidate,
    score: moveOnlyConsiderationIds.reduce((total, considerationId) => (
      total + evaluation.evaluateConsideration(considerations, considerationId, candidate)
    ), 0),
  }));

  ranked.sort((left, right) => {
    const scoreOrder = right.score - left.score;
    return scoreOrder === 0
      ? left.candidate.stableMoveKey.localeCompare(right.candidate.stableMoveKey)
      : scoreOrder;
  });

  return new Set(ranked.slice(0, topK).map((entry) => entry.candidate.stableMoveKey));
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

function summarizePreviewUsage(candidates: readonly CandidateEntry[], mode: AgentPreviewMode): PolicyEvaluationPreviewUsage {
  const refIds = new Set<string>();
  const unknownRefs = new Map<string, PolicyPreviewUnavailabilityReason>();
  const evaluatedCandidates = candidates.filter((candidate) => candidate.previewRefIds.size > 0);
  for (const candidate of evaluatedCandidates) {
    candidate.previewRefIds.forEach((refId) => refIds.add(refId));
    candidate.unknownPreviewRefs.forEach((reason, refId) => unknownRefs.set(refId, reason));
  }
  return {
    mode,
    evaluatedCandidateCount: evaluatedCandidates.length,
    refIds: [...refIds].sort(),
    unknownRefs: [...unknownRefs.entries()]
      .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
      .map(([refId, reason]) => ({ refId, reason })),
    outcomeBreakdown: summarizePreviewOutcomes(evaluatedCandidates),
  };
}

function emptyPreviewUsage(mode: AgentPreviewMode): PolicyEvaluationPreviewUsage {
  return {
    mode,
    evaluatedCandidateCount: 0,
    refIds: [],
    unknownRefs: [],
    outcomeBreakdown: {
      ready: 0,
      stochastic: 0,
      unknownRandom: 0,
      unknownHidden: 0,
      unknownUnresolved: 0,
      unknownDepthCap: 0,
      unknownNoPreviewDecision: 0,
      unknownGated: 0,
      unknownFailed: 0,
    },
  };
}

function summarizePreviewOutcomes(evaluatedCandidates: readonly CandidateEntry[]): PolicyPreviewOutcomeBreakdownTrace {
  if (evaluatedCandidates.length === 0) {
    return {
      ready: 0,
      stochastic: 0,
      unknownRandom: 0,
      unknownHidden: 0,
      unknownUnresolved: 0,
      unknownDepthCap: 0,
      unknownNoPreviewDecision: 0,
      unknownGated: 0,
      unknownFailed: 0,
    };
  }

  let ready = 0;
  let stochastic = 0;
  let random = 0;
  let hidden = 0;
  let unresolved = 0;
  let depthCap = 0;
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
    unknownNoPreviewDecision: noPreviewDecision,
    unknownGated: gated,
    unknownFailed: failed,
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
