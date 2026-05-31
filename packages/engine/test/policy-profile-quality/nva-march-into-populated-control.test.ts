// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertTemplateRole,
  emitNvaPolicyQualityRecord,
  loadNvaPlanFixture,
} from './nva-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 203_005_02;

describe('Spec 203 NVA March Control witness', () => {
  it('wires March Control to population and projected NVA-margin target quality', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const templates = fixture.profile.plan.planTemplates ?? [];
    const selector = lib?.selectors?.['nva.marchControlDestination'];
    const template = lib?.planTemplates?.['nva.marchControl'];

    const hasTemplate = templates.includes('nva.marchControl');
    const hasProjectedGain = selector?.dependencies.candidateFeatures.includes('projectedSelfMarginDelta') === true;
    const usesMarchRoot = template?.root.actionTags.includes('march') === true;
    const passed = hasTemplate && hasProjectedGain && usesMarchRoot;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      decisions: templates.length,
    });

    assert.ok(hasTemplate, 'expected nva.marchControl bound');
    assertTemplateRole(fixture, 'nva.marchControl', 'marchSpace', 'nva.marchControlDestination');
    assert.ok(usesMarchRoot, 'expected nva.marchControl to root on March');
    assert.ok(hasProjectedGain, 'expected nva.marchControlDestination to depend on projectedSelfMarginDelta');
  });
});
