import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  AgentPolicyCostClass,
  AgentPolicyExpr,
  AgentPolicyLiteral,
  AgentPolicyOperator,
  AgentPolicyValueType,
  AgentPolicyZoneTokenAggOp,
  CompiledAgentDependencyRefs,
  CompiledAgentPolicyRef,
  CompiledAgentParameterDef,
} from '../kernel/types.js';
import type { GameSpecPolicyExpr } from '../cnl/game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from '../cnl/compiler-diagnostic-codes.js';

type InternalPolicyValueType = AgentPolicyValueType | 'unknown';

export interface ResolvedPolicyRef {
  readonly type: AgentPolicyValueType;
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
    case 'zoneTokenAgg':
      return analyzeZoneTokenAggOperator(value, diagnostics, path);
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

const ZONE_TOKEN_AGG_OPS = new Set<AgentPolicyZoneTokenAggOp>(['sum', 'count', 'min', 'max']);

function analyzeZoneTokenAggOperator(
  expr: GameSpecPolicyExpr,
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
  if (typeof zone !== 'string' || zone.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.zoneTokenAgg.zone`,
      severity: 'error',
      message: 'zoneTokenAgg.zone must be a non-empty string zone id.',
      suggestion: 'Set zone to a declared zone id (e.g., "hand", "community").',
    });
    return null;
  }
  if (typeof owner !== 'string' || owner.length === 0) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_EXPR_INVALID,
      path: `${path}.zoneTokenAgg.owner`,
      severity: 'error',
      message: 'zoneTokenAgg.owner must be "self", "active", "none", or a literal seat id.',
      suggestion: 'Set owner to "self" for the acting player\'s zone.',
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
  return {
    expr: {
      kind: 'zoneTokenAgg',
      zone,
      owner,
      prop,
      aggOp: op as AgentPolicyZoneTokenAggOp,
    },
    valueType: 'number',
    costClass: 'state',
    dependencies: emptyDependencies(),
    isStaticallyZero: false,
  };
}
