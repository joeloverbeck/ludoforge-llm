import type { Agent } from '../kernel/types.js';
import { evaluatePolicyMove } from './policy-eval.js';
import { buildPolicyAgentDecisionTrace, type PolicyDecisionTraceLevel } from './policy-diagnostics.js';

export interface PolicyAgentConfig {
  readonly profileId?: string;
  readonly traceLevel?: PolicyDecisionTraceLevel;
  readonly fallbackOnError?: boolean;
}

export class PolicyAgent implements Agent {
  private readonly profileId: string | undefined;
  private readonly traceLevel: PolicyDecisionTraceLevel;
  private readonly fallbackOnError: boolean | undefined;

  constructor(config: PolicyAgentConfig = {}) {
    this.profileId = config.profileId;
    this.traceLevel = config.traceLevel ?? 'summary';
    this.fallbackOnError = config.fallbackOnError;
  }

  chooseMove(input: Parameters<Agent['chooseMove']>[0]): ReturnType<Agent['chooseMove']> {
    const result = evaluatePolicyMove({
      ...input,
      ...(this.profileId === undefined ? {} : { profileIdOverride: this.profileId }),
      ...(this.fallbackOnError === undefined ? {} : { fallbackOnError: this.fallbackOnError }),
    });

    return {
      move: result.move,
      rng: result.rng,
      agentDecision: buildPolicyAgentDecisionTrace(result.metadata, this.traceLevel),
    };
  }
}
