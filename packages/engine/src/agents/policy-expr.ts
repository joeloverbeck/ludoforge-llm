import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  AgentPolicyCostClass,
  AgentPolicyExpr,
  AgentPolicyLiteral,
  AgentPolicyOperator,
  AgentPolicyValueType,
  CompiledAgentDependencyRefs,
  CompiledAgentPolicyRef,
  CompiledAgentParameterDef,
} from '../kernel/types.js';
import type { GameSpecPolicyExpr } from '../cnl/game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../cnl/compiler-diagnostic-codes.js';
import type {
  AgentPolicyZoneScope,
  AgentPolicyZoneTokenAggOp,
} from '../contracts/index.js';
import {
  AGENT_POLICY_ZONE_TOKEN_AGG_OPS,
  isAgentPolicyZoneFilterOp,
  isAgentPolicyZoneScope,
  isAgentPolicyZoneTokenAggOp,
  isAgentPolicyZoneTokenAggOwner,
} from '../contracts/index.js';

export type InternalPolicyValueType = AgentPolicyValueType | 'unknown';

export interface ResolvedPolicyRef {
  readonly type: InternalPolicyValueType;
  readonly costClass: AgentPolicyCostClass;
  readonly ref: CompiledAgentPolicyRef;
  readonly dependency?: {
    readonly kind: keyof CompiledAgentDependencyRefs;
    readonly id: string;
  };
}

export interface AnalyzePolicyExprContext {
  readonly parameterDefs: Readonly<Record<string, CompiledAgentParameterDef>>;
  resolveRef(refPath: string, path: string): ResolvedPolicyRef | null;
}

export interface PolicyExprAnalysis {
  readonly expr: AgentPolicyExpr;
  readonly valueType: InternalPolicyValueType;
  readonly costClass: AgentPolicyCostClass;
  readonly dependencies: CompiledAgentDependencyRefs;
  readonly isStaticallyZero: boolean;
}

type KnownOperator =
  | 'abs'
  | 'add'
  | 'and'
  | 'boolToNumber'
  | 'clamp'
  | 'coalesce'
  | 'const'
  | 'div'
  | 'eq'
  | 'gt'
  | 'gte'
  | 'if'
  | 'in'
  | 'lt'
  | 'lte'
  | 'max'
  | 'min'
  | 'mul'
  | 'ne'
  | 'neg'
  | 'not'
  | 'or'
  | 'param'
  | 'ref'
  | 'sub'
  | 'globalTokenAgg'
  | 'zoneProp'
  | 'zoneTokenAgg';

const KNOWN_OPERATORS = new Set<KnownOperator>([
  'abs',
  'add',
  'and',
  'boolToNumber',
  'clamp',
  'coalesce',
  'const',
  'div',
  'eq',
  'gt',
  'gte',
  'if',
  'in',
  'lt',
  'lte',
  'max',
  'min',
  'mul',
  'ne',
  'neg',
  'not',
  'or',
  'param',
  'ref',
  'sub',
  'globalTokenAgg',
  'zoneProp',
  'zoneTokenAgg',
]);

export function analyzePolicyExpr(
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  if (expr === null) {
    return createLiteralAnalysis(null, 'unknown', 'state', true);
  }
  if (typeof expr === 'number') {
    return createLiteralAnalysis(expr, 'number', 'state', expr === 0);
  }
  if (typeof expr === 'boolean') {
    return createLiteralAnalysis(expr, 'boolean', 'state', false);
  }
  if (typeof expr === 'string') {
    return createLiteralAnalysis(expr, 'id', 'state', false);
  }
  if (Array.isArray(expr)) {
    if (expr.every((entry) => typeof entry === 'string')) {
      return createLiteralAnalysis(expr, 'idList', 'state', false);
    }
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'Policy expression arrays may only be used as operator argument lists or literal string id lists.',
      suggestion: 'Use a supported policy helper form or a string-id list literal.',
    });
    return null;
  }
  if (typeof expr !== 'object') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'Policy expression must be a scalar, array, or object.',
      suggestion: 'Use a supported policy expression form.',
    });
    return null;
  }

  const entries = Object.entries(expr);
  if (entries.length !== 1) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'Policy expression objects must contain exactly one operator key.',
      suggestion: 'Wrap each helper form in its own single-key object.',
    });
    return null;
  }

  const [operator, value] = entries[0] as [KnownOperator | string, GameSpecPolicyExpr];
  if (!KNOWN_OPERATORS.has(operator as KnownOperator)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: `Unsupported policy expression operator "${operator}".`,
      suggestion: 'Use one of the supported v1 policy expression helpers.',
    });
    return null;
  }

  switch (operator) {
    case 'const':
      return analyzePolicyExpr(value, context, diagnostics, `${path}.const`);
    case 'param':
      return analyzeParamExpr(value, context, diagnostics, `${path}.param`);
    case 'ref':
      return analyzeRefExpr(value, context, diagnostics, `${path}.ref`);
    case 'add':
    case 'mul':
    case 'min':
    case 'max':
      return analyzeNumericListOperator(operator, value, context, diagnostics, path, 2);
    case 'sub':
    case 'div':
      return analyzeNumericListOperator(operator, value, context, diagnostics, path, 2, 2);
    case 'abs':
    case 'neg':
      return analyzeUnaryNumericOperator(operator, value, context, diagnostics, path);
    case 'eq':
    case 'ne':
      return analyzeEqualityOperator(operator, value, context, diagnostics, path);
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
      return analyzeNumericComparisonOperator(operator, value, context, diagnostics, path);
    case 'and':
    case 'or':
      return analyzeBooleanListOperator(operator, value, context, diagnostics, path, 2);
    case 'not':
      return analyzeUnaryBooleanOperator(operator, value, context, diagnostics, path);
    case 'if':
      return analyzeIfOperator(value, context, diagnostics, path);
    case 'in':
      return analyzeInOperator(value, context, diagnostics, path);
    case 'coalesce':
      return analyzeCoalesceOperator(value, context, diagnostics, path);
    case 'clamp':
      return analyzeClampOperator(value, context, diagnostics, path);
    case 'boolToNumber':
      return analyzeBoolToNumberOperator(value, context, diagnostics, path);
    case 'zoneProp':
      return analyzeZonePropOperator(value, context, diagnostics, path);
    case 'globalTokenAgg':
      return analyzeGlobalTokenAggOperator(value, diagnostics, path);
    case 'zoneTokenAgg':
      return analyzeZoneTokenAggOperator(value, context, diagnostics, path);
  }

  return null;
}

function analyzeParamExpr(
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  if (typeof expr !== 'string' || expr.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'Policy param references must be non-empty parameter ids.',
      suggestion: 'Set param to a declared agents parameter id.',
    });
    return null;
  }
  const parameterDef = context.parameterDefs[expr];
  if (parameterDef === undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
      path,
      severity: 'error',
      message: `Policy expression references unknown parameter "${expr}".`,
      suggestion: 'Declare the parameter in doc.agents.parameters before using it in an expression.',
    });
    return null;
  }
  return {
    expr: { kind: 'param', id: expr },
    valueType: parameterTypeToValueType(parameterDef.type),
    costClass: 'state',
    dependencies: { parameters: [expr], stateFeatures: [], candidateFeatures: [], aggregates: [] },
    isStaticallyZero: false,
  };
}

function analyzeRefExpr(
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  if (typeof expr !== 'string' || expr.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'Policy refs must be non-empty strings.',
      suggestion: 'Set ref to an approved policy-visible reference.',
    });
    return null;
  }
  if (expr.startsWith('preview.preview.')) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_PREVIEW_NESTED,
      path,
      severity: 'error',
      message: `Nested preview refs are not allowed in policy expressions ("${expr}").`,
      suggestion: 'Use at most one preview prefix and derive any extra value through named features.',
    });
    return null;
  }
  const resolved = context.resolveRef(expr, path);
  if (resolved === null) {
    return null;
  }
  const dependencies = emptyDependencies();
  if (resolved.dependency !== undefined) {
    switch (resolved.dependency.kind) {
      case 'parameters':
        return withResolvedRef(resolved, { ...dependencies, parameters: [resolved.dependency.id] });
      case 'stateFeatures':
        return withResolvedRef(resolved, { ...dependencies, stateFeatures: [resolved.dependency.id] });
      case 'candidateFeatures':
        return withResolvedRef(resolved, { ...dependencies, candidateFeatures: [resolved.dependency.id] });
      case 'aggregates':
        return withResolvedRef(resolved, { ...dependencies, aggregates: [resolved.dependency.id] });
    }
  }
  return withResolvedRef(resolved, dependencies);
}

function analyzeNumericListOperator(
  operator: string,
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
  minimumArity: number,
  exactArity?: number,
): PolicyExprAnalysis | null {
  const args = expectExpressionArray(expr, diagnostics, `${path}.${operator}`, operator, minimumArity, exactArity);
  if (args === null) {
    return null;
  }
  const analyzed = analyzeChildExpressions(args, context, diagnostics, `${path}.${operator}`);
  if (analyzed === null) {
    return null;
  }
  if (!requireType(analyzed, 'number', diagnostics, path, `${operator} requires number operands.`)) {
    return null;
  }
  if (operator === 'div' && analyzed[1]?.isStaticallyZero === true) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_DIVIDE_BY_ZERO,
      path,
      severity: 'error',
      message: 'Policy expression contains a statically provable divide-by-zero.',
      suggestion: 'Guard the divisor or coalesce it to a non-zero value before division.',
    });
    return null;
  }
  const isZero = operator === 'sub'
    ? analyzed.every((entry) => entry.isStaticallyZero)
    : operator === 'add'
      ? analyzed.every((entry) => entry.isStaticallyZero)
      : false;
  return compileOperatorAnalysis(operator as AgentPolicyOperator, 'number', analyzed, isZero);
}

function analyzeUnaryNumericOperator(
  operator: string,
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  const analyzed = analyzePolicyExpr(expr, context, diagnostics, `${path}.${operator}`);
  if (analyzed === null) {
    return null;
  }
  if (!matchesType(analyzed.valueType, 'number')) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path,
      severity: 'error',
      message: `${operator} requires a number operand.`,
      suggestion: 'Use a numeric policy expression for this operator.',
    });
    return null;
  }
  return compileOperatorAnalysis(operator as AgentPolicyOperator, 'number', [analyzed], analyzed.isStaticallyZero);
}

function analyzeEqualityOperator(
  operator: string,
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  const args = expectExpressionArray(expr, diagnostics, `${path}.${operator}`, operator, 2, 2);
  if (args === null) {
    return null;
  }
  const analyzed = analyzeChildExpressions(args, context, diagnostics, `${path}.${operator}`);
  if (analyzed === null) {
    return null;
  }
  const left = analyzed[0]!;
  const right = analyzed[1]!;
  if (!typesAreCompatible(left.valueType, right.valueType)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path,
      severity: 'error',
      message: `${operator} requires both operands to have compatible types.`,
      suggestion: 'Compare expressions that resolve to the same scalar type.',
    });
    return null;
  }
  return compileOperatorAnalysis(operator as AgentPolicyOperator, 'boolean', analyzed, false);
}

function analyzeNumericComparisonOperator(
  operator: string,
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  const args = expectExpressionArray(expr, diagnostics, `${path}.${operator}`, operator, 2, 2);
  if (args === null) {
    return null;
  }
  const analyzed = analyzeChildExpressions(args, context, diagnostics, `${path}.${operator}`);
  if (analyzed === null) {
    return null;
  }
  if (!requireType(analyzed, 'number', diagnostics, path, `${operator} requires number operands.`)) {
    return null;
  }
  return compileOperatorAnalysis(operator as AgentPolicyOperator, 'boolean', analyzed, false);
}

function analyzeBooleanListOperator(
  operator: string,
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
  minimumArity: number,
): PolicyExprAnalysis | null {
  const args = expectExpressionArray(expr, diagnostics, `${path}.${operator}`, operator, minimumArity);
  if (args === null) {
    return null;
  }
  const analyzed = analyzeChildExpressions(args, context, diagnostics, `${path}.${operator}`);
  if (analyzed === null) {
    return null;
  }
  if (!requireType(analyzed, 'boolean', diagnostics, path, `${operator} requires boolean operands.`)) {
    return null;
  }
  return compileOperatorAnalysis(operator as AgentPolicyOperator, 'boolean', analyzed, false);
}

function analyzeUnaryBooleanOperator(
  operator: string,
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  const analyzed = analyzePolicyExpr(expr, context, diagnostics, `${path}.${operator}`);
  if (analyzed === null) {
    return null;
  }
  if (!matchesType(analyzed.valueType, 'boolean')) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path,
      severity: 'error',
      message: `${operator} requires a boolean operand.`,
      suggestion: 'Use a boolean policy expression for this operator.',
    });
    return null;
  }
  return compileOperatorAnalysis(operator as AgentPolicyOperator, 'boolean', [analyzed], false);
}

function analyzeIfOperator(
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  const args = expectExpressionArray(expr, diagnostics, `${path}.if`, 'if', 3, 3);
  if (args === null) {
    return null;
  }
  const conditionExpr = args[0]!;
  const thenExpr = args[1]!;
  const elseExpr = args[2]!;
  const condition = analyzePolicyExpr(conditionExpr, context, diagnostics, `${path}.if.0`);
  const whenTrue = analyzePolicyExpr(thenExpr, context, diagnostics, `${path}.if.1`);
  const whenFalse = analyzePolicyExpr(elseExpr, context, diagnostics, `${path}.if.2`);
  if (condition === null || whenTrue === null || whenFalse === null) {
    return null;
  }
  if (!matchesType(condition.valueType, 'boolean')) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path,
      severity: 'error',
      message: 'if requires a boolean condition.',
      suggestion: 'Use a boolean condition expression as the first if argument.',
    });
    return null;
  }
  const resultType = unifyCoalescedType(whenTrue.valueType, whenFalse.valueType);
  if (resultType === null) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path,
      severity: 'error',
      message: 'if requires compatible then/else branch types.',
      suggestion: 'Return the same scalar type from both branches.',
    });
    return null;
  }
  return compileOperatorAnalysis('if', resultType, [condition, whenTrue, whenFalse], false);
}

function analyzeInOperator(
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  const args = expectExpressionArray(expr, diagnostics, `${path}.in`, 'in', 2, 2);
  if (args === null) {
    return null;
  }
  const left = analyzePolicyExpr(args[0]!, context, diagnostics, `${path}.in.0`);
  const right = analyzePolicyExpr(args[1]!, context, diagnostics, `${path}.in.1`);
  if (left === null || right === null) {
    return null;
  }
  if (!matchesType(left.valueType, 'id')) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path,
      severity: 'error',
      message: 'in currently requires an id-valued left operand.',
      suggestion: 'Compare an id or enum-like value against an id-list expression.',
    });
    return null;
  }
  if (!matchesType(right.valueType, 'idList')) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path,
      severity: 'error',
      message: 'in currently requires an id-list right operand.',
      suggestion: 'Use an idOrder parameter or a literal string-id list on the right side.',
    });
    return null;
  }
  return compileOperatorAnalysis('in', 'boolean', [left, right], false);
}

function analyzeCoalesceOperator(
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  const args = expectExpressionArray(expr, diagnostics, `${path}.coalesce`, 'coalesce', 2);
  if (args === null) {
    return null;
  }
  const analyzed = analyzeChildExpressions(args, context, diagnostics, `${path}.coalesce`);
  if (analyzed === null) {
    return null;
  }
  let resultType: InternalPolicyValueType | null = null;
  for (const entry of analyzed) {
    if (entry.valueType === 'unknown') {
      continue;
    }
    resultType = resultType === null ? entry.valueType : unifyCoalescedType(resultType, entry.valueType);
    if (resultType === null) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
        path,
        severity: 'error',
        message: 'coalesce requires compatible argument types.',
        suggestion: 'Coalesce only expressions that resolve to the same scalar type.',
      });
      return null;
    }
  }
  if (resultType === null) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path,
      severity: 'error',
      message: 'coalesce must include at least one typed non-null expression.',
      suggestion: 'Provide a fallback value of the intended result type.',
    });
    return null;
  }
  return compileOperatorAnalysis('coalesce', resultType, analyzed, analyzed.every((entry) => entry.isStaticallyZero));
}

function analyzeClampOperator(
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  const args = expectExpressionArray(expr, diagnostics, `${path}.clamp`, 'clamp', 3, 3);
  if (args === null) {
    return null;
  }
  const analyzed = analyzeChildExpressions(args, context, diagnostics, `${path}.clamp`);
  if (analyzed === null) {
    return null;
  }
  if (!requireType(analyzed, 'number', diagnostics, path, 'clamp requires number operands.')) {
    return null;
  }
  return compileOperatorAnalysis('clamp', 'number', analyzed, analyzed[0]?.isStaticallyZero === true);
}

function analyzeBoolToNumberOperator(
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  const analyzed = analyzePolicyExpr(expr, context, diagnostics, `${path}.boolToNumber`);
  if (analyzed === null) {
    return null;
  }
  if (!matchesType(analyzed.valueType, 'boolean')) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path,
      severity: 'error',
      message: 'boolToNumber requires a boolean operand.',
      suggestion: 'Use a boolean policy expression with boolToNumber.',
    });
    return null;
  }
  return compileOperatorAnalysis('boolToNumber', 'number', [analyzed], false);
}

function analyzeChildExpressions(
  expressions: readonly GameSpecPolicyExpr[],
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis[] | null {
  const analyzed: PolicyExprAnalysis[] = [];
  for (const [index, expression] of expressions.entries()) {
    const result = analyzePolicyExpr(expression, context, diagnostics, `${path}.${index}`);
    if (result === null) {
      return null;
    }
    analyzed.push(result);
  }
  return analyzed;
}

function expectExpressionArray(
  expr: GameSpecPolicyExpr,
  diagnostics: Diagnostic[],
  path: string,
  operator: string,
  minimumArity: number,
  exactArity?: number,
): readonly GameSpecPolicyExpr[] | null {
  if (!Array.isArray(expr)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: `${operator} expects an array of arguments.`,
      suggestion: `Rewrite ${operator} using its array argument form.`,
    });
    return null;
  }
  if (expr.length < minimumArity || (exactArity !== undefined && expr.length !== exactArity)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: exactArity === undefined
        ? `${operator} expects at least ${minimumArity} arguments.`
        : `${operator} expects exactly ${exactArity} arguments.`,
      suggestion: 'Adjust the expression arity to match the helper contract.',
    });
    return null;
  }
  return expr;
}

function requireType(
  analyses: readonly PolicyExprAnalysis[],
  expected: AgentPolicyValueType,
  diagnostics: Diagnostic[],
  path: string,
  message: string,
): boolean {
  if (analyses.every((entry) => matchesType(entry.valueType, expected))) {
    return true;
  }
  diagnostics.push({
    code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
    path,
    severity: 'error',
    message,
    suggestion: `Use only ${expected} expressions with this helper.`,
  });
  return false;
}

function createLiteralAnalysis(
  value: AgentPolicyLiteral,
  valueType: InternalPolicyValueType,
  costClass: AgentPolicyCostClass,
  isStaticallyZero: boolean,
): PolicyExprAnalysis {
  return {
    expr: { kind: 'literal', value },
    valueType,
    costClass,
    dependencies: emptyDependencies(),
    isStaticallyZero,
  };
}

function compileOperatorAnalysis(
  operator: AgentPolicyOperator,
  valueType: InternalPolicyValueType,
  analyses: readonly PolicyExprAnalysis[],
  isStaticallyZero: boolean,
): PolicyExprAnalysis {
  return mergeAnalyses(
    {
      kind: 'op',
      op: operator,
      args: analyses.map((entry) => entry.expr),
    },
    valueType,
    analyses,
    isStaticallyZero,
  );
}

function withResolvedRef(
  resolved: ResolvedPolicyRef,
  dependencies: CompiledAgentDependencyRefs,
): PolicyExprAnalysis {
  return {
    expr: { kind: 'ref', ref: resolved.ref },
    valueType: resolved.type,
    costClass: resolved.costClass,
    dependencies,
    isStaticallyZero: false,
  };
}

function mergeAnalyses(
  expr: AgentPolicyExpr,
  valueType: InternalPolicyValueType,
  analyses: readonly PolicyExprAnalysis[],
  isStaticallyZero: boolean,
): PolicyExprAnalysis {
  return {
    expr,
    valueType,
    costClass: analyses.reduce<AgentPolicyCostClass>((highest, entry) => maxCostClass(highest, entry.costClass), 'state'),
    dependencies: mergeDependencies(analyses.map((entry) => entry.dependencies)),
    isStaticallyZero,
  };
}

function mergeDependencies(dependencies: readonly CompiledAgentDependencyRefs[]): CompiledAgentDependencyRefs {
  return {
    parameters: uniqueSorted(dependencies.flatMap((entry) => entry.parameters)),
    stateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.stateFeatures)),
    candidateFeatures: uniqueSorted(dependencies.flatMap((entry) => entry.candidateFeatures)),
    aggregates: uniqueSorted(dependencies.flatMap((entry) => entry.aggregates)),
  };
}

function emptyDependencies(): CompiledAgentDependencyRefs {
  return {
    parameters: [],
    stateFeatures: [],
    candidateFeatures: [],
    aggregates: [],
  };
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function parameterTypeToValueType(type: CompiledAgentParameterDef['type']): AgentPolicyValueType {
  switch (type) {
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'enum':
      return 'id';
    case 'idOrder':
      return 'idList';
  }
}

function maxCostClass(left: AgentPolicyCostClass, right: AgentPolicyCostClass): AgentPolicyCostClass {
  if (left === 'preview' || right === 'preview') {
    return 'preview';
  }
  if (left === 'candidate' || right === 'candidate') {
    return 'candidate';
  }
  return 'state';
}

function matchesType(actual: InternalPolicyValueType, expected: AgentPolicyValueType): boolean {
  return actual === expected || actual === 'unknown';
}

function typesAreCompatible(left: InternalPolicyValueType, right: InternalPolicyValueType): boolean {
  return left === 'unknown' || right === 'unknown' || left === right;
}

function unifyCoalescedType(
  left: InternalPolicyValueType,
  right: InternalPolicyValueType,
): InternalPolicyValueType | null {
  if (left === 'unknown') {
    return right;
  }
  if (right === 'unknown') {
    return left;
  }
  return left === right ? left : null;
}

const ZONE_TOKEN_AGG_OPS = new Set<AgentPolicyZoneTokenAggOp>(AGENT_POLICY_ZONE_TOKEN_AGG_OPS);

function analyzeZoneSource(
  zone: unknown,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
  operatorName: 'zoneProp' | 'zoneTokenAgg',
): { zoneExpr: string | AgentPolicyExpr; zoneAnalysis: PolicyExprAnalysis | null } | null {
  if (typeof zone === 'string') {
    if (zone.length === 0) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
        path,
        severity: 'error',
        message: `${operatorName}.zone must be a non-empty string zone id or policy expression.`,
        suggestion: 'Set zone to a declared zone id (e.g., "hand", "community") or an id-valued policy expression.',
      });
      return null;
    }
    return { zoneExpr: zone, zoneAnalysis: null };
  }

  const zoneAnalysis = analyzePolicyExpr(zone as GameSpecPolicyExpr, context, diagnostics, path);
  if (zoneAnalysis === null) {
    return null;
  }
  if (!matchesType(zoneAnalysis.valueType, 'id')) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path,
      severity: 'error',
      message: `${operatorName}.zone expressions must resolve to an id value.`,
      suggestion: 'Use a string literal zone id or an id-valued ref/expression such as { ref: "option.value" }.',
    });
    return null;
  }
  return { zoneExpr: zoneAnalysis.expr, zoneAnalysis };
}

function analyzeZonePropOperator(
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  if (typeof expr !== 'object' || expr === null || Array.isArray(expr)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'zoneProp requires an object with zone and prop fields.',
      suggestion: 'Use { zoneProp: { zone: "space-a:none", prop: "population" } }.',
    });
    return null;
  }
  const obj = expr as Readonly<Record<string, unknown>>;
  const zone = obj['zone'];
  const prop = obj['prop'];
  if (typeof prop !== 'string' || prop.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.zoneProp.prop`,
      severity: 'error',
      message: 'zoneProp.prop must be a non-empty string zone property name.',
      suggestion: 'Set prop to a scalar zone property name such as "population" or "category".',
    });
    return null;
  }

  const zoneSource = analyzeZoneSource(zone, context, diagnostics, `${path}.zoneProp.zone`, 'zoneProp');
  if (zoneSource === null) {
    return null;
  }

  return {
    expr: {
      kind: 'zoneProp',
      zone: zoneSource.zoneExpr,
      prop,
    },
    valueType: 'unknown',
    costClass: zoneSource.zoneAnalysis?.costClass ?? 'state',
    dependencies: zoneSource.zoneAnalysis?.dependencies ?? emptyDependencies(),
    isStaticallyZero: false,
  };
}

function analyzeZoneTokenAggOperator(
  expr: GameSpecPolicyExpr,
  context: AnalyzePolicyExprContext,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  if (typeof expr !== 'object' || expr === null || Array.isArray(expr)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'zoneTokenAgg requires an object with zone, owner, prop, and op fields.',
      suggestion: 'Use { zoneTokenAgg: { zone: "hand", owner: "self", prop: "rank", op: "sum" } }.',
    });
    return null;
  }
  const obj = expr as Readonly<Record<string, unknown>>;
  const zone = obj['zone'];
  const owner = obj['owner'];
  const prop = obj['prop'];
  const op = obj['op'];
  if (typeof owner !== 'string' || !isAgentPolicyZoneTokenAggOwner(owner)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.zoneTokenAgg.owner`,
      severity: 'error',
      message: 'zoneTokenAgg.owner must be "self", "active", "none", or a numeric runtime player id.',
      suggestion: 'Set owner to "self", "active", "none", or a numeric player id such as "0".',
    });
    return null;
  }
  if (typeof prop !== 'string' || prop.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.zoneTokenAgg.prop`,
      severity: 'error',
      message: 'zoneTokenAgg.prop must be a non-empty string token property name.',
      suggestion: 'Set prop to a token property name (e.g., "rank").',
    });
    return null;
  }
  if (typeof op !== 'string' || !ZONE_TOKEN_AGG_OPS.has(op as AgentPolicyZoneTokenAggOp)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.zoneTokenAgg.op`,
      severity: 'error',
      message: `zoneTokenAgg.op must be one of: ${[...ZONE_TOKEN_AGG_OPS].join(', ')}.`,
      suggestion: 'Use "sum", "count", "min", or "max".',
    });
    return null;
  }
  const zoneSource = analyzeZoneSource(zone, context, diagnostics, `${path}.zoneTokenAgg.zone`, 'zoneTokenAgg');
  if (zoneSource === null) {
    return null;
  }
  return {
    expr: {
      kind: 'zoneTokenAgg',
      zone: zoneSource.zoneExpr,
      owner,
      prop,
      aggOp: op as AgentPolicyZoneTokenAggOp,
    },
    valueType: 'number',
    costClass: zoneSource.zoneAnalysis?.costClass ?? 'state',
    dependencies: zoneSource.zoneAnalysis?.dependencies ?? emptyDependencies(),
    isStaticallyZero: false,
  };
}

function analyzeGlobalTokenAggOperator(
  expr: GameSpecPolicyExpr,
  diagnostics: Diagnostic[],
  path: string,
): PolicyExprAnalysis | null {
  if (typeof expr !== 'object' || expr === null || Array.isArray(expr)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'globalTokenAgg requires an object with aggOp and optional tokenFilter, prop, zoneFilter, and zoneScope fields.',
      suggestion: 'Use { globalTokenAgg: { aggOp: "count", tokenFilter: { type: "base" } } }.',
    });
    return null;
  }

  const obj = expr as Readonly<Record<string, unknown>>;
  const aggOp = obj['aggOp'];
  const prop = obj['prop'];
  const tokenFilter = analyzeGlobalTokenAggTokenFilter(obj['tokenFilter'], diagnostics, `${path}.globalTokenAgg.tokenFilter`);
  const zoneFilter = analyzeGlobalTokenAggZoneFilter(obj['zoneFilter'], diagnostics, `${path}.globalTokenAgg.zoneFilter`);
  const zoneScope = analyzeGlobalTokenAggZoneScope(obj['zoneScope'], diagnostics, `${path}.globalTokenAgg.zoneScope`);

  if (typeof aggOp !== 'string' || !isAgentPolicyZoneTokenAggOp(aggOp)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.globalTokenAgg.aggOp`,
      severity: 'error',
      message: `globalTokenAgg.aggOp must be one of: ${AGENT_POLICY_ZONE_TOKEN_AGG_OPS.join(', ')}.`,
      suggestion: 'Use "sum", "count", "min", or "max".',
    });
    return null;
  }

  if (prop !== undefined && (typeof prop !== 'string' || prop.length === 0)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.globalTokenAgg.prop`,
      severity: 'error',
      message: 'globalTokenAgg.prop must be a non-empty string token property name when provided.',
      suggestion: 'Set prop to a token property name such as "strength".',
    });
    return null;
  }

  if (aggOp !== 'count' && prop === undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.globalTokenAgg.prop`,
      severity: 'error',
      message: `globalTokenAgg.prop is required when aggOp is "${aggOp}".`,
      suggestion: 'Set prop to the numeric token property to aggregate.',
    });
    return null;
  }

  if (tokenFilter === null || zoneFilter === null || zoneScope === null) {
    return null;
  }

  return {
    expr: {
      kind: 'globalTokenAgg',
      ...(tokenFilter === undefined ? {} : { tokenFilter }),
      aggOp,
      ...(prop === undefined ? {} : { prop }),
      ...(zoneFilter === undefined ? {} : { zoneFilter }),
      zoneScope,
    },
    valueType: 'number',
    costClass: 'state',
    dependencies: emptyDependencies(),
    isStaticallyZero: false,
  };
}

function analyzeGlobalTokenAggTokenFilter(
  expr: unknown,
  diagnostics: Diagnostic[],
  path: string,
): Extract<AgentPolicyExpr, { readonly kind: 'globalTokenAgg' }>['tokenFilter'] | null {
  if (expr === undefined) {
    return undefined;
  }
  if (typeof expr !== 'object' || expr === null || Array.isArray(expr)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'globalTokenAgg.tokenFilter must be an object when provided.',
      suggestion: 'Use { tokenFilter: { type?: string, props?: { key: { eq: value } } } }.',
    });
    return null;
  }

  const obj = expr as Readonly<Record<string, unknown>>;
  const type = obj['type'];
  const props = obj['props'];

  if (type !== undefined && (typeof type !== 'string' || type.length === 0)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.type`,
      severity: 'error',
      message: 'globalTokenAgg.tokenFilter.type must be a non-empty string when provided.',
      suggestion: 'Set type to a token type id such as "base".',
    });
    return null;
  }

  const resolvedProps = analyzeGlobalTokenAggTokenFilterProps(props, diagnostics, `${path}.props`);
  if (resolvedProps === null) {
    return null;
  }

  if (type === undefined && resolvedProps === undefined) {
    return {};
  }

  return {
    ...(type === undefined ? {} : { type }),
    ...(resolvedProps === undefined ? {} : { props: resolvedProps }),
  };
}

function analyzeGlobalTokenAggTokenFilterProps(
  expr: unknown,
  diagnostics: Diagnostic[],
  path: string,
): Readonly<Record<string, { readonly eq: string | number | boolean }>> | undefined | null {
  if (expr === undefined) {
    return undefined;
  }
  if (typeof expr !== 'object' || expr === null || Array.isArray(expr)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'globalTokenAgg.tokenFilter.props must be an object when provided.',
      suggestion: 'Set props to a record like { seat: { eq: "self" } }.',
    });
    return null;
  }

  const props: Record<string, { readonly eq: string | number | boolean }> = {};
  for (const [key, comparison] of Object.entries(expr as Readonly<Record<string, unknown>>)) {
    if (typeof comparison !== 'object' || comparison === null || Array.isArray(comparison)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
        path: `${path}.${key}`,
        severity: 'error',
        message: 'globalTokenAgg.tokenFilter.props entries must use { eq: <scalar> } objects.',
        suggestion: 'Use a comparison such as { seat: { eq: "self" } }.',
      });
      return null;
    }

    const keys = Object.keys(comparison);
    const eq = (comparison as Readonly<Record<string, unknown>>)['eq'];
    if (keys.length !== 1 || keys[0] !== 'eq' || !isPolicyScalar(eq)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
        path: `${path}.${key}`,
        severity: 'error',
        message: 'globalTokenAgg.tokenFilter.props entries must use { eq: <scalar> } objects.',
        suggestion: 'Use a scalar eq comparison such as { hidden: { eq: false } }.',
      });
      return null;
    }

    props[key] = { eq };
  }

  return props;
}

function analyzeGlobalTokenAggZoneFilter(
  expr: unknown,
  diagnostics: Diagnostic[],
  path: string,
): Extract<AgentPolicyExpr, { readonly kind: 'globalTokenAgg' }>['zoneFilter'] | null {
  if (expr === undefined) {
    return undefined;
  }
  if (typeof expr !== 'object' || expr === null || Array.isArray(expr)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'globalTokenAgg.zoneFilter must be an object when provided.',
      suggestion: 'Use { zoneFilter: { category?: string, attribute?: {...}, variable?: {...} } }.',
    });
    return null;
  }

  const obj = expr as Readonly<Record<string, unknown>>;
  const category = obj['category'];
  const attribute = analyzeGlobalTokenAggAttributeFilterComparison(obj['attribute'], diagnostics, `${path}.attribute`);
  const variable = analyzeGlobalTokenAggVariableFilterComparison(obj['variable'], diagnostics, `${path}.variable`);

  if (category !== undefined && (typeof category !== 'string' || category.length === 0)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.category`,
      severity: 'error',
      message: 'globalTokenAgg.zoneFilter.category must be a non-empty string when provided.',
      suggestion: 'Set category to a zone category such as "province".',
    });
    return null;
  }

  if (attribute === null || variable === null) {
    return null;
  }

  return {
    ...(category === undefined ? {} : { category }),
    ...(attribute === undefined ? {} : { attribute }),
    ...(variable === undefined ? {} : { variable }),
  };
}

function analyzeGlobalTokenAggAttributeFilterComparison(
  expr: unknown,
  diagnostics: Diagnostic[],
  path: string,
): Extract<NonNullable<Extract<AgentPolicyExpr, { readonly kind: 'globalTokenAgg' }>['zoneFilter']>['attribute'], object> | undefined | null {
  if (expr === undefined) {
    return undefined;
  }
  if (typeof expr !== 'object' || expr === null || Array.isArray(expr)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'globalTokenAgg zone-filter comparisons must be objects with prop, op, and value fields.',
      suggestion: 'Use { prop: "population", op: "gt", value: 0 }.',
    });
    return null;
  }

  const obj = expr as Readonly<Record<string, unknown>>;
  const prop = obj['prop'];
  const op = obj['op'];
  const value = obj['value'];

  if (typeof prop !== 'string' || prop.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.prop`,
      severity: 'error',
      message: 'globalTokenAgg zone-filter prop values must be non-empty strings.',
      suggestion: 'Set prop to the zone attribute or variable name to compare.',
    });
    return null;
  }

  if (typeof op !== 'string' || !isAgentPolicyZoneFilterOp(op)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.op`,
      severity: 'error',
      message: 'globalTokenAgg zone-filter op must be one of: eq, gt, gte, lt, lte.',
      suggestion: 'Use one of the supported scalar comparison operators.',
    });
    return null;
  }

  if (!isPolicyScalar(value)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.value`,
      severity: 'error',
      message: 'globalTokenAgg.zoneFilter.attribute.value must be a scalar string, number, or boolean.',
      suggestion: 'Use a scalar comparison value such as 0, "province", or false.',
    });
    return null;
  }

  return { prop, op, value };
}

function analyzeGlobalTokenAggVariableFilterComparison(
  expr: unknown,
  diagnostics: Diagnostic[],
  path: string,
): Extract<NonNullable<Extract<AgentPolicyExpr, { readonly kind: 'globalTokenAgg' }>['zoneFilter']>['variable'], object> | undefined | null {
  if (expr === undefined) {
    return undefined;
  }
  if (typeof expr !== 'object' || expr === null || Array.isArray(expr)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'globalTokenAgg zone-filter comparisons must be objects with prop, op, and value fields.',
      suggestion: 'Use { prop: "opposition", op: "gt", value: 0 }.',
    });
    return null;
  }

  const obj = expr as Readonly<Record<string, unknown>>;
  const prop = obj['prop'];
  const op = obj['op'];
  const value = obj['value'];

  if (typeof prop !== 'string' || prop.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.prop`,
      severity: 'error',
      message: 'globalTokenAgg zone-filter prop values must be non-empty strings.',
      suggestion: 'Set prop to the zone variable name to compare.',
    });
    return null;
  }

  if (typeof op !== 'string' || !isAgentPolicyZoneFilterOp(op)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.op`,
      severity: 'error',
      message: 'globalTokenAgg zone-filter op must be one of: eq, gt, gte, lt, lte.',
      suggestion: 'Use one of the supported scalar comparison operators.',
    });
    return null;
  }

  if (typeof value !== 'number') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.value`,
      severity: 'error',
      message: 'globalTokenAgg.zoneFilter.variable.value must be a number.',
      suggestion: 'Use a numeric comparison value such as 0 or 3.',
    });
    return null;
  }

  return { prop, op, value };
}

function analyzeGlobalTokenAggZoneScope(
  expr: unknown,
  diagnostics: Diagnostic[],
  path: string,
): AgentPolicyZoneScope | null {
  if (expr === undefined) {
    return 'board';
  }
  if (typeof expr !== 'string' || !isAgentPolicyZoneScope(expr)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path,
      severity: 'error',
      message: 'globalTokenAgg.zoneScope must be "board", "aux", or "all" when provided.',
      suggestion: 'Use the default board scope or explicitly set zoneScope to "board", "aux", or "all".',
    });
    return null;
  }
  return expr;
}

function isPolicyScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}
