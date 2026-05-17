import {
  compilePolicyBytecode,
  type PolicyBytecode,
} from '../cnl/policy-bytecode/index.js';
import { isPolicyWasmTimingProfileEnabled } from './policy-wasm-timing-profile.js';
import type {
  AgentPolicyCatalog,
  AgentParameterValue,
  CompiledPolicyExpr,
  EncodedStateLayout,
  GameDef,
} from '../kernel/index.js';

const NO_PARAMETER_VALUES: Readonly<Record<string, AgentParameterValue>> = {};

export interface PolicyWasmBytecodeCacheAxisStats {
  readonly hits: number;
  readonly misses: number;
  readonly compileTimeMs: number;
}

const scoreRowBytecodeCache = new WeakMap<
  CompiledPolicyExpr,
  WeakMap<Readonly<Record<string, AgentParameterValue>>, WeakMap<EncodedStateLayout, PolicyBytecode>>
>();

let scoreRowBytecodeCompileCount = 0;
let scoreRowBytecodeCacheHitCount = 0;
let scoreRowBytecodeCacheMissCount = 0;
let scoreRowBytecodeCompileTimeMs = 0;
const scoreRowBytecodeAxisStats = new Map<string, PolicyWasmBytecodeCacheAxisStats>();

const compareOrdinalStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const addAxisStats = (
  axisLabel: string | undefined,
  delta: PolicyWasmBytecodeCacheAxisStats,
): void => {
  if (axisLabel === undefined || !isPolicyWasmTimingProfileEnabled()) {
    return;
  }
  const current = scoreRowBytecodeAxisStats.get(axisLabel) ?? { hits: 0, misses: 0, compileTimeMs: 0 };
  scoreRowBytecodeAxisStats.set(axisLabel, {
    hits: current.hits + delta.hits,
    misses: current.misses + delta.misses,
    compileTimeMs: current.compileTimeMs + delta.compileTimeMs,
  });
};

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
  axisLabel?: string,
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
    scoreRowBytecodeCacheHitCount += 1;
    addAxisStats(axisLabel, { hits: 1, misses: 0, compileTimeMs: 0 });
    return cached;
  }
  const startedAt = performance.now();
  const bytecode = compilePolicyBytecode(materializePolicyParams(expr, parameterValues), def, layout);
  const compileTimeMs = performance.now() - startedAt;
  scoreRowBytecodeCompileCount += 1;
  scoreRowBytecodeCacheMissCount += 1;
  scoreRowBytecodeCompileTimeMs += compileTimeMs;
  addAxisStats(axisLabel, { hits: 0, misses: 1, compileTimeMs });
  byLayout.set(layout, bytecode);
  return bytecode;
};

const isRuntimeCompiledScoreExpr = (expr: CompiledPolicyExpr | undefined): expr is CompiledPolicyExpr =>
  expr !== undefined && expr.kind !== 'literal';

export const precompilePolicyWasmScoreRows = (
  def: GameDef,
  layout: EncodedStateLayout,
  catalog: AgentPolicyCatalog,
  profileId: string,
): number => {
  const profile = catalog.profiles[profileId];
  if (profile === undefined) {
    return 0;
  }
  const before = scoreRowBytecodeCompileCount;
  for (const featureId of profile.plan.candidateFeatures) {
    const feature = catalog.compiled.candidateFeatures[featureId];
    if (feature?.costClass === 'preview' && isRuntimeCompiledScoreExpr(feature.expr)) {
      getCachedScoreRowBytecode(feature.expr, profile.params, def, layout);
    }
  }
  for (const considerationId of profile.use.considerations ?? []) {
    const consideration = catalog.compiled.considerations[considerationId];
    if (consideration?.scopes?.includes('move') !== true) {
      continue;
    }
    if (isRuntimeCompiledScoreExpr(consideration.when)) {
      getCachedScoreRowBytecode(consideration.when, profile.params, def, layout);
    }
    if (isRuntimeCompiledScoreExpr(consideration.weight)) {
      getCachedScoreRowBytecode(consideration.weight, profile.params, def, layout);
    }
    if (isRuntimeCompiledScoreExpr(consideration.value)) {
      getCachedScoreRowBytecode(consideration.value, profile.params, def, layout);
    }
  }
  return scoreRowBytecodeCompileCount - before;
};

export const getScoreRowBytecodeCompileCount = (): number => scoreRowBytecodeCompileCount;
export const getScoreRowBytecodeCacheHitCount = (): number => scoreRowBytecodeCacheHitCount;
export const getScoreRowBytecodeCacheMissCount = (): number => scoreRowBytecodeCacheMissCount;
export const getScoreRowBytecodeCompileTimeMs = (): number => scoreRowBytecodeCompileTimeMs;

export const snapshotPolicyWasmBytecodeCacheAxisStats = (): Record<string, PolicyWasmBytecodeCacheAxisStats> =>
  Object.fromEntries([...scoreRowBytecodeAxisStats.entries()].sort(([left], [right]) => compareOrdinalStrings(left, right)));

export const resetScoreRowBytecodeCompileCount = (): void => {
  scoreRowBytecodeCompileCount = 0;
  scoreRowBytecodeCacheHitCount = 0;
  scoreRowBytecodeCacheMissCount = 0;
  scoreRowBytecodeCompileTimeMs = 0;
  scoreRowBytecodeAxisStats.clear();
};
