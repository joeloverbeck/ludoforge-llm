// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  definePolicyWasmPreviewStateSlot,
  encodePolicyWasmPreviewDriveInput,
  type PolicyWasmPreviewDriveStep,
  type PolicyWasmPreviewStateSlot,
  type PolicyWasmPreviewStateSlotKind,
  type PolicyWasmPreviewStateSlotLifetime,
} from '../../../src/agents/policy-wasm-preview-drive.js';
import {
  POLICY_WASM_ABI_MAGIC,
  POLICY_WASM_ABI_VERSION,
} from '../../../src/agents/policy-wasm-runtime.js';
import {
  defaultPolicyWasmPath,
  loadPolicyWasmRuntime,
} from '../../../src/agents/policy-wasm-runtime-node-loader.js';

const SLOT_KINDS: readonly PolicyWasmPreviewStateSlotKind[] = [
  'global',
  'feature',
  'surface',
  'generic',
];

const SLOT_LIFETIMES: readonly PolicyWasmPreviewStateSlotLifetime[] = [
  'singleIteration',
  'crossIteration',
];

const slotId = (kind: PolicyWasmPreviewStateSlotKind, index: number): string => {
  switch (kind) {
    case 'global':
      return `global.score${index}`;
    case 'feature':
      return `feature.projected${index}`;
    case 'surface':
      return `surface.victoryCurrentMargin.${index}`;
    case 'generic':
      return `preview.drive.value${index}`;
  }
};

const buildSlots = (
  slotCount: number,
  lifetime: PolicyWasmPreviewStateSlotLifetime,
): readonly PolicyWasmPreviewStateSlot[] =>
  Array.from({ length: slotCount }, (_entry, index) => {
    const kind = SLOT_KINDS[index % SLOT_KINDS.length]!;
    return definePolicyWasmPreviewStateSlot(slotId(kind, index), { kind, lifetime });
  });

describe('policy WASM preview-drive preview-state slot ABI', () => {
  it('round-trips slot identity, kind, lifetime, and values through the WASM FFI', async () => {
    const wasm = await loadPolicyWasmRuntime();
    for (const lifetime of SLOT_LIFETIMES) {
      for (const slotCount of [1, 2, 4]) {
        const slots = buildSlots(slotCount, lifetime);
        const initialValues = slots.map((_slot, index) => index + 1);
        const result = wasm.evaluatePreviewDriveBatch({
          profileId: `synthetic-preview-state-slots-${slotCount}-${lifetime}`,
          originSeatId: '0',
          originTurnId: 0,
          depthCap: 16,
          previewStateSlots: slots,
          candidates: [{
            actionId: 'slot-round-trip',
            stableMoveKey: 'candidate',
            initialValue: initialValues[0]!,
            initialPreviewStateValues: initialValues,
          }],
          steps: slots.map((_slot, slotIndex): PolicyWasmPreviewDriveStep => ({
            kind: 'addPreviewSlot',
            slotIndex,
            delta: 10 + slotIndex,
          })),
        });

        if (result.kind !== 'supported') {
          assert.fail(`preview-state slot batch unexpectedly unsupported: ${result.reason}`);
        }
        assert.deepEqual(result.rows[0]?.previewStateSlots, slots);
        assert.deepEqual(result.rows[0]?.previewStateValues, Object.fromEntries(
          slots.map((slot, slotIndex) => [slot.id, initialValues[slotIndex]! + 10 + slotIndex]),
        ));
      }
    }
  });

  it('rejects invalid slot lifetimes and out-of-bound slot counts deterministically', async () => {
    const slots = buildSlots(2, 'crossIteration');
    const invalidLifetimeInput = encodePolicyWasmPreviewDriveInput({
      profileId: 'synthetic-invalid-slot-lifetime',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 16,
      previewStateSlots: slots,
      candidates: [{
        actionId: 'slot-rejection',
        stableMoveKey: 'candidate',
        initialValue: 0,
        initialPreviewStateValues: [0, 0],
      }],
      steps: [],
    }, POLICY_WASM_ABI_MAGIC, POLICY_WASM_ABI_VERSION);
    new DataView(invalidLifetimeInput.buffer, invalidLifetimeInput.byteOffset, invalidLifetimeInput.byteLength)
      .setInt32(13 * 4, 999, true);
    assert.equal(await evaluateRawPreviewDriveStatus(invalidLifetimeInput, 2, 1, 0), -12);

    const outOfBoundSlotInput = encodePolicyWasmPreviewDriveInput({
      profileId: 'synthetic-out-of-bound-slot-count',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 1,
      previewStateSlots: slots,
      candidates: [{
        actionId: 'slot-rejection',
        stableMoveKey: 'candidate',
        initialValue: 0,
        initialPreviewStateValues: [0, 0],
      }],
      steps: [],
    }, POLICY_WASM_ABI_MAGIC, POLICY_WASM_ABI_VERSION);
    assert.equal(await evaluateRawPreviewDriveStatus(outOfBoundSlotInput, 2, 1, 0), -12);
  });
});

const evaluateRawPreviewDriveStatus = async (
  input: Uint8Array,
  slotCount: number,
  candidateCount: number,
  decisionStackMaxDepth: number,
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
  const previewStateBytes = Math.max(4, candidateCount * slotCount * 4);
  const candidateGroupMetadataWords = candidateCount * 3;
  const candidateGroupMetadataBytes = candidateGroupMetadataWords * 4;
  const decisionStackWords = candidateCount * decisionStackMaxDepth * 6;
  const decisionStackBytes = Math.max(4, decisionStackWords * 4);
  const slotMetadataWords = slotCount * 3;
  const slotMetadataBytes = Math.max(4, slotMetadataWords * 4);
  const inputPtr = exports.ludoforge_policy_vm_alloc(input.byteLength);
  const outOutcomesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outDepthsPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outValuesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outPreviewStatePtr = exports.ludoforge_policy_vm_alloc(previewStateBytes);
  const outPreviewStatusesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outPreviewBranchesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outTiebreakAfterPreviewNoSignalPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outPolicyPreviewSignalUnavailablePtr = exports.ludoforge_policy_vm_alloc(outputBytes);
  const outCandidateGroupMetadataPtr = exports.ludoforge_policy_vm_alloc(candidateGroupMetadataBytes);
  const outDecisionStackPublicationPtr = exports.ludoforge_policy_vm_alloc(decisionStackBytes);
  const outPreviewStateSlotMetadataPtr = exports.ludoforge_policy_vm_alloc(slotMetadataBytes);
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
      decisionStackWords,
      outPreviewStateSlotMetadataPtr,
      slotMetadataWords,
      slotCount,
      candidateCount,
    );
  } finally {
    exports.ludoforge_policy_vm_dealloc(inputPtr, input.byteLength);
    for (const ptr of [
      outOutcomesPtr,
      outDepthsPtr,
      outValuesPtr,
      outPreviewStatusesPtr,
      outPreviewBranchesPtr,
      outTiebreakAfterPreviewNoSignalPtr,
      outPolicyPreviewSignalUnavailablePtr,
    ]) {
      exports.ludoforge_policy_vm_dealloc(ptr, outputBytes);
    }
    exports.ludoforge_policy_vm_dealloc(outPreviewStatePtr, previewStateBytes);
    exports.ludoforge_policy_vm_dealloc(outCandidateGroupMetadataPtr, candidateGroupMetadataBytes);
    exports.ludoforge_policy_vm_dealloc(outDecisionStackPublicationPtr, decisionStackBytes);
    exports.ludoforge_policy_vm_dealloc(outPreviewStateSlotMetadataPtr, slotMetadataBytes);
  }
};
