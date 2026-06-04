// @test-class: architectural-invariant
// @proof-tier: executed-outcome
// @proof-tier: adversarial
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertOutcomeDeltas, assertReplayIdentity, canonicalStateChanged } from '../helpers/competence/index.js';
import {
  decisionStableKey,
  loadFitlProductionDef,
  runFitlCompetenceCase,
  withEveryZoneSupportMarker,
} from './shared-competence-helpers.js';
import { assertProfileBinds, emitVcArchitecturalRecord, loadVcPlanFixture } from './vc-plan-witness-helpers.js';

const TEST_FILE = fileURLToPath(import.meta.url);
const SEED = 204_008_01;

describe('Spec 204 VC Terror high-pop target witness', () => {
  it('binds Terror doctrine to the high-population non-COIN selector surface', () => {
    const fixture = loadVcPlanFixture(SEED);
    const lib = fixture.def.agents?.library;
    const terrorTax = lib?.planTemplates?.['vc.terrorTax'];
    const terrorSubvert = lib?.planTemplates?.['vc.terrorSubvert'];
    const oppositionEngine = lib?.strategyModules?.['vc.oppositionEngine'];
    const selector = lib?.selectors?.['vc.terrorHighPopTarget'];

    const passed = selector !== undefined
      && terrorTax?.roles.terrorSpace?.selectorId === 'vc.terrorHighPopTarget'
      && terrorSubvert?.roles.terrorSpace?.selectorId === 'vc.terrorHighPopTarget'
      && oppositionEngine?.selectors.some((entry) => entry.selectorId === 'vc.terrorHighPopTarget') === true;

    emitVcArchitecturalRecord(TEST_FILE, SEED, passed);

    assert.ok(selector, 'expected vc.terrorHighPopTarget selector');
    assert.equal(terrorTax?.roles.terrorSpace?.selectorId, 'vc.terrorHighPopTarget');
    assert.equal(terrorSubvert?.roles.terrorSpace?.selectorId, 'vc.terrorHighPopTarget');
    assert.equal(oppositionEngine?.selectors.some((entry) => entry.selectorId === 'vc.terrorHighPopTarget'), true);
    assertProfileBinds(fixture, {
      strategyModules: ['vc.oppositionEngine'],
      planTemplates: ['vc.terrorTax', 'vc.terrorSubvert'],
    });
  });

  it('executes Terror on a high-pop non-COIN target and improves Opposition', () => {
    const def = loadFitlProductionDef();
    const run = () => runFitlCompetenceCase(def, {
      seatId: 'vc',
      playerIndex: 3,
      seed: 210_001,
      prepareState: (caseDef, state) => withEveryZoneSupportMarker(caseDef, state, 'passiveOpposition'),
    });
    const result = run();
    const selectedTarget = result.decisions
      .map((decision) => decision.agentDecision?.selectedStableMoveKey)
      .find((key) => key?.includes(':add:'));
    const outcomeDeltas = assertOutcomeDeltas({
      def,
      before: result.preState,
      after: result.postState,
      assertions: [
        {
          label: 'VC Opposition total',
          query: { kind: 'stateFeature', id: 'totalOpposition', seatId: 'vc', playerId: 3 },
          before: 35,
          after: 37,
          delta: { exact: 2 },
        },
      ],
    });
    const passed = canonicalStateChanged(result.preState, result.postState)
      && decisionStableKey(def, result.selectedDecision) === 'terror|{}|noCompound|false|operation'
      && selectedTarget?.includes('quang-tin-quang-ngai:none') === true
      && outcomeDeltas[0]?.delta === 2;

    emitVcArchitecturalRecord(TEST_FILE, 210_001, passed, result.decisions.length);

    assert.equal(decisionStableKey(def, result.selectedDecision), 'terror|{}|noCompound|false|operation');
    assert.equal(selectedTarget?.includes('quang-tin-quang-ngai:none'), true);
    assert.ok(canonicalStateChanged(result.preState, result.postState), 'expected Terror to change state');
    assertReplayIdentity({ def, runFixture: run });
  });
});
