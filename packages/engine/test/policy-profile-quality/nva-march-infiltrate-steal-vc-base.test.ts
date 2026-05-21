// @test-class: convergence-witness
// @profile-variant: nva-baseline
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { emitPolicyProfileQualityRecord } from '../helpers/policy-profile-quality-report-helpers.js';
import {
  loadNvaPlanFixture,
  proposeNvaPlan,
  requireAlternative,
} from './nva-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 188_009_01;

describe('Spec 188 NVA March/Infiltrate VC-base pressure witness', () => {
  it('binds March+Infiltrate to NVA expansion and VC-rival takeover selectors', () => {
    const fixture = loadNvaPlanFixture(SEED);
    const profile = fixture.def.agents?.profiles['nva-baseline'];
    const template = fixture.def.agents?.library.planTemplates?.['nva.marchInfiltrate'];
    const relationship = fixture.def.agents?.library.relationships?.['nva.vcNominalAlly'];
    const guardrail = fixture.def.agents?.library.guardrails?.['nva.doNotServeVcWin'];
    const result = proposeNvaPlan(fixture, ['march']);
    const marchInfiltrate = requireAlternative(result, 'nva.marchInfiltrate');
    const passed = relationship?.seat === 'vc'
      && guardrail?.severity === 'demote'
      && (profile?.plan.strategyModules ?? []).includes('nva.vcRivalLeverage')
      && (profile?.plan.planTemplates ?? []).includes('nva.marchInfiltrate')
      && template?.roles.marchSpace?.selectorId === 'nva.marchExpansionSpace'
      && template?.roles.infiltrateSpace?.selectorId === 'nva.infiltrateTargetSpace'
      && marchInfiltrate.roleBindings.infiltrateSpace?.components.vcBaseTakeover !== undefined;

    emitPolicyProfileQualityRecord({
      file: TEST_FILE,
      variantId: 'nva-baseline',
      seed: SEED,
      passed,
      stopReason: result.status,
      decisions: result.alternatives.length,
    });

    assert.equal(relationship?.seat, 'vc');
    assert.equal(guardrail?.severity, 'demote');
    assert.equal((profile?.plan.strategyModules ?? []).includes('nva.vcRivalLeverage'), true);
    assert.equal((profile?.plan.planTemplates ?? []).includes('nva.marchInfiltrate'), true);
    assert.equal(template?.roles.marchSpace?.selectorId, 'nva.marchExpansionSpace');
    assert.equal(template?.roles.infiltrateSpace?.selectorId, 'nva.infiltrateTargetSpace');
    assert.notEqual(marchInfiltrate.roleBindings.infiltrateSpace?.components.vcBaseTakeover, undefined);
  });
});
