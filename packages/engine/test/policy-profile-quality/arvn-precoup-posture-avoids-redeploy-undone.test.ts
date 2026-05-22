// @test-class: convergence-witness
// @profile-variant: arvn-evolved
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
const SEED = 188_007_06;

describe('Spec 188 ARVN pre-Coup redeploy-discipline witness', () => {
  it('keeps the pre-Coup redeploy doctrine active while preferring the non-Transport Train plan', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const result = proposeArvnPlan(fixture, ['train', 'transport']);
    const selected = requireSelectedTemplate(result, 'arvn.trainGovern');
    const trainTransport = requireAlternative(result, 'arvn.trainTransport');
    const passed = result.activeDoctrines.includes('arvn.preCoupRedeployDiscipline')
      && selected.templateId !== 'arvn.trainTransport'
      && selected.score > trainTransport.score;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-evolved',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.ok(result.activeDoctrines.includes('arvn.preCoupRedeployDiscipline'));
    assert.notEqual(selected.templateId, 'arvn.trainTransport');
    assert.ok(selected.score > trainTransport.score);
  });
});
