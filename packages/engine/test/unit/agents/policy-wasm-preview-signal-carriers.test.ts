// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadPolicyWasmRuntime } from '../../../src/agents/policy-wasm-runtime-node-loader.js';
import type {
  PolicyWasmPreviewBranch,
  PolicyWasmPreviewSignalCarrier,
  PolicyWasmPreviewStatus,
} from '../../../src/agents/policy-wasm-preview-drive.js';

const PREVIEW_STATUSES: readonly PolicyWasmPreviewStatus[] = [
  'ready',
  'stochastic',
  'hidden',
  'unresolved',
  'failed',
  'depthCap',
  'gated',
];

const PREVIEW_BRANCHES: readonly PolicyWasmPreviewBranch[] = [
  'none',
  'greedy',
  'continuedDeepening',
];

const expectedCarrier = (
  previewStatus: PolicyWasmPreviewStatus,
  previewBranch: PolicyWasmPreviewBranch,
): PolicyWasmPreviewSignalCarrier => {
  const noSignal = previewStatus !== 'ready' && previewStatus !== 'stochastic';
  return {
    previewStatus,
    previewBranch,
    tiebreakAfterPreviewNoSignal: noSignal,
    policyPreviewSignalUnavailable: noSignal,
  };
};

describe('policy WASM preview-drive signal carriers', () => {
  it('round-trips Foundation 20 preview signal carriers through the WASM FFI', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const carriers = PREVIEW_STATUSES.flatMap((previewStatus) =>
      PREVIEW_BRANCHES.map((previewBranch) => expectedCarrier(previewStatus, previewBranch)));

    const result = wasm.evaluatePreviewDriveBatch({
      profileId: 'synthetic-preview-signal-carriers',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 4,
      previewStateSlots: ['global.score'],
      candidates: carriers.map((carrier, index) => ({
        actionId: 'branch',
        stableMoveKey: `candidate-${index}`,
        initialValue: index,
        initialPreviewStateValues: [index],
        previewSignalCarrier: carrier,
      })),
      steps: [{ kind: 'addGlobal', delta: 1 }],
    });

    if (result.kind !== 'supported') {
      assert.fail(`preview signal carrier batch unexpectedly unsupported: ${result.reason}`);
    }

    assert.deepEqual(result.rows.map((row) => row.previewSignalCarrier), carriers);
    assert.deepEqual(result.rows.map((row) => row.previewStateValues), carriers.map((_carrier, index) => ({
      'global.score': index + 1,
    })));
  });

  it('derives status from WASM outcome while preserving the caller preview branch', async () => {
    const wasm = await loadPolicyWasmRuntime();

    const result = wasm.evaluatePreviewDriveBatch({
      profileId: 'synthetic-preview-branch-derived-status',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 4,
      candidates: [{
        actionId: 'branch',
        stableMoveKey: 'candidate',
        initialValue: 0,
        previewBranch: 'continuedDeepening',
      }],
      steps: [{ kind: 'stochastic' }],
    });

    if (result.kind !== 'supported') {
      assert.fail(`preview branch carrier batch unexpectedly unsupported: ${result.reason}`);
    }

    assert.deepEqual(result.rows.map((row) => row.previewSignalCarrier), [{
      previewStatus: 'stochastic',
      previewBranch: 'continuedDeepening',
      tiebreakAfterPreviewNoSignal: false,
      policyPreviewSignalUnavailable: false,
    }]);
  });
});
