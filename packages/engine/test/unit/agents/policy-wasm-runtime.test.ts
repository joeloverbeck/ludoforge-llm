// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  POLICY_WASM_SMOKE_LAYOUT_ID,
  loadPolicyWasmRuntime,
} from '../../../src/agents/policy-wasm-runtime.js';
import {
  Opcode,
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
    sourceFingerprint: 'policy-wasm-runtime-test',
    targetVmVersion: 1,
  },
});

const makeLayout = (): EncodedStateLayout => ({
  zoneIds: ['board', 'aux'] as never,
  tokenIds: ['tok_a', 'tok_b'] as never,
  playerIds: [0, 1] as never,
  markerIds: [],
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
    markerCount: 0,
    zoneMarkerIds: [],
    globalMarkerIds: [],
    markerIndexById: {},
    markerStateIdsByMarkerId: {},
  },
  varLayout: {
    variableCount: 2,
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
    globalMarkerBitCount: 0,
    globalMarkerWordCount: 0,
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
  globalMarkers: new BigUint64Array(),
  globals: Int32Array.from([23]),
});

const makeDef = (): GameDef => ({
  metadata: { players: { min: 1, max: 2 } },
  zones: [
    { id: 'board' as never, zoneKind: 'board' },
    { id: 'aux' as never, zoneKind: 'aux' },
  ],
} as unknown as GameDef);

describe('policy WASM runtime bridge', () => {
  it('loads the built WASM artifact and executes the deterministic smoke ABI', async () => {
    const runtime = await loadPolicyWasmRuntime();

    assert.equal(runtime.evaluateSmokeAdd(19, 23), 42);
    assert.equal(runtime.evaluateSmokeAdd(-9, 4), -5);
  });

  it('rejects mismatched layout identity instead of interpreting the buffer', async () => {
    const runtime = await loadPolicyWasmRuntime();

    assert.throws(
      () => runtime.evaluateSmokeAdd(1, 2, POLICY_WASM_SMOKE_LAYOUT_ID + 1),
      /status -4/u,
    );
  });

  it('executes generic policy bytecode against encoded-state buffers', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const bytecode = makeBytecode([
      Opcode.LOAD_FEATURE, 0,
      Opcode.LOAD_FEATURE, 1,
      Opcode.ADD_SCORE,
      Opcode.LOAD_CONST, 0,
      Opcode.SUB_SCORE,
      Opcode.HALT,
    ], [4], {
      refs: [
        { kind: 'globalVar', layoutIndex: 0, aux: [0] },
        { kind: 'zoneTokenAgg', layoutIndex: 0, aux: [0, 0, 1] },
      ],
      refToId: {},
    });

    assert.equal(runtime.evaluatePolicyBytecode(bytecode, makeEncoded(), {
      def: makeDef(),
      layout: makeLayout(),
      state: { activePlayer: 1 } as unknown as GameState,
      playerId: 0,
    }), 22);
  });

  it('evaluates supported bytecode across a deterministic action batch', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const bytecode = makeBytecode([
      Opcode.LOAD_FEATURE, 0,
      Opcode.LOAD_CONST, 0,
      Opcode.ADD_SCORE,
      Opcode.HALT,
    ], [5], {
      refs: [
        { kind: 'playerInt', layoutIndex: 0, aux: [0, 1, 1] },
      ],
      refToId: {},
    });

    assert.deepEqual(runtime.evaluatePolicyBytecodeBatch(bytecode, makeEncoded(), {
      def: makeDef(),
      layout: makeLayout(),
      state: { activePlayer: 1 } as unknown as GameState,
      playerId: 0,
    }, [
      { actionId: 'move', stableMoveKey: 'move:{"x":1}' },
      { actionId: 'pass', stableMoveKey: 'pass:{}' },
    ]), [18, 18]);
  });

  it('rejects batch layout mismatches before evaluating action rows', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const bytecode = makeBytecode([Opcode.LOAD_CONST, 0, Opcode.HALT], [7]);

    assert.throws(
      () => runtime.evaluatePolicyBytecodeBatch(bytecode, makeEncoded(), {
        def: makeDef(),
        layout: makeLayout(),
        state: { activePlayer: 1 } as unknown as GameState,
        expectedLayoutId: 42,
      }, [
        { actionId: 'move', stableMoveKey: 'move:{}' },
      ]),
      /status -4/u,
    );
  });

  it('fails closed for unsupported bytecode instead of falling back to TypeScript', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const bytecode = makeBytecode([Opcode.RESOLVE_DYNAMIC, 1, Opcode.HALT]);

    assert.throws(
      () => runtime.evaluatePolicyBytecode(bytecode, makeEncoded(), {
        def: makeDef(),
        layout: makeLayout(),
        state: { activePlayer: 1 } as unknown as GameState,
      }),
      /status -14/u,
    );
  });

  it('fails closed for unsupported batch bytecode instead of falling back to TypeScript', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const bytecode = makeBytecode([Opcode.RESOLVE_DYNAMIC, 1, Opcode.HALT]);

    assert.throws(
      () => runtime.evaluatePolicyBytecodeBatch(bytecode, makeEncoded(), {
        def: makeDef(),
        layout: makeLayout(),
        state: { activePlayer: 1 } as unknown as GameState,
      }, [
        { actionId: 'move', stableMoveKey: 'move:{}' },
      ]),
      /status -14/u,
    );
  });
});
