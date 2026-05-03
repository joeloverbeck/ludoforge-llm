import {
  compilePolicyBytecode,
  type PolicyBytecode,
} from '../cnl/policy-bytecode/index.js';
import type {
  AgentParameterValue,
  CompiledPolicyExpr,
  EncodedStateLayout,
  GameDef,
} from '../kernel/index.js';

const NO_PARAMETER_VALUES: Readonly<Record<string, AgentParameterValue>> = {};

const scoreRowBytecodeCache = new WeakMap<
  CompiledPolicyExpr,
  WeakMap<Readonly<Record<string, AgentParameterValue>>, WeakMap<EncodedStateLayout, PolicyBytecode>>
>();

let scoreRowBytecodeCompileCount = 0;

const materializePolicyParams = (
  expr: CompiledPolicyExpr,
  parameterValues: Readonly<Record<string, AgentParameterValue>> | undefined,
): CompiledPolicyExpr => {
  if (expr.kind === 'param') {
    const value = parameterValues?.[expr.id];
    return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string'
      ? { kind: 'literal', value }
      : expr;
  }
  if (expr.kind === 'op') {
    return {
      ...expr,
      args: expr.args.map((arg) => materializePolicyParams(arg, parameterValues)),
    };
  }
  if (expr.kind === 'zoneTokenAgg' && typeof expr.zone !== 'string') {
    return { ...expr, zone: materializePolicyParams(expr.zone, parameterValues) };
  }
  if (expr.kind === 'adjacentTokenAgg' && typeof expr.anchorZone !== 'string') {
    return { ...expr, anchorZone: materializePolicyParams(expr.anchorZone, parameterValues) };
  }
  if (expr.kind === 'seatAgg') {
    return { ...expr, expr: materializePolicyParams(expr.expr, parameterValues) };
  }
  if (expr.kind === 'zoneProp' && typeof expr.zone !== 'string') {
    return { ...expr, zone: materializePolicyParams(expr.zone, parameterValues) };
  }
  return expr;
};

export const getCachedScoreRowBytecode = (
  expr: CompiledPolicyExpr,
  parameterValues: Readonly<Record<string, AgentParameterValue>> | undefined,
  def: GameDef,
  layout: EncodedStateLayout,
): PolicyBytecode => {
  const parameterKey = parameterValues ?? NO_PARAMETER_VALUES;
  let byParameterValues = scoreRowBytecodeCache.get(expr);
  if (byParameterValues === undefined) {
    byParameterValues = new WeakMap();
    scoreRowBytecodeCache.set(expr, byParameterValues);
  }
  let byLayout = byParameterValues.get(parameterKey);
  if (byLayout === undefined) {
    byLayout = new WeakMap();
    byParameterValues.set(parameterKey, byLayout);
  }
  const cached = byLayout.get(layout);
  if (cached !== undefined) {
    return cached;
  }
  const bytecode = compilePolicyBytecode(materializePolicyParams(expr, parameterValues), def, layout);
  scoreRowBytecodeCompileCount += 1;
  byLayout.set(layout, bytecode);
  return bytecode;
};

export const getScoreRowBytecodeCompileCount = (): number => scoreRowBytecodeCompileCount;

export const resetScoreRowBytecodeCompileCount = (): void => {
  scoreRowBytecodeCompileCount = 0;
};
