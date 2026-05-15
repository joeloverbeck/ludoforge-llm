// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadPolicyWasmRuntime } from '../../src/agents/policy-wasm-runtime-node-loader.js';
import {
  createSupportedPreviewDriveParityFixtures,
  createUnsupportedPreviewDriveFixture,
  evaluateSupportedPreviewDriveWithWasm,
  evaluateUnsupportedPreviewDriveWithTsOracle,
  projectWasmPreviewDriveRow,
} from './policy-wasm-preview-drive-equivalence-fixtures.js';

describe('policy WASM preview-drive TypeScript equivalence', () => {
  it('matches the TypeScript oracle for supported preview-drive rows', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const fixtures = createSupportedPreviewDriveParityFixtures();
    const result = evaluateSupportedPreviewDriveWithWasm(wasm, fixtures);

    if (result.kind !== 'supported') {
      assert.fail(`preview-drive parity fixture unexpectedly unsupported: ${result.reason}`);
    }

    assert.deepEqual(
      result.rows.map((row) => row.stableMoveKey),
      fixtures.map((fixture) => fixture.expected.stableMoveKey),
    );
    assert.deepEqual(
      result.rows.map(projectWasmPreviewDriveRow),
      fixtures.map((fixture) => ({
        stableMoveKey: fixture.expected.stableMoveKey,
        outcome: fixture.expected.outcome,
        value: fixture.expected.value,
        previewStateValues: fixture.expected.previewStateValues,
        previewSignalCarrier: fixture.expected.previewSignalCarrier,
        candidateGroup: fixture.expected.candidateGroup,
        decisionStackPublication: fixture.expected.decisionStackPublication,
        continuedDeepeningCompletionRecords: fixture.expected.continuedDeepeningCompletionRecords,
        rowDigest: fixture.expected.rowDigest,
      })),
    );
    assert.ok(
      fixtures.every((fixture) => fixture.expected.previewStateHash.length > 0),
      'TS preview-state hashes should be present for deterministic parity diagnostics',
    );
  });

  it('matches the TypeScript oracle for unsupported preview-drive classes', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const input = createUnsupportedPreviewDriveFixture();

    assert.deepEqual(
      wasm.evaluatePreviewDriveBatch(input),
      evaluateUnsupportedPreviewDriveWithTsOracle(input),
    );
  });
});
