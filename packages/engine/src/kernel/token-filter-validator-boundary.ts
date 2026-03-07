import { booleanArityMessage, booleanAritySuggestion } from './boolean-arity-policy.js';
import type { NormalizedTokenFilterTraversalError } from './token-filter-expr-utils.js';

const assertNever = (value: never): never => {
  throw new Error(`Unhandled token filter traversal error reason: ${String(value)}`);
};

export const tokenFilterTraversalValidatorMessage = (
  error: NormalizedTokenFilterTraversalError,
): string => {
  switch (error.reason) {
    case 'unsupported_operator':
      return `Unsupported token filter operator "${String(error.op)}".`;
    case 'non_conforming_node':
      return `Malformed token filter expression node for operator "${String(error.op)}".`;
    case 'empty_args':
      return booleanArityMessage('tokenFilter', error.op === 'and' || error.op === 'or' ? error.op : 'and');
    default:
      return assertNever(error.reason);
  }
};

export const tokenFilterTraversalValidatorSuggestion = (
  error: NormalizedTokenFilterTraversalError,
): string => {
  switch (error.reason) {
    case 'unsupported_operator':
      return 'Use one of: and, or, not.';
    case 'non_conforming_node':
      return 'Use a predicate leaf or a well-formed and/or/not expression node.';
    case 'empty_args':
      return booleanAritySuggestion('tokenFilter');
    default:
      return assertNever(error.reason);
  }
};
