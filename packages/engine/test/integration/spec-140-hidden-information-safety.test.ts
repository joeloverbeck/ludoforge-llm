// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  applyDecision,
  assertValidatedGameDef,
  createGameDefRuntime,
  initialState,
  publishMicroturn,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
} from '../../src/kernel/index.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { derivePlayerObservation } from '../../src/kernel/observation.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';

const OBSERVER_SAFE_ACTION_ID = asActionId('observer-safe-pending-action');

const withObserverSafeAction = (def: GameDef): GameDef => {
  const action: ActionDef = {
    id: OBSERVER_SAFE_ACTION_ID,
    actor: 'active',
    executor: 'actor',
    phase: def.turnStructure.phases.map((phase) => phase.id),
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  };
  const pipeline: ActionPipelineDef = {
    id: 'observer-safe-pending-profile',
    actionId: OBSERVER_SAFE_ACTION_ID,
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$publicFirst',
            bind: '$publicFirst',
            options: { query: 'enums', values: ['call', 'raise'] },
          },
        }) as GameDef['actions'][number]['effects'][number],
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$publicSecond',
            bind: '$publicSecond',
            options: { query: 'enums', values: ['left', 'right'] },
          },
        }) as GameDef['actions'][number]['effects'][number],
      ],
    }],
    atomicity: 'partial',
  };
  return {
    ...def,
    actions: [...def.actions, action],
    actionPipelines: [...(def.actionPipelines ?? []), pipeline],
  };
};

describe('Spec 140 hidden-information safety', () => {
  it('keeps published microturn identity and downstream player choice observer-safe when hidden hole cards change', () => {
    const { compiled } = compileTexasProductionSpec();
    const def = withObserverSafeAction(assertValidatedGameDef(compiled.gameDef));
    const runtime = createGameDefRuntime(def);
    const state = advanceToDecisionPoint(def, initialState(def, 29, 2).state);
    const opponentPlayer = Number(state.activePlayer) === 0 ? 1 : 0;
    const opponentZoneId = `hand:${opponentPlayer}`;
    const opponentCards = state.zones[opponentZoneId] ?? [];

    assert.equal(opponentCards.length >= 2, true, 'expected opponent to hold hidden hole cards');

    const observerProfile = def.observers?.observers.currentPlayer;
    const observation = derivePlayerObservation(def, state, state.activePlayer, observerProfile);
    assert.deepEqual(observation.visibleTokenIdsByZone[opponentZoneId], []);

    const swappedState = {
      ...state,
      zones: {
        ...state.zones,
        [opponentZoneId]: [...opponentCards].reverse(),
      },
    };
    const swappedObservation = derivePlayerObservation(def, swappedState, swappedState.activePlayer, observerProfile);
    assert.deepEqual(swappedObservation.visibleTokenIdsByZone[opponentZoneId], []);

    const baseMicroturn = publishMicroturn(def, state, runtime);
    const swappedMicroturn = publishMicroturn(def, swappedState, runtime);
    const baseDecision = baseMicroturn.legalActions.find(
      (candidate) => candidate.kind === 'actionSelection' && candidate.actionId === OBSERVER_SAFE_ACTION_ID,
    );
    const swappedDecision = swappedMicroturn.legalActions.find(
      (candidate) => candidate.kind === 'actionSelection' && candidate.actionId === OBSERVER_SAFE_ACTION_ID,
    );

    assert.ok(baseDecision, 'expected observer-safe action in base state');
    assert.ok(swappedDecision, 'expected observer-safe action in swapped hidden state');
    assert.deepEqual(baseDecision, swappedDecision);

    const baseNext = publishMicroturn(def, applyDecision(def, state, baseDecision!, undefined, runtime).state, runtime);
    const swappedNext = publishMicroturn(def, applyDecision(def, swappedState, swappedDecision!, undefined, runtime).state, runtime);

    assert.equal(baseNext.kind, 'chooseOne');
    assert.equal(swappedNext.kind, 'chooseOne');
    assert.deepEqual(baseNext.legalActions, swappedNext.legalActions);
    const serializedDecision = JSON.stringify(baseNext.legalActions);
    for (const card of opponentCards) {
      assert.equal(serializedDecision.includes(String(card.id)), false);
    }
  });
});
