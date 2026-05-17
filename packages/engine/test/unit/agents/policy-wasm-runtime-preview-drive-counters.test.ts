// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  __internal_for_tests as policyWasmRuntimeInternals,
  getProductionPolicyWasmPreviewDriveRouteCount,
  getProductionPolicyWasmPreviewDriveUnsupportedCount,
  getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts,
  recordProductionPolicyWasmPreviewDrive,
} from '../../../src/agents/policy-wasm-runtime.js';

describe('policy WASM production preview-drive counters', () => {
  afterEach(() => {
    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
  });

  it('tracks supported and unsupported preview-drive route attempts separately', () => {
    policyWasmRuntimeInternals.resetProductionScoreRowCounters();

    recordProductionPolicyWasmPreviewDrive('supported');
    recordProductionPolicyWasmPreviewDrive('supported');
    recordProductionPolicyWasmPreviewDrive('unsupported', {
      unsupportedDriveClass: 'unsupported-effect',
      unsupportedOwner: 'production-preview-drive.previewStateSlots',
      reason: 'unsupported preview-state slot',
      projectedStateBoundaryKind: 'depthCap',
      projectedStateClassification: 'expected-terminal-boundary',
    });

    assert.equal(getProductionPolicyWasmPreviewDriveRouteCount(), 2);
    assert.equal(getProductionPolicyWasmPreviewDriveUnsupportedCount(), 1);
    assert.deepEqual(getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts(), [{
      unsupportedDriveClass: 'unsupported-effect',
      unsupportedOwner: 'production-preview-drive.previewStateSlots',
      reason: 'unsupported preview-state slot',
      projectedStateBoundaryKind: 'depthCap',
      projectedStateClassification: 'expected-terminal-boundary',
      count: 1,
    }]);
  });

  it('resets preview-drive counters with the production WASM counter reset hook', () => {
    recordProductionPolicyWasmPreviewDrive('supported');
    recordProductionPolicyWasmPreviewDrive('unsupported', {
      unsupportedDriveClass: 'unknown',
      reason: 'no initialized policy WASM runtime',
    });

    policyWasmRuntimeInternals.resetProductionScoreRowCounters();

    assert.equal(getProductionPolicyWasmPreviewDriveRouteCount(), 0);
    assert.equal(getProductionPolicyWasmPreviewDriveUnsupportedCount(), 0);
    assert.deepEqual(getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts(), []);
  });
});
