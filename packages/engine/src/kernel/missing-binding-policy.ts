import { isEvalErrorCode } from './eval-error.js';

export type MissingBindingPolicyContext =
  | 'legalMoves.executorDuringParamEnumeration'
  | 'legalMoves.eventDecisionSequence'
  | 'pipeline.discoveryPredicate';

const isDeferrableUnresolvedSelectorCardinality = (error: unknown): boolean => {
  if (!isEvalErrorCode(error, 'SELECTOR_CARDINALITY')) {
    return false;
  }
  const selector = error.context?.selector;
  const resolvedCount = error.context?.resolvedCount;
  return typeof selector === 'string' && selector.startsWith('$') && resolvedCount === 0;
};

/**
 * Centralized policy for when low-level MISSING_BINDING can be treated as
 * recoverable/deferred during discovery-time runtime flows.
 */
export const shouldDeferMissingBinding = (
  error: unknown,
  context: MissingBindingPolicyContext,
): boolean => {
  const isMissingBinding = isEvalErrorCode(error, 'MISSING_BINDING');
  const isSelectorCardinality = isDeferrableUnresolvedSelectorCardinality(error);
  if (!isMissingBinding && !isSelectorCardinality) {
    return false;
  }
  switch (context) {
    case 'legalMoves.executorDuringParamEnumeration':
    case 'pipeline.discoveryPredicate':
      return isMissingBinding;
    case 'legalMoves.eventDecisionSequence':
      return isMissingBinding || isSelectorCardinality;
    default: {
      const unreachable: never = context;
      return unreachable;
    }
  }
};
