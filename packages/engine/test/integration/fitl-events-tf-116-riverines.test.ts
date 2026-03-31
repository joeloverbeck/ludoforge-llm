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
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-25';
const MEKONG_CHAU_DOC = 'loc-can-tho-chau-doc:none';
const MEKONG_LONG_PHU = 'loc-can-tho-long-phu:none';
const MEKONG_SAIGON_CAN_THO = 'loc-saigon-can-tho:none';
const NON_MEKONG_BAC_LIEU = 'loc-can-tho-bac-lieu:none';

const mekongLocs = [MEKONG_CHAU_DOC, MEKONG_LONG_PHU, MEKONG_SAIGON_CAN_THO] as const;

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

const withEconOverrides = (def: GameDef, overrides: Readonly<Record<string, number>>): GameDef => ({
  ...def,
  zones: def.zones.map((zone) => {
    const econOverride = overrides[String(zone.id)];
    if (econOverride === undefined) {
      return zone;
    }
    return {
      ...zone,
      attributes: {
        ...(zone.attributes ?? {}),
        econ: econOverride,
      },
    };
  }),
});

const findCard25Move = (
  def: GameDef,
  state: GameState,
  side: 'unshaded' | 'shaded',
  branch?: string,
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID)
      && move.params.side === side
      && (branch === undefined || move.params.branch === branch),
  );

const countZoneTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-25 TF-116 Riverines', () => {
  it('encodes unshaded as execute-as branch choice with Mekong-Lowland filtered sweep/assault grants and monsoon sweep allowance', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    const branches = card?.unshaded?.branches ?? [];
    assert.deepEqual(branches.map((branch) => branch.id), ['tf116-execute-as-us', 'tf116-execute-as-arvn']);

    const usGrants = branches[0]?.freeOperationGrants ?? [];
    const arvnGrants = branches[1]?.freeOperationGrants ?? [];

    assert.equal(usGrants.length, 2);
    assert.equal(arvnGrants.length, 2);

    assert.equal(usGrants[0]?.seat, 'self');
    assert.equal(usGrants[0]?.executeAsSeat, 'us');
    assert.equal(usGrants[0]?.allowDuringMonsoon, true);
    assert.deepEqual(usGrants.map((grant) => grant.actionIds?.[0]), ['sweep', 'assault']);
    assert.equal(usGrants.every((grant) => grant.zoneFilter !== undefined), true);

    assert.equal(arvnGrants[0]?.seat, 'self');
    assert.equal(arvnGrants[0]?.executeAsSeat, 'arvn');
    assert.equal(arvnGrants[0]?.allowDuringMonsoon, true);
    assert.deepEqual(arvnGrants.map((grant) => grant.actionIds?.[0]), ['sweep', 'assault']);
    assert.equal(arvnGrants.every((grant) => grant.zoneFilter !== undefined), true);
  });

  it('unshaded removes all NVA/VC from all 3 Mekong LoCs but not from non-Mekong LoCs', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 25001, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [MEKONG_CHAU_DOC]: [
          makeToken('tf116-nva-troop-1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('tf116-vc-guerrilla-1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('tf116-us-troop-stays', 'troops', 'US', { type: 'troops' }),
        ],
        [MEKONG_LONG_PHU]: [
          makeToken('tf116-nva-base-1', 'base', 'NVA', { type: 'base', tunnel: 'tunneled' }),
        ],
        [NON_MEKONG_BAC_LIEU]: [
          makeToken('tf116-vc-base-bac-lieu', 'base', 'VC', { type: 'base' }),
          makeToken('tf116-arvn-troop-stays', 'troops', 'ARVN', { type: 'troops' }),
        ],
        [MEKONG_SAIGON_CAN_THO]: [
          makeToken('tf116-vc-saigon-cantho', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('tf116-us-troop-saigon-cantho', 'troops', 'US', { type: 'troops' }),
        ],
      },
    };

    const move = findCard25Move(def, setup, 'unshaded', 'tf116-execute-as-us');
    assert.notEqual(move, undefined, 'Expected card-25 unshaded event move');

    const final = applyMove(def, setup, move!).state;

    for (const loc of mekongLocs) {
      assert.equal(
        countZoneTokens(final, loc, (token) => token.props.faction === 'NVA' || token.props.faction === 'VC'),
        0,
        `Expected all NVA/VC removed from ${loc}`,
      );
    }

    assert.equal(
      countZoneTokens(final, MEKONG_CHAU_DOC, (token) => token.id === asTokenId('tf116-us-troop-stays')),
      1,
      'US pieces in Mekong LoCs should remain',
    );
    assert.equal(
      countZoneTokens(final, MEKONG_SAIGON_CAN_THO, (token) => token.id === asTokenId('tf116-us-troop-saigon-cantho')),
      1,
      'US pieces in Saigon-Can Tho Mekong LoC should remain',
    );

    assert.equal(
      countZoneTokens(final, NON_MEKONG_BAC_LIEU, (token) => token.id === asTokenId('tf116-vc-base-bac-lieu')),
      1,
      'Can Tho-Bac Lieu is not a Mekong LoC — its VC base should not be removed by card-25',
    );
    assert.equal(
      countZoneTokens(final, NON_MEKONG_BAC_LIEU, (token) => token.id === asTokenId('tf116-arvn-troop-stays')),
      1,
      'Can Tho-Bac Lieu ARVN troop should remain untouched',
    );

    assert.equal(
      countZoneTokens(final, 'available-NVA:none', (token) => token.id === asTokenId('tf116-nva-troop-1') || token.id === asTokenId('tf116-nva-base-1')),
      2,
      'NVA pieces removed from Mekong LoCs should move to available-NVA:none',
    );
    assert.equal(
      countZoneTokens(final, 'available-VC:none', (token) =>
        token.id === asTokenId('tf116-vc-guerrilla-1') || token.id === asTokenId('tf116-vc-saigon-cantho')),
      2,
      'VC pieces removed from Mekong LoCs should move to available-VC:none',
    );
  });

  it('unshaded and shaded target sets are invariant to Mekong LoC econ changes', () => {
    const def = withEconOverrides(compileDef(), {
      [MEKONG_CHAU_DOC]: 4,
      [MEKONG_LONG_PHU]: 6,
      [MEKONG_SAIGON_CAN_THO]: 0,
    });
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const unshadedBase = clearAllZones(initialState(def, 25003, 4).state);
    const unshadedSetup: GameState = {
      ...unshadedBase,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...unshadedBase.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        [MEKONG_CHAU_DOC]: [makeToken('tf116-econ-nva-target-1', 'troops', 'NVA', { type: 'troops' })],
        [MEKONG_LONG_PHU]: [makeToken('tf116-econ-vc-target-2', 'base', 'VC', { type: 'base' })],
        [MEKONG_SAIGON_CAN_THO]: [makeToken('tf116-econ-vc-target-3', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' })],
      },
    };

    const unshadedMove = findCard25Move(def, unshadedSetup, 'unshaded', 'tf116-execute-as-us');
    assert.notEqual(unshadedMove, undefined, 'Expected card-25 unshaded event move');
    const unshadedFinal = applyMove(def, unshadedSetup, unshadedMove!).state;

    for (const loc of mekongLocs) {
      assert.equal(
        countZoneTokens(unshadedFinal, loc, (token) => token.props.faction === 'NVA' || token.props.faction === 'VC'),
        0,
        `Expected all insurgents removed from ${loc} despite econ overrides`,
      );
    }

    const shadedBase = clearAllZones(initialState(def, 25004, 4).state);
    const shadedSetup: GameState = {
      ...shadedBase,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...shadedBase.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        'available-VC:none': [
          makeToken('tf116-econ-vc-available-1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('tf116-econ-vc-available-2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('tf116-econ-vc-available-3', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('tf116-econ-vc-available-4', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('tf116-econ-vc-available-5', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('tf116-econ-vc-available-6', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
        ],
      },
    };

    const shadedMove = findCard25Move(def, shadedSetup, 'shaded');
    assert.notEqual(shadedMove, undefined, 'Expected card-25 shaded event move');
    const shadedFinal = applyMove(def, shadedSetup, shadedMove!).state;

    for (const loc of mekongLocs) {
      assert.equal(
        countZoneTokens(shadedFinal, loc, (token) => token.props.faction === 'VC' && token.props.type === 'guerrilla'),
        2,
        `Expected shaded placement to remain at 2 VC guerrillas in ${loc} despite econ overrides`,
      );
    }
    assert.equal(
      countZoneTokens(shadedFinal, 'available-VC:none', (token) => token.props.faction === 'VC' && token.props.type === 'guerrilla'),
      0,
      'All 6 available VC guerrillas should be placed (2 per each of 3 Mekong LoCs)',
    );
  });

  it('shaded places up to 2 VC guerrillas in each Mekong river LoC then sabotages each LoC with VC > COIN while respecting cap/idempotency', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 25002, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      globalVars: {
        ...base.globalVars,
        terrorSabotageMarkersPlaced: 13,
      },
      markers: {
        ...base.markers,
        [MEKONG_LONG_PHU]: { ...(base.markers[MEKONG_LONG_PHU] ?? {}), sabotage: 'sabotage' },
      },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
        'available-VC:none': [
          makeToken('tf116-vc-available-1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('tf116-vc-available-2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('tf116-vc-available-3', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('tf116-vc-available-4', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('tf116-vc-available-5', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('tf116-vc-available-6', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
        ],
        [MEKONG_LONG_PHU]: [
          makeToken('tf116-vc-base-long-phu', 'base', 'VC', { type: 'base' }),
          makeToken('tf116-coin-arvn-long-phu', 'troops', 'ARVN', { type: 'troops' }),
        ],
      },
    };

    const move = findCard25Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-25 shaded event move');

    const final = applyMove(def, setup, move!).state;

    for (const loc of mekongLocs) {
      assert.equal(
        countZoneTokens(final, loc, (token) => token.props.faction === 'VC' && token.props.type === 'guerrilla'),
        2,
        `Expected exactly 2 placed VC guerrillas in ${loc}`,
      );
    }

    assert.equal(final.markers[MEKONG_CHAU_DOC]?.sabotage, 'sabotage', 'Chau Doc should sabotage when VC > COIN');
    assert.equal(final.markers[MEKONG_SAIGON_CAN_THO]?.sabotage, 'sabotage', 'Saigon-Can Tho should sabotage when VC > COIN');
    assert.equal(final.markers[MEKONG_LONG_PHU]?.sabotage, 'sabotage', 'Pre-existing sabotage should remain in place');

    assert.equal(final.globalVars.terrorSabotageMarkersPlaced, 15, 'Two new sabotage markers should be consumed (Chau Doc + Saigon-Can Tho)');
    assert.equal(
      countZoneTokens(final, 'available-VC:none', (token) => token.props.faction === 'VC' && token.props.type === 'guerrilla'),
      0,
      'All 6 available VC guerrillas should be placed (2 per each of 3 Mekong LoCs)',
    );
  });
});
