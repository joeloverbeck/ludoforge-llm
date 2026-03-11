import type { Diagnostic } from './diagnostics.js';
import type { NumericValueExpr, ValueExpr, ZoneRef } from './types.js';
import { isNumericValueExpr } from './numeric-value-expr.js';
import {
  appendValueExprConditionSurfacePath,
  CONDITION_SURFACE_SUFFIX,
} from '../contracts/index.js';
import {
  type ValidationContext,
  validateZoneSelector,
} from './validate-gamedef-structure.js';
import {
  validateReference,
  validateCanonicalBinding,
} from './validate-behavior-shared.js';

// Lazy cross-module imports (ESM live bindings — safe inside function bodies)
import { validateConditionAst } from './validate-conditions.js';
import { validateOptionsQuery } from './validate-queries.js';

// ---------------------------------------------------------------------------
// Value expression validation
// ---------------------------------------------------------------------------

export const validateValueExpr = (
  diagnostics: Diagnostic[],
  valueExpr: ValueExpr,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof valueExpr === 'number' || typeof valueExpr === 'boolean' || typeof valueExpr === 'string') {
    return;
  }
  if ('scalarArray' in valueExpr) {
    return;
  }

  if ('ref' in valueExpr) {
    validateReference(diagnostics, valueExpr, path, context);
    return;
  }

  if ('concat' in valueExpr) {
    valueExpr.concat.forEach((child, index) => {
      validateValueExpr(diagnostics, child, `${path}.concat[${index}]`, context);
    });
    return;
  }

  if ('op' in valueExpr) {
    validateValueExpr(diagnostics, valueExpr.left, `${path}.left`, context);
    validateValueExpr(diagnostics, valueExpr.right, `${path}.right`, context);
    if (
      (valueExpr.op === '/' || valueExpr.op === 'floorDiv' || valueExpr.op === 'ceilDiv') &&
      typeof valueExpr.right === 'number' &&
      valueExpr.right === 0
    ) {
      diagnostics.push({
        code: 'VALUE_EXPR_DIVISION_BY_ZERO_STATIC',
        path: `${path}.right`,
        severity: 'error',
        message: `ValueExpr "${valueExpr.op}" denominator must not be 0.`,
        suggestion: 'Use a non-zero literal denominator or guard the expression with an if condition.',
      });
    }
    return;
  }

  if ('if' in valueExpr) {
    validateConditionAst(
      diagnostics,
      valueExpr.if.when,
      appendValueExprConditionSurfacePath(path, CONDITION_SURFACE_SUFFIX.valueExpr.ifWhen),
      context,
    );
    validateValueExpr(diagnostics, valueExpr.if.then, `${path}.if.then`, context);
    validateValueExpr(diagnostics, valueExpr.if.else, `${path}.if.else`, context);
    return;
  }

  validateOptionsQuery(diagnostics, valueExpr.aggregate.query, `${path}.aggregate.query`, context);
  if (valueExpr.aggregate.op !== 'count') {
    validateCanonicalBinding(
      diagnostics,
      valueExpr.aggregate.bind,
      `${path}.aggregate.bind`,
      'VALUE_EXPR_AGGREGATE_BIND_INVALID',
      'aggregate.bind',
    );
    validateNumericValueExpr(
      diagnostics,
      valueExpr.aggregate.valueExpr,
      `${path}.aggregate.valueExpr`,
      context,
    );
  }
};

export const validateNumericValueExpr = (
  diagnostics: Diagnostic[],
  valueExpr: NumericValueExpr,
  path: string,
  context: ValidationContext,
): void => {
  validateValueExpr(diagnostics, valueExpr, path, context);
  if (!isNumericValueExpr(valueExpr)) {
    diagnostics.push({
      code: 'VALUE_EXPR_NUMERIC_REQUIRED',
      path,
      severity: 'error',
      message: 'Expected a numeric value expression in this context.',
      suggestion: 'Use number, numeric refs/aggregates, arithmetic, or numeric if-expression branches.',
    });
  }
};

// ---------------------------------------------------------------------------
// Zone reference validation
// ---------------------------------------------------------------------------

export const validateZoneRef = (
  diagnostics: Diagnostic[],
  zoneRef: ZoneRef,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof zoneRef === 'string') {
    validateZoneSelector(diagnostics, zoneRef, path, context);
    return;
  }
  validateValueExpr(diagnostics, zoneRef.zoneExpr, `${path}.zoneExpr`, context);
};
