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
const SEED = 203_005_05;

describe('Spec 203 NVA Bombard concentrated-COIN witness', () => {
  it('wires Bombard to concentrated-stack target quality and low-yield demotion', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const selector = lib?.selectors?.['nva.bombardCoinStackTarget'];
    const guardrail = lib?.guardrails?.['nva.avoidLowYieldBombard'];

    const hasTemplate = fixture.profile.plan.planTemplates?.includes('nva.bombardCoinStack') === true;
    const hasUsPressure = selector?.dependencies.candidateFeatures.includes('projectedUsMarginDelta') === true;
    const hasLowYieldGuardrail = fixture.profile.use.guardrails?.includes('nva.avoidLowYieldBombard') === true
      && guardrail?.severity === 'demote'
      && guardrail.dependencies.candidateFeatures.includes('projectedSelfMarginDelta');
    const passed = hasTemplate && hasUsPressure && hasLowYieldGuardrail;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      decisions: fixture.profile.plan.planTemplates?.length ?? 0,
    });

    assert.ok(hasTemplate, 'expected nva.bombardCoinStack bound');
    assertTemplateRole(fixture, 'nva.bombardCoinStack', 'bombardSpace', 'nva.bombardCoinStackTarget');
    assert.ok(hasUsPressure, 'expected Bombard selector to depend on projectedUsMarginDelta');
    assert.ok(hasLowYieldGuardrail, 'expected nva.avoidLowYieldBombard demotion over projectedSelfMarginDelta');
  });
});
