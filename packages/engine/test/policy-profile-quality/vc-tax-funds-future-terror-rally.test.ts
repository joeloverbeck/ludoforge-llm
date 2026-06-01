// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertProfileBinds, emitVcArchitecturalRecord, includesId, loadVcPlanFixture } from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 204_008_02;

describe('Spec 204 VC Tax funding witness', () => {
  it('binds Rally+Tax to LoC funding and Coup-resource preservation', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const template = lib?.planTemplates?.['vc.rallyTax'];
    const module = lib?.strategyModules?.['vc.agitationReadiness'];
    const posture = lib?.postureEvaluators?.['vc.preserveAgitationResources'];

    const passed = template?.root.compound?.specialTags.includes('tax') === true
      && template?.roles.taxSpace?.selectorId === 'vc.taxLocTarget'
      && template?.postureHook === 'vc.preserveAgitationResources'
      && includesId(module?.enablesPlanTemplates, 'vc.rallyTax')
      && posture?.prefer.some((entry) => entry.id === 'coup-resource-floor' && entry.hasFallbackContribution) === true;

    emitVcArchitecturalRecord(TEST_FILE, SEED, passed);

    assert.equal(template?.root.compound?.timing, 'after');
    assert.equal(template?.root.compound?.specialTags.includes('tax'), true);
    assert.equal(template?.roles.taxSpace?.selectorId, 'vc.taxLocTarget');
    assert.equal(template?.postureHook, 'vc.preserveAgitationResources');
    assert.equal(includesId(module?.enablesPlanTemplates, 'vc.rallyTax'), true);
    assert.equal(posture?.prefer.some((entry) => entry.id === 'coup-resource-floor' && entry.hasFallbackContribution), true);
    assertProfileBinds(fixture, {
      strategyModules: ['vc.agitationReadiness'],
      planTemplates: ['vc.rallyTax'],
    });
  });
});
