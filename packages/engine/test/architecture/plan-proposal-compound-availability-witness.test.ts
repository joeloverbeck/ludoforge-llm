// @test-class: convergence-witness
// @witness: spec-199-compound-availability-witness
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPlanProposalTrace } from '../../src/agents/plan-trace.js';
import {
  loadArvnPlanFixture,
  proposeArvnPlan,
  requireAlternative,
  requireSelectedTemplate,
} from '../policy-profile-quality/arvn-plan-witness-helpers.js';

describe('Spec 199 compound availability convergence witness', () => {
  it('seed 199 ARVN Train+Govern records unavailable compound availability before controller fallback', () => {
    const fixture = loadArvnPlanFixture(199);
    const result = proposeArvnPlan(fixture, ['train']);
    const selected = requireSelectedTemplate(result, 'arvn.trainGovern');
    const trainGovern = requireAlternative(result, 'arvn.trainGovern');
    const trace = buildPlanProposalTrace(result);

    assert.deepEqual(selected.compoundAvailability, { kind: 'unavailable', reason: 'no-continuation' });
    assert.deepEqual(trainGovern.compoundAvailability, selected.compoundAvailability);
    assert.deepEqual(
      trace.alternatives.find((alternative) => alternative.templateId === 'arvn.trainGovern')?.compoundAvailability,
      selected.compoundAvailability,
    );
  });
});
