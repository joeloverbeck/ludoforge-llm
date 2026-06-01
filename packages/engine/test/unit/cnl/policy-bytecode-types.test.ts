// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import { Ajv2020 } from 'ajv/dist/2020.js';

import { disassemble } from '../../../src/agents/policy-bytecode/index.js';
import {
  Opcode,
  POLICY_BYTECODE_VERSION,
  POLICY_BYTECODE_VM_VERSION,
  SCORE_RANGE_LIMIT,
  validateScoreRange,
  type PolicyBytecode,
} from '../../../src/cnl/policy-bytecode/index.js';
import type { AgentPolicyExpr, CompiledPolicyExpr } from '../../../src/kernel/types.js';

const assertNever = (_value: never): never => {
  throw new Error('Unexpected policy expression variant');
};

const opcodesForAgentPolicyExpr = (expr: AgentPolicyExpr): readonly Opcode[] => {
  switch (expr.kind) {
    case 'literal':
      return [Opcode.LOAD_CONST];
    case 'param':
    case 'ref':
      return [Opcode.RESOLVE_REF];
    case 'op':
      return [Opcode.RESOLVE_DYNAMIC];
    case 'zoneTokenAgg':
    case 'globalTokenAgg':
    case 'globalZoneAgg':
    case 'adjacentTokenAgg':
    case 'seatAgg':
    case 'tokenProp':
      return [Opcode.LOAD_FEATURE, Opcode.AGGREGATE_COUNT, Opcode.AGGREGATE_SUM, Opcode.AGGREGATE_MIN, Opcode.AGGREGATE_MAX];
    case 'zoneProp':
      return [Opcode.LOAD_FEATURE];
    default:
      return assertNever(expr);
  }
};

const opcodesForCompiledPolicyExpr = (expr: CompiledPolicyExpr): readonly Opcode[] => {
  switch (expr.kind) {
    case 'literal':
      return [Opcode.LOAD_CONST];
    case 'param':
    case 'ref':
      return [Opcode.RESOLVE_REF];
    case 'op':
      return [Opcode.RESOLVE_DYNAMIC];
    case 'zoneTokenAgg':
    case 'globalTokenAgg':
    case 'globalZoneAgg':
    case 'adjacentTokenAgg':
    case 'seatAgg':
    case 'tokenProp':
      return [Opcode.LOAD_FEATURE, Opcode.AGGREGATE_COUNT, Opcode.AGGREGATE_SUM, Opcode.AGGREGATE_MIN, Opcode.AGGREGATE_MAX];
    case 'zoneProp':
      return [Opcode.LOAD_FEATURE];
    default:
      return assertNever(expr);
  }
};

const readSchema = (filename: string): Record<string, unknown> => {
  const schemaPath = path.join(process.cwd(), 'schemas', filename);
  return JSON.parse(readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
};

const serializePolicyBytecode = (bytecode: PolicyBytecode): Record<string, unknown> => ({
  instructions: Array.from(bytecode.instructions),
  featureTable: bytecode.featureTable,
  constants: Array.from(bytecode.constants),
  metadata: bytecode.metadata,
});

describe('policy bytecode foundational types', () => {
  it('defines the generic opcode set for the phase-3 bytecode IR', () => {
    assert.deepEqual(
      Object.values(Opcode).filter((value): value is string => typeof value === 'string'),
      [
        'LOAD_FEATURE',
        'LOAD_CONST',
        'GT',
        'LT',
        'EQ',
        'NEQ',
        'GTE',
        'LTE',
        'JUMP_IF_FALSE',
        'ADD_SCORE',
        'SUB_SCORE',
        'MUL_SCORE',
        'DIV_SCORE',
        'NEG',
        'ABS',
        'MIN',
        'MAX',
        'AND',
        'OR',
        'NOT',
        'COALESCE',
        'BOOL_TO_NUMBER',
        'IN',
        'RESOLVE_REF',
        'AGGREGATE_SUM',
        'AGGREGATE_COUNT',
        'AGGREGATE_MIN',
        'AGGREGATE_MAX',
        'RESOLVE_DYNAMIC',
        'HALT',
      ],
    );
  });

  it('keeps opcode coverage exhaustive over current policy expression unions', () => {
    const literal: AgentPolicyExpr = { kind: 'literal', value: 1 };
    assert.deepEqual(opcodesForAgentPolicyExpr(literal), [Opcode.LOAD_CONST]);

    const compiledLiteral: CompiledPolicyExpr = { kind: 'literal', value: 1 };
    assert.deepEqual(opcodesForCompiledPolicyExpr(compiledLiteral), [Opcode.LOAD_CONST]);
  });

  it('validates a hand-crafted bytecode artifact with the PolicyBytecode schema', () => {
    const bytecode: PolicyBytecode = {
      instructions: Int32Array.from([Opcode.LOAD_FEATURE, 0, Opcode.LOAD_CONST, 2, Opcode.GT, Opcode.HALT]),
      featureTable: {
        refs: [{ kind: 'zoneProp', layoutIndex: 0, aux: [1] }],
        refToId: { 'zoneProp:0:1': 0 },
      },
      constants: Int32Array.from([2]),
      metadata: {
        version: POLICY_BYTECODE_VERSION,
        sourceFingerprint: 'agent-policy-expr:test',
        targetVmVersion: POLICY_BYTECODE_VM_VERSION,
      },
    };

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(readSchema('PolicyBytecode.schema.json'));
    assert.equal(validate(serializePolicyBytecode(bytecode)), true, JSON.stringify(validate.errors));
  });

  it('exposes compiler and disassembler ABI hooks', () => {
    const range = validateScoreRange({ kind: 'literal', value: SCORE_RANGE_LIMIT - 1 });
    assert.equal(range.kind, 'bounded');

    const bytecode: PolicyBytecode = {
      instructions: Int32Array.from([Opcode.HALT]),
      featureTable: { refs: [], refToId: {} },
      constants: Int32Array.from([]),
      metadata: {
        version: POLICY_BYTECODE_VERSION,
        sourceFingerprint: 'agent-policy-expr:test',
        targetVmVersion: POLICY_BYTECODE_VM_VERSION,
      },
    };
    assert.equal(disassemble(bytecode), '0000: HALT');
  });
});
