// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertTemplateRole,
  countBoardFactionTokens,
  executePublishedNvaRoot,
  emitNvaPolicyQualityRecord,
  loadNvaPlanFixture,
} from './nva-plan-witness-helpers.js';
import { withCoupLookahead } from './shared-competence-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 203_005_03;

describe('Spec 203 NVA March/Infiltrate build witness', () => {
  it('executes March+Infiltrate as NVA board build-up rather than VC theft', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const template = lib?.planTemplates?.['nva.marchInfiltrateControl'];
    const buildSelector = lib?.selectors?.['nva.infiltrateForNvaGain'];
    const rivalSelector = lib?.selectors?.['nva.infiltrateVcTargetRational'];
    const executed = executePublishedNvaRoot(fixture, {
      actionId: 'march',
      specialActionId: 'infiltrate',
      seed: SEED,
      prepareState: (def, state) => withCoupLookahead(def, state),
    });
    const nvaBoardTroopDelta = countBoardFactionTokens(fixture.def, executed.postState, 'NVA', 'troops')
      - countBoardFactionTokens(fixture.def, executed.preState, 'NVA', 'troops');
    const vcGuerrillaDelta = countBoardFactionTokens(fixture.def, executed.postState, 'VC', 'guerrilla')
      - countBoardFactionTokens(fixture.def, executed.preState, 'VC', 'guerrilla');

    const hasCompound = template?.root.compound?.specialTags.includes('infiltrate') === true
      && template.root.compound.timing === 'after';
    const buildUsesNvaGain = buildSelector?.dependencies.candidateFeatures.includes('projectedSelfMarginDelta') === true;
    const rivalHasVcNearWin = rivalSelector?.dependencies.strategicConditions?.includes('vcNearWin') === true;
    const passed = hasCompound && buildUsesNvaGain && rivalHasVcNearWin
      && nvaBoardTroopDelta > 0
      && vcGuerrillaDelta === 0;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      stopReason: executed.rootStableMoveKey,
      decisions: executed.decisions.length,
    });

    assertTemplateRole(fixture, 'nva.marchInfiltrateControl', 'marchSpace', 'nva.marchInfiltrateDestination');
    assertTemplateRole(fixture, 'nva.marchInfiltrateControl', 'infiltrateSpace', 'nva.infiltrateForNvaGain');
    assert.ok(hasCompound, 'expected March then Infiltrate compound template');
    assert.ok(buildUsesNvaGain, 'expected build selector to depend on projectedSelfMarginDelta');
    assert.ok(rivalHasVcNearWin, 'expected rival selector to encode VC near-win gating');
    assert.ok(nvaBoardTroopDelta > 0, `expected NVA board troop build-up, got ${nvaBoardTroopDelta}`);
    assert.equal(vcGuerrillaDelta, 0, 'expected build-up branch not to steal VC guerrillas');
  });
});
