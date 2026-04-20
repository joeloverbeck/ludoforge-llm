// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  assertValidatedGameDef,
  createGameDefRuntime,
  enumerateLegalMoves,
  initialState,
  materializeCompletionCertificate,
  type ActionDef,
  type ActionPipelineDef,
  type GameDef,
} from '../../src/kernel/index.js';
import { advanceToDecisionPoint } from '../../src/kernel/phase-advance.js';
import { derivePlayerObservation } from '../../src/kernel/observation.js';
import { toMoveIdentityKey } from '../../src/kernel/move-identity.js';
import { compileTexasProductionSpec } from '../helpers/production-spec-helpers.js';
import { eff } from '../helpers/effect-tag-helper.js';

const OBSERVER_SAFE_ACTION_ID = asActionId('observer-safe-certificate');

const withObserverSafeCertificateAction = (def: GameDef): GameDef => {
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
    id: 'observer-safe-certificate-profile',
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
  it('keeps certificate assignments and materialized moves observer-safe when only hidden hole-card bindings change', () => {
    const { compiled } = compileTexasProductionSpec();
    const def = withObserverSafeCertificateAction(assertValidatedGameDef(compiled.gameDef));
    const runtime = createGameDefRuntime(def);
    const state = advanceToDecisionPoint(def, initialState(def, 29, 2).state);
    const opponentPlayer = Number(state.activePlayer) === 0 ? 1 : 0;
    const opponentZoneId = `hand:${opponentPlayer}`;
    const opponentCards = state.zones[opponentZoneId] ?? [];

    assert.equal(opponentCards.length >= 2, true, 'expected opponent to hold hidden hole cards');

    const observerProfile = def.observers?.observers['currentPlayer'];
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

    assert.ok(baseClassified, 'expected observer-safe certificate move to be legal in base state');
    assert.ok(swappedClassified, 'expected observer-safe certificate move to be legal in swapped hidden state');
    assert.equal(baseClassified?.viability.complete, false);
    assert.equal(swappedClassified?.viability.complete, false);
    assert.equal(baseClassified?.viability.stochasticDecision, undefined);
    assert.equal(swappedClassified?.viability.stochasticDecision, undefined);

    const baseKey = toMoveIdentityKey(def, baseClassified!.move);
    const swappedKey = toMoveIdentityKey(def, swappedClassified!.move);
    const baseCertificate = baseEnumerated.certificateIndex?.get(baseKey);
    const swappedCertificate = swappedEnumerated.certificateIndex?.get(swappedKey);

    assert.ok(baseCertificate, 'expected completion certificate in base state');
    assert.ok(swappedCertificate, 'expected completion certificate in swapped hidden state');
    assert.deepEqual(baseCertificate?.assignments, swappedCertificate?.assignments);

    const baseMaterialized = materializeCompletionCertificate(def, state, baseClassified!.move, baseCertificate!, runtime);
    const swappedMaterialized = materializeCompletionCertificate(def, swappedState, swappedClassified!.move, swappedCertificate!, runtime);

    assert.deepEqual(baseMaterialized, swappedMaterialized);
    const serializedAssignments = JSON.stringify(baseCertificate?.assignments ?? []);
    for (const card of opponentCards) {
      assert.equal(serializedAssignments.includes(String(card.id)), false);
    }
  });
});
