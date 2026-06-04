// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertTemplateRole,
  countZoneFactionTokens,
  executePublishedNvaRoot,
  emitNvaPolicyQualityRecord,
  loadNvaPlanFixture,
  proposeNvaPlanFromDecisions,
  publishedSecondEligibleNvaActionDecisions,
  requireSelectedTemplate,
  withNvaPressureAtQuangTri,
} from './nva-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 1;

describe('Spec 203 NVA Attack+Ambush witness', () => {
  it('selects and executes published Attack+Ambush over conventional Attack', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const template = lib?.planTemplates?.['nva.attackAmbush'];
    const module = lib?.strategyModules?.['nva.conventionalPressure'];
    const pressureState = withNvaPressureAtQuangTri(fixture.def, fixture.state);
    const attackRoots = publishedSecondEligibleNvaActionDecisions(fixture, pressureState)
      .filter((decision) => String(decision.move?.actionId) === 'attack');
    const plan = proposeNvaPlanFromDecisions(fixture, attackRoots, pressureState);
    const selected = requireSelectedTemplate(plan, 'nva.attackAmbush');
    const executed = executePublishedNvaRoot(fixture, {
      actionId: 'attack',
      specialActionId: 'ambushNva',
      timing: 'during',
      insertAfterStage: 1,
      replaceRemainingStages: true,
      seed: SEED,
      prepareState: withNvaPressureAtQuangTri,
    });
    const usTroopDelta = countZoneFactionTokens(executed.postState, 'quang-tri-thua-thien:none', 'US', 'troops')
      - countZoneFactionTokens(executed.preState, 'quang-tri-thua-thien:none', 'US', 'troops');
    const usCasualtyDelta = countZoneFactionTokens(executed.postState, 'casualties-US:none', 'US', 'troops')
      - countZoneFactionTokens(executed.preState, 'casualties-US:none', 'US', 'troops');

    const hasTemplate = fixture.profile.plan.planTemplates?.includes('nva.attackAmbush') === true;
    const hasCompound = template?.root.actionTags.includes('attack') === true
      && template.root.compound?.specialTags.includes('ambush-nva') === true
      && template.root.compound.timing === 'during'
      && template.root.compound.interruptAfterStage === 1
      && template.root.compound.replaceRemainingStages === true;
    const moduleEnables = module?.enablesPlanTemplates.some((id) => id === 'nva.attackAmbush') === true;
    const hasConventionalAttackAlternative = attackRoots.some((decision) => decision.move?.compound === undefined);
    const passed = hasTemplate && hasCompound && moduleEnables
      && hasConventionalAttackAlternative
      && selected.rootStableMoveKey.includes('\"timing\":\"during\"')
      && usTroopDelta < 0
      && usCasualtyDelta > 0;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      stopReason: executed.rootStableMoveKey,
      decisions: attackRoots.length + executed.decisions.length,
    });

    assert.ok(hasTemplate, 'expected nva.attackAmbush bound');
    assertTemplateRole(fixture, 'nva.attackAmbush', 'attackSpace', 'nva.attackTargetSpace');
    assertTemplateRole(fixture, 'nva.attackAmbush', 'ambushSpace', 'nva.ambushTargetSpace');
    assert.ok(hasCompound, 'expected Attack then Ambush during-stage compound template');
    assert.ok(moduleEnables, 'expected nva.conventionalPressure to enable nva.attackAmbush');
    assert.ok(hasConventionalAttackAlternative, 'expected conventional Attack adversarial root');
    assert.ok(selected.rootStableMoveKey.includes('"timing":"during"'), 'expected selected root to be during Attack+Ambush');
    assert.ok(usTroopDelta < 0, `expected Ambush to remove a US troop from Quang Tri, got ${usTroopDelta}`);
    assert.ok(usCasualtyDelta > 0, `expected Ambush to send a US troop to Casualties, got ${usCasualtyDelta}`);
  });
});
