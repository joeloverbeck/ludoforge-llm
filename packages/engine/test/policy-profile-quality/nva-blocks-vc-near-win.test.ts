// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  countBoardFactionTokens,
  executePublishedNvaRoot,
  emitNvaPolicyQualityRecord,
  loadNvaPlanFixture,
} from './nva-plan-witness-helpers.js';
import { withCoupLookahead } from './shared-competence-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 203_005_07;

describe('Spec 203 NVA blocks VC near-win witness', () => {
  it('encodes VC-denial scoring and executes non-kingmaking Infiltrate', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const module = lib?.strategyModules?.['nva.vcRivalRisk'];
    const posture = lib?.postureEvaluators?.['nva.avoidVcKingmaking'];
    const selector = lib?.selectors?.['nva.infiltrateVcTargetRational'];
    const executed = executePublishedNvaRoot(fixture, {
      actionId: 'infiltrate',
      seed: SEED,
      prepareState: (def, state) => withCoupLookahead(def, state),
    });
    const nvaBoardTroopDelta = countBoardFactionTokens(fixture.def, executed.postState, 'NVA', 'troops')
      - countBoardFactionTokens(fixture.def, executed.preState, 'NVA', 'troops');
    const vcBoardTokenDelta = countBoardFactionTokens(fixture.def, executed.postState, 'VC')
      - countBoardFactionTokens(fixture.def, executed.preState, 'VC');

    const moduleUsesVcMargin = module?.dependencies.candidateFeatures.includes('projectedVcMarginDelta') === true;
    const postureUsesVcNearWin = posture?.dependencies.strategicConditions?.includes('vcNearWin') === true;
    const selectorUsesVcNearWin = selector?.dependencies.strategicConditions?.includes('vcNearWin') === true;
    const passed = moduleUsesVcMargin && postureUsesVcNearWin && selectorUsesVcNearWin
      && nvaBoardTroopDelta > 0
      && vcBoardTokenDelta === 0;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      stopReason: executed.rootStableMoveKey,
      decisions: executed.decisions.length + (fixture.profile.use.strategyModules?.length ?? 0),
    });

    assert.ok(moduleUsesVcMargin, 'expected nva.vcRivalRisk to score projectedVcMarginDelta');
    assert.ok(postureUsesVcNearWin, 'expected nva.avoidVcKingmaking to depend on vcNearWin');
    assert.ok(selectorUsesVcNearWin, 'expected rational VC Infiltrate selector to depend on vcNearWin');
    assert.ok(nvaBoardTroopDelta > 0, `expected executable Infiltrate to build NVA troops, got ${nvaBoardTroopDelta}`);
    assert.equal(vcBoardTokenDelta, 0, 'expected executed branch not to help VC');
  });
});
