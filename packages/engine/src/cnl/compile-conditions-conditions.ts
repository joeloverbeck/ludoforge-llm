import type { Diagnostic } from '../kernel/diagnostics.js';
import type { ConditionAST } from '../kernel/types.js';
import { CONDITION_OPERATORS } from '../kernel/condition-operator-meta.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';
import {
  type ConditionLoweringContext,
  type ConditionLoweringResult,
  type ConditionLoweringRuntime,
  isRecord,
  lowerBooleanArityTuple,
  lowerZoneSelector,
  missingCapability,
} from './compile-conditions-shared.js';
import { areTypesCompatible, inferValueExprType } from './type-inference.js';

export function createConditionLowerers(
  runtime: ConditionLoweringRuntime,
): Pick<ConditionLoweringRuntime, 'lowerConditionNode'> {
  function lowerConditionArray(
    source: readonly unknown[],
    context: ConditionLoweringContext,
    path: string,
  ): ConditionLoweringResult<readonly ConditionAST[]> {
    const diagnostics: Diagnostic[] = [];
    const values: ConditionAST[] = [];

    source.forEach((entry, index) => {
      const lowered = runtime.lowerConditionNode(entry, context, `${path}.${index}`);
      diagnostics.push(...lowered.diagnostics);
      if (lowered.value !== null) {
        values.push(lowered.value);
      }
    });

    if (diagnostics.length > 0 && values.length !== source.length) {
      return { value: null, diagnostics };
    }

    return { value: values, diagnostics };
  }

  function lowerConditionNode(
    source: unknown,
    context: ConditionLoweringContext,
    path: string,
  ): ConditionLoweringResult<ConditionAST> {
    if (typeof source === 'boolean') {
      return { value: source, diagnostics: [] };
    }
    if (!isRecord(source) || typeof source.op !== 'string') {
      return missingCapability(path, 'condition node', source, CONDITION_OPERATORS);
    }

    switch (source.op) {
      case 'and':
      case 'or': {
        const loweredArgs = lowerBooleanArityTuple<ConditionAST>(
          { op: source.op, args: source.args },
          path,
          `${source.op} condition`,
          ['{ op, args: [...] }'],
          (args) => lowerConditionArray(args, context, `${path}.args`),
        );
        if (loweredArgs.value === null) {
          return { value: null, diagnostics: loweredArgs.diagnostics };
        }
        return {
          value: { op: source.op, args: loweredArgs.value },
          diagnostics: loweredArgs.diagnostics,
        };
      }
      case 'not': {
        const loweredArg = runtime.lowerConditionNode(source.arg, context, `${path}.arg`);
        if (loweredArg.value === null) {
          return loweredArg;
        }
        return { value: { op: 'not', arg: loweredArg.value }, diagnostics: loweredArg.diagnostics };
      }
      case '==':
      case '!=':
      case '<':
      case '<=':
      case '>':
      case '>=': {
        if (source.left === undefined && (source.item !== undefined || source.set !== undefined)) {
          return {
            value: null,
            diagnostics: [{
              code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONDITION_COMPARISON_FIELD_MISMATCH,
              path,
              severity: 'error',
              message: `Comparison "op: ${source.op}" requires "left" and "right" fields, not "item" and "set". `
                + `Use: { op: ${source.op}, left: <value-expr>, right: <value-expr> }.`,
              suggestion: 'Rename "item" to "left" and "set" to "right".',
            }],
          };
        }
        const left = runtime.lowerValueNode(source.left, context, `${path}.left`);
        const right = runtime.lowerValueNode(source.right, context, `${path}.right`);
        const diagnostics = [...left.diagnostics, ...right.diagnostics];
        if (left.value === null || right.value === null) {
          return { value: null, diagnostics };
        }
        if (context.typeInference !== undefined && (source.op === '==' || source.op === '!=')) {
          const leftType = inferValueExprType(left.value, context.typeInference);
          const rightType = inferValueExprType(right.value, context.typeInference);
          if (!areTypesCompatible(leftType, rightType)) {
            diagnostics.push({
              code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONDITION_TYPE_MISMATCH,
              path,
              severity: 'warning',
              message: `Comparison operands have incompatible types: left is ${leftType}, right is ${rightType}. Strict equality will always evaluate to ${source.op === '==' ? 'false' : 'true'}.`,
              suggestion: 'Ensure both sides of the comparison have the same type.',
            });
          }
        }
        return {
          value: { op: source.op, left: left.value, right: right.value },
          diagnostics,
        };
      }
      case 'in': {
        if (source.item === undefined && (source.left !== undefined || source.right !== undefined)) {
          return {
            value: null,
            diagnostics: [{
              code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_CONDITION_MEMBERSHIP_FIELD_MISMATCH,
              path,
              severity: 'error',
              message: `Condition "op: in" requires "item" and "set" fields, not "left" and "right". `
                + `Use: { op: in, item: <value-to-test>, set: <array-or-value-expr> }.`,
              suggestion: 'Rename "left" to "item" and "right" to "set".',
            }],
          };
        }
        const item = runtime.lowerValueNode(source.item, context, `${path}.item`);
        const set = runtime.lowerValueNode(source.set, context, `${path}.set`);
        const diagnostics = [...item.diagnostics, ...set.diagnostics];
        if (item.value === null || set.value === null) {
          return { value: null, diagnostics };
        }
        return {
          value: { op: 'in', item: item.value, set: set.value },
          diagnostics,
        };
      }
      case 'adjacent': {
        const left = lowerZoneSelector(source.left, context, `${path}.left`);
        const right = lowerZoneSelector(source.right, context, `${path}.right`);
        const diagnostics = [...left.diagnostics, ...right.diagnostics];
        if (left.value === null || right.value === null) {
          return { value: null, diagnostics };
        }
        return {
          value: { op: 'adjacent', left: left.value, right: right.value },
          diagnostics,
        };
      }
      case 'zonePropIncludes': {
        if (typeof source.prop !== 'string') {
          return missingCapability(path, 'zonePropIncludes condition', source, [
            '{ op: "zonePropIncludes", zone: <ZoneSel>, prop: string, value: <ValueExpr> }',
          ]);
        }
        const zpiZone = lowerZoneSelector(source.zone, context, `${path}.zone`);
        const zpiValue = runtime.lowerValueNode(source.value, context, `${path}.value`);
        const zpiDiagnostics = [...zpiZone.diagnostics, ...zpiValue.diagnostics];
        if (zpiZone.value === null || zpiValue.value === null) {
          return { value: null, diagnostics: zpiDiagnostics };
        }
        return {
          value: { op: 'zonePropIncludes', zone: zpiZone.value, prop: source.prop, value: zpiValue.value },
          diagnostics: zpiDiagnostics,
        };
      }
      case 'markerStateAllowed': {
        if (typeof source.marker !== 'string') {
          return missingCapability(path, 'markerStateAllowed condition', source, [
            '{ op: "markerStateAllowed", space: <ZoneSel>, marker: string, state: <ValueExpr> }',
          ]);
        }
        const space = lowerZoneSelector(source.space, context, `${path}.space`);
        const state = runtime.lowerValueNode(source.state, context, `${path}.state`);
        const diagnostics = [...space.diagnostics, ...state.diagnostics];
        if (space.value === null || state.value === null) {
          return { value: null, diagnostics };
        }
        return {
          value: { op: 'markerStateAllowed', space: space.value, marker: source.marker, state: state.value },
          diagnostics,
        };
      }
      case 'markerShiftAllowed': {
        if (typeof source.marker !== 'string') {
          return missingCapability(path, 'markerShiftAllowed condition', source, [
            '{ op: "markerShiftAllowed", space: <ZoneSel>, marker: string, delta: <NumericValueExpr> }',
          ]);
        }
        const space = lowerZoneSelector(source.space, context, `${path}.space`);
        const delta = runtime.lowerNumericValueNode(source.delta, context, `${path}.delta`);
        const diagnostics = [...space.diagnostics, ...delta.diagnostics];
        if (space.value === null || delta.value === null) {
          return { value: null, diagnostics };
        }
        return {
          value: { op: 'markerShiftAllowed', space: space.value, marker: source.marker, delta: delta.value },
          diagnostics,
        };
      }
      case 'connected': {
        const from = lowerZoneSelector(source.from, context, `${path}.from`);
        const to = lowerZoneSelector(source.to, context, `${path}.to`);
        const via =
          source.via === undefined ? { value: undefined, diagnostics: [] as readonly Diagnostic[] } : runtime.lowerConditionNode(source.via, context, `${path}.via`);
        const allowTargetOutsideVia = source.allowTargetOutsideVia;
        const allowTargetOutsideViaValue = typeof allowTargetOutsideVia === 'boolean' ? allowTargetOutsideVia : undefined;
        const allowTargetOutsideViaDiagnostic =
          allowTargetOutsideVia === undefined || allowTargetOutsideViaValue !== undefined
            ? []
            : [
                {
                  code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
                  path: `${path}.allowTargetOutsideVia`,
                  severity: 'error' as const,
                  message: 'connected.allowTargetOutsideVia must be a boolean literal.',
                  suggestion: 'Use allowTargetOutsideVia: true or allowTargetOutsideVia: false.',
                },
              ];
        const maxDepth = source.maxDepth;
        const maxDepthValue = typeof maxDepth === 'number' && Number.isInteger(maxDepth) && maxDepth >= 0 ? maxDepth : undefined;
        const maxDepthDiagnostic =
          maxDepth === undefined || maxDepthValue !== undefined
            ? []
            : [
                {
                  code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_MISSING_CAPABILITY,
                  path: `${path}.maxDepth`,
                  severity: 'error' as const,
                  message: 'connected.maxDepth must be an integer literal >= 0.',
                  suggestion: 'Use a non-negative integer literal maxDepth.',
                },
              ];
        const diagnostics = [...from.diagnostics, ...to.diagnostics, ...via.diagnostics, ...allowTargetOutsideViaDiagnostic, ...maxDepthDiagnostic];
        if (
          from.value === null
          || to.value === null
          || via.value === null
          || allowTargetOutsideViaDiagnostic.length > 0
          || maxDepthDiagnostic.length > 0
        ) {
          return { value: null, diagnostics };
        }
        return {
          value: {
            op: 'connected',
            from: from.value,
            to: to.value,
            ...(via.value === undefined ? {} : { via: via.value }),
            ...(allowTargetOutsideViaValue === undefined ? {} : { allowTargetOutsideVia: allowTargetOutsideViaValue }),
            ...(maxDepthValue === undefined ? {} : { maxDepth: maxDepthValue }),
          },
          diagnostics,
        };
      }
      default:
        return missingCapability(path, 'condition operator', source.op, CONDITION_OPERATORS);
    }
  }

  return { lowerConditionNode };
}
