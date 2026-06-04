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

describe('Spec 203 NVA low-yield VC-steal guardrail witness', () => {
  it('demotes low-yield VC theft while executable Infiltrate builds NVA strength', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const guardrails = fixture.profile.use.guardrails ?? [];
    const guardrail = fixture.def.agents?.library.guardrails?.['nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial'];
    const executed = executePublishedNvaRoot(fixture, {
      actionId: 'infiltrate',
      seed: SEED,
      prepareState: (def, state) => withCoupLookahead(def, state),
    });
    const nvaBoardTroopDelta = countBoardFactionTokens(fixture.def, executed.postState, 'NVA', 'troops')
      - countBoardFactionTokens(fixture.def, executed.preState, 'NVA', 'troops');
    const vcBoardTokenDelta = countBoardFactionTokens(fixture.def, executed.postState, 'VC')
      - countBoardFactionTokens(fixture.def, executed.preState, 'VC');

    const bound = guardrails.includes('nva.avoidStealingVcBaseWithoutNvaGainOrVcDenial');
    const demotesStrongly = guardrail?.severity === 'demote';
    const usesGainAndDenial = guardrail?.dependencies.candidateFeatures.includes('projectedSelfMarginDelta') === true
      && guardrail.dependencies.strategicConditions?.includes('vcNearWin') === true;
    const passed = bound && demotesStrongly && usesGainAndDenial && nvaBoardTroopDelta > 0 && vcBoardTokenDelta === 0;

    emitNvaPolicyQualityRecord({
      file: TEST_FILE,
      seed: SEED,
      passed,
      stopReason: executed.rootStableMoveKey,
      decisions: executed.decisions.length + guardrails.length,
    });

    assert.ok(bound, 'expected VC-steal guardrail bound');
    assert.ok(demotesStrongly, 'expected demote severity');
    assert.ok(usesGainAndDenial, 'expected guardrail to depend on projectedSelfMarginDelta and vcNearWin');
    assert.ok(nvaBoardTroopDelta > 0, `expected executable Infiltrate to build NVA troops, got ${nvaBoardTroopDelta}`);
    assert.equal(vcBoardTokenDelta, 0, 'expected low-yield branch not to transfer VC board assets');
  });
});
