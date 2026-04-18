// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  computeTotalSupport,
  computeVictoryMarker,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type MarkerWeightConfig,
  type SeatGroupConfig,
  type Token,
  type VictoryFormula,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-88';
const ARVN_PLAYER = asPlayerId(1);
const SAIGON = 'saigon:none';

const FITL_FACTION_CONFIG: SeatGroupConfig = {
  coinSeats: ['us', 'arvn'],
  insurgentSeats: ['nva', 'vc'],
  soloSeat: 'nva',
  seatProp: 'faction',
};

const FITL_SUPPORT_CONFIG: MarkerWeightConfig = {
  activeState: 'activeSupport',
  passiveState: 'passiveSupport',
};

const ARVN_FORMULA: VictoryFormula = {
  type: 'controlledPopulationPlusGlobalVar',
  controlFn: 'coin',
  varName: 'patronage',
};

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const findEventMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const supportMarkerStates = (state: GameState): Record<string, string> =>
  Object.fromEntries(
    Object.entries(state.markers)
      .filter(([, markers]) => typeof markers?.supportOpposition === 'string')
      .map(([space, markers]) => [space, String(markers?.supportOpposition)]),
  );

const countAvailableUsVictoryPieces = (state: GameState): number =>
  (state.zones['available-US:none'] ?? []).filter(
    (token) =>
      token.props?.faction === 'US'
      && (token.props?.type === 'troops' || token.props?.type === 'base'),
  ).length;

const victorySnapshot = (def: GameDef, state: GameState) => {
  const spaces = def.zones.filter((zone) => zone.zoneKind === 'board');
  const markerStates = supportMarkerStates(state);
  const totalSupport = computeTotalSupport(def, spaces, markerStates, FITL_SUPPORT_CONFIG);
  return {
    us: totalSupport + countAvailableUsVictoryPieces(state),
    arvn: computeVictoryMarker(def, state, spaces, markerStates, FITL_FACTION_CONFIG, ARVN_FORMULA),
  };
};

const setupRoundRobinState = (
  def: GameDef,
  seed: number,
  options: {
    readonly patronage?: number;
    readonly saigonSupport: string;
  },
): GameState => {
  const base = initialState(def, seed, 4).state;
  return {
    ...base,
    activePlayer: ARVN_PLAYER,
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...base.globalVars,
      ...(options.patronage === undefined ? {} : { patronage: options.patronage }),
    },
    markers: {
      ...base.markers,
      [SAIGON]: {
        ...(base.markers[SAIGON] ?? {}),
        supportOpposition: options.saigonSupport,
      },
    },
    zones: {
      ...base.zones,
      'played:none': [makeToken(CARD_ID, 'card', 'none')],
    },
  };
};

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  options: {
    readonly patronage?: number;
    readonly saigonSupport: string;
  },
): GameState => {
  const base = initialState(def, seed, 4).state;
  assert.equal(base.turnOrderState.type, 'cardDriven');
  const runtime = requireCardDrivenRuntime(base);
  return {
    ...base,
    activePlayer: ARVN_PLAYER,
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: 'arvn',
          secondEligible: 'vc',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    globalVars: {
      ...base.globalVars,
      ...(options.patronage === undefined ? {} : { patronage: options.patronage }),
    },
    markers: {
      ...base.markers,
      [SAIGON]: {
        ...(base.markers[SAIGON] ?? {}),
        supportOpposition: options.saigonSupport,
      },
    },
    zones: {
      ...base.zones,
      'played:none': [makeToken(CARD_ID, 'card', 'none')],
    },
  };
};

describe('FITL card-88 Phan Quang Dan', () => {
  it('unshaded shifts Saigon one level toward Active Support, adds Patronage +5, and increases US/ARVN victory markers by the exact amounts', () => {
    const def = compileDef();
    const setup = setupRoundRobinState(def, 88001, {
      patronage: 14,
      saigonSupport: 'neutral',
    });

    const before = victorySnapshot(def, setup);
    const move = findEventMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-88 unshaded move');

    const final = applyMove(def, setup, move!).state;
    const after = victorySnapshot(def, final);

    assert.equal(final.markers[SAIGON]?.supportOpposition, 'passiveSupport');
    assert.equal(final.globalVars.patronage, 19);
    assert.equal(after.us - before.us, 6, 'Saigon population should add exactly 6 US victory points when moving Neutral -> Passive Support');
    assert.equal(after.arvn - before.arvn, 5, 'ARVN victory should rise only by Patronage when control is unchanged');
  });

  it('unshaded clamps Patronage at 75 and does not move beyond Active Support', () => {
    const def = compileDef();
    const setup = setupRoundRobinState(def, 88002, {
      patronage: 73,
      saigonSupport: 'activeSupport',
    });

    const before = victorySnapshot(def, setup);
    const move = findEventMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-88 unshaded move at support cap');

    const final = applyMove(def, setup, move!).state;
    const after = victorySnapshot(def, final);

    assert.equal(final.markers[SAIGON]?.supportOpposition, 'activeSupport');
    assert.equal(final.globalVars.patronage, 75);
    assert.equal(after.us - before.us, 0, 'US victory should not increase once Saigon is already at Active Support');
    assert.equal(after.arvn - before.arvn, 2, 'Patronage should clamp at the track maximum');
  });

  it('shaded shifts Saigon one level toward Neutral from Support, reduces Patronage by 5, and queues ARVN ineligibility through the next card', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 88003, {
      patronage: 17,
      saigonSupport: 'passiveSupport',
    });

    const before = victorySnapshot(def, setup);
    const move = findEventMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-88 shaded move');

    const result = applyMove(def, setup, move!);
    const final = result.state;
    const after = victorySnapshot(def, final);
    const runtime = requireCardDrivenRuntime(final);

    assert.equal(final.markers[SAIGON]?.supportOpposition, 'neutral');
    assert.equal(final.globalVars.patronage, 12);
    assert.equal(after.us - before.us, -6, 'Saigon population should remove exactly 6 US victory points when moving Passive Support -> Neutral');
    assert.equal(after.arvn - before.arvn, -5, 'ARVN victory should fall only by Patronage when control is unchanged');
    assert.deepEqual(runtime.pendingEligibilityOverrides ?? [], [
      { seat: 'arvn', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' },
    ]);

    const overrideCreate = result.triggerFirings.find(
      (entry) => entry.kind === 'turnFlowEligibility' && entry.step === 'overrideCreate',
    );
    assert.deepEqual((overrideCreate as { overrides?: readonly unknown[] } | undefined)?.overrides, [
      { seat: 'arvn', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' },
    ]);
  });

  it('shaded shifts Saigon one level toward Neutral from Opposition and clamps Patronage at the floor', () => {
    const def = compileDef();
    const setup = setupRoundRobinState(def, 88004, {
      patronage: 3,
      saigonSupport: 'activeOpposition',
    });

    const move = findEventMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-88 shaded move from opposition');

    const final = applyMove(def, setup, move!).state;

    assert.equal(final.markers[SAIGON]?.supportOpposition, 'passiveOpposition');
    assert.equal(final.globalVars.patronage, 0, 'Patronage should not drop below the track minimum');
  });
});
