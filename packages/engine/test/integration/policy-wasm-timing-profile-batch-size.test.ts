// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '../../../../../');

const childScript = String.raw`
import * as assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.env.LUDOFORGE_REPO_ROOT;
const outputPath = process.env.POLICY_WASM_PROBE_OUTPUT;
assert.equal(typeof repoRoot, 'string');
assert.equal(typeof outputPath, 'string');
const timingModule = await import(pathToFileURL(join(repoRoot, 'packages/engine/dist/src/agents/policy-wasm-timing-profile.js')).href);

timingModule.resetPolicyWasmTimingBuckets();
timingModule.recordPolicyWasmTimingBucket('productionPreviewDrive', {
  marshalingNs: 10,
  executionNs: 20,
  deserializationNs: 30,
  batchSize: 1,
});
timingModule.recordPolicyWasmTimingBucket('productionPreviewDrive', {
  marshalingNs: 40,
  executionNs: 50,
  deserializationNs: 60,
  batchSize: 7,
});
const snapshot = timingModule.snapshotPolicyWasmTimingBuckets();
assert.equal(snapshot.scoreRows.callCount, 0);
if (process.env.POLICY_WASM_TIMING_PROFILE === '1') {
  snapshot.productionPreviewDrive.batchSizeHistogram['1'] = 99;
  const resnapshot = timingModule.snapshotPolicyWasmTimingBuckets();
  assert.equal(resnapshot.productionPreviewDrive.batchSizeHistogram['1'], 1);
  writeFileSync(outputPath, JSON.stringify(resnapshot.productionPreviewDrive));
} else {
  writeFileSync(outputPath, JSON.stringify(snapshot.productionPreviewDrive));
}
`;

const runBatchSizeProbe = (enabled: boolean) => {
  const env = { ...process.env };
  if (enabled) {
    env.POLICY_WASM_TIMING_PROFILE = '1';
  } else {
    delete env.POLICY_WASM_TIMING_PROFILE;
  }
  env.LUDOFORGE_REPO_ROOT = REPO_ROOT;
  const outputPath = join(tmpdir(), `policy-wasm-batch-size-${process.pid}-${enabled ? 'enabled' : 'disabled'}.json`);
  env.POLICY_WASM_PROBE_OUTPUT = outputPath;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', childScript], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = readFileSync(outputPath, 'utf8');
  unlinkSync(outputPath);
  return JSON.parse(output);
};

describe('policy WASM timing profile batch size telemetry', () => {
  it('accumulates sum, min, max, and histogram buckets when enabled', () => {
    assert.deepEqual(runBatchSizeProbe(true), {
      marshalingNs: 50,
      executionNs: 70,
      deserializationNs: 90,
      callCount: 2,
      batchSizeSum: 8,
      batchSizeMin: 1,
      batchSizeMax: 7,
      batchSizeHistogram: {
        '1': 1,
        '5-8': 1,
      },
    });
  });

  it('does not allocate or accumulate batch-size telemetry when disabled', () => {
    assert.deepEqual(runBatchSizeProbe(false), {
      marshalingNs: 0,
      executionNs: 0,
      deserializationNs: 0,
      callCount: 0,
      batchSizeSum: 0,
      batchSizeMin: 0,
      batchSizeMax: 0,
      batchSizeHistogram: {},
    });
  });
});
