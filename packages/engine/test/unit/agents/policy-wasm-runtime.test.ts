// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  POLICY_WASM_SMOKE_LAYOUT_ID,
  __internal_for_tests as policyWasmRuntimeInternals,
  evaluateWasmCandidateFeatureRow,
  evaluateWasmMoveConsiderationScoreRows,
  loadPolicyWasmRuntime,
} from '../../../src/agents/policy-wasm-runtime.js';
import { stablePayloadCode } from '../../../src/cnl/policy-bytecode/feature-table.js';
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

  it('evaluates candidate tag and scalar param refs across a deterministic action batch', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const bytecode = makeBytecode([
      Opcode.LOAD_FEATURE, 0,
      Opcode.BOOL_TO_NUMBER,
      Opcode.LOAD_FEATURE, 1,
      Opcode.ADD_SCORE,
      Opcode.HALT,
    ], [], {
      refs: [
        { kind: 'candidateTag', layoutIndex: 0, aux: [stableStringCodeForTest('pass')] },
        { kind: 'candidateParam', layoutIndex: 0, aux: [stableStringCodeForTest('urgency')] },
      ],
      refToId: {},
    });

    assert.deepEqual(runtime.evaluatePolicyBytecodeBatch(bytecode, makeEncoded(), {
      def: makeDef(),
      layout: makeLayout(),
      state: { activePlayer: 1 } as unknown as GameState,
      playerId: 0,
    }, [
      { actionId: 'move', stableMoveKey: 'move:{"x":1}', params: { urgency: 4 }, tags: [] },
      { actionId: 'pass', stableMoveKey: 'pass:{}', params: { urgency: 2 }, tags: ['pass'] },
    ]), [4, 3]);
  });

  it('preserves unsupported candidate param domains as undefined entries', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const bytecode = makeBytecode([Opcode.LOAD_FEATURE, 0, Opcode.HALT], [], {
      refs: [
        { kind: 'candidateIntrinsic', layoutIndex: 0, aux: [2] },
      ],
      refToId: {},
    });

    assert.deepEqual(
      runtime.evaluatePolicyBytecodeBatch(bytecode, makeEncoded(), {
        def: makeDef(),
        layout: makeLayout(),
        state: { activePlayer: 1 } as unknown as GameState,
        playerId: 0,
      }, [
        { actionId: 'move', stableMoveKey: 'move:{}', params: { payload: { nested: true }, urgency: 3 } },
      ]),
      [2],
    );
  });

  it('produces supported move-consideration score rows without TypeScript fallback', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const consideration = {
      id: 'preferPass',
      scopes: ['move'] as const,
      costClass: 'candidate' as const,
      when: {
        kind: 'ref' as const,
        ref: { kind: 'candidateTag' as const, tagName: 'pass' },
      },
      weight: { kind: 'literal' as const, value: 3 },
      value: {
        kind: 'ref' as const,
        ref: { kind: 'candidateParam' as const, id: 'urgency' },
      },
      dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
    };

    const result = evaluateWasmMoveConsiderationScoreRows(runtime, {
      def: makeDef(),
      encoded: makeEncoded(),
      context: {
        def: makeDef(),
        layout: makeLayout(),
        state: { activePlayer: 1 } as unknown as GameState,
        playerId: 0,
      },
      considerations: [{ id: 'preferPass', consideration }],
      candidates: [
        { actionId: 'move', stableMoveKey: 'move:{"x":1}', params: { urgency: 4 }, tags: [] },
        { actionId: 'pass', stableMoveKey: 'pass:{}', params: { urgency: 2 }, tags: ['pass'] },
      ],
    });

    assert.deepEqual(result, {
      kind: 'supported',
      rows: [
        { stableMoveKey: 'move:{"x":1}', score: 0 },
        { stableMoveKey: 'pass:{}', score: 6 },
      ],
    });
  });

  it('caches materialized score-row bytecode for repeated production batches', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const def = makeDef();
    const layout = makeLayout();
    const context = {
      def,
      layout,
      state: { activePlayer: 1 } as unknown as GameState,
      playerId: 0,
    };
    const parameterValues = { urgencyWeight: 3 };
    const consideration = {
      id: 'preferPass',
      scopes: ['move'] as const,
      costClass: 'candidate' as const,
      when: {
        kind: 'ref' as const,
        ref: { kind: 'candidateTag' as const, tagName: 'pass' },
      },
      weight: { kind: 'param' as const, id: 'urgencyWeight' },
      value: {
        kind: 'ref' as const,
        ref: { kind: 'candidateParam' as const, id: 'urgency' },
      },
      dependencies: { parameters: ['urgencyWeight'], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
    };
    const input = {
      def,
      encoded: makeEncoded(),
      context,
      parameterValues,
      considerations: [{ id: 'preferPass', consideration }],
      candidates: [
        { actionId: 'move', stableMoveKey: 'move:{"x":1}', params: { urgency: 4 }, tags: [] },
        { actionId: 'pass', stableMoveKey: 'pass:{}', params: { urgency: 2 }, tags: ['pass'] },
      ],
    };

    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
    assert.equal(policyWasmRuntimeInternals.getProductionScoreRowBytecodeCompileCount(), 0);
    assert.equal(evaluateWasmMoveConsiderationScoreRows(runtime, input).kind, 'supported');
    const firstCompileCount = policyWasmRuntimeInternals.getProductionScoreRowBytecodeCompileCount();
    assert.equal(firstCompileCount, 3);
    assert.equal(evaluateWasmMoveConsiderationScoreRows(runtime, input).kind, 'supported');
    assert.equal(policyWasmRuntimeInternals.getProductionScoreRowBytecodeCompileCount(), firstCompileCount);
  });

  it('uses precomputed state-feature, candidate-feature, and aggregate rows in WASM score batches', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const consideration = {
      id: 'featurePlusAggregate',
      scopes: ['move'] as const,
      costClass: 'candidate' as const,
      weight: { kind: 'literal' as const, value: 2 },
      value: {
        kind: 'op' as const,
        op: 'add' as const,
        args: [
          {
            kind: 'ref' as const,
            ref: { kind: 'library' as const, refKind: 'candidateFeature' as const, id: 'feature-a' },
          },
          {
            kind: 'ref' as const,
            ref: { kind: 'library' as const, refKind: 'aggregate' as const, id: 'agg-a' },
          },
          {
            kind: 'ref' as const,
            ref: { kind: 'library' as const, refKind: 'stateFeature' as const, id: 'state-a' },
          },
        ],
      },
      dependencies: { parameters: [], stateFeatures: ['state-a'], candidateFeatures: ['feature-a'], aggregates: ['agg-a'], strategicConditions: [] },
    };

    const result = evaluateWasmMoveConsiderationScoreRows(runtime, {
      def: makeDef(),
      encoded: makeEncoded(),
      context: {
        def: makeDef(),
        layout: makeLayout(),
        state: { activePlayer: 1 } as unknown as GameState,
        playerId: 0,
      },
      considerations: [{ id: 'featurePlusAggregate', consideration }],
      candidates: [
        { actionId: 'move', stableMoveKey: 'move:{"x":1}' },
        { actionId: 'pass', stableMoveKey: 'pass:{}' },
      ],
      precomputedStateFeatures: [{ id: 'state-a', value: 11 }],
      precomputedCandidateFeatures: [{ id: 'feature-a', values: [3, 5] }],
      precomputedAggregates: [{ id: 'agg-a', value: 7 }],
    });

    assert.deepEqual(result, {
      kind: 'supported',
      rows: [
        { stableMoveKey: 'move:{"x":1}', score: 42 },
        { stableMoveKey: 'pass:{}', score: 46 },
      ],
    });
  });

  it('uses preview-materialized candidate rows for preview-backed score batches', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const consideration = {
      id: 'projectedMargin',
      scopes: ['move'] as const,
      costClass: 'preview' as const,
      weight: { kind: 'literal' as const, value: 4 },
      value: {
        kind: 'ref' as const,
        ref: { kind: 'library' as const, refKind: 'candidateFeature' as const, id: 'projected-margin' },
      },
      dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['projected-margin'], aggregates: [], strategicConditions: [] },
    };

    const result = evaluateWasmMoveConsiderationScoreRows(runtime, {
      def: makeDef(),
      encoded: makeEncoded(),
      context: {
        def: makeDef(),
        layout: makeLayout(),
        state: { activePlayer: 1 } as unknown as GameState,
        playerId: 0,
      },
      considerations: [{ id: 'projectedMargin', consideration }],
      candidates: [
        { actionId: 'move', stableMoveKey: 'move:{"x":1}' },
        { actionId: 'pass', stableMoveKey: 'pass:{}' },
      ],
      precomputedPreviewCandidateFeatures: [{
        id: 'projected-margin',
        outcomes: ['ready', 'gated'],
        values: [6, 2],
      }],
    });

    assert.deepEqual(result, {
      kind: 'supported',
      rows: [
        { stableMoveKey: 'move:{"x":1}', score: 24 },
        { stableMoveKey: 'pass:{}', score: 8 },
      ],
    });
  });

  it('uses dynamic preview-state rows when evaluating candidate features in WASM', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const ref = { kind: 'library' as const, refKind: 'previewStateFeature' as const, id: 'projected' };
    const values = evaluateWasmCandidateFeatureRow(runtime, {
      def: makeDef(),
      encoded: makeEncoded(),
      context: {
        def: makeDef(),
        layout: makeLayout(),
        state: { activePlayer: 1 } as unknown as GameState,
        playerId: 0,
      },
      expr: {
        kind: 'op',
        op: 'coalesce',
        args: [
          { kind: 'ref', ref },
          { kind: 'literal', value: 0 },
        ],
      },
      candidates: [
        { actionId: 'move', stableMoveKey: 'move:{"x":1}' },
        { actionId: 'pass', stableMoveKey: 'pass:{}' },
      ],
      precomputedDynamicCandidateFeatures: [{
        code: stablePayloadCode(ref),
        values: [9, undefined],
      }],
    });

    assert.deepEqual(values, [9, 0]);
  });

  it('fails closed when preview-backed rows are not materialized', async () => {
    const runtime = await loadPolicyWasmRuntime();
    const consideration = {
      id: 'projectedMargin',
      scopes: ['move'] as const,
      costClass: 'preview' as const,
      weight: { kind: 'literal' as const, value: 4 },
      value: {
        kind: 'ref' as const,
        ref: { kind: 'library' as const, refKind: 'candidateFeature' as const, id: 'projected-margin' },
      },
      dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['projected-margin'], aggregates: [], strategicConditions: [] },
    };

    const result = evaluateWasmMoveConsiderationScoreRows(runtime, {
      def: makeDef(),
      encoded: makeEncoded(),
      context: {
        def: makeDef(),
        layout: makeLayout(),
        state: { activePlayer: 1 } as unknown as GameState,
        playerId: 0,
      },
      considerations: [{ id: 'projectedMargin', consideration }],
      candidates: [{ actionId: 'move', stableMoveKey: 'move:{}' }],
    });

    assert.deepEqual(result, {
      kind: 'unsupported',
      reason: 'preview-backed consideration projectedMargin requires preview candidate feature row projected-margin',
    });
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

const stableStringCodeForTest = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 1;
};
