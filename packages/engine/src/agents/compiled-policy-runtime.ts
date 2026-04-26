import type { CompiledAgentPolicyRef, CompiledPolicyExpr } from '../kernel/types.js';
import type { PolicyEvaluationCandidate, PolicyRuntimeError } from './policy-evaluation-core.js';
import type { PolicyValue } from './policy-surface.js';

export type CompiledPolicyExprClosure = (candidate: PolicyEvaluationCandidate | undefined) => PolicyValue;

export interface CompiledPolicyRuntimeContext {
  resolveCompiledPolicyParam(id: string): PolicyValue;
  resolveCompiledPolicyRef(
    ref: CompiledAgentPolicyRef,
    candidate: PolicyEvaluationCandidate | undefined,
  ): PolicyValue;
  createCompiledPolicyRuntimeError(
    code: string,
    message: string,
    detail?: Readonly<Record<string, unknown>>,
  ): PolicyRuntimeError;
}

export function buildPolicyExprClosure(
  expr: CompiledPolicyExpr,
  context: CompiledPolicyRuntimeContext,
): CompiledPolicyExprClosure {
  switch (expr.kind) {
    case 'literal':
      return () => expr.value === null ? undefined : expr.value;
    case 'param':
      return () => context.resolveCompiledPolicyParam(expr.id);
    case 'ref':
      return (candidate) => context.resolveCompiledPolicyRef(expr.ref, candidate);
    case 'op':
      return buildOpClosure(expr, context);
  }
}

function buildOpClosure(
  expr: Extract<CompiledPolicyExpr, { readonly kind: 'op' }>,
  context: CompiledPolicyRuntimeContext,
): CompiledPolicyExprClosure {
  const args = expr.args.map((arg) => buildPolicyExprClosure(arg, context));
  const values = (candidate: PolicyEvaluationCandidate | undefined): readonly PolicyValue[] =>
    args.map((arg) => arg(candidate));
  const first = (candidate: PolicyEvaluationCandidate | undefined): PolicyValue =>
    args[0]?.(candidate);

  switch (expr.op) {
    case 'add':
      return (candidate) => sumValues(values(candidate));
    case 'sub':
      return (candidate) => binaryNumeric(values(candidate), (left, right) => left - right);
    case 'mul':
      return (candidate) => multiplyValues(values(candidate));
    case 'div':
      return (candidate) => binaryNumeric(values(candidate), (left, right) => {
        if (right === 0) {
          throw context.createCompiledPolicyRuntimeError(
            'RUNTIME_EVALUATION_ERROR',
            'Policy expression division evaluated with a zero denominator.',
          );
        }
        return left / right;
      });
    case 'min':
      return (candidate) => reduceNumeric(values(candidate), (left, right) => Math.min(left, right));
    case 'max':
      return (candidate) => reduceNumeric(values(candidate), (left, right) => Math.max(left, right));
    case 'abs':
      return (candidate) => {
        const entry = first(candidate);
        return typeof entry === 'number' ? Math.abs(entry) : undefined;
      };
    case 'neg':
      return (candidate) => {
        const entry = first(candidate);
        return typeof entry === 'number' ? -entry : undefined;
      };
    case 'eq':
    case 'ne':
      return (candidate) => compareEquality(expr.op === 'eq' ? 'eq' : 'ne', values(candidate));
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const op = expr.op;
      return (candidate) => compareOrder(op, values(candidate));
    }
    case 'and':
      return (candidate) => andValues(values(candidate));
    case 'or':
      return (candidate) => orValues(values(candidate));
    case 'not':
      return (candidate) => {
        const entry = first(candidate);
        return typeof entry === 'boolean' ? !entry : undefined;
      };
    case 'if':
      return (candidate) => evaluateIf(values(candidate));
    case 'in':
      return (candidate) => evaluateIn(values(candidate));
    case 'coalesce':
      return (candidate) => values(candidate).find((entry) => entry !== undefined);
    case 'clamp':
      return (candidate) => evaluateClamp(values(candidate));
    case 'boolToNumber':
      return (candidate) => {
        const entry = first(candidate);
        return typeof entry === 'boolean' ? (entry ? 1 : 0) : undefined;
      };
  }
}

function sumValues(values: readonly PolicyValue[]): PolicyValue {
  const numericValues = values.filter((entry): entry is number => typeof entry === 'number');
  return numericValues.length === values.length
    ? numericValues.reduce((sum, entry) => sum + entry, 0)
    : undefined;
}

function multiplyValues(values: readonly PolicyValue[]): PolicyValue {
  const numericValues = values.filter((entry): entry is number => typeof entry === 'number');
  return numericValues.length === values.length
    ? numericValues.reduce((product, entry) => product * entry, 1)
    : undefined;
}

function binaryNumeric(
  values: readonly PolicyValue[],
  reducer: (left: number, right: number) => number,
): PolicyValue {
  if (values.length !== 2 || typeof values[0] !== 'number' || typeof values[1] !== 'number') {
    return undefined;
  }
  return reducer(values[0], values[1]);
}

function reduceNumeric(
  values: readonly PolicyValue[],
  reducer: (left: number, right: number) => number,
): PolicyValue {
  const numericValues = values.filter((entry): entry is number => typeof entry === 'number');
  if (numericValues.length !== values.length || numericValues.length === 0) {
    return undefined;
  }
  return numericValues.slice(1).reduce((total, entry) => reducer(total, entry), numericValues[0]!);
}

function compareEquality(op: 'eq' | 'ne', values: readonly PolicyValue[]): PolicyValue {
  if (values.length !== 2 || values[0] === undefined || values[1] === undefined) {
    return undefined;
  }
  const equals = deepPolicyEqual(values[0], values[1]);
  return op === 'eq' ? equals : !equals;
}

function compareOrder(op: 'lt' | 'lte' | 'gt' | 'gte', values: readonly PolicyValue[]): PolicyValue {
  if (values.length !== 2 || typeof values[0] !== 'number' || typeof values[1] !== 'number') {
    return undefined;
  }
  if (op === 'lt') return values[0] < values[1];
  if (op === 'lte') return values[0] <= values[1];
  if (op === 'gt') return values[0] > values[1];
  return values[0] >= values[1];
}

function andValues(values: readonly PolicyValue[]): PolicyValue {
  let sawUnknown = false;
  for (const value of values) {
    if (value === false) return false;
    if (value !== true) sawUnknown = true;
  }
  return sawUnknown ? undefined : true;
}

function orValues(values: readonly PolicyValue[]): PolicyValue {
  let sawUnknown = false;
  for (const value of values) {
    if (value === true) return true;
    if (value !== false) sawUnknown = true;
  }
  return sawUnknown ? undefined : false;
}

function evaluateIf(values: readonly PolicyValue[]): PolicyValue {
  if (values.length !== 3 || typeof values[0] !== 'boolean') {
    return undefined;
  }
  return values[0] ? values[1] : values[2];
}

function evaluateIn(values: readonly PolicyValue[]): PolicyValue {
  if (values.length !== 2 || values[0] === undefined || values[1] === undefined) {
    return undefined;
  }
  return Array.isArray(values[1]) ? values[1].includes(String(values[0])) : undefined;
}

function evaluateClamp(values: readonly PolicyValue[]): PolicyValue {
  if (values.length !== 3 || typeof values[0] !== 'number' || typeof values[1] !== 'number' || typeof values[2] !== 'number') {
    return undefined;
  }
  return Math.max(values[1], Math.min(values[2], values[0]));
}

function deepPolicyEqual(left: Exclude<PolicyValue, undefined>, right: Exclude<PolicyValue, undefined>): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((entry, index) => entry === right[index]);
  }
  return left === right;
}
