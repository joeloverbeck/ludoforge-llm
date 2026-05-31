// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertExcludesAll,
  assertIncludesAll,
  emitNvaPolicyQualityRecord,
  loadNvaPlanFixture,
} from './nva-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 203_005_09;

const REQUIRED_SHARED_MODULES = [
  'shared.immediateWin',
  'shared.blockCurrentLeader',
  'shared.nearCoupConcreteSwing',
  'shared.resourceLogistics',
  'shared.eventDirectSwing',
  'shared.allyRivalThrottle',
  'shared.monsoonOperationalRestriction',
] as const;

const REQUIRED_NVA_MODULES = [
  'nva.logisticsAndTrail',
  'nva.controlAndBases',
  'nva.vcRivalLeverage',
  'nva.baseNetwork',
  'nva.takeControl',
  'nva.conventionalPressure',
  'nva.vcRivalRisk',
] as const;

const REQUIRED_NVA_TEMPLATES = [
  'nva.rallyInfiltrate',
  'nva.marchInfiltrate',
  'nva.marchAmbush',
  'nva.attackAmbush',
  'nva.locOccupationBeforeCoup',
  'nva.rallyTrail',
  'nva.marchControl',
  'nva.marchInfiltrateControl',
  'nva.infiltrateVcOnlyWhenRational',
  'nva.bombardCoinStack',
  'nva.terrorSupportReduction',
] as const;

describe('Spec 203 NVA shared-module and template binding invariant', () => {
  it('binds Spec 201 shared modules plus the corrected NVA template set', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const modules = fixture.profile.use.strategyModules ?? [];
    const templates = fixture.profile.plan.planTemplates ?? [];
    const expectedModules = [...REQUIRED_SHARED_MODULES, ...REQUIRED_NVA_MODULES];

    const passed = expectedModules.every((id) => modules.includes(id))
      && REQUIRED_NVA_TEMPLATES.every((id) => templates.includes(id))
      && !templates.includes('nva.eventLogisticsOrControlSwing')
      && modules.length === expectedModules.length
      && templates.length === REQUIRED_NVA_TEMPLATES.length;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      decisions: modules.length + templates.length,
    });

    assertIncludesAll(modules, REQUIRED_SHARED_MODULES, 'nva-baseline shared modules');
    assertIncludesAll(modules, REQUIRED_NVA_MODULES, 'nva-baseline faction modules');
    assertIncludesAll(templates, REQUIRED_NVA_TEMPLATES, 'nva-baseline plan templates');
    assertExcludesAll(templates, ['nva.eventLogisticsOrControlSwing'], 'nva-baseline plan templates');
    assert.equal(modules.length, expectedModules.length);
    assert.equal(templates.length, REQUIRED_NVA_TEMPLATES.length);
  });
});
