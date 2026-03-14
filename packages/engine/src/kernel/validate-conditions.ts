import type { Diagnostic } from './diagnostics.js';
import type { ConditionAST } from './types.js';
import { booleanArityMessage, booleanAritySuggestion, isNonEmptyArray } from './boolean-arity-policy.js';
import {
  forEachConditionNestedConditionField,
  forEachConditionNumericValueField,
  forEachConditionValueField,
  forEachConditionZoneSelectorField,
} from './condition-operator-meta.js';
import {
  type ValidationContext,
  validateZoneSelector,
} from './validate-gamedef-structure.js';
import {
  validateMapSpacePropertyReference,
  validateMarkerStateLiteral,
} from './validate-behavior-shared.js';

// Lazy cross-module import (ESM live bindings — safe inside function bodies)
import { validateNumericValueExpr, validateValueExpr } from './validate-values.js';

// ---------------------------------------------------------------------------
// Condition AST validation
// ---------------------------------------------------------------------------

const validateConditionStructure = (
  diagnostics: Diagnostic[],
  condition: Exclude<ConditionAST, boolean>,
  path: string,
  context: ValidationContext,
  options?: {
    readonly skipZoneSelectorFields?: readonly string[];
    readonly skipValueFields?: readonly string[];
    readonly skipNumericValueFields?: readonly string[];
    readonly skipNestedConditionFields?: readonly string[];
  },
): void => {
  const skipZoneSelectorFields = new Set(options?.skipZoneSelectorFields ?? []);
  const skipValueFields = new Set(options?.skipValueFields ?? []);
  const skipNumericValueFields = new Set(options?.skipNumericValueFields ?? []);
  const skipNestedConditionFields = new Set(options?.skipNestedConditionFields ?? []);

  forEachConditionZoneSelectorField(condition, (fieldName, value) => {
    if (skipZoneSelectorFields.has(fieldName)) {
      return;
    }
    validateZoneSelector(diagnostics, value, `${path}.${fieldName}`, context);
  });

  forEachConditionValueField(condition, (fieldName, value) => {
    if (skipValueFields.has(fieldName)) {
      return;
    }
    validateValueExpr(diagnostics, value, `${path}.${fieldName}`, context);
  });

  forEachConditionNumericValueField(condition, (fieldName, value) => {
    if (skipNumericValueFields.has(fieldName)) {
      return;
    }
    validateNumericValueExpr(
      diagnostics,
      value,
      `${path}.${fieldName}`,
      context,
    );
  });

  forEachConditionNestedConditionField(condition, (fieldName, nested) => {
    if (skipNestedConditionFields.has(fieldName)) {
      return;
    }
    if (Array.isArray(nested)) {
      nested.forEach((entry, index) => {
        validateConditionAst(diagnostics, entry, `${path}.${fieldName}[${index}]`, context);
      });
    } else if (nested !== undefined) {
      validateConditionAst(diagnostics, nested as ConditionAST, `${path}.${fieldName}`, context);
    }
  });
};

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
      validateConditionStructure(diagnostics, condition, path, context);
      return;
    }
    case 'not': {
      validateConditionStructure(diagnostics, condition, path, context);
      return;
    }
    case 'in': {
      validateConditionStructure(diagnostics, condition, path, context);
      return;
    }
    case 'adjacent': {
      validateConditionStructure(diagnostics, condition, path, context);
      return;
    }
    case 'connected': {
      validateConditionStructure(diagnostics, condition, path, context);
      return;
    }
    case 'zonePropIncludes': {
      validateMapSpacePropertyReference(diagnostics, condition.zone, condition.prop, path, context, 'array');
      validateConditionStructure(diagnostics, condition, path, context, { skipZoneSelectorFields: ['zone'] });
      return;
    }
    case 'markerStateAllowed': {
      validateConditionStructure(diagnostics, condition, path, context);
      validateMarkerStateLiteral(
        diagnostics,
        condition.marker,
        condition.state,
        `${path}.state`,
        context.markerLatticeStatesById,
      );
      return;
    }
    case 'markerShiftAllowed': {
      validateConditionStructure(diagnostics, condition, path, context);
      return;
    }
    default: {
      validateConditionStructure(diagnostics, condition, path, context);
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
