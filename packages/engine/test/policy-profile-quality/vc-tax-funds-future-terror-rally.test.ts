// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { moveOneToken } from './shared-competence-helpers.js';
import {
  actionDecision,
  assertProfileBinds,
  compoundActionDecision,
  emitVcArchitecturalRecord,
  includesId,
  loadVcPlanFixture,
  proposeVcPlanFromDecisions,
} from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 204_008_02;
const CURATED_TAX_SEED = 210_001;
const RALLY_TAX_ROOT = 'rally|{}|{"specialActivity":{"actionId":"tax","params":{}},"timing":"after"}|false|operationPlusSpecialActivity';

describe('Spec 204 VC Tax funding witness', () => {
  it('binds Rally+Tax to LoC funding and Coup-resource preservation', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const template = lib?.planTemplates?.['vc.rallyTax'];
    const agitationModule = lib?.strategyModules?.['vc.agitationReadiness'];
    const fundingModule = lib?.strategyModules?.['vc.fundAndAmbushCarefully'];
    const posture = lib?.postureEvaluators?.['vc.preserveAgitationResources'];

    const passed = template?.root.compound?.specialTags.includes('tax') === true
      && template?.roles.taxSpace?.selectorId === 'vc.taxLocTarget'
      && template?.postureHook === 'vc.preserveAgitationResources'
      && includesId(agitationModule?.enablesPlanTemplates, 'vc.rallyTax')
      && includesId(fundingModule?.enablesPlanTemplates, 'vc.rallyTax')
      && posture?.prefer.some((entry) => entry.id === 'coup-resource-floor' && entry.hasFallbackContribution) === true;

    emitVcArchitecturalRecord(TEST_FILE, SEED, passed);

    assert.equal(template?.root.compound?.timing, 'after');
    assert.equal(template?.root.compound?.specialTags.includes('tax'), true);
    assert.equal(template?.roles.taxSpace?.selectorId, 'vc.taxLocTarget');
    assert.equal(template?.postureHook, 'vc.preserveAgitationResources');
    assert.equal(includesId(agitationModule?.enablesPlanTemplates, 'vc.rallyTax'), true);
    assert.equal(includesId(fundingModule?.enablesPlanTemplates, 'vc.rallyTax'), true);
    assert.equal(posture?.prefer.some((entry) => entry.id === 'coup-resource-floor' && entry.hasFallbackContribution), true);
    assertProfileBinds(fixture, {
      strategyModules: ['vc.agitationReadiness', 'vc.fundAndAmbushCarefully'],
      planTemplates: ['vc.rallyTax'],
    });
  });

  it('selects LoC Rally+Tax in the curated resource-building state', () => {
    const fixture = loadVcPlanFixture(CURATED_TAX_SEED);
    const state = moveOneToken(
      fixture.state,
      'available-VC:none',
      'loc-saigon-can-tho:none',
      (token) => token.props.faction === 'VC' && token.props.type === 'guerrilla',
    );
    const result = proposeVcPlanFromDecisions(fixture, [
      compoundActionDecision('rally', 'tax'),
      compoundActionDecision('rally', 'subvert'),
      compoundActionDecision('terror', 'tax'),
      compoundActionDecision('terror', 'subvert'),
      compoundActionDecision('march', 'subvert'),
      actionDecision('march'),
      actionDecision('rally'),
      actionDecision('tax'),
      compoundActionDecision('attack', 'ambush-vc', { timing: 'during' }),
    ], state);

    const selected = result.selected;
    const passed = result.status === 'selected'
      && selected?.templateId === 'vc.rallyTax'
      && selected.rootStableMoveKey === RALLY_TAX_ROOT
      && selected.roleBindings.taxSpace?.selectedId === 'loc-saigon-can-tho:none'
      && selected.roleBindings.rallySpace?.selectedId !== undefined;

    emitVcArchitecturalRecord(TEST_FILE, CURATED_TAX_SEED, passed);

    assert.equal(result.status, 'selected');
    assert.equal(selected?.templateId, 'vc.rallyTax');
    assert.equal(selected?.rootStableMoveKey, RALLY_TAX_ROOT);
    assert.equal(selected?.roleBindings.taxSpace?.selectedId, 'loc-saigon-can-tho:none');
    assert.notEqual(selected?.roleBindings.rallySpace?.selectedId, undefined);
    assert.equal(
      result.alternatives.some((alternative) =>
        Object.values(alternative.roleBindings).some((binding) => binding.selectedId.startsWith('available-')),
      ),
      false,
      'expected VC plan roles to ignore off-board holding zones',
    );
  });
});
