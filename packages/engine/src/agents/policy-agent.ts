import type { Agent } from '../kernel/types.js';
import { perfStart, perfDynEnd } from '../kernel/perf-profiler.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import { NoPlayableMovesAfterPreparationError } from './no-playable-move.js';
import { evaluatePolicyMove } from './policy-eval.js';
import { buildPolicyAgentDecisionTrace, type PolicyDecisionTraceLevel } from './policy-diagnostics.js';
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

    const t0_prepare = perfStart(profiler);
    const prepared = preparePlayableMoves(input, {
      pendingTemplateCompletions: this.completionsPerTemplate,
    });
    perfDynEnd(profiler, 'agent:preparePlayableMoves', t0_prepare);

    const playableMoves = prepared.completedMoves.length > 0 ? prepared.completedMoves : prepared.stochasticMoves;
    if (playableMoves.length === 0) {
      throw new NoPlayableMovesAfterPreparationError('policy', input.legalMoves.length);
    }

    const t0_eval = perfStart(profiler);
    const result = evaluatePolicyMove({
      ...input,
      legalMoves: playableMoves.map((move) => move.move),
      rng: prepared.rng,
      ...(this.profileId === undefined ? {} : { profileIdOverride: this.profileId }),
      ...(this.fallbackOnError === undefined ? {} : { fallbackOnError: this.fallbackOnError }),
    });
    perfDynEnd(profiler, 'agent:evaluatePolicyMove', t0_eval);

    const trustedMove = playableMoves.find(
      (candidate) => toMoveIdentityKey(input.def, candidate.move) === toMoveIdentityKey(input.def, result.move),
    );
    if (trustedMove === undefined) {
      throw new Error('PolicyAgent selected a move that was not present in the trusted candidate set.');
    }

    return {
      move: trustedMove,
      rng: result.rng,
      agentDecision: buildPolicyAgentDecisionTrace(result.metadata, this.traceLevel),
    };
  }
}
