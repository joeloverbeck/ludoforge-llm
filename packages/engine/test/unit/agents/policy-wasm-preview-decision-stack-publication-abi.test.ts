// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  encodePolicyWasmPreviewDriveInput,
  type PolicyWasmDecisionStackPublication,
  type PolicyWasmDecisionStackFrameVariant,
} from '../../../src/agents/policy-wasm-preview-drive.js';
import {
  POLICY_WASM_ABI_MAGIC,
  POLICY_WASM_ABI_VERSION,
} from '../../../src/agents/policy-wasm-runtime.js';
import {
  defaultPolicyWasmPath,
  loadPolicyWasmRuntime,
} from '../../../src/agents/policy-wasm-runtime-node-loader.js';

const FRAME_VARIANTS: readonly PolicyWasmDecisionStackFrameVariant[] = [
  'actionSelection',
  'chooseOne',
  'chooseNStep',
  'stochasticResolve',
  'outcomeGrantResolve',
  'turnRetirement',
];

const buildPublication = (
  depth: number,
  variantOffset: number,
): PolicyWasmDecisionStackPublication => ({
  maxDepth: FRAME_VARIANTS.length,
  frames: Array.from({ length: depth }, (_entry, index) => ({
    frameId: 100 + index,
    parentFrameId: index === 0 ? null : 99 + index,
    turnId: 500 + index,
    depth: index,
    variant: FRAME_VARIANTS[(index + variantOffset) % FRAME_VARIANTS.length]!,
    contextId: `ctx:${depth}:${index}:${FRAME_VARIANTS[(index + variantOffset) % FRAME_VARIANTS.length]!}`,
  })),
});

describe('policy WASM preview-drive decision-stack publication ABI', () => {
  it('round-trips bounded decision-stack publications through the WASM FFI', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const publications = FRAME_VARIANTS.flatMap((_variant, variantOffset) =>
      Array.from({ length: FRAME_VARIANTS.length + 1 }, (_entry, depth) =>
        buildPublication(depth, variantOffset)));

    const result = wasm.evaluatePreviewDriveBatch({
      profileId: 'synthetic-decision-stack-publication',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      candidates: publications.map((publication, index) => ({
        actionId: 'decision-stack',
        stableMoveKey: `candidate-${index}`,
        initialValue: index,
        decisionStackPublication: publication,
      })),
      steps: [{ kind: 'addGlobal', delta: 1 }],
    });

    if (result.kind !== 'supported') {
      assert.fail(`decision-stack publication batch unexpectedly unsupported: ${result.reason}`);
    }

    assert.deepEqual(
      result.rows.map((row) => row.decisionStackPublication),
      publications,
    );
  });

  it('rejects malformed decision-stack frame variants deterministically', async () => {
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
        outDecisionStackPublicationPtr: number,
        outDecisionStackPublicationLen: number,
        outPreviewStateLen: number,
        outLen: number,
      ) => number;
    };

    const input = encodePolicyWasmPreviewDriveInput({
      profileId: 'malformed-decision-stack-publication',
      originSeatId: '0',
      originTurnId: 0,
      depthCap: 8,
      candidates: [{
        actionId: 'decision-stack',
        stableMoveKey: 'candidate',
        initialValue: 0,
        decisionStackPublication: buildPublication(1, 0),
      }],
      steps: [],
    }, POLICY_WASM_ABI_MAGIC, POLICY_WASM_ABI_VERSION);
    new DataView(input.buffer, input.byteOffset, input.byteLength).setInt32(25 * 4, 999, true);

    const outputBytes = 4;
    const decisionStackBytes = FRAME_VARIANTS.length * 6 * 4;
    const inputPtr = exports.ludoforge_policy_vm_alloc(input.byteLength);
    const outOutcomesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
    const outDepthsPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
    const outValuesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
    const outPreviewStatePtr = exports.ludoforge_policy_vm_alloc(outputBytes);
    const outPreviewStatusesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
    const outPreviewBranchesPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
    const outTiebreakAfterPreviewNoSignalPtr = exports.ludoforge_policy_vm_alloc(outputBytes);
    const outPolicyPreviewSignalUnavailablePtr = exports.ludoforge_policy_vm_alloc(outputBytes);
    const outDecisionStackPublicationPtr = exports.ludoforge_policy_vm_alloc(decisionStackBytes);
    try {
      new Uint8Array(exports.memory.buffer, inputPtr, input.byteLength).set(input);
      const status = exports.ludoforge_policy_vm_evaluate_preview_drive_batch(
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
        outDecisionStackPublicationPtr,
        FRAME_VARIANTS.length * 6,
        0,
        1,
      );

      assert.equal(status, -12);
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
      ]) {
        exports.ludoforge_policy_vm_dealloc(ptr, outputBytes);
      }
      exports.ludoforge_policy_vm_dealloc(outDecisionStackPublicationPtr, decisionStackBytes);
    }
  });
});
