// @test-class: convergence-witness
// @profile-variant: arvn-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { proposeAdvisoryTurnPlan } from '../../src/agents/plan-proposal.js';
import {
  asActionId,
  asPlayerId,
  assertValidatedGameDef,
  initialState,
  type Decision,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import { __resetProductionSpecCacheForTests, compileProductionSpec } from '../helpers/production-spec-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const FITL_PLAYER_COUNT = 4;

const trainDecision = (): Extract<Decision, { readonly kind: 'actionSelection' }> => ({
  kind: 'actionSelection',
  actionId: asActionId('train'),
  move: { actionId: asActionId('train'), params: {} },
});

describe('Spec 186 ARVN Train+Govern plan separation', () => {
  it('binds distinct Train and Govern role spaces from the production FITL v3 agent library', () => {
    __resetProductionSpecCacheForTests();
    const first = compileProductionSpec();
    __resetProductionSpecCacheForTests();
    const second = compileProductionSpec();
    assertNoErrors(first.parsed);
    assertNoErrors(first.compiled);
    assertNoErrors(second.compiled);

    const def = assertValidatedGameDef(first.compiled.gameDef);
    const state = initialState(def, 186007, FITL_PLAYER_COUNT).state;
    const profile = def.agents?.profiles['arvn-baseline'];
    assert.ok(def.agents?.library.planTemplates?.['arvn.trainGovern'], 'expected arvn.trainGovern template');
    assert.ok(profile?.plan.planTemplates?.includes('arvn.trainGovern'), 'expected arvn-baseline to carry the plan template');
    assert.equal(JSON.stringify(first.compiled.gameDef), JSON.stringify(second.compiled.gameDef));
    if (profile === undefined) {
      throw new Error('Expected arvn-baseline profile');
    }

    const result = proposeAdvisoryTurnPlan({
      def,
      state,
      seatId: 'arvn',
      playerId: asPlayerId(1),
      profile,
      catalog: def.agents!,
      actionDecisions: [trainDecision()],
    });

    const trainSpace = result.selected?.roleBindings.trainSpace?.selectedId;
    const governSpace = result.selected?.roleBindings.governSpace?.selectedId;
    const passed = result.status === 'selected'
      && trainSpace !== undefined
      && governSpace !== undefined
      && trainSpace !== governSpace;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'arvn-baseline',
      seed: 186007,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.equal(result.status, 'selected');
    assert.notEqual(trainSpace, undefined);
    assert.notEqual(governSpace, undefined);
    assert.notEqual(trainSpace, governSpace);
  });
});
