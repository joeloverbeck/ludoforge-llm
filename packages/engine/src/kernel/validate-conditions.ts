import type { Diagnostic } from './diagnostics.js';
import type { ConditionAST } from './types.js';
import { booleanArityMessage, booleanAritySuggestion, isNonEmptyArray } from './boolean-arity-policy.js';
import {
  type ValidationContext,
  validateZoneSelector,
} from './validate-gamedef-structure.js';
import {
  validateMapSpacePropertyReference,
  validateMarkerStateLiteral,
} from './validate-behavior-shared.js';

// Lazy cross-module import (ESM live bindings — safe inside function bodies)
import { validateValueExpr } from './validate-values.js';

// ---------------------------------------------------------------------------
// Condition AST validation
// ---------------------------------------------------------------------------

export const validateConditionAst = (
  diagnostics: Diagnostic[],
  condition: ConditionAST,
  path: string,
  context: ValidationContext,
): void => {
  if (typeof condition === 'boolean') {
    return;
  }

  switch (condition.op) {
    case 'and':
    case 'or': {
      if (!isNonEmptyArray(condition.args)) {
        diagnostics.push({
          code: 'CONDITION_BOOLEAN_ARITY_INVALID',
          path: `${path}.args`,
          severity: 'error',
          message: booleanArityMessage('condition', condition.op),
          suggestion: booleanAritySuggestion('condition'),
        });
      }
      condition.args.forEach((entry, index) => {
        validateConditionAst(diagnostics, entry, `${path}.args[${index}]`, context);
      });
      return;
    }
    case 'not': {
      validateConditionAst(diagnostics, condition.arg, `${path}.arg`, context);
      return;
    }
    case 'in': {
      validateValueExpr(diagnostics, condition.item, `${path}.item`, context);
      validateValueExpr(diagnostics, condition.set, `${path}.set`, context);
      return;
    }
    case 'adjacent': {
      validateZoneSelector(diagnostics, condition.left, `${path}.left`, context);
      validateZoneSelector(diagnostics, condition.right, `${path}.right`, context);
      return;
    }
    case 'connected': {
      validateZoneSelector(diagnostics, condition.from, `${path}.from`, context);
      validateZoneSelector(diagnostics, condition.to, `${path}.to`, context);
      if (condition.via) {
        validateConditionAst(diagnostics, condition.via, `${path}.via`, context);
      }
      return;
    }
    case 'zonePropIncludes': {
      validateMapSpacePropertyReference(diagnostics, condition.zone, condition.prop, path, context, 'array');
      validateValueExpr(diagnostics, condition.value, `${path}.value`, context);
      return;
    }
    case 'markerStateAllowed': {
      validateZoneSelector(diagnostics, condition.space, `${path}.space`, context);
      validateValueExpr(diagnostics, condition.state, `${path}.state`, context);
      validateMarkerStateLiteral(
        diagnostics,
        condition.marker,
        condition.state,
        `${path}.state`,
        context.markerLatticeStatesById,
      );
      return;
    }
    default: {
      validateValueExpr(diagnostics, condition.left, `${path}.left`, context);
      validateValueExpr(diagnostics, condition.right, `${path}.right`, context);
      if ((condition.op === '==' || condition.op === '!=') && typeof condition.left === 'object' && condition.left !== null) {
        if ('ref' in condition.left && condition.left.ref === 'markerState') {
          validateMarkerStateLiteral(
            diagnostics,
            condition.left.marker,
            condition.right,
            `${path}.right`,
            context.markerLatticeStatesById,
          );
        }
        if ('ref' in condition.left && condition.left.ref === 'globalMarkerState') {
          validateMarkerStateLiteral(
            diagnostics,
            condition.left.marker,
            condition.right,
            `${path}.right`,
            context.globalMarkerLatticeStatesById,
          );
        }
      }

      if ((condition.op === '==' || condition.op === '!=') && typeof condition.right === 'object' && condition.right !== null) {
        if ('ref' in condition.right && condition.right.ref === 'markerState') {
          validateMarkerStateLiteral(
            diagnostics,
            condition.right.marker,
            condition.left,
            `${path}.left`,
            context.markerLatticeStatesById,
          );
        }
        if ('ref' in condition.right && condition.right.ref === 'globalMarkerState') {
          validateMarkerStateLiteral(
            diagnostics,
            condition.right.marker,
            condition.left,
            `${path}.left`,
            context.globalMarkerLatticeStatesById,
          );
        }
      }
    }
  }
};
