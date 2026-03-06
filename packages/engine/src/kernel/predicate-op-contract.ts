export const PREDICATE_OPERATORS = ['eq', 'neq', 'in', 'notIn'] as const;

export type PredicateOp = (typeof PREDICATE_OPERATORS)[number];

const PREDICATE_OPERATOR_SET: ReadonlySet<string> = new Set(PREDICATE_OPERATORS);

export function isPredicateOp(op: unknown): op is PredicateOp {
  return typeof op === 'string' && PREDICATE_OPERATOR_SET.has(op);
}
