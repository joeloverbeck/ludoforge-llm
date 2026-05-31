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
const SEED = 203_005_06;

describe('Spec 203 NVA Attack+Ambush witness', () => {
  it('wires Attack+Ambush as a compound attrition template promoted by conventional pressure', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const template = lib?.planTemplates?.['nva.attackAmbush'];
    const module = lib?.strategyModules?.['nva.conventionalPressure'];

    const hasTemplate = fixture.profile.plan.planTemplates?.includes('nva.attackAmbush') === true;
    const hasCompound = template?.root.actionTags.includes('attack') === true
      && template.root.compound?.specialTags.includes('ambush-nva') === true;
    const moduleEnables = module?.enablesPlanTemplates.some((id) => id === 'nva.attackAmbush') === true;
    const passed = hasTemplate && hasCompound && moduleEnables;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      decisions: module?.enablesPlanTemplates.length ?? 0,
    });

    assert.ok(hasTemplate, 'expected nva.attackAmbush bound');
    assertTemplateRole(fixture, 'nva.attackAmbush', 'attackSpace', 'nva.attackTargetSpace');
    assertTemplateRole(fixture, 'nva.attackAmbush', 'ambushSpace', 'nva.ambushTargetSpace');
    assert.ok(hasCompound, 'expected Attack then Ambush compound template');
    assert.ok(moduleEnables, 'expected nva.conventionalPressure to enable nva.attackAmbush');
  });
});
