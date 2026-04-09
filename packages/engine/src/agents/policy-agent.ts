import type { Agent } from '../kernel/types.js';
import { perfStart, perfDynEnd } from '../kernel/perf-profiler.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import { NoPlayableMovesAfterPreparationError } from './no-playable-move.js';
import { buildCompletionChooseCallback } from './completion-guidance-choice.js';
import { evaluatePolicyMove, type PolicyEvaluationMetadata } from './policy-eval.js';
import { buildPolicyAgentDecisionTrace, type PolicyDecisionTraceLevel } from './policy-diagnostics.js';
import { resolveEffectivePolicyProfile } from './policy-profile-resolution.js';
import { preparePlayableMoves } from './prepare-playable-moves.js';

// Reduced from 5 to 3: 5 random completions per template was excessive for
// policy evaluation. 3 completions provides sufficient diversity for ranking
// while reducing completion work by 40%.
const DEFAULT_COMPLETIONS_PER_TEMPLATE = 3;

export interface PolicyAgentConfig {
  readonly profileId?: string;
  readonly traceLevel?: PolicyDecisionTraceLevel;
  readonly fallbackOnError?: boolean;
  readonly completionsPerTemplate?: number;
}

export class PolicyAgent implements Agent {
  private readonly profileId: string | undefined;
  private readonly traceLevel: PolicyDecisionTraceLevel;
  private readonly fallbackOnError: boolean | undefined;
  private readonly completionsPerTemplate: number;

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
  }

  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    const profiler = input.profiler;
    const resolvedProfile = resolveEffectivePolicyProfile(input.def, input.playerId, this.profileId);
    const phase1EvaluationInput = {
      ...input,
      legalMoves: input.legalMoves.map((classified) => classified.move),
      trustedMoveIndex: new Map(),
      selectionGrouping: 'actionId' as const,
      ...(this.profileId === undefined ? {} : { profileIdOverride: this.profileId }),
      ...(this.fallbackOnError === undefined ? {} : { fallbackOnError: this.fallbackOnError }),
    };

    const t0_eval = perfStart(profiler);
    const phase1 = evaluatePolicyMove(phase1EvaluationInput);
    perfDynEnd(profiler, 'agent:evaluatePolicyMove', t0_eval);

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

    const t0_prepare = perfStart(profiler);
    const prepared = preparePlayableMoves(input, {
      pendingTemplateCompletions: this.completionsPerTemplate,
      actionIdFilter: phase1.move.actionId,
      ...(choose === undefined ? {} : { choose }),
    });
    perfDynEnd(profiler, 'agent:preparePlayableMoves', t0_prepare);

    const playableMoves = prepared.completedMoves.length > 0 ? prepared.completedMoves : prepared.stochasticMoves;
    if (playableMoves.length === 0) {
      throw new NoPlayableMovesAfterPreparationError('policy', input.legalMoves.length);
    }
    const trustedMoveIndex = new Map(
      playableMoves.map((trustedMove) => [toMoveIdentityKey(input.def, trustedMove.move), trustedMove] as const),
    );

    const t0_phase2 = perfStart(profiler);
    const phase2 = evaluatePolicyMove({
      ...input,
      legalMoves: playableMoves.map((move) => move.move),
      trustedMoveIndex,
      rng: prepared.rng,
      completionStatistics: prepared.statistics,
      movePreparations: prepared.movePreparations,
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
