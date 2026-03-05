import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  createEvalRuntimeResources,
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, unknown>>,
): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type, ...(extraProps ?? {}) },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const withActivePlayer = (state: GameState, player: 0 | 1 | 2 | 3): GameState => ({
  ...state,
  activePlayer: asPlayerId(player),
});

const findDaNangMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === 'card-22'),
  );

const countUSTroopsInZone = (state: GameState, zone: string): number =>
  (state.zones[zone] ?? []).filter(
    (token) => token.props?.faction === 'US' && token.props?.type === 'troops',
  ).length;

describe('FITL card-22 Da Nang', () => {
  it('unshaded places up to 6 US Troops into Da Nang, with at most 3 from out of play', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 10221, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        'played:none': [makeToken('card-22', 'card', 'none')],
        'out-of-play-US:none': [
          makeToken('oop-us-1', 'troops', 'US'),
          makeToken('oop-us-2', 'troops', 'US'),
          makeToken('oop-us-3', 'troops', 'US'),
          makeToken('oop-us-4', 'troops', 'US'),
          makeToken('oop-us-5', 'troops', 'US'),
        ],
        'available-US:none': [
          makeToken('avail-us-1', 'troops', 'US'),
          makeToken('avail-us-2', 'troops', 'US'),
          makeToken('avail-us-3', 'troops', 'US'),
          makeToken('avail-us-4', 'troops', 'US'),
          makeToken('avail-us-5', 'troops', 'US'),
        ],
      },
    };

    const move = findDaNangMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-22 unshaded event move');

    const after = applyMove(def, setup, move!).state;
    assert.equal(countUSTroopsInZone(after, 'da-nang:none'), 6, 'Should place at most 6 US Troops into Da Nang');
    assert.equal(countUSTroopsInZone(after, 'out-of-play-US:none'), 2, 'Should place at most 3 Troops from out of play');
    assert.equal(countUSTroopsInZone(after, 'available-US:none'), 2, 'Should source remaining Troops from Available');
  });

  it('unshaded places only available inventory when fewer than 6 Troops exist across sources', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 10222, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        'played:none': [makeToken('card-22', 'card', 'none')],
        'out-of-play-US:none': [
          makeToken('oop-us-1', 'troops', 'US'),
          makeToken('oop-us-2', 'troops', 'US'),
        ],
        'available-US:none': [
          makeToken('avail-us-1', 'troops', 'US'),
        ],
      },
    };

    const move = findDaNangMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-22 unshaded event move');

    const after = applyMove(def, setup, move!).state;
    assert.equal(countUSTroopsInZone(after, 'da-nang:none'), 3, 'Should place all available Troops when below 6 total');
    assert.equal(countUSTroopsInZone(after, 'out-of-play-US:none'), 0);
    assert.equal(countUSTroopsInZone(after, 'available-US:none'), 0);
  });

  it('shaded immediately removes Support within 1 space, then bans Air Strike until Coup reset', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 10223, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      markers: {
        ...base.markers,
        'da-nang:none': { ...(base.markers['da-nang:none'] ?? {}), supportOpposition: 'activeSupport' },
        'quang-nam:none': { ...(base.markers['quang-nam:none'] ?? {}), supportOpposition: 'passiveSupport' },
        'loc-hue-da-nang:none': { ...(base.markers['loc-hue-da-nang:none'] ?? {}), supportOpposition: 'activeSupport' },
        'loc-da-nang-qui-nhon:none': { ...(base.markers['loc-da-nang-qui-nhon:none'] ?? {}), supportOpposition: 'passiveOpposition' },
        'hue:none': { ...(base.markers['hue:none'] ?? {}), supportOpposition: 'passiveSupport' },
        'saigon:none': { ...(base.markers['saigon:none'] ?? {}), supportOpposition: 'activeSupport' },
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken('card-22', 'card', 'none')],
      },
    };

    const move = findDaNangMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-22 shaded event move');

    const afterShaded = applyMove(def, setup, move!).state;
    assert.equal(afterShaded.markers['da-nang:none']?.supportOpposition, 'neutral');
    assert.equal(afterShaded.markers['quang-nam:none']?.supportOpposition, 'neutral');
    assert.equal(afterShaded.markers['loc-hue-da-nang:none']?.supportOpposition, 'neutral');
    assert.equal(afterShaded.markers['loc-da-nang-qui-nhon:none']?.supportOpposition, 'passiveOpposition');
    assert.equal(afterShaded.markers['hue:none']?.supportOpposition, 'passiveSupport');
    assert.equal(afterShaded.markers['saigon:none']?.supportOpposition, 'activeSupport');
    assert.equal(afterShaded.globalVars.mom_daNang, true, 'Shaded should activate Da Nang momentum');

    const runAirStrike = (state: GameState) =>
      applyMoveWithResolvedDecisionIds(def, withActivePlayer(state, 0), {
        actionId: asActionId('airStrike'),
        params: {
          $spaces: [],
          $degradeTrail: 'no',
        },
      });

    assert.throws(
      () => runAirStrike(afterShaded),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Da Nang momentum should prohibit Air Strike before Coup',
    );

    const preparedForCoupReset: GameState = {
      ...afterShaded,
      currentPhase: asPhaseId('coupCommitment'),
      zones: {
        ...afterShaded.zones,
        'played:none': [makeToken('played-coup', 'card', 'none', { isCoup: true })],
        'lookahead:none': [makeToken('lookahead-event', 'card', 'none', { isCoup: false })],
        'deck:none': [makeToken('deck-event', 'card', 'none', { isCoup: false })],
      },
    };

    const atReset = advancePhase(def, preparedForCoupReset, createEvalRuntimeResources());
    assert.equal(atReset.currentPhase, asPhaseId('coupReset'));
    assert.equal(atReset.globalVars.mom_daNang, false, 'Coup reset must clear Da Nang momentum');

    const afterReset = advancePhase(def, atReset, createEvalRuntimeResources());
    assert.equal(afterReset.currentPhase, asPhaseId('main'));
    assert.doesNotThrow(() => runAirStrike(afterReset), 'Air Strike should be legal again after Coup reset');
  });
});
