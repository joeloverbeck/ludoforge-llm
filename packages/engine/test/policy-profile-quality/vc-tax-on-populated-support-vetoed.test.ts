// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertProfileBinds, emitVcArchitecturalRecord, loadVcPlanFixture } from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 204_008_08;

describe('Spec 204 VC populated-Support Tax guardrail witness', () => {
  it('binds the populated-Support Tax demotion guardrail with LoC Tax doctrine', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const guardrail = lib?.guardrails?.['vc.avoidTaxWhenSupportShiftIsTooCostly'];
    const taxTemplate = lib?.planTemplates?.['vc.terrorTax'];
    const rallyTax = lib?.planTemplates?.['vc.rallyTax'];

    const passed = guardrail?.severity === 'demote'
      && taxTemplate?.roles.taxSpace?.selectorId === 'vc.taxLocTarget'
      && rallyTax?.roles.taxSpace?.selectorId === 'vc.taxLocTarget';

    emitVcArchitecturalRecord(TEST_FILE, SEED, passed);

    assert.equal(guardrail?.severity, 'demote');
    assert.equal(taxTemplate?.roles.taxSpace?.selectorId, 'vc.taxLocTarget');
    assert.equal(rallyTax?.roles.taxSpace?.selectorId, 'vc.taxLocTarget');
    assertProfileBinds(fixture, {
      guardrails: ['vc.avoidTaxWhenSupportShiftIsTooCostly'],
      planTemplates: ['vc.terrorTax', 'vc.rallyTax'],
    });
  });
});
