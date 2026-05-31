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
const SEED = 203_005_01;

describe('Spec 203 NVA Rally Trail witness', () => {
  it('wires Rally Trail doctrine to Laos/Cambodia and Trail-repair target quality', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const templates = fixture.profile.plan.planTemplates ?? [];
    const selector = lib?.selectors?.['nva.rallyTrailTarget'];

    const hasTemplate = templates.includes('nva.rallyTrail');
    const hasQualityRefs = selector?.dependencies.candidateFeatures.includes('projectedTrailDelta') === true;
    const usesRallyRoot = lib?.planTemplates?.['nva.rallyTrail']?.root.actionTags.includes('rally') === true;
    const passed = hasTemplate && hasQualityRefs && usesRallyRoot;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      decisions: templates.length,
    });

    assert.ok(hasTemplate, 'expected nva.rallyTrail bound');
    assertTemplateRole(fixture, 'nva.rallyTrail', 'rallySpace', 'nva.rallyTrailTarget');
    assert.ok(usesRallyRoot, 'expected nva.rallyTrail to root on Rally');
    assert.ok(hasQualityRefs, 'expected nva.rallyTrailTarget to depend on projectedTrailDelta');
  });
});
