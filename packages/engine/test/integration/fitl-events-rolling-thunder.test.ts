import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
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
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

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

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const findRollingThunderMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === 'card-10'),
  );

const withActivePlayer = (state: GameState, player: 0 | 1 | 2 | 3): GameState => ({
  ...state,
  activePlayer: asPlayerId(player),
});

describe('FITL card-10 Rolling Thunder', () => {
  it('encodes unshaded as Trail/NVA resource degradation plus NVA make-ineligible override', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-10');
    assert.notEqual(card, undefined, 'Expected card-10 in production deck');
    assert.deepEqual(card?.unshaded?.eligibilityOverrides, [
      { target: { kind: 'seat', seat: 'NVA' }, eligible: false, windowId: 'make-ineligible' },
    ]);
    assert.deepEqual(card?.unshaded?.effects, [
      { addVar: { scope: 'global', var: 'trail', delta: -2 } },
      { addVar: { scope: 'global', var: 'nvaResources', delta: -9 } },
    ]);
  });

  it('unshaded immediately applies both deltas with clamping and makes NVA ineligible for the next card', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 10101, 4).state);
    assert.equal(base.turnOrderState.type, 'cardDriven');

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(base),
          currentCard: {
            ...requireCardDrivenRuntime(base).currentCard,
            firstEligible: 'US',
            secondEligible: 'ARVN',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
      globalVars: {
        ...base.globalVars,
        trail: 1,
        nvaResources: 5,
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken('card-10', 'card', 'none')],
      },
    };

    const move = findRollingThunderMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-10 unshaded event move');

    const first = applyMove(def, setup, move!);
    assert.equal(first.state.globalVars.trail, 0, 'Trail should degrade by 2 with floor at 0');
    assert.equal(first.state.globalVars.nvaResources, 0, 'NVA resources should drop by 9 with floor at 0');

    const overrideCreate = first.triggerFirings.find(
      (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'overrideCreate',
    );
    assert.deepEqual(
      (overrideCreate as { overrides?: readonly unknown[] } | undefined)?.overrides,
      [{ seat: 'NVA', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' }],
      'Unshaded should queue a nextTurn make-ineligible override for NVA',
    );

    const pendingOverrides = requireCardDrivenRuntime(first.state).pendingEligibilityOverrides ?? [];
    assert.deepEqual(
      pendingOverrides,
      [{ seat: 'NVA', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' }],
      'NVA ineligibility should be queued with nextTurn duration (through next card)',
    );
  });

  it('shaded applies ARVN resource hit instantly, blocks Air Strike until Coup reset, then unblocks', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 10102, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      globalVars: {
        ...base.globalVars,
        arvnResources: 3,
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken('card-10', 'card', 'none')],
      },
    };

    const move = findRollingThunderMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-10 shaded event move');

    const afterShaded = applyMove(def, setup, move!).state;
    assert.equal(afterShaded.globalVars.arvnResources, 0, 'ARVN resources should drop by 5 with floor at 0');
    assert.equal(afterShaded.globalVars.mom_rollingThunder, true, 'Shaded should activate Rolling Thunder momentum');

    const runAirStrike = (state: GameState) =>
      applyMoveWithResolvedDecisionIds(def, withActivePlayer(state, 0), {
        actionId: asActionId('airStrike'),
        params: {
          spaces: [],
          $degradeTrail: 'no',
        },
      });

    assert.throws(
      () => runAirStrike(afterShaded),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
      'Rolling Thunder momentum should prohibit Air Strike before Coup',
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

    const atReset = advancePhase(def, preparedForCoupReset);
    assert.equal(atReset.currentPhase, asPhaseId('coupReset'));
    assert.equal(atReset.globalVars.mom_rollingThunder, false, 'Coup reset must clear Rolling Thunder momentum');

    const afterReset = advancePhase(def, atReset);
    assert.equal(afterReset.currentPhase, asPhaseId('main'));
    assert.doesNotThrow(() => runAirStrike(afterReset), 'Air Strike should be legal again after Coup reset');
  });
});
