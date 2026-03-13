import { resolveBindingTemplate } from './binding-template.js';
import type { ReadContext } from './eval-context.js';
import { missingBindingError, missingVarError, typeMismatchError } from './eval-error.js';
import { evalValue } from './eval-value.js';
import { resolveFreeOperationSequenceKey } from './free-operation-sequence-key.js';
import type { AssetRowPredicate, TokenFilterPredicate, ValueExpr } from './types.js';
import type { PredicateValue } from './query-predicate.js';

type PredicateRuntimeValue = TokenFilterPredicate['value'] | AssetRowPredicate['value'] | ValueExpr;
interface PredicateValueResolutionOptions {
  readonly missingBinding?: 'bindingError' | 'varError';
  readonly missingGrantContext?: 'error' | 'emptySet';
}

function isScalarValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isPredicateScalarArray(value: unknown): value is readonly (string | number | boolean)[] {
  return Array.isArray(value) && value.every((entry) => isScalarValue(entry));
}

function resolveRuntimePredicateReference(
  value: PredicateRuntimeValue,
  ctx: ReadContext,
  options: PredicateValueResolutionOptions,
): PredicateValue | null {
  if (typeof value !== 'object' || value === null || !('ref' in value)) {
    return null;
  }

  if (value.ref === 'binding') {
    const resolvedName = resolveBindingTemplate(value.name, ctx.bindings);
    const bindingValue = ctx.bindings[resolvedName];
    if (bindingValue === undefined) {
      const createMissingBinding =
        options.missingBinding === 'bindingError' ? missingBindingError : missingVarError;
      throw createMissingBinding(`Binding not found: ${resolvedName}`, {
        reference: value,
        binding: resolvedName,
        bindingTemplate: value.name,
        availableBindings: Object.keys(ctx.bindings).sort(),
      });
    }
    if (isScalarValue(bindingValue) || isPredicateScalarArray(bindingValue)) {
      return bindingValue;
    }
    throw typeMismatchError(`Binding ${resolvedName} must resolve to a scalar or scalar array in predicate position`, {
      reference: value,
      binding: resolvedName,
      bindingTemplate: value.name,
      actualType: Array.isArray(bindingValue) ? 'array' : typeof bindingValue,
      value: bindingValue,
    });
  }

  if (value.ref === 'grantContext') {
    const grantValue = ctx.freeOperationOverlay?.grantContext?.[value.key];
    if (grantValue === undefined) {
      if (options.missingGrantContext === 'emptySet') {
        return [];
      }
      throw missingVarError(`Free-operation grant context key not found: ${value.key}`, {
        reference: value,
        availableGrantContextKeys: Object.keys(ctx.freeOperationOverlay?.grantContext ?? {}).sort(),
      });
    }
    if (isScalarValue(grantValue) || isPredicateScalarArray(grantValue)) {
      return grantValue;
    }
    throw typeMismatchError(`Free-operation grant context ${value.key} must resolve to a scalar or scalar array in predicate position`, {
      reference: value,
      key: value.key,
      actualType: Array.isArray(grantValue) ? 'array' : typeof grantValue,
      value: grantValue,
    });
  }

  if (value.ref === 'capturedSequenceZones') {
    const resolvedKey = resolveFreeOperationSequenceKey(value.key, ctx);
    return resolvedKey === undefined
      ? []
      : (ctx.freeOperationOverlay?.capturedSequenceZonesByKey?.[resolvedKey] ?? []);
  }

  return null;
}

export function resolvePredicateValue(
  value: PredicateRuntimeValue,
  ctx: ReadContext,
  options: PredicateValueResolutionOptions = { missingBinding: 'varError' },
): PredicateValue {
  if (Array.isArray(value)) {
    return value;
  }
  if (isScalarValue(value)) {
    return value;
  }
  const resolvedReference = resolveRuntimePredicateReference(value, ctx, options);
  if (resolvedReference !== null) {
    return resolvedReference;
  }
  const resolved = evalValue(value as ValueExpr, ctx);
  if (!isScalarValue(resolved) && !isPredicateScalarArray(resolved)) {
    throw typeMismatchError('Predicate value must resolve to a scalar or scalar array', {
      value,
      resolved,
      actualType: Array.isArray(resolved) ? 'array' : typeof resolved,
    });
  }
  return resolved;
}
