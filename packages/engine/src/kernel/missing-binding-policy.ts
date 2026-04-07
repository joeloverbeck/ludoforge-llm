import { hasEvalErrorDeferClass } from './eval-error-classification.js';
import { EVAL_ERROR_DEFER_CLASS } from './eval-error-defer-class.js';
import { isEvalErrorCode } from './eval-error.js';
import type { ProbeResult } from './probe-result.js';
import type { FreeOperationZoneFilterSurface } from './free-operation-zone-filter-contract.js';

export const MISSING_BINDING_POLICY_CONTEXTS = {
  LEGAL_MOVES_EXECUTOR_DURING_PARAM_ENUMERATION: 'legalMoves.executorDuringParamEnumeration',
  LEGAL_MOVES_EVENT_DECISION_SEQUENCE: 'legalMoves.eventDecisionSequence',
  LEGAL_MOVES_PIPELINE_DECISION_SEQUENCE: 'legalMoves.pipelineDecisionSequence',
  LEGAL_MOVES_PLAIN_ACTION_DECISION_SEQUENCE: 'legalMoves.plainActionDecisionSequence',
  LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE: 'legalMoves.freeOperationDecisionSequence',
  LEGAL_CHOICES_FREE_OPERATION_ZONE_FILTER_PROBE: 'legalChoices.freeOperationZoneFilterProbe',
  PIPELINE_DISCOVERY_PREDICATE: 'pipeline.discoveryPredicate',
} as const;

export type MissingBindingPolicyContext =
  (typeof MISSING_BINDING_POLICY_CONTEXTS)[keyof typeof MISSING_BINDING_POLICY_CONTEXTS];

type MissingBindingContextPolicy = {
  readonly deferSelectorCardinality: boolean;
};

const MISSING_BINDING_CONTEXT_POLICIES: Readonly<Record<MissingBindingPolicyContext, MissingBindingContextPolicy>> = {
  [MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EXECUTOR_DURING_PARAM_ENUMERATION]: {
    deferSelectorCardinality: false,
  },
  [MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_EVENT_DECISION_SEQUENCE]: {
    deferSelectorCardinality: true,
  },
  [MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PIPELINE_DECISION_SEQUENCE]: {
    deferSelectorCardinality: false,
  },
  [MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_PLAIN_ACTION_DECISION_SEQUENCE]: {
    deferSelectorCardinality: false,
  },
  [MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE]: {
    deferSelectorCardinality: false,
  },
  [MISSING_BINDING_POLICY_CONTEXTS.LEGAL_CHOICES_FREE_OPERATION_ZONE_FILTER_PROBE]: {
    deferSelectorCardinality: false,
  },
  [MISSING_BINDING_POLICY_CONTEXTS.PIPELINE_DISCOVERY_PREDICATE]: {
    deferSelectorCardinality: false,
  },
};

const isDeferrableUnresolvedSelectorCardinality = (error: unknown): boolean => {
  return hasEvalErrorDeferClass(
    error,
    'SELECTOR_CARDINALITY',
    EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY,
  );
};

const MISSING_BINDING_PROBE_RESULT: ProbeResult<never> = {
  outcome: 'inconclusive',
  reason: 'missingBinding',
};

const SELECTOR_CARDINALITY_PROBE_RESULT: ProbeResult<never> = {
  outcome: 'inconclusive',
  reason: 'selectorCardinality',
};

export const classifyMissingBindingProbeError = (
  error: unknown,
  context: MissingBindingPolicyContext,
): ProbeResult<never> | null => {
  if (isEvalErrorCode(error, 'MISSING_BINDING')) {
    return MISSING_BINDING_PROBE_RESULT;
  }

  if (
    isDeferrableUnresolvedSelectorCardinality(error)
    && MISSING_BINDING_CONTEXT_POLICIES[context].deferSelectorCardinality
  ) {
    return SELECTOR_CARDINALITY_PROBE_RESULT;
  }

  return null;
};

/**
 * Centralized policy for when low-level MISSING_BINDING can be treated as
 * recoverable/deferred during discovery-time runtime flows.
 */
export const shouldDeferMissingBinding = (
  error: unknown,
  context: MissingBindingPolicyContext,
): boolean => classifyMissingBindingProbeError(error, context) !== null;

export const shouldDeferFreeOperationZoneFilterFailure = (
  surface: FreeOperationZoneFilterSurface,
  error: unknown,
): boolean =>
  surface === 'legalChoices' &&
  (
    shouldDeferMissingBinding(error, MISSING_BINDING_POLICY_CONTEXTS.LEGAL_CHOICES_FREE_OPERATION_ZONE_FILTER_PROBE) ||
    (
      isEvalErrorCode(error, 'MISSING_VAR') &&
      (
        typeof error.context?.binding === 'string' ||
        (
          typeof error.context?.query === 'object' &&
          error.context?.query !== null &&
          'query' in error.context.query &&
          (error.context.query as { readonly query?: unknown }).query === 'binding'
        )
      )
    )
  );
