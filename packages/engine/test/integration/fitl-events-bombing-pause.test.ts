import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  createEvalRuntimeResources,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, unknown>>,
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...(extraProps ?? {}),
  },
});

const withActivePlayer = (state: GameState, player: 0 | 1 | 2 | 3): GameState => ({
  ...state,
  activePlayer: asPlayerId(player),
});

const findBombingPauseMove = (def: GameDef, state: GameState) =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === 'unshaded'
      && (move.params.eventCardId === undefined || move.params.eventCardId === 'card-41'),
  );

const runAirStrike = (def: GameDef, state: GameState) =>
  applyMoveWithResolvedDecisionIds(def, withActivePlayer(state, 0), {
    actionId: asActionId('airStrike'),
    params: {
      spaces: [],
      $degradeTrail: 'no',
    },
  });

describe('FITL card-41 Bombing Pause', () => {
  it('applies immediate support/patronage effects and blocks Air Strike until Coup reset', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 41001, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      globalVars: {
        ...base.globalVars,
        patronage: 74,
      },
      markers: {
        ...base.markers,
        'saigon:none': { supportOpposition: 'activeSupport' },
        'quang-tri-thua-thien:none': { supportOpposition: 'activeOpposition' },
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken('card-41', 'card', 'none')],
      },
    };

    const move = findBombingPauseMove(def, setup);
    assert.notEqual(move, undefined, 'Expected card-41 unshaded event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetSpace' || request.decisionId.includes('targetSpace'),
        value: ['saigon:none', 'quang-tri-thua-thien:none'],
      },
    ];

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;
    assert.equal(afterEvent.markers['saigon:none']?.supportOpposition, 'passiveSupport');
    assert.equal(afterEvent.markers['quang-tri-thua-thien:none']?.supportOpposition, 'passiveSupport');
    assert.equal(afterEvent.globalVars.patronage, 75, 'Patronage +2 should clamp at global max');
    assert.equal(afterEvent.globalVars.mom_bombingPause, true, 'Bombing Pause momentum should activate immediately');

    assert.throws(
      () => runAirStrike(def, afterEvent),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Bombing Pause momentum should prohibit Air Strike before Coup',
    );

    const preparedForCoupReset: GameState = {
      ...afterEvent,
      currentPhase: asPhaseId('coupCommitment'),
      zones: {
        ...afterEvent.zones,
        'played:none': [makeToken('played-coup', 'card', 'none', { isCoup: true })],
        'lookahead:none': [makeToken('lookahead-event', 'card', 'none', { isCoup: false })],
        'deck:none': [makeToken('deck-event', 'card', 'none', { isCoup: false })],
      },
    };

    const operationResources = createEvalRuntimeResources();
    const atReset = advancePhase({ def, state: preparedForCoupReset, evalRuntimeResources: operationResources });
    assert.equal(atReset.currentPhase, asPhaseId('coupReset'));
    assert.equal(atReset.globalVars.mom_bombingPause, false, 'Coup reset must clear Bombing Pause momentum');

    const afterReset = advancePhase({ def, state: atReset, evalRuntimeResources: operationResources });
    assert.equal(afterReset.currentPhase, asPhaseId('main'));
    assert.doesNotThrow(() => runAirStrike(def, afterReset), 'Air Strike should be legal again after Coup reset');
  });

  it('encodes single-side contract with exact-two support-eligible targets', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-41');
    assert.notEqual(card, undefined, 'Expected card-41 in production deck');
    assert.equal(card?.sideMode, 'single');
    assert.equal(card?.shaded, undefined);
    assert.equal(card?.unshaded?.text, 'Set any two spaces to Passive Support. Patronage +2. No Air Strike until Coup. MOMENTUM');
    assert.deepEqual(card?.unshaded?.targets?.[0]?.cardinality, { n: 2 });
    assert.equal(card?.unshaded?.targets?.[0]?.application, 'each');
    assert.deepEqual(card?.unshaded?.targets?.[0]?.effects, [
      { setMarker: { space: '$targetSpace', marker: 'supportOpposition', state: 'passiveSupport' } },
    ]);
    assert.deepEqual(card?.unshaded?.effects, [{ addVar: { scope: 'global', var: 'patronage', delta: 2 } }]);
  });

  it('rejects target selections that do not meet exact-two or options-domain constraints', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 41002, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        'played:none': [makeToken('card-41', 'card', 'none')],
      },
    };

    const move = findBombingPauseMove(def, setup);
    assert.notEqual(move, undefined, 'Expected card-41 event move');

    assert.throws(
      () =>
        applyMove(def, setup, {
          ...move!,
          params: {
            ...move!.params,
            $targetSpace: ['saigon:none'],
          },
        }),
      /(?:moveHasIncompleteParams|chooseN selection cardinality mismatch)/,
      'Bombing Pause must require exactly two selected spaces',
    );

    assert.throws(
      () =>
        applyMove(def, setup, {
          ...move!,
          params: {
            ...move!.params,
            $targetSpace: ['saigon:none', 'loc-hue-da-nang:none'],
          },
        }),
      /(?:outside options domain|moveHasIncompleteParams)/,
      'Bombing Pause must reject LoC/non-support spaces from target selection',
    );
  });
});
