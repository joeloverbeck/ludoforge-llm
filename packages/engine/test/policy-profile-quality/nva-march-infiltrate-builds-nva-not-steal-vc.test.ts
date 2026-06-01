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
const SEED = 203_005_03;

describe('Spec 203 NVA March/Infiltrate build witness', () => {
  it('separates NVA-build Infiltrate from VC-rival takeover doctrine', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const template = lib?.planTemplates?.['nva.marchInfiltrateControl'];
    const buildSelector = lib?.selectors?.['nva.infiltrateForNvaGain'];
    const rivalSelector = lib?.selectors?.['nva.infiltrateVcTargetRational'];

    const hasCompound = template?.root.compound?.specialTags.includes('infiltrate') === true
      && template.root.compound.timing === 'after';
    const buildUsesNvaGain = buildSelector?.dependencies.candidateFeatures.includes('projectedSelfMarginDelta') === true;
    const rivalHasVcNearWin = rivalSelector?.dependencies.strategicConditions?.includes('vcNearWin') === true;
    const passed = hasCompound && buildUsesNvaGain && rivalHasVcNearWin;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      decisions: fixture.profile.plan.planTemplates?.length ?? 0,
    });

    assertTemplateRole(fixture, 'nva.marchInfiltrateControl', 'marchSpace', 'nva.marchInfiltrateDestination');
    assertTemplateRole(fixture, 'nva.marchInfiltrateControl', 'infiltrateSpace', 'nva.infiltrateForNvaGain');
    assert.ok(hasCompound, 'expected March then Infiltrate compound template');
    assert.ok(buildUsesNvaGain, 'expected build selector to depend on projectedSelfMarginDelta');
    assert.ok(rivalHasVcNearWin, 'expected rival selector to encode VC near-win gating');
  });
});
