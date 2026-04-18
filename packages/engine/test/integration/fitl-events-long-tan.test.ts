// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  asTokenId,
  initialState,
  legalChoicesEvaluate,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-98';
const CENTRAL_LAOS = 'central-laos:none';
const PHUOC_LONG = 'phuoc-long:none';
const TAY_NINH = 'tay-ninh:none';
const THE_FISHHOOK = 'the-fishhook:none';
const NORTH_VIETNAM = 'north-vietnam:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const OUT_OF_PLAY_US = 'out-of-play-US:none';
const AVAILABLE_VC = 'available-VC:none';
const AVAILABLE_NVA = 'available-NVA:none';
const CASUALTIES_US = 'casualties-US:none';

const BRANCH_1 = 'long-tan-place-us-troops';
const BRANCH_2 = 'long-tan-clear-jungle-guerrillas';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extras: Readonly<Record<string, string | number | boolean>> = {},
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...extras,
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const setupState = (
  def: GameDef,
  seed: number,
  activePlayer: 0 | 1 | 2 | 3,
  zones: Readonly<Record<string, readonly Token[]>>,
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected FITL event deck');

  const base = clearAllZones(initialState(def, seed, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    turnOrderState: { type: 'roundRobin' },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...zones,
    },
  };
};

const findCardMove = (
  def: GameDef,
  state: GameState,
  side: 'unshaded' | 'shaded',
  branch?: string,
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID)
      && (branch === undefined || move.params.branch === branch),
  );

const countMatching = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-98 Long Tan', () => {
  // ─── Unshaded Branch 1: Place 2 US Troops from out-of-play into a Province ───

  it('unshaded branch 1 places 2 out-of-play US troops into a chosen province', () => {
    const def = compileDef();
    const setup = setupState(def, 98001, 0, {
      [OUT_OF_PLAY_US]: [
        makeToken('lt-us-troop-1', 'troops', 'US'),
        makeToken('lt-us-troop-2', 'troops', 'US'),
        makeToken('lt-us-troop-3', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_1);
    assert.notEqual(move, undefined, 'Expected Long Tan unshaded branch 1 move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetProvince',
        value: TAY_NINH,
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, TAY_NINH, (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'Should place 2 US troops into the chosen province',
    );
    assert.equal(
      countMatching(final, OUT_OF_PLAY_US, (token) => token.type === 'troops'),
      1,
      'Should leave 1 US troop in out-of-play',
    );
  });

  it('unshaded branch 1 excludes North Vietnam from destination choices', () => {
    const def = compileDef();
    const setup = setupState(def, 98002, 0, {
      [OUT_OF_PLAY_US]: [
        makeToken('lt-nv-troop-1', 'troops', 'US'),
        makeToken('lt-nv-troop-2', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_1);
    assert.notEqual(move, undefined, 'Expected Long Tan unshaded branch 1 move');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending choice for province selection');
    }

    const optionValues = pending.options.map((option) => String(option.value));
    assert.equal(
      optionValues.includes(NORTH_VIETNAM),
      false,
      'North Vietnam must not be a valid destination for US troops',
    );
  });

  it('unshaded branch 1 places only 1 troop when only 1 is in out-of-play', () => {
    const def = compileDef();
    const setup = setupState(def, 98003, 0, {
      [OUT_OF_PLAY_US]: [
        makeToken('lt-partial-troop', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_1);
    assert.notEqual(move, undefined, 'Expected Long Tan unshaded branch 1 move with 1 troop');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetProvince',
        value: PHUOC_LONG,
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, PHUOC_LONG, (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
      'Should place only the 1 available US troop',
    );
    assert.equal(
      countMatching(final, OUT_OF_PLAY_US, (token) => token.type === 'troops'),
      0,
      'Out-of-play should be empty after placing the only troop',
    );
  });

  it('unshaded branch 1 is a no-op when 0 US troops in out-of-play', () => {
    const def = compileDef();
    const setup = setupState(def, 98004, 0, {});

    const move = findCardMove(def, setup, 'unshaded', BRANCH_1);
    assert.notEqual(move, undefined, 'Expected Long Tan unshaded branch 1 move with 0 troops');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetProvince',
        value: TAY_NINH,
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, TAY_NINH, (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'Should place 0 troops when none available',
    );
  });

  // ─── Unshaded Branch 2: Remove all guerrillas from ALL jungle with US troops ───

  it('unshaded branch 2 removes guerrillas from multiple jungles with US troops', () => {
    const def = compileDef();
    const setup = setupState(def, 98005, 0, {
      [CENTRAL_LAOS]: [
        makeToken('lt-cl-us-troop', 'troops', 'US'),
        makeToken('lt-cl-vc-guerrilla-1', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('lt-cl-vc-guerrilla-2', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
      [PHUOC_LONG]: [
        makeToken('lt-pl-us-troop', 'troops', 'US'),
        makeToken('lt-pl-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_2);
    assert.notEqual(move, undefined, 'Expected Long Tan unshaded branch 2 move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;

    assert.equal(
      countMatching(final, CENTRAL_LAOS, (token) => token.type === 'guerrilla'),
      0,
      'All guerrillas should be removed from Central Laos',
    );
    assert.equal(
      countMatching(final, PHUOC_LONG, (token) => token.type === 'guerrilla'),
      0,
      'All guerrillas should be removed from Phuoc Long',
    );
    assert.equal(
      countMatching(final, CENTRAL_LAOS, (token) => token.type === 'troops' && token.props.faction === 'US'),
      1,
      'US troops should remain in Central Laos',
    );
    assert.equal(
      countMatching(final, PHUOC_LONG, (token) => token.type === 'troops' && token.props.faction === 'US'),
      1,
      'US troops should remain in Phuoc Long',
    );
  });

  it('unshaded branch 2 routes VC guerrillas to available-VC and NVA guerrillas to available-NVA', () => {
    const def = compileDef();
    const setup = setupState(def, 98006, 0, {
      [TAY_NINH]: [
        makeToken('lt-tn-us-troop', 'troops', 'US'),
        makeToken('lt-tn-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('lt-tn-nva-guerrilla', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_2);
    assert.notEqual(move, undefined, 'Expected Long Tan unshaded branch 2 move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;

    assert.equal(
      countMatching(final, TAY_NINH, (token) => token.type === 'guerrilla'),
      0,
      'All guerrillas should be removed from Tay Ninh',
    );
    assert.equal(
      countMatching(final, AVAILABLE_VC, (token) => String(token.id) === 'lt-tn-vc-guerrilla'),
      1,
      'VC guerrilla should go to available-VC',
    );
    assert.equal(
      countMatching(final, AVAILABLE_NVA, (token) => String(token.id) === 'lt-tn-nva-guerrilla'),
      1,
      'NVA guerrilla should go to available-NVA',
    );
  });

  it('unshaded branch 2 does not affect jungles without US troops', () => {
    const def = compileDef();
    const setup = setupState(def, 98007, 0, {
      [THE_FISHHOOK]: [
        makeToken('lt-fh-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
      ],
      [CENTRAL_LAOS]: [
        makeToken('lt-cl-us-troop', 'troops', 'US'),
        makeToken('lt-cl-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_2);
    assert.notEqual(move, undefined, 'Expected Long Tan unshaded branch 2 move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;

    assert.equal(
      countMatching(final, THE_FISHHOOK, (token) => token.type === 'guerrilla'),
      1,
      'Guerrillas should remain in jungle without US troops',
    );
    assert.equal(
      countMatching(final, CENTRAL_LAOS, (token) => token.type === 'guerrilla'),
      0,
      'Guerrillas should be removed from jungle with US troops',
    );
  });

  it('unshaded branch 2 is a no-op when no jungle has both US troops and guerrillas', () => {
    const def = compileDef();
    const setup = setupState(def, 98008, 0, {
      [CENTRAL_LAOS]: [
        makeToken('lt-nq-us-troop', 'troops', 'US'),
      ],
      [THE_FISHHOOK]: [
        makeToken('lt-nq-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_2);
    assert.notEqual(move, undefined, 'Expected Long Tan unshaded branch 2 move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;

    assert.equal(
      countMatching(final, CENTRAL_LAOS, (token) => token.type === 'troops'),
      1,
      'US troops should remain untouched',
    );
    assert.equal(
      countMatching(final, THE_FISHHOOK, (token) => token.type === 'guerrilla'),
      1,
      'Guerrillas in jungle without US troops should remain',
    );
  });

  it('unshaded branch 2 does not affect non-jungle provinces with US troops and guerrillas', () => {
    const def = compileDef();
    const setup = setupState(def, 98009, 0, {
      [QUANG_TRI]: [
        makeToken('lt-qt-us-troop', 'troops', 'US'),
        makeToken('lt-qt-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
      ],
      [TAY_NINH]: [
        makeToken('lt-tn-us-troop', 'troops', 'US'),
        makeToken('lt-tn-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_2);
    assert.notEqual(move, undefined, 'Expected Long Tan unshaded branch 2 move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;

    assert.equal(
      countMatching(final, QUANG_TRI, (token) => token.type === 'guerrilla'),
      1,
      'Guerrillas should remain in non-jungle province',
    );
    assert.equal(
      countMatching(final, TAY_NINH, (token) => token.type === 'guerrilla'),
      0,
      'Guerrillas should be removed from jungle province with US troops',
    );
  });

  // ─── Shaded: 1 US Base + 1 US Troop in a Jungle with 2+ VC Guerrillas to Casualties ───

  it('shaded removes 1 US base and 1 US troop to casualties from a jungle with 2+ VC guerrillas', () => {
    const def = compileDef();
    const setup = setupState(def, 98010, 0, {
      [CENTRAL_LAOS]: [
        makeToken('lt-sh-us-base', 'base', 'US'),
        makeToken('lt-sh-us-troop', 'troops', 'US'),
        makeToken('lt-sh-vc-guerrilla-1', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('lt-sh-vc-guerrilla-2', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Long Tan shaded move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetJungle',
        value: CENTRAL_LAOS,
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, CASUALTIES_US, (token) => String(token.id) === 'lt-sh-us-base'),
      1,
      'US base should be in casualties',
    );
    assert.equal(
      countMatching(final, CASUALTIES_US, (token) => String(token.id) === 'lt-sh-us-troop'),
      1,
      'US troop should be in casualties',
    );
    assert.equal(
      countMatching(final, CENTRAL_LAOS, (token) => token.type === 'guerrilla'),
      2,
      'VC guerrillas should remain in the jungle',
    );
  });

  it('shaded removes only 1 troop (not 2) when no US base exists — bug fix verification', () => {
    const def = compileDef();
    const setup = setupState(def, 98011, 0, {
      [TAY_NINH]: [
        makeToken('lt-sh-nobase-troop-1', 'troops', 'US'),
        makeToken('lt-sh-nobase-troop-2', 'troops', 'US'),
        makeToken('lt-sh-nobase-vc-1', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('lt-sh-nobase-vc-2', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Long Tan shaded move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetJungle',
        value: TAY_NINH,
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, CASUALTIES_US, (token) => token.type === 'troops'),
      1,
      'Only 1 US troop should be removed to casualties when no base exists (bug fix)',
    );
    assert.equal(
      countMatching(final, TAY_NINH, (token) => token.type === 'troops' && token.props.faction === 'US'),
      1,
      'Exactly 1 US troop should remain in the jungle',
    );
  });

  it('shaded removes only base when no US troop exists', () => {
    const def = compileDef();
    const setup = setupState(def, 98012, 0, {
      [PHUOC_LONG]: [
        makeToken('lt-sh-baseonly-base', 'base', 'US'),
        makeToken('lt-sh-baseonly-vc-1', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('lt-sh-baseonly-vc-2', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Long Tan shaded move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetJungle',
        value: PHUOC_LONG,
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, CASUALTIES_US, (token) => token.type === 'base'),
      1,
      'US base should be removed to casualties',
    );
    assert.equal(
      countMatching(final, CASUALTIES_US, (token) => token.type === 'troops'),
      0,
      'No US troops should be in casualties when none existed',
    );
  });

  it('shaded excludes jungles with fewer than 2 VC guerrillas — no qualifying target means no move', () => {
    const def = compileDef();
    const setupOneGuerrilla = setupState(def, 98013, 0, {
      [CENTRAL_LAOS]: [
        makeToken('lt-sh-1g-base', 'base', 'US'),
        makeToken('lt-sh-1g-troop', 'troops', 'US'),
        makeToken('lt-sh-1g-vc', 'guerrilla', 'VC', { activity: 'active' }),
      ],
    });

    const moveOne = findCardMove(def, setupOneGuerrilla, 'shaded');
    assert.equal(
      moveOne,
      undefined,
      'Shaded move should not be legal when the only jungle has fewer than 2 VC guerrillas',
    );
  });

  it('shaded excludes jungles with 0 VC guerrillas — no qualifying target means no move', () => {
    const def = compileDef();
    const setupZeroGuerrillas = setupState(def, 98014, 0, {
      [TAY_NINH]: [
        makeToken('lt-sh-0g-base', 'base', 'US'),
        makeToken('lt-sh-0g-troop', 'troops', 'US'),
      ],
    });

    const moveZero = findCardMove(def, setupZeroGuerrillas, 'shaded');
    assert.equal(
      moveZero,
      undefined,
      'Shaded move should not be legal when the only jungle has 0 VC guerrillas',
    );
  });

  it('shaded presents multiple qualifying jungles as target options', () => {
    const def = compileDef();
    const setup = setupState(def, 98015, 0, {
      [CENTRAL_LAOS]: [
        makeToken('lt-sh-multi-cl-base', 'base', 'US'),
        makeToken('lt-sh-multi-cl-troop', 'troops', 'US'),
        makeToken('lt-sh-multi-cl-vc-1', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('lt-sh-multi-cl-vc-2', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
      [TAY_NINH]: [
        makeToken('lt-sh-multi-tn-base', 'base', 'US'),
        makeToken('lt-sh-multi-tn-troop', 'troops', 'US'),
        makeToken('lt-sh-multi-tn-vc-1', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('lt-sh-multi-tn-vc-2', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Long Tan shaded move');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending choice');
    }
    const options = pending.options.map((option) => String(option.value));
    assert.equal(options.includes(CENTRAL_LAOS), true, 'Central Laos should be a valid target');
    assert.equal(options.includes(TAY_NINH), true, 'Tay Ninh should be a valid target');
  });
});
