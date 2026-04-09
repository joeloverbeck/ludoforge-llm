import type { ReadContext } from './eval-context.js';
import { missingVarError, typeMismatchError } from './eval-error.js';
import { resolveFreeOperationSequenceKey } from './free-operation-sequence-key.js';
import { matchesResolvedPredicate, type PredicateValue } from './query-predicate.js';
import { tryCompileValueExpr } from './condition-compiler.js';
import { isMembershipScalar } from './value-membership.js';
import type { Token, TokenFilterExpr, TokenFilterPredicate } from './types.js';
import { isPredicateOp } from '../contracts/index.js';

type CompilableFieldAccessor = (token: Token) => unknown;
type CompiledPredicateValueAccessor = (ctx: ReadContext | undefined) => PredicateValue;

export type CompiledTokenFilterFn = (token: Token, ctx?: ReadContext) => boolean;

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

const isPredicateScalarArray = (
  value: unknown,
): value is readonly (string | number | boolean)[] =>
  Array.isArray(value) && value.every((entry) => isMembershipScalar(entry));

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

const compileLiteralPredicateValueAccessor = (
  value: TokenFilterPredicate['value'],
): CompiledPredicateValueAccessor | null => {
  if (Array.isArray(value)) {
    return isLiteralScalarArray(value)
      ? () => value
      : null;
  }
  return isMembershipScalar(value)
    ? () => value
    : null;
};

const requireReadContext = (
  predicate: TokenFilterPredicate,
  ctx: ReadContext | undefined,
): ReadContext => {
  if (ctx !== undefined) {
    return ctx;
  }
  throw typeMismatchError('Compiled token filter requires ReadContext for dynamic predicate values', {
    domain: 'token',
    predicate,
  });
};

const compilePredicateValueAccessor = (
  predicate: TokenFilterPredicate,
): CompiledPredicateValueAccessor | null => {
  const { value } = predicate;
  const literalAccessor = compileLiteralPredicateValueAccessor(value);
  if (literalAccessor !== null) {
    return literalAccessor;
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'ref' in value) {
    if (value.ref === 'grantContext') {
      return (ctx) => {
        const runtimeCtx = requireReadContext(predicate, ctx);
        const grantValue = runtimeCtx.freeOperationOverlay?.grantContext?.[value.key];
        if (grantValue === undefined) {
          throw missingVarError(`Free-operation grant context key not found: ${value.key}`, {
            reference: value,
            availableGrantContextKeys: Object.keys(runtimeCtx.freeOperationOverlay?.grantContext ?? {}).sort(),
          });
        }
        if (isMembershipScalar(grantValue) || isPredicateScalarArray(grantValue)) {
          return grantValue;
        }
        throw typeMismatchError(`Free-operation grant context ${value.key} must resolve to a scalar or scalar array in predicate position`, {
          reference: value,
          key: value.key,
          actualType: Array.isArray(grantValue) ? 'array' : typeof grantValue,
          value: grantValue,
        });
      };
    }

    if (value.ref === 'capturedSequenceZones') {
      return (ctx) => {
        const runtimeCtx = requireReadContext(predicate, ctx);
        const resolvedKey = resolveFreeOperationSequenceKey(value.key, runtimeCtx);
        return resolvedKey === undefined
          ? []
          : (runtimeCtx.freeOperationOverlay?.capturedSequenceZonesByKey?.[resolvedKey] ?? []);
      };
    }

    const compiledValueExpr = tryCompileValueExpr(value);
    if (compiledValueExpr === null) {
      return null;
    }

    return (ctx) => {
      const runtimeCtx = requireReadContext(predicate, ctx);
      const resolved = compiledValueExpr(runtimeCtx);
      if (isMembershipScalar(resolved) || isPredicateScalarArray(resolved)) {
        return resolved;
      }
      throw typeMismatchError('Predicate value must resolve to a scalar or scalar array', {
        predicate,
        resolved,
        actualType: Array.isArray(resolved) ? 'array' : typeof resolved,
      });
    };
  }
  return null;
};

const compilePredicate = (
  predicate: TokenFilterPredicate,
): CompiledTokenFilterFn | null => {
  if (!isPredicateOp(predicate.op)) {
    return null;
  }
  const resolveFieldValue = compileFieldAccessor(predicate);
  if (resolveFieldValue === null) {
    return null;
  }
  const resolvePredicateValue = compilePredicateValueAccessor(predicate);
  if (resolvePredicateValue === null) {
    return null;
  }

  const fieldName = predicate.prop ?? (
    predicate.field?.kind === 'prop' || predicate.field?.kind === 'zoneProp'
      ? predicate.field.prop
      : predicate.field?.kind ?? 'unknown'
  );

  return (token, ctx) =>
    matchesResolvedPredicate(
      resolveFieldValue(token),
      {
        field: fieldName,
        op: predicate.op,
        value: resolvePredicateValue(ctx),
      },
      {
        domain: 'token',
        predicate,
        tokenId: token.id,
      },
    );
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
    return (token, ctx) => !compiledArg(token, ctx);
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
    return (token, ctx) => {
      for (const compiledArg of compiledArgs) {
        if (!compiledArg(token, ctx)) {
          return false;
        }
      }
      return true;
    };
  }

  return (token, ctx) => {
    for (const compiledArg of compiledArgs) {
      if (compiledArg(token, ctx)) {
        return true;
      }
    }
    return false;
  };
};
