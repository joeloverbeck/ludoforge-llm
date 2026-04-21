// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  assertValidatedGameDef,
  createGameDefRuntime,
  enumerateLegalMoves,
  initialState,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
} from '../../src/kernel/index.js';
import { resolveDecisionContinuation } from '../../src/kernel/microturn/continuation.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { derivePlayerObservation } from '../../src/kernel/observation.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
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

describe('Spec 139 hidden-information safety', () => {
  it('keeps published pending action identity and next public choice observer-safe when hidden hole cards change', () => {
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

    const baseEnumerated = enumerateLegalMoves(def, state, undefined, runtime);
    const swappedEnumerated = enumerateLegalMoves(def, swappedState, undefined, runtime);
    const baseClassified = baseEnumerated.moves.find((candidate) => candidate.move.actionId === OBSERVER_SAFE_ACTION_ID);
    const swappedClassified = swappedEnumerated.moves.find((candidate) => candidate.move.actionId === OBSERVER_SAFE_ACTION_ID);

    assert.ok(baseClassified, 'expected observer-safe pending action in base state');
    assert.ok(swappedClassified, 'expected observer-safe pending action in swapped hidden state');
    assert.equal(baseClassified?.viability.complete, false);
    assert.equal(swappedClassified?.viability.complete, false);
    assert.equal(baseClassified?.trustedMove, undefined);
    assert.equal(swappedClassified?.trustedMove, undefined);

    const baseKey = toMoveIdentityKey(def, baseClassified!.move);
    const swappedKey = toMoveIdentityKey(def, swappedClassified!.move);
    assert.equal(baseKey, swappedKey, 'hidden card order should not perturb published pending action identity');

    const baseContinuation = resolveDecisionContinuation(def, state, baseClassified!.move, { choose: () => undefined }, runtime);
    const swappedContinuation = resolveDecisionContinuation(def, swappedState, swappedClassified!.move, { choose: () => undefined }, runtime);

    assert.deepEqual(baseContinuation.nextDecision, swappedContinuation.nextDecision);
    const serializedDecision = JSON.stringify(baseContinuation.nextDecision ?? null);
    for (const card of opponentCards) {
      assert.equal(serializedDecision.includes(String(card.id)), false);
    }
  });
});
