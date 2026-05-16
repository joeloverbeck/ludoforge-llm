// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evaluateProductionPreviewDriveBatchWithWasm,
} from '../../src/agents/policy-wasm-production-preview-drive.js';
import { loadPolicyWasmRuntime } from '../../src/agents/policy-wasm-runtime-node-loader.js';
import { serializeGameState } from '../../src/kernel/index.js';
import {
  createSupportedPreviewDriveParityFixtures,
  previewStateSlots,
} from './policy-wasm-preview-drive-equivalence-fixtures.js';

describe('policy WASM preview-drive state-patch materialization', () => {
  it('materializes WASM-returned state patches into canonical projected GameState values', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const fixtures = createSupportedPreviewDriveParityFixtures();
    const result = evaluateProductionPreviewDriveBatchWithWasm({
      runtime: wasm,
      def: fixtures[0]!.def,
      state: fixtures[0]!.state,
      profileId: 'synthetic-preview-drive-state-patch',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      previewBranch: 'continuedDeepening',
      previewStateSlots,
      candidates: fixtures.map((fixture) => fixture.candidate),
      materializeStatePatch: true,
    });

    if (result.kind !== 'supported') {
      assert.fail(`state-patch preview-drive fixture unexpectedly unsupported: ${result.reason}`);
    }
    assert.deepEqual(result.rows.map((row) => row.statePatch?.ops.map((op) => op.kind)), [
      ['setActionUsage', 'setMicroturnMetadata', 'setGlobalVar', 'setGlobalVar'],
      ['setActionUsage', 'setMicroturnMetadata', 'setGlobalVar', 'setGlobalVar'],
    ]);
    assert.deepEqual(result.rows.map((row) => row.projectedState === undefined ? undefined : serializeGameState(row.projectedState).stateHash), [
      fixtures[0]!.expected.previewStateHash,
      fixtures[1]!.expected.previewStateHash,
    ]);
  });
});
