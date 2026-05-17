// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '../../../../../../');

const childScript = String.raw`
import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const runtimeModule = await import(pathToFileURL(join(process.cwd(), 'packages/engine/dist/src/agents/policy-wasm-runtime.js')).href);
process.env.POLICY_WASM_TIMING_PROFILE = process.argv[1];

const def = {
  metadata: { players: { min: 1, max: 2 } },
  zones: [{ id: 'board', zoneKind: 'board' }],
};
const layout = {
  zoneIds: ['board'],
  tokenIds: [],
  playerIds: [0, 1],
  markerIds: [],
  variableIds: [],
  tokenLayout: {
    tokenCount: 0,
    tokenTypeIds: [],
    tokenIndexById: {},
    tokenTypeIndexById: {},
    propIdsByTokenType: {},
    scalarPropIds: [],
    scalarPropIndexById: {},
    scalarPropTypesById: {},
  },
  markerLayout: {
    markerCount: 0,
    zoneMarkerIds: [],
    globalMarkerIds: [],
    markerIndexById: {},
    markerStateIdsByMarkerId: {},
  },
  varLayout: {
    variableCount: 0,
    globalVariableIds: [],
    perPlayerVariableIds: [],
    zoneVariableIds: [],
    variableIndexById: {},
  },
  bitsetLayout: {
    tokenFlagCount: 0,
    tokenFlagWordCount: 0,
    zoneMarkerBitCount: 0,
    zoneMarkerWordCount: 0,
    globalMarkerBitCount: 0,
  },
};
const encoded = {
  tokenIds: [],
  tokenIndexById: {},
  tokenTypeByIndex: [],
  tokenZone: new Int16Array(),
  tokenOccurrenceOffset: new Int32Array(),
  tokenOccurrenceCount: new Int16Array(),
  tokenOccurrenceZones: new Int16Array(),
  tokenFlags: new BigUint64Array(),
  tokenScalarPropValues: new Int32Array(),
  tokenScalarPropPresent: new Uint8Array(),
  tokenScalarStringValuesByProp: {},
  zoneOccupancy: Int16Array.from([0]),
  playerInts: Int32Array.from([11, 13]),
  zoneInts: new Int32Array(),
  zoneMarkers: new BigUint64Array(),
  globalMarkers: new BigUint64Array(),
  globals: new Int32Array(),
};
const consideration = {
  id: 'preferPass',
  scopes: ['move'],
  costClass: 'candidate',
  when: {
    kind: 'ref',
    ref: { kind: 'candidateTag', tagName: 'pass' },
  },
  weight: { kind: 'param', id: 'urgencyWeight' },
  value: {
    kind: 'ref',
    ref: { kind: 'candidateParam', id: 'urgency', onMissing: 'unavailable' },
  },
  dependencies: { parameters: ['urgencyWeight'], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
};
const fakeRuntime = {
  evaluatePolicyBytecodeBatch: (_bytecode, _encoded, _context, candidates) => candidates.map((_candidate, index) => index + 1),
};
const input = {
  def,
  encoded,
  context: {
    def,
    layout,
    state: { activePlayer: 1 },
    playerId: 0,
    bytecodeCacheAxisLabel: 'train|continuedDeepening',
  },
  parameterValues: { urgencyWeight: 3 },
  considerations: [{ id: 'preferPass', consideration }],
  candidates: [
    { actionId: 'move', stableMoveKey: 'move:{"x":1}', params: { urgency: 4 }, tags: [] },
    { actionId: 'pass', stableMoveKey: 'pass:{}', params: { urgency: 2 }, tags: ['pass'] },
  ],
};

runtimeModule.__internal_for_tests.resetProductionScoreRowCounters();
assert.equal(runtimeModule.evaluateWasmMoveConsiderationScoreRows(fakeRuntime, input).kind, 'supported');
assert.equal(runtimeModule.evaluateWasmMoveConsiderationScoreRows(fakeRuntime, input).kind, 'supported');
if (process.argv[1] === 'ordering') {
  for (const bytecodeCacheAxisLabel of ['z|singlePass', 'ä|singlePass']) {
    const axisInput = {
      ...input,
      context: {
        ...input.context,
        bytecodeCacheAxisLabel,
      },
    };
    assert.equal(runtimeModule.evaluateWasmMoveConsiderationScoreRows(fakeRuntime, axisInput).kind, 'supported');
  }
}
const axisStats = runtimeModule.__internal_for_tests.snapshotPolicyWasmBytecodeCacheAxisStats();
const compileCount = runtimeModule.__internal_for_tests.getProductionScoreRowBytecodeCompileCount();
const hitCount = runtimeModule.__internal_for_tests.getProductionScoreRowBytecodeCacheHitCount();
const missCount = runtimeModule.__internal_for_tests.getProductionScoreRowBytecodeCacheMissCount();
process.stdout.write(JSON.stringify({ axisStats, compileCount, hitCount, missCount }));
`;

const runProbe = (initialFlag: 'enabled' | 'disabled', mutation: '1' | '' | 'ordering') => {
  const env = { ...process.env };
  if (initialFlag === 'enabled') {
    env.POLICY_WASM_TIMING_PROFILE = '1';
  } else {
    delete env.POLICY_WASM_TIMING_PROFILE;
  }
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', childScript, mutation], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

describe('policy WASM bytecode cache axis stats', () => {
  it('keeps per-axis stats empty when timing profile is disabled at import', () => {
    const result = runProbe('disabled', '1');

    assert.deepEqual(result.axisStats, {});
    assert.equal(result.compileCount, 3);
    assert.equal(result.hitCount, 3);
    assert.equal(result.missCount, 3);
  });

  it('records per-axis hit/miss and compile-time stats when timing profile is enabled', () => {
    const result = runProbe('enabled', '');
    const stats = result.axisStats['train|continuedDeepening'];

    assert.equal(result.compileCount, 3);
    assert.equal(result.hitCount, 3);
    assert.equal(result.missCount, 3);
    assert.equal(stats.hits, result.hitCount);
    assert.equal(stats.misses, result.compileCount);
    assert.ok(stats.compileTimeMs >= 0);
  });

  it('snapshots axis stats in deterministic ordinal order', () => {
    const result = runProbe('enabled', 'ordering');

    assert.deepEqual(Object.keys(result.axisStats), [
      'train|continuedDeepening',
      'z|singlePass',
      'ä|singlePass',
    ]);
  });
});
