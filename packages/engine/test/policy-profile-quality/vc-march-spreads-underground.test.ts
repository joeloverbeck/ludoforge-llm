// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertProfileBinds, emitVcArchitecturalRecord, includesId, loadVcPlanFixture } from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 204_008_04;

describe('Spec 204 VC March spread witness', () => {
  it('binds March spread to Underground preservation posture and readiness doctrine', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const template = lib?.planTemplates?.['vc.marchSpread'];
    const module = lib?.strategyModules?.['vc.agitationReadiness'];
    const posture = lib?.postureEvaluators?.['vc.preserveUndergroundAndBases'];

    const passed = template?.roles.marchSpace?.selectorId === 'vc.marchSpreadDestination'
      && template?.postureHook === 'vc.preserveUndergroundAndBases'
      && includesId(module?.enablesPlanTemplates, 'vc.marchSpread')
      && posture?.prefer.some((entry) => entry.id === 'underground-network') === true;

    emitVcArchitecturalRecord(TEST_FILE, SEED, passed);

    assert.equal(template?.roles.marchSpace?.selectorId, 'vc.marchSpreadDestination');
    assert.equal(template?.postureHook, 'vc.preserveUndergroundAndBases');
    assert.equal(includesId(module?.enablesPlanTemplates, 'vc.marchSpread'), true);
    assert.equal(posture?.prefer.some((entry) => entry.id === 'underground-network'), true);
    assertProfileBinds(fixture, {
      strategyModules: ['vc.agitationReadiness'],
      planTemplates: ['vc.marchSpread'],
    });
  });
});
