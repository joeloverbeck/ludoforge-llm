import { typeMismatchError } from './eval-error.js';
import { isTokenFilterTraversalError, normalizeTokenFilterTraversalError } from './token-filter-expr-utils.js';

export const mapTokenFilterTraversalToTypeMismatch = (error: unknown): never => {
  if (!isTokenFilterTraversalError(error)) {
    throw error;
  }
  const normalizedError = normalizeTokenFilterTraversalError(error);
  throw typeMismatchError(error.message, {
    ...error.context,
    entryPathSuffix: normalizedError.entryPathSuffix,
    errorFieldSuffix: normalizedError.errorFieldSuffix,
  });
};
