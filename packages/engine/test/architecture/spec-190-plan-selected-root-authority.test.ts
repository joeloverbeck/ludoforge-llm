// @test-class: architectural-invariant
// Uses the exported policy evaluation call counter because the contract is
// negative: plan-selected roots must not invoke the scalar root scorer.
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/policy-agent.js';
import { getPolicyEvalCallCount } from '../../src/agents/policy-eval.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
import {
  createSpec190ActionSelectionInput,
  spec190ActionDecision,
} from '../helpers/spec-190-plan-root-fixture.js';

describe('Spec 190 plan-selected root authority', () => {
  for (const seed of [1901, 1902, 1903]) {
    it(`seed=${seed}: returns the committed plan root from the published frontier without scalar evaluation`, () => {
      const input = createSpec190ActionSelectionInput(seed, [
        spec190ActionDecision(3),
        spec190ActionDecision(1),
        spec190ActionDecision(2),
      ]);
      const beforeEvalCalls = getPolicyEvalCallCount();

      const result = new PolicyAgent({ traceLevel: 'verbose' }).chooseDecision(input);

      assert.equal(getPolicyEvalCallCount() - beforeEvalCalls, 0);
      assert.equal(result.decision.kind, 'actionSelection');
      assert.equal(result.agentDecision?.plan?.status, 'selected');
      const planRoot = result.agentDecision?.plan?.selectedRootStableMoveKey;
      assert.ok(planRoot, 'expected selected plan root key');
      assert.equal(toMoveIdentityKey(input.def, result.decision.move!), planRoot);
      assert.ok(
        input.microturn.legalActions.some((decision) => (
          decision.kind === 'actionSelection'
            && decision.move !== undefined
            && toMoveIdentityKey(input.def, decision.move) === planRoot
        )),
        'selected plan root must be a published legal action',
      );
      assert.deepEqual(result.rng, input.rng);
      assert.deepEqual(result.agentDecision?.candidates, []);
    });
  }
});
