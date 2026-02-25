import type { EvalErrorCode } from './eval-error.js';

export const EVAL_ERROR_DEFER_CLASS = {
  UNRESOLVED_BINDING_SELECTOR_CARDINALITY: 'unresolvedBindingSelectorCardinality',
} as const;

export type EvalErrorDeferClass = (typeof EVAL_ERROR_DEFER_CLASS)[keyof typeof EVAL_ERROR_DEFER_CLASS];

export const EVAL_ERROR_DEFER_CLASSES_BY_CODE = {
  SELECTOR_CARDINALITY: [EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY],
} as const satisfies Partial<Record<EvalErrorCode, readonly EvalErrorDeferClass[]>>;

type EvalErrorDeferClassesByCode = typeof EVAL_ERROR_DEFER_CLASSES_BY_CODE;

export type EvalErrorCodeWithDeferClass = keyof EvalErrorDeferClassesByCode;

export type EvalErrorDeferClassForCode<C extends EvalErrorCodeWithDeferClass> =
  EvalErrorDeferClassesByCode[C][number];
