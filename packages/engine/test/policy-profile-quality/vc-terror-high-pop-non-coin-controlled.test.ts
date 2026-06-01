// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertProfileBinds, emitVcArchitecturalRecord, loadVcPlanFixture } from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 204_008_01;

describe('Spec 204 VC Terror high-pop target witness', () => {
  it('binds Terror doctrine to the high-population non-COIN selector surface', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const terrorTax = lib?.planTemplates?.['vc.terrorTax'];
    const terrorSubvert = lib?.planTemplates?.['vc.terrorSubvert'];
    const oppositionEngine = lib?.strategyModules?.['vc.oppositionEngine'];
    const selector = lib?.selectors?.['vc.terrorHighPopTarget'];

    const passed = selector !== undefined
      && terrorTax?.roles.terrorSpace?.selectorId === 'vc.terrorHighPopTarget'
      && terrorSubvert?.roles.terrorSpace?.selectorId === 'vc.terrorHighPopTarget'
      && oppositionEngine?.selectors.some((entry) => entry.selectorId === 'vc.terrorHighPopTarget') === true;

    emitVcArchitecturalRecord(TEST_FILE, SEED, passed);

    assert.ok(selector, 'expected vc.terrorHighPopTarget selector');
    assert.equal(terrorTax?.roles.terrorSpace?.selectorId, 'vc.terrorHighPopTarget');
    assert.equal(terrorSubvert?.roles.terrorSpace?.selectorId, 'vc.terrorHighPopTarget');
    assert.equal(oppositionEngine?.selectors.some((entry) => entry.selectorId === 'vc.terrorHighPopTarget'), true);
    assertProfileBinds(fixture, {
      strategyModules: ['vc.oppositionEngine'],
      planTemplates: ['vc.terrorTax', 'vc.terrorSubvert'],
    });
  });
});
