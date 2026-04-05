import type { PlayerId } from '../kernel/branded.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type {
  AgentPreviewMode,
  AgentSelectionMode,
  AgentPolicyCatalog,
  CompiledAgentTieBreaker,
  GameDef,
  GameState,
  Move,
  PolicyCompletionStatistics,
  PolicyMovePreparationTrace,
  PolicyPreviewOutcomeBreakdownTrace,
  Rng,
  TrustedExecutableMove,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { createRng, stepRng } from '../kernel/prng.js';
import { pickRandom } from './agent-move-selection.js';
import type { PolicyPreviewTraceOutcome, PolicyPreviewUnavailabilityReason } from './policy-preview.js';
import { type PolicyValue } from './policy-runtime.js';
import { PolicyEvaluationContext, type PolicyEvaluationCandidate, PolicyRuntimeError } from './policy-evaluation-core.js';
import { resolvePolicyBindingSeatId } from './policy-profile-resolution.js';

const SELECTION_SALT = 0x73656c656374696f6e5f6d6f64655f7274n;
const SELECTION_SEED_MIX = 0x9e3779b97f4a7c15f39cc0605cedc835n;
const TWO_TO_53 = 9007199254740992;
const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;

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
  readonly completionStatistics?: PolicyCompletionStatistics;
  readonly movePreparations?: readonly PolicyMovePreparationTrace[];
  readonly stateFeatures?: Readonly<Record<string, number | string | boolean>>;
  readonly selectedStableMoveKey: string | null;
  readonly finalScore: number | null;
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
  readonly rng: Rng;
  readonly runtime?: GameDefRuntime;
  readonly completionStatistics?: PolicyCompletionStatistics;
  readonly movePreparations?: readonly PolicyMovePreparationTrace[];
  readonly fallbackOnError?: boolean;
  readonly profileIdOverride?: string;
}

export type PolicyEvaluationCoreResult =
  | {
      readonly kind: 'success';
      readonly move: Move;
      readonly rng: Rng;
      readonly metadata: PolicyEvaluationMetadata;
    }
  | {
      readonly kind: 'failure';
      readonly failure: PolicyEvaluationFailure;
      readonly metadata: PolicyEvaluationMetadata;
    };

interface CandidateEntry extends PolicyEvaluationCandidate {
  readonly move: Move;
  readonly stableMoveKey: string;
  readonly actionId: string;
  readonly prunedBy: string[];
  readonly scoreContributions: { readonly termId: string; readonly contribution: number }[];
  previewOutcome?: PolicyPreviewTraceOutcome;
  previewFailureReason?: string;
  score: number;
}

function applyTieBreaker(
  evaluation: PolicyEvaluationContext,
  catalog: AgentPolicyCatalog,
  candidates: readonly CandidateEntry[],
  tieBreakerId: string,
  rng: Rng,
): { readonly candidates: readonly CandidateEntry[]; readonly rng: Rng } {
  const tieBreaker = catalog.library.tieBreakers[tieBreakerId];
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
          (candidate) => evaluation.evaluateExpr(tieBreaker.value!, candidate),
        ),
        rng,
      };
    case 'preferredEnumOrder':
    case 'preferredIdOrder':
      return {
        candidates: selectByPreferredOrder(
          candidates,
          tieBreaker,
          (candidate) => evaluation.evaluateExpr(tieBreaker.value!, candidate),
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
  const candidates = canonicalizeCandidates(input.def, input.legalMoves);
  const canonicalOrder = candidates.map((candidate) => candidate.stableMoveKey);
  const requestedProfileId = input.profileIdOverride ?? null;

  if (candidates.length === 0) {
    return {
      kind: 'failure',
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
        ...(input.completionStatistics === undefined ? {} : { completionStatistics: input.completionStatistics }),
        ...(input.movePreparations === undefined ? {} : { movePreparations: input.movePreparations }),
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
    }, null, input.completionStatistics, input.movePreparations);
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
    }, null, input.completionStatistics, input.movePreparations);
  }

  const profile = catalog.profiles[profileId];
  if (profile === undefined) {
    return failureWithMetadata(candidates, seatId, requestedProfileId, profileId, {
      code: 'PROFILE_MISSING',
      message: `Compiled policy profile "${profileId}" is missing from GameDef.agents.profiles.`,
      detail: { seatId, profileId },
    }, null, input.completionStatistics, input.movePreparations);
  }

  try {
    const evaluation = new PolicyEvaluationContext({
      def: input.def,
      state: input.state,
      playerId: input.playerId,
      seatId,
      catalog,
      parameterValues: profile.params,
      trustedMoveIndex: input.trustedMoveIndex,
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
    }, candidates);
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
      const pruningRule = catalog.library.pruningRules[pruningRuleId];
      if (pruningRule === undefined) {
        throw new PolicyRuntimeError({
          code: 'RUNTIME_EVALUATION_ERROR',
          message: `Unknown pruning rule "${pruningRuleId}".`,
          detail: { pruningRuleId },
        });
      }
      const survivors = activeCandidates.filter((candidate) => {
        const shouldPrune = evaluation.evaluateExpr(pruningRule.when, candidate);
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

    const considerations = catalog.library.considerations ?? {};
    const moveConsiderationIds = (profile.use.considerations ?? []).filter(
      (considerationId) => considerations[considerationId]?.scopes?.includes('move') === true,
    );
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
    }
    let rng = input.rng;
    let selected: CandidateEntry | undefined;
    let selectionTrace: PolicyEvaluationSelectionTrace | undefined;
    switch (profile.selection.mode) {
      case 'argmax': {
        const bestScore = activeCandidates.reduce((best, candidate) => Math.max(best, candidate.score), Number.NEGATIVE_INFINITY);
        let bestCandidates = activeCandidates.filter((candidate) => candidate.score === bestScore);

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

        selected = bestCandidates[0] ?? activeCandidates[0];
        selectionTrace = {
          mode: 'argmax',
          candidateCount: activeCandidates.length,
          selectedIndex: Math.max(0, activeCandidates.findIndex((candidate) => candidate.stableMoveKey === selected?.stableMoveKey)),
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
        const probabilities = computeSoftmaxProbabilities(activeCandidates, temperature);
        selected = sampleCandidateByProbabilities(
          activeCandidates,
          probabilities,
          deriveSelectionRngFromVisiblePolicyInputs(profile.fingerprint, activeCandidates),
        ).selected;
        selectionTrace = {
          mode: 'softmaxSample',
          temperature,
          candidateCount: activeCandidates.length,
          samplingProbabilities: probabilities,
          selectedIndex: Math.max(0, activeCandidates.findIndex((candidate) => candidate.stableMoveKey === selected?.stableMoveKey)),
        };
        break;
      }
      case 'weightedSample': {
        const probabilities = computeWeightedSampleProbabilities(activeCandidates);
        selected = sampleCandidateByProbabilities(
          activeCandidates,
          probabilities,
          deriveSelectionRngFromVisiblePolicyInputs(profile.fingerprint, activeCandidates),
        ).selected;
        selectionTrace = {
          mode: 'weightedSample',
          candidateCount: activeCandidates.length,
          samplingProbabilities: probabilities,
          selectedIndex: Math.max(0, activeCandidates.findIndex((candidate) => candidate.stableMoveKey === selected?.stableMoveKey)),
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
    return {
      kind: 'success',
      move: selected.move,
      rng,
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
        ...(input.completionStatistics === undefined ? {} : { completionStatistics: input.completionStatistics }),
        ...(input.movePreparations === undefined ? {} : { movePreparations: input.movePreparations }),
        ...(Object.keys(stateFeatures).length > 0 ? { stateFeatures } : {}),
        selectedStableMoveKey: selected.stableMoveKey,
        finalScore: Number.isFinite(selected.score) ? selected.score : null,
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
    return failureWithMetadata(
      candidates,
      seatId,
      requestedProfileId,
      profileId,
      failure,
      profile.fingerprint,
      input.completionStatistics,
      input.movePreparations,
    );
  }
}

export function evaluatePolicyMove(input: EvaluatePolicyMoveInput): PolicyEvaluationResult {
  const core = evaluatePolicyMoveCore(input);
  if (core.kind === 'success') {
    return core;
  }

  const candidates = canonicalizeCandidates(input.def, input.legalMoves);
  const fallbackCandidate = candidates[0];
  const fallbackMove = fallbackCandidate?.move;
  if (fallbackMove === undefined || input.fallbackOnError === false) {
    throw new PolicyRuntimeError(core.failure);
  }

  return {
    move: fallbackMove,
    rng: input.rng,
    metadata: {
      ...core.metadata,
      selectedStableMoveKey: fallbackCandidate?.stableMoveKey ?? null,
      finalScore: fallbackCandidate === undefined || !Number.isFinite(fallbackCandidate.score) ? null : fallbackCandidate.score,
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
  completionStatistics?: PolicyCompletionStatistics,
  movePreparations?: readonly PolicyMovePreparationTrace[],
): PolicyEvaluationCoreResult {
  return {
    kind: 'failure',
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
      ...(completionStatistics === undefined ? {} : { completionStatistics }),
      ...(movePreparations === undefined ? {} : { movePreparations }),
      selectedStableMoveKey: null,
      finalScore: null,
      usedFallback: false,
      failure,
    },
  };
}

function canonicalizeCandidates(def: GameDef, legalMoves: readonly Move[]): CandidateEntry[] {
  return legalMoves
    .map((move) => ({
      move,
      stableMoveKey: toMoveIdentityKey(def, move),
      actionId: String(move.actionId),
      prunedBy: [],
      scoreContributions: [],
      previewRefIds: new Set<string>(),
      unknownPreviewRefs: new Map<string, PolicyPreviewUnavailabilityReason>(),
      score: Number.NEGATIVE_INFINITY,
    }))
    .sort((left, right) => left.stableMoveKey.localeCompare(right.stableMoveKey));
}

function candidateMetadata(candidate: CandidateEntry): PolicyEvaluationCandidateMetadata {
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
    ...(candidate.previewFailureReason === undefined ? {} : { previewFailureReason: candidate.previewFailureReason }),
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
      unknownFailed: 0,
    };
  }

  let ready = 0;
  let stochastic = 0;
  let random = 0;
  let hidden = 0;
  let unresolved = 0;
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
    failed += 1;
  }

  return {
    ready,
    stochastic,
    unknownRandom: random,
    unknownHidden: hidden,
    unknownUnresolved: unresolved,
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
  tieBreaker: CompiledAgentTieBreaker,
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
