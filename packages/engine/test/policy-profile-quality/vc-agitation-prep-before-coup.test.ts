// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { applyMove, asActionId, asPhaseId } from '../../src/kernel/index.js';
import { loadFitlProductionDef, runFitlCompetenceCase, withCoupLookahead, withEveryZoneSupportMarker } from './shared-competence-helpers.js';
import {
  actionDecision,
  assertProfileBinds,
  emitVcArchitecturalRecord,
  includesId,
  loadVcPlanFixture,
  proposeVcPlanFromDecisions,
} from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 204_008_06;

describe('Spec 204 VC Agitation preparation witness', () => {
  it('binds Coup-support Agitation to the singular targetSpace surface and readiness module', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const template = lib?.planTemplates?.['vc.agitationPrep'];
    const module = lib?.strategyModules?.['vc.agitationReadiness'];
    const step = template?.steps[0];

    const passed = template?.root.actionTags.includes('agitate') === true
      && template?.roles.prepSpace?.selectorId === 'vc.agitationReadinessTarget'
      && step?.match.decisionKind === 'chooseOne'
      && step?.match.decisionPath === 'targetSpace'
      && step?.match.actionTag === 'agitate'
      && includesId(module?.enablesPlanTemplates, 'vc.agitationPrep');

    emitVcArchitecturalRecord(TEST_FILE, SEED, passed);

    assert.equal(template?.root.actionTags.includes('agitate'), true);
    assert.equal(template?.roles.prepSpace?.selectorId, 'vc.agitationReadinessTarget');
    assert.equal(step?.match.decisionKind, 'chooseOne');
    assert.equal(step?.match.decisionPath, 'targetSpace');
    assert.equal(step?.match.actionTag, 'agitate');
    assert.equal(includesId(module?.enablesPlanTemplates, 'vc.agitationPrep'), true);
    assertProfileBinds(fixture, {
      strategyModules: ['vc.agitationReadiness'],
      planTemplates: ['vc.agitationPrep'],
    });
  });

  it('executes Coup Agitation to shift a passive Opposition space to active Opposition', () => {
    const def = loadFitlProductionDef();
    const fixture = loadVcPlanFixture(210_001);
    const run = runFitlCompetenceCase(def, {
      seatId: 'vc',
      playerIndex: 3,
      seed: 210_001,
      prepareState: (caseDef, state) => withCoupLookahead(
        caseDef,
        withEveryZoneSupportMarker(caseDef, state, 'passiveOpposition'),
      ),
    });
    const before = { ...run.preState, currentPhase: asPhaseId('coupSupport') };
    const agitationDecision = {
      kind: 'actionSelection' as const,
      actionId: asActionId('coupAgitateVC'),
      move: {
        actionId: asActionId('coupAgitateVC'),
        params: {
          targetSpace: 'quang-tin-quang-ngai:none',
          action: 'shiftOpposition',
        },
        actionClass: 'specialActivity' as const,
      },
    };
    const proposal = proposeVcPlanFromDecisions(fixture, [
      agitationDecision,
      actionDecision('rally'),
      actionDecision('march'),
      actionDecision('terror'),
    ], before);
    const after = applyMove(def, before, {
      actionId: asActionId('coupAgitateVC'),
      params: {
        targetSpace: 'quang-tin-quang-ngai:none',
        action: 'shiftOpposition',
      },
    }).state;
    const beforeMarker = before.markers['quang-tin-quang-ngai:none']?.supportOpposition;
    const afterMarker = after.markers['quang-tin-quang-ngai:none']?.supportOpposition;
    const passed = proposal.selected?.templateId === 'vc.agitationPrep'
      && beforeMarker === 'passiveOpposition'
      && afterMarker === 'activeOpposition';

    emitVcArchitecturalRecord(TEST_FILE, 210_001, passed, 1);

    assert.equal(proposal.selected?.templateId, 'vc.agitationPrep');
    assert.equal(beforeMarker, 'passiveOpposition');
    assert.equal(afterMarker, 'activeOpposition');
    assert.equal(after.markers['quang-tin-quang-ngai:none']?.coupAgitateSpaceUsage, 'used');
  });
});
