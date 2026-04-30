import type { AgentPolicyExpr, CompiledPolicyExpr } from '../../kernel/types.js';

export const POLICY_BYTECODE_VERSION = 1;
export const POLICY_BYTECODE_VM_VERSION = 1;
export const SCORE_RANGE_LIMIT = 2 ** 30;

export enum Opcode {
  LOAD_FEATURE,
  LOAD_CONST,
  GT,
  LT,
  EQ,
  NEQ,
  JUMP_IF_FALSE,
  ADD_SCORE,
  MUL_SCORE,
  RESOLVE_REF,
  AGGREGATE_SUM,
  AGGREGATE_COUNT,
  AGGREGATE_MIN,
  AGGREGATE_MAX,
  RESOLVE_DYNAMIC,
  HALT,
}

export const OPCODE_NAMES: Readonly<Record<Opcode, string>> = {
  [Opcode.LOAD_FEATURE]: 'LOAD_FEATURE',
  [Opcode.LOAD_CONST]: 'LOAD_CONST',
  [Opcode.GT]: 'GT',
  [Opcode.LT]: 'LT',
  [Opcode.EQ]: 'EQ',
  [Opcode.NEQ]: 'NEQ',
  [Opcode.JUMP_IF_FALSE]: 'JUMP_IF_FALSE',
  [Opcode.ADD_SCORE]: 'ADD_SCORE',
  [Opcode.MUL_SCORE]: 'MUL_SCORE',
  [Opcode.RESOLVE_REF]: 'RESOLVE_REF',
  [Opcode.AGGREGATE_SUM]: 'AGGREGATE_SUM',
  [Opcode.AGGREGATE_COUNT]: 'AGGREGATE_COUNT',
  [Opcode.AGGREGATE_MIN]: 'AGGREGATE_MIN',
  [Opcode.AGGREGATE_MAX]: 'AGGREGATE_MAX',
  [Opcode.RESOLVE_DYNAMIC]: 'RESOLVE_DYNAMIC',
  [Opcode.HALT]: 'HALT',
};

export type OpcodeName = (typeof OPCODE_NAMES)[Opcode];

export interface BytecodeInstruction {
  readonly opcode: Opcode;
  readonly operands: readonly number[];
}

export interface FeatureRef {
  readonly kind: string;
  readonly layoutIndex: number;
  readonly aux: readonly number[];
}

export interface FeatureTable {
  readonly refs: readonly FeatureRef[];
  readonly refToId: Readonly<Record<string, number>>;
}

export interface BytecodeMetadata {
  readonly version: typeof POLICY_BYTECODE_VERSION;
  readonly sourceFingerprint: string;
  readonly targetVmVersion: typeof POLICY_BYTECODE_VM_VERSION;
}

export interface PolicyBytecode {
  readonly instructions: Int32Array;
  readonly featureTable: FeatureTable;
  readonly constants: Int32Array;
  readonly metadata: BytecodeMetadata;
}

export type RangeAnalysis =
  | {
      readonly kind: 'bounded';
      readonly min: number;
      readonly max: number;
      readonly withinScoreBudget: boolean;
    }
  | {
      readonly kind: 'unknown';
      readonly reason: string;
    };

export function validateScoreRange(_expr: AgentPolicyExpr | CompiledPolicyExpr): RangeAnalysis {
  return {
    kind: 'unknown',
    reason: 'Static policy-bytecode range analysis lands with the bytecode compiler.',
  };
}

export function disassemble(_bytecode: PolicyBytecode): string {
  throw new Error('Policy bytecode disassembly lands with the bytecode compiler.');
}

