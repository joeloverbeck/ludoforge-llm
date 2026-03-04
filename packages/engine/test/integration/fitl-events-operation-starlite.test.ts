import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-24';
const QUANG_NAM = 'quang-nam:none';
const DA_NANG = 'da-nang:none';
const PLEIKU = 'pleiku-darlac:none';
const BINH_DINH = 'binh-dinh:none';
const PHU_BON = 'phu-bon-phu-yen:none';
const QUANG_TIN = 'quang-tin-quang-ngai:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, string | number | boolean>>,
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

const findCard24Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID)
      && move.params.side === side,
  );

const countZoneTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-24 Operation Starlite', () => {
  it('unshaded removes all VC pieces from a coastal province with US troops in or adjacent', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 24001, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [QUANG_NAM]: [
          makeToken('starlite-vc-base', 'base', 'VC', { type: 'base' }),
          makeToken('starlite-vc-guerrilla-active', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('starlite-vc-guerrilla-underground', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('starlite-us-base-not-removed', 'base', 'US', { type: 'base' }),
        ],
        [DA_NANG]: [
          makeToken('starlite-us-adjacent-troop', 'troops', 'US', { type: 'troops' }),
        ],
      },
    };

    const move = findCard24Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-24 unshaded event move');

    const overrides: readonly DecisionOverrideRule[] = [{
      when: (request) => request.name === '$targetProvince',
      value: QUANG_NAM,
    }];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countZoneTokens(final, QUANG_NAM, (token) => token.props.faction === 'VC'),
      0,
      'Unshaded should remove all VC pieces from the selected province',
    );
    assert.equal(
      countZoneTokens(final, 'available-VC:none', (token) => token.id === asTokenId('starlite-vc-base')),
      1,
      'VC base should move to Available',
    );
    assert.equal(
      countZoneTokens(final, 'available-VC:none', (token) => token.id === asTokenId('starlite-vc-guerrilla-active')),
      1,
      'Active VC guerrilla should move to Available',
    );
    assert.equal(
      countZoneTokens(final, 'available-VC:none', (token) => token.id === asTokenId('starlite-vc-guerrilla-underground')),
      1,
      'Underground VC guerrilla should move to Available',
    );
    assert.equal(
      countZoneTokens(final, QUANG_NAM, (token) => token.id === asTokenId('starlite-us-base-not-removed')),
      1,
      'Non-VC pieces in selected province should not be affected',
    );
  });

  it('unshaded is unavailable if no province satisfies coastal + VC + US troop adjacency constraints', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 24002, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [QUANG_NAM]: [
          makeToken('starlite-vc-coastal-no-us-troop', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
        [DA_NANG]: [
          makeToken('starlite-us-base-adjacent-only', 'base', 'US', { type: 'base' }),
        ],
        [PLEIKU]: [
          makeToken('starlite-vc-inland', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('starlite-us-inland-troop', 'troops', 'US', { type: 'troops' }),
        ],
      },
    };

    const move = findCard24Move(def, setup, 'unshaded');
    assert.equal(move, undefined, 'Unshaded should be unavailable with no legal target province');
  });

  it('shaded flips all active VC guerrillas underground in up to 3 selected provinces', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 24003, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [QUANG_NAM]: [
          makeToken('starlite-shaded-vc-active-1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('starlite-shaded-vc-underground-1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('starlite-shaded-nva-active', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'active' }),
        ],
        [BINH_DINH]: [
          makeToken('starlite-shaded-vc-active-2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
        [PHU_BON]: [
          makeToken('starlite-shaded-vc-active-3', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
        [QUANG_TIN]: [
          makeToken('starlite-shaded-vc-active-unselected', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
      },
    };

    const move = findCard24Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-24 shaded event move');

    const overrides: readonly DecisionOverrideRule[] = [{
      when: (request) => request.name === '$targetProvince',
      value: [QUANG_NAM, BINH_DINH, PHU_BON],
    }];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const vcActive1 = (final.zones[QUANG_NAM] ?? []).find((token) => token.id === asTokenId('starlite-shaded-vc-active-1')) as Token | undefined;
    const vcUnderground1 = (final.zones[QUANG_NAM] ?? []).find((token) => token.id === asTokenId('starlite-shaded-vc-underground-1')) as Token | undefined;
    const nvaActive = (final.zones[QUANG_NAM] ?? []).find((token) => token.id === asTokenId('starlite-shaded-nva-active')) as Token | undefined;
    const vcActive2 = (final.zones[BINH_DINH] ?? []).find((token) => token.id === asTokenId('starlite-shaded-vc-active-2')) as Token | undefined;
    const vcActive3 = (final.zones[PHU_BON] ?? []).find((token) => token.id === asTokenId('starlite-shaded-vc-active-3')) as Token | undefined;
    const vcUnselected = (final.zones[QUANG_TIN] ?? []).find((token) => token.id === asTokenId('starlite-shaded-vc-active-unselected')) as Token | undefined;

    assert.equal(vcActive1?.props.activity, 'underground');
    assert.equal(vcActive2?.props.activity, 'underground');
    assert.equal(vcActive3?.props.activity, 'underground');
    assert.equal(vcUnderground1?.props.activity, 'underground', 'Already underground VC guerrilla should remain underground');
    assert.equal(nvaActive?.props.activity, 'active', 'Non-VC guerrillas should not be affected');
    assert.equal(vcUnselected?.props.activity, 'active', 'Unselected province should not be modified');
  });

  it('shaded queues and applies active-seat remain-eligible override through next card', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 24004, 4).state);
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
            firstEligible: 'us',
            secondEligible: 'vc',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [QUANG_NAM]: [
          makeToken('starlite-remain-vc-active', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
      },
    };

    const shadedMove = findCard24Move(def, setup, 'shaded');
    assert.notEqual(shadedMove, undefined, 'Expected card-24 shaded event move');
    const first = applyMoveWithResolvedDecisionIds(def, setup, shadedMove!, {
      overrides: [{
        when: (request) => request.name === '$targetProvince',
        value: [QUANG_NAM],
      }],
    });

    const overrideCreate = first.triggerFirings.find(
      (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'overrideCreate',
    );
    assert.deepEqual(
      (overrideCreate as { overrides?: readonly unknown[] } | undefined)?.overrides,
      [{ seat: 'us', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' }],
      'Shaded should queue remain-eligible for the executing faction',
    );
    assert.deepEqual(
      requireCardDrivenRuntime(first.state).pendingEligibilityOverrides,
      [{ seat: 'us', eligible: true, windowId: 'remain-eligible', duration: 'nextTurn' }],
      'Pending overrides should include active-seat remain-eligible through next turn window',
    );

    const passMove = legalMoves(def, first.state).find((move) => String(move.actionId) === 'pass');
    assert.notEqual(passMove, undefined, 'Expected a legal pass move for second actor to end card');
    const second = applyMove(def, first.state, passMove!);
    assert.equal(
      requireCardDrivenRuntime(second.state).eligibility['us'],
      true,
      'Executing seat should remain eligible on the following card',
    );
  });
});
