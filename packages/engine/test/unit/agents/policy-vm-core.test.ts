// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { executeBytecode } from '../../../src/agents/policy-vm/index.js';
import {
  Opcode,
  type FeatureRef,
  type FeatureTable,
  type PolicyBytecode,
} from '../../../src/cnl/policy-bytecode/index.js';
import type {
  EncodedState,
  EncodedStateLayout,
  GameDef,
  GameState,
} from '../../../src/kernel/index.js';

const makeBytecode = (
  instructions: readonly number[],
  constants: readonly number[] = [],
  featureTable: FeatureTable = { refs: [], refToId: {} },
): PolicyBytecode => ({
  instructions: Int32Array.from(instructions),
  constants: Int32Array.from(constants),
  featureTable,
  metadata: {
    version: 1,
    sourceFingerprint: 'policy-vm-core-test',
    targetVmVersion: 1,
  },
});

const makeLayout = (): EncodedStateLayout => ({
  zoneIds: ['a', 'b'] as never,
  tokenIds: ['tok_a', 'tok_b'] as never,
  playerIds: [0, 1] as never,
  markerIds: ['status'],
  variableIds: [],
  tokenLayout: {
    tokenCount: 2,
    tokenTypeIds: ['unit'],
    tokenIndexById: { tok_a: 0, tok_b: 1 },
    tokenTypeIndexById: { unit: 0 },
    propIdsByTokenType: { unit: ['power'] },
    scalarPropIds: ['power'],
    scalarPropIndexById: { power: 0 },
    scalarPropTypesById: { power: 'int' },
  },
  markerLayout: {
    markerCount: 1,
    zoneMarkerIds: [],
    globalMarkerIds: ['status'],
    markerIndexById: { status: 0 },
    markerStateIdsByMarkerId: { status: ['off', 'on'] },
  },
  varLayout: {
    variableCount: 0,
    globalVariableIds: ['round'],
    perPlayerVariableIds: ['cash'],
    zoneVariableIds: ['control'],
    variableIndexById: {},
  },
  bitsetLayout: {
    tokenFlagCount: 0,
    tokenFlagWordCount: 0,
    zoneMarkerBitCount: 0,
    zoneMarkerWordCount: 0,
    globalMarkerBitCount: 2,
    globalMarkerWordCount: 1,
  },
});

const makeEncoded = (): EncodedState => ({
  tokenIds: ['tok_a', 'tok_b'] as never,
  tokenIndexById: { tok_a: 0, tok_b: 1 },
  tokenTypeByIndex: ['unit', 'unit'],
  tokenZone: Int16Array.from([0, 1]),
  tokenOccurrenceOffset: Int32Array.from([-1, -1]),
  tokenOccurrenceCount: Int16Array.from([1, 1]),
  tokenOccurrenceZones: new Int16Array(),
  tokenFlags: new BigUint64Array(),
  tokenScalarPropValues: Int32Array.from([3, 7]),
  tokenScalarPropPresent: Uint8Array.from([1, 1]),
  tokenScalarStringValuesByProp: {},
  zoneOccupancy: Int16Array.from([1, 1]),
  playerInts: Int32Array.from([11, 13]),
  zoneInts: Int32Array.from([17, 19]),
  zoneMarkers: new BigUint64Array(),
  globalMarkers: BigUint64Array.from([2n]),
  globals: Int32Array.from([23]),
});

const makeDef = (): GameDef => ({
  metadata: { players: { min: 1, max: 2 } },
  zones: [
    { id: 'a' as never, zoneKind: 'board' },
    { id: 'b' as never, zoneKind: 'aux' },
  ],
  globalMarkerLattices: [{ id: 'status', states: ['off', 'on'], defaultState: 'off' }],
} as unknown as GameDef);

const execute = (
  instructions: readonly number[],
  constants: readonly number[] = [],
  featureTable?: FeatureTable,
) => executeBytecode(makeBytecode(instructions, constants, featureTable), makeEncoded(), {
  def: makeDef(),
  layout: makeLayout(),
  state: { activePlayer: 1 } as unknown as GameState,
  playerId: 0,
  resolveRef: (refId) => refId === 1 ? ['5', '8'] : undefined,
  resolveDynamic: () => 41,
});

const singleFeatureTable = (ref: FeatureRef): FeatureTable => ({
  refs: [ref],
  refToId: { [`${ref.kind}:${ref.layoutIndex}:${ref.aux.join(',')}`]: 0 },
});

describe('policy bytecode VM core', () => {
  it('executes numeric, comparison, boolean, coalesce, ref, dynamic, and halt opcodes', () => {
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.ADD_SCORE, Opcode.HALT], [3, 4]).value, 7);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.SUB_SCORE, Opcode.HALT], [9, 4]).value, 5);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.MUL_SCORE, Opcode.HALT], [3, 4]).value, 12);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.DIV_SCORE, Opcode.HALT], [9, 2]).value, 4);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.NEG, Opcode.HALT], [9]).value, -9);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.ABS, Opcode.HALT], [-9]).value, 9);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.MIN, Opcode.HALT], [9, 4]).value, 4);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.MAX, Opcode.HALT], [9, 4]).value, 9);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.GT, Opcode.HALT], [9, 4]).value, true);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.LT, Opcode.HALT], [9, 4]).value, false);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.EQ, Opcode.HALT], [4, 4]).value, true);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.NEQ, Opcode.HALT], [4, 5]).value, true);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.GTE, Opcode.HALT], [4, 4]).value, true);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.LTE, Opcode.HALT], [5, 4]).value, false);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.BOOL_TO_NUMBER, Opcode.HALT], [1]).value, undefined);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.AND, Opcode.HALT], [1, 1]).value, undefined);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.NOT, Opcode.HALT], [0]).value, undefined);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.COALESCE, Opcode.HALT], [0, 7]).value, 0);
    assert.equal(execute([Opcode.LOAD_CONST, 0, Opcode.RESOLVE_REF, 1, Opcode.IN, Opcode.HALT], [5]).value, true);
    assert.equal(execute([Opcode.RESOLVE_DYNAMIC, 7, Opcode.HALT]).value, 41);
  });

  it('supports boolean opcodes with resolver-provided booleans', () => {
    const bytecode = makeBytecode([
      Opcode.RESOLVE_REF, 1,
      Opcode.RESOLVE_REF, 2,
      Opcode.AND,
      Opcode.RESOLVE_REF, 3,
      Opcode.OR,
      Opcode.NOT,
      Opcode.HALT,
    ]);
    const result = executeBytecode(bytecode, makeEncoded(), {
      def: makeDef(),
      layout: makeLayout(),
      state: { activePlayer: 1 } as unknown as GameState,
      resolveRef: (refId) => refId === 1 ? true : refId === 2 ? false : false,
    });
    assert.equal(result.value, true);
  });

  it('executes conditional jumps over skipped bytecode ranges', () => {
    const branch = (condition: boolean) => executeBytecode(makeBytecode([
      Opcode.RESOLVE_REF, 1,
      Opcode.JUMP_IF_FALSE, 2,
      Opcode.LOAD_CONST, 0,
      Opcode.HALT,
    ], [9]), makeEncoded(), {
      def: makeDef(),
      layout: makeLayout(),
      state: { activePlayer: 1 } as unknown as GameState,
      resolveRef: () => condition,
    });

    assert.equal(branch(true).value, 9);
    assert.equal(branch(false).value, undefined);
  });

  it('loads encoded-state features generically', () => {
    assert.equal(execute([Opcode.LOAD_FEATURE, 0, Opcode.HALT], [], singleFeatureTable({ kind: 'globalVar', layoutIndex: 0, aux: [0] })).value, 23);
    assert.equal(execute([Opcode.LOAD_FEATURE, 0, Opcode.HALT], [], singleFeatureTable({ kind: 'playerInt', layoutIndex: 0, aux: [0, 1, 0] })).value, 11);
    assert.equal(execute([Opcode.LOAD_FEATURE, 0, Opcode.HALT], [], singleFeatureTable({ kind: 'globalMarker', layoutIndex: 0, aux: [0] })).value, 'on');
    assert.equal(execute([Opcode.LOAD_FEATURE, 0, Opcode.HALT], [], singleFeatureTable({ kind: 'zoneProp', layoutIndex: 1, aux: [1, 0] })).value, 19);
    assert.equal(execute([Opcode.LOAD_FEATURE, 0, Opcode.HALT], [], singleFeatureTable({ kind: 'zoneTokenAgg', layoutIndex: 0, aux: [0, 0, 1] })).value, 3);
    assert.equal(execute([Opcode.LOAD_FEATURE, 0, Opcode.HALT], [], singleFeatureTable({ kind: 'globalTokenAgg', layoutIndex: 0, aux: [1, 0, 0, 0, 0] })).value, 10);
    assert.equal(execute([Opcode.LOAD_FEATURE, 0, Opcode.HALT], [], singleFeatureTable({ kind: 'globalZoneAgg', layoutIndex: 0, aux: [1, 0, 1, 0, 0] })).value, 36);
  });

  it('aborts cleanly on malformed bytecode and aggregate-frame opcodes not emitted by the compiler yet', () => {
    assert.throws(
      () => execute([Opcode.LOAD_CONST, 0, Opcode.LOAD_CONST, 1, Opcode.DIV_SCORE, Opcode.HALT], [1, 0]),
      /zero denominator/u,
    );
    assert.throws(
      () => execute([Opcode.AGGREGATE_SUM, Opcode.HALT]),
      /aggregate frames/u,
    );
    assert.throws(
      () => execute([Opcode.AGGREGATE_COUNT, Opcode.HALT]),
      /aggregate frames/u,
    );
    assert.throws(
      () => execute([Opcode.AGGREGATE_MIN, Opcode.HALT]),
      /aggregate frames/u,
    );
    assert.throws(
      () => execute([Opcode.AGGREGATE_MAX, Opcode.HALT]),
      /aggregate frames/u,
    );

    const overflowing = Array.from({ length: 257 }, () => [Opcode.LOAD_CONST, 0]).flat();
    assert.throws(
      () => execute([...overflowing, Opcode.HALT], [1]),
      /stack overflow/u,
    );
  });
});
