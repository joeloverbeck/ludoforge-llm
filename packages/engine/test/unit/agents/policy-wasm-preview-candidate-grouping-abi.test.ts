// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  decodePolicyWasmPreviewDriveRows,
  encodePolicyWasmPreviewDriveInput,
  type PolicyWasmPreviewCandidateGroup,
} from '../../../src/agents/policy-wasm-preview-drive.js';
import { stablePayloadCode } from '../../../src/cnl/policy-bytecode/feature-table.js';
import {
  POLICY_WASM_ABI_MAGIC,
  POLICY_WASM_ABI_VERSION,
} from '../../../src/agents/policy-wasm-runtime.js';
import {
  defaultPolicyWasmPath,
  loadPolicyWasmRuntime,
} from '../../../src/agents/policy-wasm-runtime-node-loader.js';

const buildGroups = (
  groupCount: number,
  groupSize: number,
): readonly PolicyWasmPreviewCandidateGroup[] =>
  Array.from({ length: groupCount }, (_groupEntry, groupIndex) =>
    Array.from({ length: groupSize }, (_candidateEntry, ordinalInGroup) => ({
      groupId: `group:${groupIndex}`,
      ordinalInGroup,
      groupSize,
    }))).flat();

describe('policy WASM preview-drive candidate grouping ABI', () => {
  it('round-trips candidate groups and preserves deterministic intra-group ordering', async () => {
    const wasm = await loadPolicyWasmRuntime();
    for (const groupCount of [1, 2, 3]) {
      for (const groupSize of [1, 2, 4]) {
        const groups = buildGroups(groupCount, groupSize);
        const result = wasm.evaluatePreviewDriveBatch({
          profileId: `synthetic-candidate-groups-${groupCount}x${groupSize}`,
          originSeatId: '0',
          originTurnId: 0,
          depthCap: 16,
          candidates: groups.map((candidateGroup, index) => ({
            actionId: 'candidate-group-round-trip',
            stableMoveKey: `candidate:${index}`,
            initialValue: index,
            candidateGroup,
          })),
          steps: [{ kind: 'addGlobal', delta: 1 }],
        });

        if (result.kind !== 'supported') {
          assert.fail(`candidate grouping batch unexpectedly unsupported: ${result.reason}`);
        }
        assert.deepEqual(result.rows.map((row) => row.stableMoveKey), groups.map((_group, index) => `candidate:${index}`));
        assert.deepEqual(result.rows.map((row) => row.candidateGroup), groups);
        assert.deepEqual(result.rows.map((row) => row.value), groups.map((_group, index) => index + 1));
      }
    }
  });

  it('rejects malformed grouping metadata deterministically', async () => {
    const input = encodePolicyWasmPreviewDriveInput({
      profileId: 'synthetic-invalid-candidate-group',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 16,
      candidates: buildGroups(1, 2).map((candidateGroup, index) => ({
        actionId: 'candidate-group-rejection',
        stableMoveKey: `candidate:${index}`,
        initialValue: index,
        candidateGroup,
      })),
      steps: [],
    }, POLICY_WASM_ABI_MAGIC, POLICY_WASM_ABI_VERSION);
    new DataView(input.buffer, input.byteOffset, input.byteLength).setInt32(28 * 4, 0, true);

    assert.equal(await evaluateRawPreviewDriveStatus(input, 2), -12);
  });

  it('rejects mirrored grouping metadata that is not byte-equivalent to the encoded candidate group', () => {
    const rows = () => decodeRowsFromMirroredGroupWords(0, 1, 2);

    assert.throws(
      rows,
      /candidate group ordinal mismatch/,
    );
  });
});

const decodeRowsFromMirroredGroupWords = (
  ordinalInGroup: number,
  expectedOrdinalInGroup: number,
  groupSize: number,
): void => {
  const memory = new ArrayBuffer(128);
  const view = new DataView(memory);
  const outOutcomesPtr = 0;
  const outDepthsPtr = 4;
  const outValuesPtr = 8;
  const outPreviewStatePtr = 12;
  const outPreviewStatusesPtr = 16;
  const outPreviewBranchesPtr = 20;
  const outTiebreakAfterPreviewNoSignalPtr = 24;
  const outPolicyPreviewSignalUnavailablePtr = 28;
  const outCandidateGroupMetadataPtr = 32;
  const groupId = 'group:decode';
  view.setInt32(outOutcomesPtr, 1, true);
  view.setInt32(outDepthsPtr, 0, true);
  view.setInt32(outValuesPtr, 10, true);
  view.setInt32(outPreviewStatusesPtr, 1, true);
  view.setInt32(outPreviewBranchesPtr, 0, true);
  view.setInt32(outTiebreakAfterPreviewNoSignalPtr, 0, true);
  view.setInt32(outPolicyPreviewSignalUnavailablePtr, 0, true);
  view.setInt32(outCandidateGroupMetadataPtr, stablePayloadCode({ literal: groupId }), true);
  view.setInt32(outCandidateGroupMetadataPtr + 4, ordinalInGroup, true);
  view.setInt32(outCandidateGroupMetadataPtr + 8, groupSize, true);

  decodePolicyWasmPreviewDriveRows({
    profileId: 'synthetic-candidate-group-decode-mismatch',
    originSeatId: '0',
    originTurnId: 0,
    depthCap: 16,
    candidates: [{
      actionId: 'candidate-group-decode',
      stableMoveKey: 'candidate:0',
      initialValue: 0,
      candidateGroup: {
        groupId,
        ordinalInGroup: expectedOrdinalInGroup,
        groupSize,
      },
    }],
    steps: [],
  }, memory, outOutcomesPtr, outDepthsPtr, outValuesPtr, outPreviewStatePtr, outPreviewStatusesPtr, outPreviewBranchesPtr, outTiebreakAfterPreviewNoSignalPtr, outPolicyPreviewSignalUnavailablePtr, outCandidateGroupMetadataPtr, 0, 0, 0);
};

const evaluateRawPreviewDriveStatus = async (
  input: Uint8Array,
  candidateCount: number,
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
      outPreviewStateSlotMetadataPtr: number,
      outPreviewStateSlotMetadataLen: number,
      outPreviewStateLen: number,
      outLen: number,
    ) => number;
  };
  const outputBytes = Math.max(4, candidateCount * 4);
  const candidateGroupMetadataWords = candidateCount * 3;
  const candidateGroupMetadataBytes = candidateGroupMetadataWords * 4;
  const inputPtr = exports.ludoforge_policy_vm_alloc(input.byteLength);
  const outOutcomesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outDepthsPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outValuesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outPreviewStatePtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outPreviewStatusesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outPreviewBranchesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outTiebreakAfterPreviewNoSignalPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outPolicyPreviewSignalUnavailablePtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outCandidateGroupMetadataPtr = exports.ludoforge_policy_vm_alloc(candidateGroupMetadataBytes);
  const outDecisionStackPublicationPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
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
      candidateGroupMetadataWords,
      outDecisionStackPublicationPtr,
      0,
      outPreviewStateSlotMetadataPtr,
      0,
      0,
      candidateCount,
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
    exports.ludoforge_policy_vm_dealloc(outCandidateGroupMetadataPtr, candidateGroupMetadataBytes);
  }
};
