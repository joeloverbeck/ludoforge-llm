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
const loaderModule = await import(pathToFileURL(join(process.cwd(), 'packages/engine/dist/src/agents/policy-wasm-runtime-node-loader.js')).href);
const bytecodeModule = await import(pathToFileURL(join(process.cwd(), 'packages/engine/dist/src/cnl/policy-bytecode/index.js')).href);
process.env.POLICY_WASM_TIMING_PROFILE = process.argv[1];

const runtime = await loaderModule.loadPolicyWasmRuntime();
const bytecode = {
  instructions: Int32Array.from([bytecodeModule.Opcode.LOAD_FEATURE, 0, bytecodeModule.Opcode.HALT]),
  constants: new Int32Array(),
  featureTable: {
    refs: [{ kind: 'playerInt', layoutIndex: 0, aux: [0, 1, 1] }],
    refToId: {},
  },
  metadata: {
    version: 1,
    sourceFingerprint: 'policy-wasm-serialization-stats-test',
    targetVmVersion: 1,
  },
};
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
    variableCount: 1,
    globalVariableIds: [],
    perPlayerVariableIds: ['cash'],
    zoneVariableIds: [],
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

runtimeModule.__internal_for_tests.resetProductionScoreRowCounters();
runtimeModule.__internal_for_tests.resetPolicyWasmTimingBuckets();
runtimeModule.__internal_for_tests.resetPolicyWasmSerializationStats();
assert.deepEqual(runtime.evaluatePolicyBytecodeBatch(bytecode, encoded, {
  def,
  layout,
  state: { activePlayer: 1, stateHash: 0x1234n },
  playerId: 0,
  timingRouteClass: 'scoreRows',
  bytecodeCacheAxisLabel: 'train|continuedDeepening',
  bytecodeInputCache: new Map(),
}, [
  { actionId: 'move', stableMoveKey: 'move:{}' },
]), [13]);
process.stdout.write(JSON.stringify({
  serializationStats: runtimeModule.__internal_for_tests.snapshotPolicyWasmSerializationStats(),
  cacheWriteStats: runtimeModule.__internal_for_tests.snapshotPolicyWasmBytecodeInputCacheWriteStats(),
}));
`;

const runProbe = (initialFlag: 'enabled' | 'disabled', mutation: '1' | '') => {
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

describe('policy WASM serialization stats', () => {
  it('keeps serialization and cache-write stats empty when timing profile is disabled at import', () => {
    const result = runProbe('disabled', '1');

    assert.deepEqual(result.serializationStats, {});
    assert.deepEqual(result.cacheWriteStats, {});
  });

  it('records serialized bytes and one bytecode-input-cache write after one routed WASM miss', () => {
    const result = runProbe('enabled', '');
    const serializationStats = result.serializationStats['train|continuedDeepening'];
    const cacheWriteStats = result.cacheWriteStats['train|continuedDeepening'];

    assert.equal(serializationStats.callCount, 1);
    assert.ok(serializationStats.totalBytes > 0);
    assert.equal(cacheWriteStats.writeCount, 1);
    assert.ok(cacheWriteStats.totalWriteBytes > 0);
    assert.ok(cacheWriteStats.totalWriteMs >= 0);
  });
});
