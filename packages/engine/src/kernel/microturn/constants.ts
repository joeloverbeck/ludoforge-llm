import { DEFAULT_MOVE_ENUMERATION_BUDGETS } from '../move-enumeration-budgets.js';

// Match the existing decision-probe/default completion scale so auto-resolve chains stay bounded.
export const MAX_AUTO_RESOLVE_CHAIN: number = Math.max(
  DEFAULT_MOVE_ENUMERATION_BUDGETS.maxDecisionProbeSteps,
  DEFAULT_MOVE_ENUMERATION_BUDGETS.maxCompletionDecisions,
);

export const CHANCE_RNG_MIX: bigint = 0xbf58476d1ce4e5b9n;
