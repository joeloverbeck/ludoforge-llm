// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  encodePolicyWasmPreviewDriveInput,
  type PolicyWasmPreviewDriveCompletionOutcome,
  type PolicyWasmPreviewDriveCompletionRecord,
} from '../../../src/agents/policy-wasm-preview-drive.js';
import {
  POLICY_WASM_ABI_MAGIC,
  POLICY_WASM_ABI_VERSION,
} from '../../../src/agents/policy-wasm-runtime.js';
import {
  defaultPolicyWasmPath,
  loadPolicyWasmRuntime,
} from '../../../src/agents/policy-wasm-runtime-node-loader.js';

const COMPLETION_OUTCOMES: readonly PolicyWasmPreviewDriveCompletionOutcome[] = [
  'completed',
  'stochastic',
  'depthCap',
  'failed',
];

const buildRecords = (
  iterationCount: number,
  residualBudget: number,
  outcome: PolicyWasmPreviewDriveCompletionOutcome,
): readonly PolicyWasmPreviewDriveCompletionRecord[] =>
  Array.from({ length: iterationCount }, (_entry, iterationIndex) => ({
    iterationIndex,
    residualBudget,
    outcome,
  }));

describe('policy WASM preview-drive continued-deepening completion ABI', () => {
  it('round-trips bounded completion records through the WASM FFI', async () => {
    const wasm = await loadPolicyWasmRuntime();
    for (const iterationCount of [1, 2, 4]) {
      for (const residualBudget of [0, 1, 4]) {
        for (const outcome of COMPLETION_OUTCOMES) {
          const records = buildRecords(iterationCount, residualBudget, outcome);
          const result = wasm.evaluatePreviewDriveBatch({
            profileId: `synthetic-continued-deepening-completion-${iterationCount}-${residualBudget}-${outcome}`,
            originSeatId: '0',
            originTurnId: 0,
            depthCap: 4,
            candidates: [{
              actionId: 'continued-deepening-completion',
              stableMoveKey: 'candidate',
              initialValue: 10,
              previewBranch: 'continuedDeepening',
              continuedDeepeningCompletionRecords: records,
            }],
            steps: [{ kind: 'addGlobal', delta: 1 }],
          });

          if (result.kind !== 'supported') {
            assert.fail(`continued-deepening completion batch unexpectedly unsupported: ${result.reason}`);
          }
          assert.deepEqual(result.rows[0]?.continuedDeepeningCompletionRecords, records);
          assert.equal(result.rows[0]?.value, 11);
        }
      }
    }
  });

  it('preserves iteration identity across rebroadcast', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const records = [
      { iterationIndex: 0, residualBudget: 3, outcome: 'completed' },
      { iterationIndex: 1, residualBudget: 2, outcome: 'depthCap' },
      { iterationIndex: 2, residualBudget: 0, outcome: 'failed' },
    ] as const satisfies readonly PolicyWasmPreviewDriveCompletionRecord[];
    const input = {
      profileId: 'synthetic-continued-deepening-completion-rebroadcast',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 4,
      candidates: [{
        actionId: 'continued-deepening-completion',
        stableMoveKey: 'candidate',
        initialValue: 0,
        previewBranch: 'continuedDeepening' as const,
        continuedDeepeningCompletionRecords: records,
      }],
      steps: [],
    };

    const first = wasm.evaluatePreviewDriveBatch(input);
    const second = wasm.evaluatePreviewDriveBatch(input);

    assert.equal(first.kind, 'supported');
    assert.equal(second.kind, 'supported');
    if (first.kind === 'supported' && second.kind === 'supported') {
      assert.deepEqual(first.rows[0]?.continuedDeepeningCompletionRecords, records);
      assert.deepEqual(second.rows[0]?.continuedDeepeningCompletionRecords, records);
      assert.deepEqual(second.rows[0]?.continuedDeepeningCompletionRecords, first.rows[0]?.continuedDeepeningCompletionRecords);
    }
  });

  it('rejects malformed completion records deterministically', async () => {
    const input = encodePolicyWasmPreviewDriveInput({
      profileId: 'synthetic-invalid-continued-deepening-completion',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 4,
      candidates: [{
        actionId: 'continued-deepening-completion',
        stableMoveKey: 'candidate',
        initialValue: 0,
        continuedDeepeningCompletionRecords: [{
          iterationIndex: 0,
          residualBudget: 1,
          outcome: 'completed',
        }],
      }],
      steps: [],
    }, POLICY_WASM_ABI_MAGIC, POLICY_WASM_ABI_VERSION);

    new DataView(input.buffer, input.byteOffset, input.byteLength).setInt32(28 * 4, 999, true);

    assert.equal(await evaluateRawPreviewDriveStatus(input, 1), -12);
  });
});

const evaluateRawPreviewDriveStatus = async (
  input: Uint8Array,
  completionRecordMaxCount: number,
): Promise<number> => {
  const wasmBytes = await readFile(defaultPolicyWasmPath());
  const instance = await WebAssembly.instantiate(wasmBytes, {}) as WebAssembly.WebAssemblyInstantiatedSource;
  const exports = instance.instance.exports as {
    readonly memory: WebAssembly.Memory;
    readonly ludoforge_policy_vm_alloc: (len: number) => number;
    readonly ludoforge_policy_vm_dealloc: (ptr: number, len: number) => void;
    readonly ludoforge_policy_vm_evaluate_preview_drive_batch: (
      inputPtr: number,
      inputLen: number,
      outOutcomesPtr: number,
      outDepthsPtr: number,
      outValuesPtr: number,
      outPreviewStatePtr: number,
      outPreviewStatusesPtr: number,
      outPreviewBranchesPtr: number,
      outTiebreakAfterPreviewNoSignalPtr: number,
      outPolicyPreviewSignalUnavailablePtr: number,
      outCandidateGroupMetadataPtr: number,
      outCandidateGroupMetadataLen: number,
      outDecisionStackPublicationPtr: number,
      outDecisionStackPublicationLen: number,
      outCompletionRecordsPtr: number,
      outCompletionRecordsLen: number,
      outPreviewStateSlotMetadataPtr: number,
      outPreviewStateSlotMetadataLen: number,
      outPreviewStateLen: number,
      outLen: number,
    ) => number;
  };
  const outputBytes = 4;
  const candidateGroupBytes = 3 * 4;
  const completionRecordWords = completionRecordMaxCount * 3;
  const completionRecordBytes = Math.max(4, completionRecordWords * 4);
  const inputPtr = exports.ludoforge_policy_vm_alloc(input.byteLength);
  const outOutcomesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outDepthsPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outValuesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outPreviewStatePtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outPreviewStatusesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outPreviewBranchesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outTiebreakAfterPreviewNoSignalPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outPolicyPreviewSignalUnavailablePtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outCandidateGroupMetadataPtr = exports.ludoforge_policy_vm_alloc(candidateGroupBytes);
  const outDecisionStackPublicationPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outCompletionRecordsPtr = exports.ludoforge_policy_vm_alloc(completionRecordBytes);
  const outPreviewStateSlotMetadataPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  try {
    new Uint8Array(exports.memory.buffer, inputPtr, input.byteLength).set(input);
    return exports.ludoforge_policy_vm_evaluate_preview_drive_batch(
      inputPtr,
      input.byteLength,
      outOutcomesPtr,
      outDepthsPtr,
      outValuesPtr,
      outPreviewStatePtr,
      outPreviewStatusesPtr,
      outPreviewBranchesPtr,
      outTiebreakAfterPreviewNoSignalPtr,
      outPolicyPreviewSignalUnavailablePtr,
      outCandidateGroupMetadataPtr,
      3,
      outDecisionStackPublicationPtr,
      0,
      outCompletionRecordsPtr,
      completionRecordWords,
      outPreviewStateSlotMetadataPtr,
      0,
      0,
      1,
    );
  } finally {
    exports.ludoforge_policy_vm_dealloc(inputPtr, input.byteLength);
    for (const ptr of [
      outOutcomesPtr,
      outDepthsPtr,
      outValuesPtr,
      outPreviewStatePtr,
      outPreviewStatusesPtr,
      outPreviewBranchesPtr,
      outTiebreakAfterPreviewNoSignalPtr,
      outPolicyPreviewSignalUnavailablePtr,
      outDecisionStackPublicationPtr,
      outPreviewStateSlotMetadataPtr,
    ]) {
      exports.ludoforge_policy_vm_dealloc(ptr, outputBytes);
    }
    exports.ludoforge_policy_vm_dealloc(outCandidateGroupMetadataPtr, candidateGroupBytes);
    exports.ludoforge_policy_vm_dealloc(outCompletionRecordsPtr, completionRecordBytes);
  }
};
