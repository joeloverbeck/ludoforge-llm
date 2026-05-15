import type { EncodedStateLayout } from '../../kernel/encoded-state/index.js';
import type {
  AgentPolicyExpr,
  AgentPolicyLiteral,
  CompiledPolicyExpr,
  GameDef,
} from '../../kernel/types.js';
import {
  Opcode,
  POLICY_BYTECODE_VERSION,
  POLICY_BYTECODE_VM_VERSION,
  SCORE_RANGE_LIMIT,
  type FeatureTable,
  type PolicyBytecode,
  type RangeAnalysis,
} from './types.js';
import {
  canonicalKey,
  collectFeatureRefsFromCompiledPolicyExpr,
  getFeatureTable,
  getFeatureId,
  stablePayloadCode,
} from './feature-table.js';

export interface CompilePolicyBytecodeOptions {
  readonly logger?: Pick<Console, 'warn'>;
  readonly sourceFingerprint?: string;
}

type PolicyExprInput = AgentPolicyExpr | CompiledPolicyExpr;

const DYNAMIC_REASON_UNSUPPORTED_EXPR = 1;
const DYNAMIC_REASON_SCORE_RANGE = 2;
const DYNAMIC_REASON_FEATURE_MISSING = 3;
const DYNAMIC_REASON_NON_INTEGER_LITERAL = 4;

let buildExpressionFeatureTableCount = 0;

export function compilePolicyBytecode(
  expr: PolicyExprInput,
  def: GameDef,
  layout: EncodedStateLayout,
  options: CompilePolicyBytecodeOptions = {},
): PolicyBytecode {
  const featureTable = buildExpressionFeatureTable(def, layout, expr);
  const range = validateScoreRange(expr);
  if (range.kind === 'bounded' && !range.withinScoreBudget) {
    emitWarning(options, 'score range exceeds policy-bytecode budget; emitting RESOLVE_DYNAMIC');
    return createBytecode([Opcode.RESOLVE_DYNAMIC, DYNAMIC_REASON_SCORE_RANGE, Opcode.HALT], featureTable, [], options);
  }

  const constants = collectConstants(expr);
  const constantIds = new Map(constants.map((value, index) => [value, index]));
  const emitter = new BytecodeEmitter(featureTable, layout, constantIds, options);
  emitter.emit(expr);
  emitter.emitOp(Opcode.HALT);

  return createBytecode(emitter.instructions, featureTable, constants, options);
}

function buildExpressionFeatureTable(
  def: GameDef,
  layout: EncodedStateLayout,
  expr: PolicyExprInput,
): FeatureTable {
  const baseTable = getFeatureTable(def, layout);
  const refsByKey = new Map(baseTable.refs.map((ref) => [canonicalKey(ref), ref]));
  const initialRefCount = refsByKey.size;
  for (const ref of collectFeatureRefsFromCompiledPolicyExpr(expr as CompiledPolicyExpr, layout)) {
    refsByKey.set(canonicalKey(ref), ref);
  }
  if (refsByKey.size === initialRefCount) {
    return baseTable;
  }
  buildExpressionFeatureTableCount += 1;
  const refs = [...refsByKey.values()].sort((left, right) => canonicalKey(left).localeCompare(canonicalKey(right)));
  return {
    refs,
    refToId: Object.fromEntries(refs.map((ref, index) => [canonicalKey(ref), index])),
  };
}

export function validateScoreRange(expr: PolicyExprInput): RangeAnalysis {
  const range = analyzeRange(expr);
  if (range === null) {
    return { kind: 'unknown', reason: 'Policy expression contains dynamic refs or operators with runtime-dependent bounds.' };
  }
  return {
    kind: 'bounded',
    min: range.min,
    max: range.max,
    withinScoreBudget: range.min >= -SCORE_RANGE_LIMIT && range.max <= SCORE_RANGE_LIMIT,
  };
}

function createBytecode(
  instructions: readonly number[],
  featureTable: FeatureTable,
  constants: readonly number[],
  options: CompilePolicyBytecodeOptions,
): PolicyBytecode {
  return {
    instructions: Int32Array.from(instructions),
    featureTable,
    constants: Int32Array.from(constants),
    metadata: {
      version: POLICY_BYTECODE_VERSION,
      sourceFingerprint: options.sourceFingerprint ?? 'agent-policy-expr:anonymous',
      targetVmVersion: POLICY_BYTECODE_VM_VERSION,
    },
  };
}

class BytecodeEmitter {
  readonly instructions: number[] = [];

  constructor(
    private readonly featureTable: FeatureTable,
    private readonly layout: EncodedStateLayout,
    private readonly constantIds: ReadonlyMap<number, number>,
    private readonly options: CompilePolicyBytecodeOptions,
  ) {}

  emit(expr: PolicyExprInput): void {
    switch (expr.kind) {
      case 'literal':
        this.emitConst(expr.value);
        return;
      case 'param':
        this.emitOp(Opcode.RESOLVE_REF, stablePayloadCode({ kind: 'param', id: expr.id }));
        return;
      case 'ref':
      case 'zoneTokenAgg':
      case 'globalTokenAgg':
      case 'globalZoneAgg':
      case 'adjacentTokenAgg':
      case 'seatAgg':
      case 'zoneProp':
        this.emitFeature(expr);
        return;
      case 'op':
        this.emitOpExpr(expr);
        return;
    }
  }

  emitOp(opcode: Opcode, ...operands: readonly number[]): void {
    this.instructions.push(opcode, ...operands);
  }

  private emitConst(value: AgentPolicyLiteral): void {
    const encoded = encodeLiteral(value);
    if (encoded === null) {
      this.emitDynamic(DYNAMIC_REASON_NON_INTEGER_LITERAL, 'non-integer numeric literal cannot be represented in policy bytecode');
      return;
    }
    const constantId = this.constantIds.get(encoded);
    if (constantId === undefined) {
      this.emitDynamic(DYNAMIC_REASON_UNSUPPORTED_EXPR, `constant ${encoded} was not precomputed`);
      return;
    }
    this.emitOp(Opcode.LOAD_CONST, constantId);
  }

  private emitFeature(expr: PolicyExprInput): void {
    const refs = collectFeatureRefsFromCompiledPolicyExpr(expr as CompiledPolicyExpr, this.layout);
    const primary = refs[refs.length - 1];
    if (primary === undefined) {
      this.emitDynamic(DYNAMIC_REASON_UNSUPPORTED_EXPR, `policy expression kind "${expr.kind}" has no feature ref`);
      return;
    }
    const featureId = getFeatureId(this.featureTable, primary);
    if (featureId === undefined) {
      this.emitDynamic(DYNAMIC_REASON_FEATURE_MISSING, `feature ref for "${expr.kind}" is absent from the feature table`);
      return;
    }
    this.emitOp(Opcode.LOAD_FEATURE, featureId);
  }

  private emitOpExpr(expr: Extract<PolicyExprInput, { readonly kind: 'op' }>): void {
    const args = expr.args;
    switch (expr.op) {
      case 'boolToNumber':
        if (args[0] === undefined) {
          this.emitDynamic(DYNAMIC_REASON_UNSUPPORTED_EXPR, `${expr.op} requires at least one argument`);
          return;
        }
        this.emit(args[0]);
        this.emitOp(Opcode.BOOL_TO_NUMBER);
        return;
      case 'coalesce':
        this.emitFold(args, Opcode.COALESCE);
        return;
      case 'add':
      case 'mul':
        this.emitFold(args, expr.op === 'add' ? Opcode.ADD_SCORE : Opcode.MUL_SCORE);
        return;
      case 'sub':
      case 'div':
        if (args.length !== 2) {
          this.emitDynamic(DYNAMIC_REASON_UNSUPPORTED_EXPR, `${expr.op} requires exactly two arguments`);
          return;
        }
        this.emit(args[0] as PolicyExprInput);
        this.emit(args[1] as PolicyExprInput);
        this.emitOp(expr.op === 'sub' ? Opcode.SUB_SCORE : Opcode.DIV_SCORE);
        return;
      case 'min':
      case 'max':
      case 'and':
      case 'or':
        this.emitFold(args, foldOpcode(expr.op));
        return;
      case 'not':
      case 'abs':
      case 'neg':
        if (args.length !== 1) {
          this.emitDynamic(DYNAMIC_REASON_UNSUPPORTED_EXPR, `${expr.op} requires exactly one argument`);
          return;
        }
        this.emit(args[0] as PolicyExprInput);
        this.emitOp(unaryOpcode(expr.op));
        return;
      case 'gt':
      case 'lt':
      case 'eq':
      case 'ne':
      case 'gte':
      case 'lte':
        if (args.length !== 2) {
          this.emitDynamic(DYNAMIC_REASON_UNSUPPORTED_EXPR, `${expr.op} requires exactly two arguments`);
          return;
        }
        this.emit(args[0] as PolicyExprInput);
        this.emit(args[1] as PolicyExprInput);
        this.emitOp(compareOpcode(expr.op));
        return;
      case 'clamp':
      case 'if':
      case 'in':
        this.emitDynamic(DYNAMIC_REASON_UNSUPPORTED_EXPR, `operator "${expr.op}" requires a later VM opcode expansion`);
        return;
    }
  }

  private emitFold(
    args: readonly PolicyExprInput[],
    opcode: Opcode.ADD_SCORE | Opcode.MUL_SCORE | Opcode.MIN | Opcode.MAX | Opcode.AND | Opcode.OR | Opcode.COALESCE,
  ): void {
    if (args.length < 2) {
      this.emitDynamic(DYNAMIC_REASON_UNSUPPORTED_EXPR, 'folding arithmetic requires at least two arguments');
      return;
    }
    this.emit(args[0] as PolicyExprInput);
    for (const arg of args.slice(1)) {
      this.emit(arg);
      this.emitOp(opcode);
    }
  }

  private emitDynamic(reason: number, message: string): void {
    emitWarning(this.options, message);
    this.emitOp(Opcode.RESOLVE_DYNAMIC, reason);
  }
}

function compareOpcode(op: 'gt' | 'lt' | 'eq' | 'ne' | 'gte' | 'lte'): Opcode {
  switch (op) {
    case 'gt': return Opcode.GT;
    case 'lt': return Opcode.LT;
    case 'eq': return Opcode.EQ;
    case 'ne': return Opcode.NEQ;
    case 'gte': return Opcode.GTE;
    case 'lte': return Opcode.LTE;
  }
}

function foldOpcode(op: 'min' | 'max' | 'and' | 'or'): Opcode.MIN | Opcode.MAX | Opcode.AND | Opcode.OR {
  switch (op) {
    case 'min': return Opcode.MIN;
    case 'max': return Opcode.MAX;
    case 'and': return Opcode.AND;
    case 'or': return Opcode.OR;
  }
}

function unaryOpcode(op: 'not' | 'abs' | 'neg'): Opcode.NOT | Opcode.ABS | Opcode.NEG {
  switch (op) {
    case 'not': return Opcode.NOT;
    case 'abs': return Opcode.ABS;
    case 'neg': return Opcode.NEG;
  }
}

function collectConstants(expr: PolicyExprInput): readonly number[] {
  const values = new Set<number>();
  const visit = (current: PolicyExprInput | undefined): void => {
    if (current === undefined) return;
    switch (current.kind) {
      case 'literal': {
        const value = encodeLiteral(current.value);
        if (value !== null) values.add(value);
        return;
      }
      case 'op':
        for (const arg of current.args) visit(arg);
        return;
      case 'zoneTokenAgg':
        if (typeof current.zone !== 'string') visit(current.zone as PolicyExprInput);
        return;
      case 'adjacentTokenAgg':
        if (typeof current.anchorZone !== 'string') visit(current.anchorZone as PolicyExprInput);
        return;
      case 'seatAgg':
        visit(current.expr as PolicyExprInput);
        return;
      case 'zoneProp':
        if (typeof current.zone !== 'string') visit(current.zone as PolicyExprInput);
        return;
      case 'param':
      case 'ref':
      case 'globalTokenAgg':
      case 'globalZoneAgg':
        return;
    }
  };
  visit(expr);
  return [...values].sort((left, right) => left - right);
}

function encodeLiteral(value: AgentPolicyLiteral): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (value === null) {
    return 0;
  }
  return stablePayloadCode({ literal: value });
}

interface Range {
  readonly min: number;
  readonly max: number;
}

function analyzeRange(expr: PolicyExprInput): Range | null {
  switch (expr.kind) {
    case 'literal': {
      const encoded = encodeLiteral(expr.value);
      return encoded === null ? null : { min: encoded, max: encoded };
    }
    case 'op':
      return analyzeOpRange(expr);
    case 'param':
    case 'ref':
    case 'zoneTokenAgg':
    case 'globalTokenAgg':
    case 'globalZoneAgg':
    case 'adjacentTokenAgg':
    case 'seatAgg':
    case 'zoneProp':
      return null;
  }
}

function analyzeOpRange(expr: Extract<PolicyExprInput, { readonly kind: 'op' }>): Range | null {
  const ranges = expr.args.map(analyzeRange);
  if (ranges.some((range) => range === null)) {
    return null;
  }
  const known = ranges as Range[];
  switch (expr.op) {
    case 'add':
      return known.reduce((acc, range) => ({ min: acc.min + range.min, max: acc.max + range.max }), { min: 0, max: 0 });
    case 'mul':
      return known.reduce((acc, range) => multiplyRange(acc, range), { min: 1, max: 1 });
    case 'boolToNumber':
    case 'eq':
    case 'gt':
    case 'lt':
    case 'ne':
      return { min: 0, max: 1 };
    default:
      return null;
  }
}

function multiplyRange(left: Range, right: Range): Range {
  const values = [
    left.min * right.min,
    left.min * right.max,
    left.max * right.min,
    left.max * right.max,
  ];
  return { min: Math.min(...values), max: Math.max(...values) };
}

function emitWarning(options: CompilePolicyBytecodeOptions, message: string): void {
  options.logger?.warn(`[policy-bytecode] ${message}`);
}

export const __compile_internal_for_tests = {
  getBuildExpressionFeatureTableCount: (): number => buildExpressionFeatureTableCount,
  resetBuildExpressionFeatureTableCount: (): void => {
    buildExpressionFeatureTableCount = 0;
  },
};
