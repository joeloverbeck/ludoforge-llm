// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertProfileBinds, emitVcArchitecturalRecord, includesId, loadVcPlanFixture } from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 204_008_03;

describe('Spec 204 VC Subvert patronage witness', () => {
  it('binds ARVN-near-win Subvert doctrine to the high-value selector', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const module = lib?.strategyModules?.['vc.subvertPatronage'];
    const terrorSubvert = lib?.planTemplates?.['vc.terrorSubvert'];
    const selector = lib?.selectors?.['vc.subvertHighValueTarget'];

    const passed = selector !== undefined
      && includesId(module?.enablesPlanTemplates, 'vc.terrorSubvert')
      && includesId(module?.enablesPlanTemplates, 'vc.rallySubvert')
      && includesId(module?.enablesPlanTemplates, 'vc.marchSubvert')
      && terrorSubvert?.roles.subvertSpace?.selectorId === 'vc.subvertHighValueTarget';

    emitVcArchitecturalRecord(TEST_FILE, SEED, passed);

    assert.ok(selector, 'expected vc.subvertHighValueTarget selector');
    assert.equal(includesId(module?.enablesPlanTemplates, 'vc.terrorSubvert'), true);
    assert.equal(includesId(module?.enablesPlanTemplates, 'vc.rallySubvert'), true);
    assert.equal(includesId(module?.enablesPlanTemplates, 'vc.marchSubvert'), true);
    assert.equal(terrorSubvert?.roles.subvertSpace?.selectorId, 'vc.subvertHighValueTarget');
    assertProfileBinds(fixture, {
      strategyModules: ['vc.subvertPatronage'],
      planTemplates: ['vc.terrorSubvert', 'vc.rallySubvert', 'vc.marchSubvert'],
    });
  });
});
