// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { asActionId } from '../../src/kernel/index.js';
import { moveOneToken, runFitlCompetenceCase, loadFitlProductionDef } from './shared-competence-helpers.js';
import { assertProfileBinds, emitVcArchitecturalRecord, loadVcPlanFixture } from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 204_008_08;

describe('Spec 204 VC populated-Support Tax guardrail witness', () => {
  it('binds the populated-Support Tax demotion guardrail with LoC Tax doctrine', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const guardrail = lib?.guardrails?.['vc.avoidTaxWhenSupportShiftIsTooCostly'];
    const taxTemplate = lib?.planTemplates?.['vc.terrorTax'];
    const rallyTax = lib?.planTemplates?.['vc.rallyTax'];

    const passed = guardrail?.severity === 'demote'
      && taxTemplate?.roles.taxSpace?.selectorId === 'vc.taxLocTarget'
      && rallyTax?.roles.taxSpace?.selectorId === 'vc.taxLocTarget';

    emitVcArchitecturalRecord(TEST_FILE, SEED, passed);

    assert.equal(guardrail?.severity, 'demote');
    assert.equal(taxTemplate?.roles.taxSpace?.selectorId, 'vc.taxLocTarget');
    assert.equal(rallyTax?.roles.taxSpace?.selectorId, 'vc.taxLocTarget');
    assertProfileBinds(fixture, {
      guardrails: ['vc.avoidTaxWhenSupportShiftIsTooCostly'],
      planTemplates: ['vc.terrorTax', 'vc.rallyTax'],
    });
  });

  it('executes LoC Tax instead of a populated Support Tax target in the curated funding state', () => {
    const def = loadFitlProductionDef();
    const run = runFitlCompetenceCase(def, {
      seatId: 'vc',
      playerIndex: 3,
      seed: 210_001,
      prepareState: (_caseDef, state) => moveOneToken(
        state,
        'available-VC:none',
        'loc-saigon-can-tho:none',
        (token) => token.props.faction === 'VC' && token.props.type === 'guerrilla',
      ),
    });
    const before = run.preState;
    const taxResult = applyMoveWithResolvedDecisionIds(def, before, {
      actionId: asActionId('tax'),
      params: {},
      actionClass: 'specialActivity',
    }, {
      overrides: [
        { when: (request) => request.name === '$targetSpaces', value: ['loc-saigon-can-tho:none'] },
      ],
    });
    const supportTax = (): void => {
      applyMoveWithResolvedDecisionIds(def, before, {
        actionId: asActionId('tax'),
        params: {},
        actionClass: 'specialActivity',
      }, {
        overrides: [
          { when: (request) => request.name === '$targetSpaces', value: ['saigon:none'] },
        ],
      });
    };

    const locResourceDelta = Number(taxResult.state.globalVars.vcResources) - Number(before.globalVars.vcResources);
    let supportRejected = false;
    try {
      supportTax();
    } catch (error) {
      supportRejected = error instanceof Error && /outside options domain/.test(error.message);
    }
    const passed = locResourceDelta === 2 && supportRejected;

    emitVcArchitecturalRecord(TEST_FILE, 210_001, passed, 2);

    assert.equal(locResourceDelta, 2);
    assert.throws(supportTax, /outside options domain/);
    assert.equal(taxResult.state.markers['loc-saigon-can-tho:none']?.supportOpposition, undefined);
  });
});
