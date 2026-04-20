import type { Agent } from '../kernel/types.js';
import { applyTrustedMove } from '../kernel/apply-move.js';
import { perfStart, perfDynEnd } from '../kernel/perf-profiler.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import { buildCompletionChooseCallback } from './completion-guidance-choice.js';
import { createNoPlayableMoveInvariantError } from './agent-move-selection.js';
import {
  evaluatePolicyMove,
  type PolicyEvaluationFailure,
  type PolicyEvaluationMetadata,
} from './policy-eval.js';
import { buildPolicyAgentDecisionTrace, type PolicyDecisionTraceLevel } from './policy-diagnostics.js';
import { applyPreviewMove, getSeatMargin, type Phase1ActionPreviewEntry } from './policy-preview.js';
import type { PolicyPreviewDependencies } from './policy-preview.js';
import { resolveEffectivePolicyProfile } from './policy-profile-resolution.js';
import { preparePlayableMoves } from './prepare-playable-moves.js';

// Reduced from 5 to 3: 5 random completions per template was excessive for
// policy evaluation. 3 completions provides sufficient diversity for ranking
// while reducing completion work by 40%.
const DEFAULT_COMPLETIONS_PER_TEMPLATE = 3;

const emptyActionFilterFailure = (
  actionId: string,
): PolicyEvaluationFailure => ({
  code: 'PHASE1_ACTION_FILTER_EMPTY',
  message: `PolicyAgent phase-1 selected action "${actionId}" but phase-2 preparation produced no candidates; widened to broader prepared moves.`,
  detail: {
    actionId,
  },
});

export interface PolicyAgentConfig {
  readonly profileId?: string;
  readonly traceLevel?: PolicyDecisionTraceLevel;
  readonly fallbackOnError?: boolean;
  readonly completionsPerTemplate?: number;
  readonly disableGuidedChooser?: boolean;
}

export class PolicyAgent implements Agent {
  private readonly profileId: string | undefined;
  private readonly traceLevel: PolicyDecisionTraceLevel;
  private readonly fallbackOnError: boolean | undefined;
  private readonly completionsPerTemplate: number;
  private readonly disableGuidedChooser: boolean;

  constructor(config: PolicyAgentConfig = {}) {
    const { completionsPerTemplate } = config;
    if (
      completionsPerTemplate !== undefined
      && (!Number.isSafeInteger(completionsPerTemplate) || completionsPerTemplate < 1)
    ) {
      throw new RangeError('PolicyAgent completionsPerTemplate must be a positive safe integer');
    }
    this.profileId = config.profileId;
    this.traceLevel = config.traceLevel ?? 'summary';
    this.fallbackOnError = config.fallbackOnError;
    this.completionsPerTemplate = completionsPerTemplate ?? DEFAULT_COMPLETIONS_PER_TEMPLATE;
    this.disableGuidedChooser = config.disableGuidedChooser ?? false;
  }

  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    const profiler = input.profiler;
    const resolvedProfile = resolveEffectivePolicyProfile(input.def, input.playerId, this.profileId);
    const previewDependencies = createMemoizedPreviewDependencies();
    const choose = resolvedProfile === null
      ? undefined
      : buildCompletionChooseCallback({
        state: input.state,
        def: input.def,
        catalog: resolvedProfile.catalog,
        playerId: input.playerId,
        seatId: resolvedProfile.seatId,
        profile: resolvedProfile.profile,
        ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
      });
    const phase1Preparation = buildPhase1ActionPreviewIndex(
      input,
      resolvedProfile,
      choose,
      profiler,
      this.disableGuidedChooser,
    );
    const phase1EvaluationInput = {
      ...input,
      legalMoves: input.legalMoves.map((classified) => classified.move),
      trustedMoveIndex: new Map(),
      ...(phase1Preparation.index.size === 0 ? {} : { phase1ActionPreviewIndex: phase1Preparation.index }),
      rng: phase1Preparation.rng,
      selectionGrouping: 'actionId' as const,
      previewDependencies,
      ...(this.profileId === undefined ? {} : { profileIdOverride: this.profileId }),
      ...(this.fallbackOnError === undefined ? {} : { fallbackOnError: this.fallbackOnError }),
    };

    const t0_eval = perfStart(profiler);
    const phase1 = evaluatePolicyMove(phase1EvaluationInput);
    perfDynEnd(profiler, 'agent:evaluatePolicyMove', t0_eval);

    const t0_prepare = perfStart(profiler);
    const prepared = preparePlayableMoves(input, {
      pendingTemplateCompletions: this.completionsPerTemplate,
      actionIdFilter: phase1.move.actionId,
      disableGuidedChooser: this.disableGuidedChooser,
      ...(choose === undefined ? {} : { choose }),
    });
    perfDynEnd(profiler, 'agent:preparePlayableMoves', t0_prepare);

    let phase2Prepared = prepared;
    let phase2Failure: PolicyEvaluationFailure | null = null;
    let playableMoves = prepared.completedMoves.length > 0 ? prepared.completedMoves : prepared.stochasticMoves;
    if (playableMoves.length === 0) {
      const t0_broaderPrepare = perfStart(profiler);
      const broaderPrepared = preparePlayableMoves({
        ...input,
        rng: prepared.rng,
      }, {
        pendingTemplateCompletions: this.completionsPerTemplate,
        disableGuidedChooser: this.disableGuidedChooser,
        ...(choose === undefined ? {} : { choose }),
      });
      perfDynEnd(profiler, 'agent:preparePlayableMovesFallback', t0_broaderPrepare);
      const broaderPlayableMoves = (
        broaderPrepared.completedMoves.length > 0 ? broaderPrepared.completedMoves : broaderPrepared.stochasticMoves
      );
      if (broaderPlayableMoves.length > 0) {
        phase2Prepared = broaderPrepared;
        playableMoves = broaderPlayableMoves;
        phase2Failure = emptyActionFilterFailure(String(phase1.move.actionId));
      }
    }
    if (playableMoves.length === 0) {
      throw createNoPlayableMoveInvariantError('PolicyAgent', input.legalMoves.length);
    }
    const trustedMoveIndex = new Map(
      playableMoves.map((trustedMove) => [toMoveIdentityKey(input.def, trustedMove.move), trustedMove] as const),
    );

    const t0_phase2 = perfStart(profiler);
    const phase2 = evaluatePolicyMove({
      ...input,
      legalMoves: playableMoves.map((move) => move.move),
      trustedMoveIndex,
      rng: phase2Prepared.rng,
      completionStatistics: phase2Prepared.statistics,
      movePreparations: phase2Prepared.movePreparations,
      previewDependencies,
      ...(this.profileId === undefined ? {} : { profileIdOverride: this.profileId }),
      ...(this.fallbackOnError === undefined ? {} : { fallbackOnError: this.fallbackOnError }),
    });
    perfDynEnd(profiler, 'agent:evaluatePolicyMovePhase2', t0_phase2);

    const resultMoveKey = toMoveIdentityKey(input.def, phase2.move);
    const trustedMove = trustedMoveIndex.get(resultMoveKey);
    if (trustedMove === undefined) {
      throw new Error('PolicyAgent selected a move that was not present in the trusted candidate set.');
    }

    const phase1ActionRanking = rankActionIdsByBestCandidateScore(phase1.metadata.candidates);

    return {
      move: trustedMove,
      rng: phase2.rng,
      agentDecision: buildPolicyAgentDecisionTrace({
        ...phase2.metadata,
        ...(phase2Failure === null ? {} : { failure: phase2Failure, usedFallback: true }),
        canonicalOrder: phase1.metadata.canonicalOrder,
        candidates: phase1.metadata.candidates,
        pruningSteps: phase1.metadata.pruningSteps,
        tieBreakChain: phase1.metadata.tieBreakChain,
        previewUsage: phase1.metadata.previewUsage,
        ...(phase1.metadata.selection === undefined ? {} : { selection: phase1.metadata.selection }),
        ...(phase1.metadata.stateFeatures === undefined ? {} : { stateFeatures: phase1.metadata.stateFeatures }),
        phase1Score: phase1.metadata.finalScore,
        phase2Score: phase2.metadata.finalScore,
        phase1ActionRanking,
      }, this.traceLevel),
    };
  }
}

function createMemoizedPreviewDependencies(): PolicyPreviewDependencies {
  const applyMoveCache = new Map<string, ReturnType<typeof applyPreviewMove>>();
  return {
    applyMove(def, state, move, options, runtime) {
      const cacheKey = `${state.stateHash}:${toMoveIdentityKey(def, move.move)}`;
      const cached = applyMoveCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
      const applied = applyPreviewMove(def, state, move, options, runtime);
      applyMoveCache.set(cacheKey, applied);
      return applied;
    },
  };
}

function buildPhase1ActionPreviewIndex(
  input: Parameters<Agent['chooseMove']>[0],
  resolvedProfile: ReturnType<typeof resolveEffectivePolicyProfile>,
  choose: ReturnType<typeof buildCompletionChooseCallback> | undefined,
  profiler: Parameters<typeof perfStart>[0],
  disableGuidedChooser: boolean,
): {
    readonly index: ReadonlyMap<string, Phase1ActionPreviewEntry>;
    readonly rng: typeof input.rng;
  } {
  if (resolvedProfile?.profile.preview.phase1 !== true) {
    return { index: new Map(), rng: input.rng };
  }

  const completionBudget = resolvedProfile.profile.preview.phase1CompletionsPerAction ?? 1;
  const actionIds = [...new Set(input.legalMoves.map((classified) => String(classified.move.actionId)))].sort();
  const index = new Map<string, Phase1ActionPreviewEntry>();
  let rng = input.rng;

  const t0_prepare = perfStart(profiler);
  for (const actionId of actionIds) {
    const actionIdFilter = input.legalMoves.find(
      (classified) => String(classified.move.actionId) === actionId,
    )?.move.actionId;
    if (actionIdFilter === undefined) {
      continue;
    }
    const prepared = preparePlayableMoves(
      {
        ...input,
        rng,
      },
      {
        pendingTemplateCompletions: completionBudget,
        actionIdFilter,
        disableGuidedChooser,
        ...(choose === undefined ? {} : { choose }),
      },
    );
    rng = prepared.rng;
    const representative = selectPhase1RepresentativeMove(
      input,
      resolvedProfile.seatId,
      completionBudget,
      prepared.completedMoves,
    );
    if (representative !== undefined) {
      index.set(actionId, {
        actionId,
        trustedMove: representative,
      });
    }
  }
  perfDynEnd(profiler, 'agent:phase1Completions', t0_prepare);

  return { index, rng };
}

function selectPhase1RepresentativeMove(
  input: Parameters<Agent['chooseMove']>[0],
  seatId: string,
  completionBudget: number,
  completedMoves: readonly ReturnType<typeof preparePlayableMoves>['completedMoves'][number][],
): ReturnType<typeof preparePlayableMoves>['completedMoves'][number] | undefined {
  const firstCompletedMove = completedMoves[0];
  if (firstCompletedMove === undefined) {
    return undefined;
  }
  if (completionBudget <= 1 || completedMoves.length <= 1) {
    return firstCompletedMove;
  }

  let bestMove = firstCompletedMove;
  let bestMargin = getProjectedSelfMargin(input, seatId, firstCompletedMove);

  for (let index = 1; index < completedMoves.length; index += 1) {
    const candidate = completedMoves[index];
    if (candidate === undefined) {
      continue;
    }
    const candidateMargin = getProjectedSelfMargin(input, seatId, candidate);
    if (candidateMargin > bestMargin) {
      bestMove = candidate;
      bestMargin = candidateMargin;
    }
  }

  return bestMove;
}

function getProjectedSelfMargin(
  input: Parameters<Agent['chooseMove']>[0],
  seatId: string,
  move: ReturnType<typeof preparePlayableMoves>['completedMoves'][number],
): number {
  const projectedState = applyTrustedMove(
    input.def,
    input.state,
    move,
    undefined,
    input.runtime,
  ).state;
  return getSeatMargin(input.def, projectedState, seatId, input.runtime) ?? Number.NEGATIVE_INFINITY;
}

function rankActionIdsByBestCandidateScore(
  candidates: PolicyEvaluationMetadata['candidates'],
): readonly string[] {
  const bestByActionId = new Map<string, { readonly score: number; readonly stableMoveKey: string }>();
  for (const candidate of candidates) {
    const existing = bestByActionId.get(candidate.actionId);
    if (
      existing === undefined
      || candidate.score > existing.score
      || (candidate.score === existing.score && candidate.stableMoveKey < existing.stableMoveKey)
    ) {
      bestByActionId.set(candidate.actionId, {
        score: candidate.score,
        stableMoveKey: candidate.stableMoveKey,
      });
    }
  }

  return [...bestByActionId.entries()]
    .sort((left, right) => {
      if (right[1].score !== left[1].score) {
        return right[1].score - left[1].score;
      }
      return left[1].stableMoveKey.localeCompare(right[1].stableMoveKey);
    })
    .map(([actionId]) => actionId);
}
