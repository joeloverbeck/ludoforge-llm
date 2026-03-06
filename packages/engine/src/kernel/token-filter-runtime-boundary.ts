import { typeMismatchError } from './eval-error.js';
import { isTokenFilterTraversalError } from './token-filter-expr-utils.js';

export const mapTokenFilterTraversalToTypeMismatch = (error: unknown): never => {
  if (!isTokenFilterTraversalError(error)) {
    throw error;
  }
  throw typeMismatchError(error.message, { ...error.context });
};
