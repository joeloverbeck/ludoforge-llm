// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  chooseNStepContinuationStableKey,
  lowerPolicyWasmChooseNStepContinuation,
} from '../../../src/agents/policy-wasm-preview-choosenstep-continuation.js';
import {
  getProductionPolicyWasmPreviewDriveRouteCount,
  getProductionPolicyWasmPreviewDriveUnsupportedCount,
  __internal_for_tests as policyWasmRuntimeInternals,
} from '../../../src/agents/policy-wasm-runtime.js';
import type { Decision } from '../../../src/kernel/microturn/types.js';
import { createChoosenStepPreviewFixture } from './policy-preview-inner-choosenstep-fixture.js';

type ChooseNStepDecision = Extract<Decision, { readonly kind: 'chooseNStep' }>;

describe('policy WASM chooseNStep continuation ABI lowering', () => {
  it('encodes supported add continuations as explicit WASM state-patch operations', () => {
    const fixture = createChoosenStepPreviewFixture();
    const decision = fixture.microturn.legalActions.find((candidate): candidate is ChooseNStepDecision =>
      candidate.kind === 'chooseNStep' && candidate.command === 'add' && candidate.value !== undefined);

    assert.ok(decision);
    const result = lowerPolicyWasmChooseNStepContinuation({
      state: fixture.state,
      microturn: fixture.microturn,
      decision,
      initialValue: 7,
    });

    assert.equal(result.kind, 'supported');
    if (result.kind === 'supported') {
      assert.equal(result.candidate.stableMoveKey, chooseNStepContinuationStableKey(decision));
      assert.deepEqual(result.candidate.statePatch?.ops, [{
        kind: 'applyChooseNStepDecision',
        frameId: fixture.microturn.frameId,
        decisionKey: String(decision.decisionKey),
        command: 'add',
        value: decision.value,
      }]);
    }
  });

  it('fails closed for unsupported confirm continuations without counting activation', () => {
    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
    const fixture = createChoosenStepPreviewFixture();
    const decision: ChooseNStepDecision = {
      kind: 'chooseNStep',
      decisionKey: fixture.microturn.decisionContext.decisionKey,
      command: 'confirm',
    };

    const result = lowerPolicyWasmChooseNStepContinuation({
      state: fixture.state,
      microturn: fixture.microturn,
      decision,
    });

    assert.deepEqual(result, {
      kind: 'unsupported',
      unsupportedClass: 'unsupported-effect',
      owner: 'production-preview-drive.chooseNStepContinuation',
      reason: 'chooseNStep confirm continuation materialization is deferred to production consumption',
    });
    assert.equal(getProductionPolicyWasmPreviewDriveRouteCount(), 0);
    assert.equal(getProductionPolicyWasmPreviewDriveUnsupportedCount(), 0);
  });

  it('fails closed for add continuations that are not published legal decisions', () => {
    const fixture = createChoosenStepPreviewFixture();
    const decision: ChooseNStepDecision = {
      kind: 'chooseNStep',
      decisionKey: fixture.microturn.decisionContext.decisionKey,
      command: 'add',
      value: '__not_a_legal_option__',
    };

    const result = lowerPolicyWasmChooseNStepContinuation({
      state: fixture.state,
      microturn: fixture.microturn,
      decision,
    });

    assert.deepEqual(result, {
      kind: 'unsupported',
      unsupportedClass: 'unsupported-effect',
      owner: 'production-preview-drive.chooseNStepContinuation',
      reason: 'candidate chooseNStep decision is not published as a legal continuation',
    });
  });
});
