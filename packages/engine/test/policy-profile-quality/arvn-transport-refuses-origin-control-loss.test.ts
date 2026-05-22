// @test-class: convergence-witness
// @profile-variant: arvn-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadArvnPlanFixture,
  proposeArvnPlan,
  requireAlternative,
  requireSelectedTemplate,
} from './arvn-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_007_05;

describe('Spec 188 ARVN Transport origin-control-loss witness', () => {
  it('keeps the Transport guardrail wired and does not prefer Train+Transport over the safer Train+Govern plan', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const result = proposeArvnPlan(fixture, ['train', 'transport']);
    const selected = requireSelectedTemplate(result, 'arvn.trainGovern');
    const trainTransport = requireAlternative(result, 'arvn.trainTransport');
    const guardrails = fixture.profile.use.guardrails ?? [];
    const passed = guardrails.includes('arvn.doNotLoseOriginControlByTransport')
      && selected.score > trainTransport.score
      && trainTransport.roleBindings.transportRoute !== undefined;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.ok(guardrails.includes('arvn.doNotLoseOriginControlByTransport'));
    assert.ok(selected.score > trainTransport.score);
    assert.ok(trainTransport.roleBindings.transportRoute);
  });
});
