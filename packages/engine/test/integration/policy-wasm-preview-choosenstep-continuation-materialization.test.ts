// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerPolicyWasmChooseNStepContinuation } from '../../src/agents/policy-wasm-preview-choosenstep-continuation.js';
import { materializePolicyWasmPreviewStatePatch } from '../../src/agents/policy-wasm-preview-drive-state-patch.js';
import { loadPolicyWasmRuntime } from '../../src/agents/policy-wasm-runtime-node-loader.js';
import type { Decision } from '../../src/kernel/microturn/types.js';
import { applyPublishedDecision } from '../../src/kernel/microturn/apply.js';
import { serializeGameState } from '../../src/kernel/index.js';
import { createChoosenStepPreviewFixture } from '../unit/agents/policy-preview-inner-choosenstep-fixture.js';

type ChooseNStepDecision = Extract<Decision, { readonly kind: 'chooseNStep' }>;

describe('policy WASM chooseNStep continuation state-patch materialization', () => {
  it('round-trips WASM-returned continuation patches and materializes byte-equivalent projected state', async () => {
    const wasm = await loadPolicyWasmRuntime();
    const fixture = createChoosenStepPreviewFixture();
    const decision = fixture.microturn.legalActions.find((candidate): candidate is ChooseNStepDecision =>
      candidate.kind === 'chooseNStep' && candidate.command === 'add' && candidate.value !== undefined);
    assert.ok(decision);

    const lowered = lowerPolicyWasmChooseNStepContinuation({
      state: fixture.state,
      microturn: fixture.microturn,
      decision,
      initialValue: 0,
    });
    assert.equal(lowered.kind, 'supported');
    if (lowered.kind !== 'supported') {
      return;
    }

    const result = wasm.evaluatePreviewDriveBatch({
      profileId: 'synthetic-choosenstep-continuation-materialization',
      originSeatId: fixture.microturn.seatId,
      originTurnId: fixture.microturn.turnId,
      depthCap: 4,
      candidates: [lowered.candidate],
      steps: [],
      materializeStatePatch: true,
    });

    if (result.kind !== 'supported') {
      assert.fail(`chooseNStep continuation fixture unexpectedly unsupported: ${result.reason}`);
    }
    assert.equal(result.rows[0]?.statePatch?.ops[0]?.kind, 'applyChooseNStepDecision');

    const materialized = materializePolicyWasmPreviewStatePatch({
      def: fixture.def,
      state: fixture.state,
      patch: result.rows[0]!.statePatch!,
    }).state;
    const reference = applyPublishedDecision(
      fixture.def,
      fixture.state,
      fixture.microturn,
      decision,
      { advanceToDecisionPoint: true },
    ).state;

    assert.equal(
      serializeGameState(materialized).stateHash,
      serializeGameState(reference).stateHash,
    );
    assert.deepEqual(serializeGameState(materialized), serializeGameState(reference));
  });
});
