// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertProfileBinds, emitVcArchitecturalRecord, includesId, loadVcPlanFixture } from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 204_008_06;

describe('Spec 204 VC Agitation preparation witness', () => {
  it('binds Coup-support Agitation to the singular targetSpace surface and readiness module', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const template = lib?.planTemplates?.['vc.agitationPrep'];
    const module = lib?.strategyModules?.['vc.agitationReadiness'];
    const step = template?.steps[0];

    const passed = template?.root.actionTags.includes('agitate') === true
      && template?.roles.prepSpace?.selectorId === 'vc.agitationReadinessTarget'
      && step?.match.decisionKind === 'chooseOne'
      && step?.match.decisionPath === 'targetSpace'
      && step?.match.actionTag === 'agitate'
      && includesId(module?.enablesPlanTemplates, 'vc.agitationPrep');

    emitVcArchitecturalRecord(TEST_FILE, SEED, passed);

    assert.equal(template?.root.actionTags.includes('agitate'), true);
    assert.equal(template?.roles.prepSpace?.selectorId, 'vc.agitationReadinessTarget');
    assert.equal(step?.match.decisionKind, 'chooseOne');
    assert.equal(step?.match.decisionPath, 'targetSpace');
    assert.equal(step?.match.actionTag, 'agitate');
    assert.equal(includesId(module?.enablesPlanTemplates, 'vc.agitationPrep'), true);
    assertProfileBinds(fixture, {
      strategyModules: ['vc.agitationReadiness'],
      planTemplates: ['vc.agitationPrep'],
    });
  });
});
