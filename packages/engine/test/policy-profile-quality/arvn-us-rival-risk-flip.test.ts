// @test-class: convergence-witness
// @profile-variant: arvn-evolved
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadArvnPlanFixture,
  proposeArvnPlan,
  requireSelectedTemplate,
  withEveryZoneSupportMarker,
} from './arvn-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_007_02;

describe('Spec 188 ARVN US rival-risk flip witness', () => {
  it('turns the nominal US ally into a negative posture term when US is near victory', () => {
    const fixture = loadArvnPlanFixture(SEED);
    const state = withEveryZoneSupportMarker(fixture.def, fixture.state, 'activeSupport');

    const result = proposeArvnPlan(fixture, ['train'], state);
    const selected = requireSelectedTemplate(result, 'arvn.trainGovern');
    const contribution = selected.posture.preferContributions.find((entry) => entry.id === 'us-rival-risk');
    const flip = selected.posture.allyWeightContext?.flips.find((entry) => entry.contributionId === 'us-rival-risk');
    const activeRoles = selected.posture.allyWeightContext?.activeRoles ?? [];
    const passed = contribution?.status === 'ready'
      && (contribution.contribution ?? 0) < 0
      && flip?.fired === true
      && activeRoles.some((entry) => entry.role === 'nominalAlly' && entry.seat === 'us')
      && activeRoles.some((entry) => entry.role === 'nearWin' && entry.seat === 'us');

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-evolved',
      seed: SEED,
      passed,
      stopReason: selected.posture.status,
      decisions: result.alternatives.length,
    });

    assert.equal(contribution?.status, 'ready');
    assert.ok((contribution?.contribution ?? 0) < 0);
    assert.equal(flip?.fired, true);
    assert.ok(activeRoles.some((entry) => entry.role === 'nominalAlly' && entry.seat === 'us'));
    assert.ok(activeRoles.some((entry) => entry.role === 'nearWin' && entry.seat === 'us'));
  });
});
