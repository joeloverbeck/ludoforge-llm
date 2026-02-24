import { isEvalErrorCode } from './eval-error.js';

export type MissingBindingPolicyContext =
  | 'legalMoves.executorDuringParamEnumeration'
  | 'legalMoves.eventDecisionSequence'
  | 'pipeline.discoveryPredicate';

/**
 * Centralized policy for when low-level MISSING_BINDING can be treated as
 * recoverable/deferred during discovery-time runtime flows.
 */
export const shouldDeferMissingBinding = (
  error: unknown,
  context: MissingBindingPolicyContext,
): boolean => {
  if (!isEvalErrorCode(error, 'MISSING_BINDING')) {
    return false;
  }
  switch (context) {
    case 'legalMoves.executorDuringParamEnumeration':
    case 'legalMoves.eventDecisionSequence':
    case 'pipeline.discoveryPredicate':
      return true;
    default: {
      const unreachable: never = context;
      return unreachable;
    }
  }
};
