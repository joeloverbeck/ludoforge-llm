import { hasEvalErrorDeferClass } from './eval-error-classification.js';
import { EVAL_ERROR_DEFER_CLASS } from './eval-error-defer-class.js';
import { isEvalErrorCode } from './eval-error.js';

export type MissingBindingPolicyContext =
  | 'legalMoves.executorDuringParamEnumeration'
  | 'legalMoves.eventDecisionSequence'
  | 'legalChoices.freeOperationZoneFilterProbe'
  | 'pipeline.discoveryPredicate';

const isDeferrableUnresolvedSelectorCardinality = (error: unknown): boolean => {
  return hasEvalErrorDeferClass(
    error,
    'SELECTOR_CARDINALITY',
    EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY,
  );
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
    case 'legalChoices.freeOperationZoneFilterProbe':
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
