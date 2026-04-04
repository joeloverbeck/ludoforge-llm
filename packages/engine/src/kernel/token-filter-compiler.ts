import { typeMismatchError } from './eval-error.js';
import { isMembershipScalar } from './value-membership.js';
import type { Token, TokenFilterExpr, TokenFilterPredicate } from './types.js';

type CompilableFieldAccessor = (token: Token) => unknown;

export type CompiledTokenFilterFn = (token: Token) => boolean;

const isLiteralScalarArray = (
  value: TokenFilterPredicate['value'],
): value is readonly (string | number | boolean)[] => {
  if (!Array.isArray(value)) {
    return false;
  }
  if (value.length === 0) {
    return true;
  }
  let expectedType: string | null = null;
  for (const entry of value) {
    if (!isMembershipScalar(entry)) {
      return false;
    }
    const entryType = typeof entry;
    if (expectedType === null) {
      expectedType = entryType;
      continue;
    }
    if (entryType !== expectedType) {
      return false;
    }
  }
  return true;
};

const compileFieldAccessor = (
  predicate: TokenFilterPredicate,
): CompilableFieldAccessor | null => {
  if (predicate.field?.kind === 'zoneProp' || predicate.field?.kind === 'tokenZone') {
    return null;
  }
  if (predicate.field?.kind === 'tokenId') {
    return (token) => token.id;
  }

  const fieldName = predicate.prop ?? predicate.field?.prop;
  if (fieldName === undefined) {
    return null;
  }
  if (fieldName === 'id') {
    return (token) => token.id;
  }
  return (token) => token.props[fieldName];
};

const compilePredicate = (
  predicate: TokenFilterPredicate,
): CompiledTokenFilterFn | null => {
  const resolveFieldValue = compileFieldAccessor(predicate);
  if (resolveFieldValue === null) {
    return null;
  }

  if (Array.isArray(predicate.value)) {
    if (!isLiteralScalarArray(predicate.value)) {
      return null;
    }

    const expectedType = predicate.value.length === 0 ? null : typeof predicate.value[0];
    const membership = new Set(predicate.value);
    switch (predicate.op) {
      case 'in':
        return (token) => {
          const fieldValue = resolveFieldValue(token);
          if (fieldValue === undefined) {
            return false;
          }
          if (!isMembershipScalar(fieldValue)) {
            throw typeMismatchError('Predicate membership item value must be a scalar', {
              domain: 'token',
              predicate,
              tokenId: token.id,
              actualType: Array.isArray(fieldValue) ? 'array' : typeof fieldValue,
              value: fieldValue,
            });
          }
          if (expectedType !== null && typeof fieldValue !== expectedType) {
            throw typeMismatchError('Predicate membership item/set scalar types must match', {
              domain: 'token',
              predicate,
              tokenId: token.id,
              itemType: typeof fieldValue,
              setType: expectedType,
              itemValue: fieldValue,
              setValue: predicate.value,
            });
          }
          return membership.has(fieldValue);
        };
      case 'notIn':
        return (token) => {
          const fieldValue = resolveFieldValue(token);
          if (fieldValue === undefined) {
            return false;
          }
          if (!isMembershipScalar(fieldValue)) {
            throw typeMismatchError('Predicate membership item value must be a scalar', {
              domain: 'token',
              predicate,
              tokenId: token.id,
              actualType: Array.isArray(fieldValue) ? 'array' : typeof fieldValue,
              value: fieldValue,
            });
          }
          if (expectedType !== null && typeof fieldValue !== expectedType) {
            throw typeMismatchError('Predicate membership item/set scalar types must match', {
              domain: 'token',
              predicate,
              tokenId: token.id,
              itemType: typeof fieldValue,
              setType: expectedType,
              itemValue: fieldValue,
              setValue: predicate.value,
            });
          }
          return !membership.has(fieldValue);
        };
      default:
        return null;
    }
  }

  if (!isMembershipScalar(predicate.value)) {
    return null;
  }

  switch (predicate.op) {
    case 'eq':
      return (token) => {
        const fieldValue = resolveFieldValue(token);
        return fieldValue !== undefined && fieldValue === predicate.value;
      };
    case 'neq':
      return (token) => {
        const fieldValue = resolveFieldValue(token);
        return fieldValue !== undefined && fieldValue !== predicate.value;
      };
    default:
      return null;
  }
};

export const tryCompileTokenFilter = (
  expr: TokenFilterExpr,
): CompiledTokenFilterFn | null => {
  if ('value' in expr) {
    return compilePredicate(expr);
  }

  if (expr.op === 'not') {
    const compiledArg = tryCompileTokenFilter(expr.arg);
    if (compiledArg === null) {
      return null;
    }
    return (token) => !compiledArg(token);
  }

  if ((expr.op !== 'and' && expr.op !== 'or') || expr.args.length === 0) {
    return null;
  }

  const compiledArgs: CompiledTokenFilterFn[] = [];
  for (const arg of expr.args) {
    const compiledArg = tryCompileTokenFilter(arg);
    if (compiledArg === null) {
      return null;
    }
    compiledArgs.push(compiledArg);
  }

  if (expr.op === 'and') {
    return (token) => {
      for (const compiledArg of compiledArgs) {
        if (!compiledArg(token)) {
          return false;
        }
      }
      return true;
    };
  }

  return (token) => {
    for (const compiledArg of compiledArgs) {
      if (compiledArg(token)) {
        return true;
      }
    }
    return false;
  };
};
