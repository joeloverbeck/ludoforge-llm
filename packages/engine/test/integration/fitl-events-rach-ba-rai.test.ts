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

const CARD_ID = 'card-100';

// Lowland zones
const QUANG_TIN = 'quang-tin-quang-ngai:none';
const PHU_BON = 'phu-bon-phu-yen:none';
const KIEN_PHONG = 'kien-phong:none';
const KIEN_HOA = 'kien-hoa-vinh-binh:none';
const BA_XUYEN = 'ba-xuyen:none';
const KIEN_GIANG = 'kien-giang-an-xuyen:none';

// Non-lowland zones (for exclusion tests)
const TAY_NINH = 'tay-ninh:none'; // jungle
const SAIGON = 'saigon:none'; // city

// Holding zones
const AVAILABLE_VC = 'available-VC:none';
const AVAILABLE_NVA = 'available-NVA:none';
const AVAILABLE_US = 'available-US:none';
const AVAILABLE_ARVN = 'available-ARVN:none';
const CASUALTIES_US = 'casualties-US:none';

// Branch IDs
const BRANCH_REMOVE_VC = 'rach-ba-rai-remove-vc';
const BRANCH_REMOVE_NVA = 'rach-ba-rai-remove-nva-non-troops';

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

// ─── Compilation & Structure ───

describe('FITL card-100 Rach Ba Rai', () => {
  it('compiles with correct metadata', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const card = eventDeck!.cards.find((c) => c.id === CARD_ID);
    assert.notEqual(card, undefined, 'card-100 must exist');
    assert.equal(card!.metadata?.period, '1965');
    assert.deepEqual(card!.metadata?.seatOrder, ['VC', 'US', 'ARVN', 'NVA']);
    assert.equal(card!.sideMode, 'dual');
  });

  it('unshaded has 2 branches with correct IDs', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    const card = eventDeck!.cards.find((c) => c.id === CARD_ID);
    assert.notEqual(card, undefined);
    const branches = card!.unshaded?.branches ?? [];
    assert.equal(branches.length, 2);
    assert.equal(branches[0]!.id, BRANCH_REMOVE_VC);
    assert.equal(branches[1]!.id, BRANCH_REMOVE_NVA);
  });

  // ─── Unshaded Branch 1: Remove All VC ───

  it('unshaded branch 1 removes all VC from chosen Lowland with US troops', () => {
    const def = compileDef();
    const setup = setupState(def, 100001, 0, {
      [KIEN_PHONG]: [
        makeToken('rbr-us-troop-1', 'troops', 'US'),
        makeToken('rbr-vc-guerrilla-1', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('rbr-vc-guerrilla-2', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('rbr-vc-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_REMOVE_VC);
    assert.notEqual(move, undefined, 'Expected unshaded branch 1 move');

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: KIEN_PHONG },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, KIEN_PHONG, (t) => t.props.faction === 'VC'),
      0,
      'All VC should be removed from the Lowland',
    );
    assert.equal(
      countMatching(final, AVAILABLE_VC, (t) => t.props.faction === 'VC'),
      3,
      'All 3 VC pieces should be in available-VC',
    );
  });

  it('unshaded branch 1 includes VC bases in removal', () => {
    const def = compileDef();
    const setup = setupState(def, 100002, 0, {
      [BA_XUYEN]: [
        makeToken('rbr-bas-us-troop', 'troops', 'US'),
        makeToken('rbr-bas-vc-base', 'base', 'VC', { tunnel: 'untunneled' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_REMOVE_VC);
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: BA_XUYEN },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, BA_XUYEN, (t) => t.props.faction === 'VC'),
      0,
      'VC base should be removed',
    );
    assert.equal(
      countMatching(final, AVAILABLE_VC, (t) => String(t.id) === 'rbr-bas-vc-base'),
      1,
      'VC base should be in available-VC',
    );
  });

  it('unshaded branch 1 only targets Lowlands', () => {
    const def = compileDef();
    // Place US troops + VC in jungle (Tay Ninh) — should NOT be a valid target
    // Also place US troops + VC in lowland (Kien Phong) — SHOULD be valid
    const setup = setupState(def, 100003, 0, {
      [TAY_NINH]: [
        makeToken('rbr-tn-us-troop', 'troops', 'US'),
        makeToken('rbr-tn-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
      ],
      [KIEN_PHONG]: [
        makeToken('rbr-kp-us-troop', 'troops', 'US'),
        makeToken('rbr-kp-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_REMOVE_VC);
    assert.notEqual(move, undefined);

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');

    const options = pending.options.map((o) => String(o.value));
    assert.equal(options.includes(TAY_NINH), false, 'Jungle zone must NOT be a valid target');
    assert.equal(options.includes(KIEN_PHONG), true, 'Lowland zone should be a valid target');
  });

  it('unshaded branch 1 requires US Troops in the Lowland', () => {
    const def = compileDef();
    // Lowland with VC but no US troops
    const setup = setupState(def, 100004, 0, {
      [KIEN_HOA]: [
        makeToken('rbr-noust-vc', 'guerrilla', 'VC', { activity: 'active' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_REMOVE_VC);
    // With no qualifying Lowlands, the move may still exist but have no valid targets
    // or it may not appear at all
    if (move !== undefined) {
      const pending = legalChoicesEvaluate(def, setup, move);
      if (pending.kind === 'pending') {
        const options = pending.options.map((o) => String(o.value));
        assert.equal(
          options.includes(KIEN_HOA),
          false,
          'Lowland without US troops must NOT be a valid target',
        );
      }
    }
  });

  it('unshaded branch 1 leaves US troops intact', () => {
    const def = compileDef();
    const setup = setupState(def, 100005, 0, {
      [QUANG_TIN]: [
        makeToken('rbr-ust-us-troop-1', 'troops', 'US'),
        makeToken('rbr-ust-us-troop-2', 'troops', 'US'),
        makeToken('rbr-ust-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_REMOVE_VC);
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: QUANG_TIN },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, QUANG_TIN, (t) => t.props.faction === 'US' && t.type === 'troops'),
      2,
      'US troops should remain untouched',
    );
  });

  it('unshaded branch 1 leaves NVA pieces intact', () => {
    const def = compileDef();
    const setup = setupState(def, 100006, 0, {
      [KIEN_GIANG]: [
        makeToken('rbr-nva-us-troop', 'troops', 'US'),
        makeToken('rbr-nva-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('rbr-nva-nva-guerrilla', 'guerrilla', 'NVA', { activity: 'active' }),
        makeToken('rbr-nva-nva-base', 'base', 'NVA', { tunnel: 'untunneled' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_REMOVE_VC);
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: KIEN_GIANG },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, KIEN_GIANG, (t) => t.props.faction === 'NVA'),
      2,
      'NVA pieces should remain untouched',
    );
  });

  // ─── Unshaded Branch 2: Remove All Non-Troop NVA ───

  it('unshaded branch 2 removes NVA guerrillas and bases but keeps NVA troops', () => {
    const def = compileDef();
    const setup = setupState(def, 100010, 0, {
      [PHU_BON]: [
        makeToken('rbr-b2-us-troop', 'troops', 'US'),
        makeToken('rbr-b2-nva-guerrilla-1', 'guerrilla', 'NVA', { activity: 'active' }),
        makeToken('rbr-b2-nva-guerrilla-2', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('rbr-b2-nva-base', 'base', 'NVA', { tunnel: 'untunneled' }),
        makeToken('rbr-b2-nva-troop-1', 'troops', 'NVA'),
        makeToken('rbr-b2-nva-troop-2', 'troops', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_REMOVE_NVA);
    assert.notEqual(move, undefined, 'Expected unshaded branch 2 move');

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: PHU_BON },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, PHU_BON, (t) => t.props.faction === 'NVA' && t.type === 'guerrilla'),
      0,
      'NVA guerrillas should be removed',
    );
    assert.equal(
      countMatching(final, PHU_BON, (t) => t.props.faction === 'NVA' && t.type === 'base'),
      0,
      'NVA bases should be removed',
    );
    assert.equal(
      countMatching(final, PHU_BON, (t) => t.props.faction === 'NVA' && t.type === 'troops'),
      2,
      'NVA troops should remain',
    );
  });

  it('unshaded branch 2 routes removed NVA to available-NVA', () => {
    const def = compileDef();
    const setup = setupState(def, 100011, 0, {
      [KIEN_HOA]: [
        makeToken('rbr-b2r-us-troop', 'troops', 'US'),
        makeToken('rbr-b2r-nva-guerrilla', 'guerrilla', 'NVA', { activity: 'active' }),
        makeToken('rbr-b2r-nva-base', 'base', 'NVA', { tunnel: 'untunneled' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_REMOVE_NVA);
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: KIEN_HOA },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, AVAILABLE_NVA, (t) => String(t.id) === 'rbr-b2r-nva-guerrilla'),
      1,
      'NVA guerrilla should go to available-NVA',
    );
    assert.equal(
      countMatching(final, AVAILABLE_NVA, (t) => String(t.id) === 'rbr-b2r-nva-base'),
      1,
      'NVA base should go to available-NVA',
    );
  });

  it('unshaded branch 2 leaves VC pieces untouched', () => {
    const def = compileDef();
    const setup = setupState(def, 100012, 0, {
      [BA_XUYEN]: [
        makeToken('rbr-b2vc-us-troop', 'troops', 'US'),
        makeToken('rbr-b2vc-nva-guerrilla', 'guerrilla', 'NVA', { activity: 'active' }),
        makeToken('rbr-b2vc-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('rbr-b2vc-vc-base', 'base', 'VC', { tunnel: 'untunneled' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded', BRANCH_REMOVE_NVA);
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: BA_XUYEN },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, BA_XUYEN, (t) => t.props.faction === 'VC'),
      2,
      'VC pieces should remain untouched',
    );
  });

  // ─── Shaded: Die Roll Removal + VC Placement ───

  it('shaded targets a Lowland with any VC presence', () => {
    const def = compileDef();
    // Lowland with only a VC base (no guerrillas) + US/ARVN cubes
    const setup = setupState(def, 100020, 0, {
      [KIEN_PHONG]: [
        makeToken('rbr-sh-vc-base', 'base', 'VC', { tunnel: 'untunneled' }),
        makeToken('rbr-sh-us-troop', 'troops', 'US'),
      ],
      [AVAILABLE_VC]: [
        makeToken('rbr-sh-avail-vc-guerrilla', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Shaded should be legal when a Lowland has any VC (including base only)');
  });

  it('shaded excludes Lowlands without VC', () => {
    const def = compileDef();
    const setup = setupState(def, 100021, 0, {
      [KIEN_PHONG]: [
        makeToken('rbr-sh-novc-us-troop', 'troops', 'US'),
        makeToken('rbr-sh-novc-arvn-troop', 'troops', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    // No Lowland with VC → no valid target → no move
    assert.equal(move, undefined, 'Shaded should not be legal when no Lowland has VC');
  });

  it('shaded sends US cubes to casualties and ARVN cubes to available', () => {
    const def = compileDef();
    const setup = setupState(def, 100022, 0, {
      [QUANG_TIN]: [
        makeToken('rbr-sh-cas-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('rbr-sh-cas-us-troop-1', 'troops', 'US'),
        makeToken('rbr-sh-cas-us-troop-2', 'troops', 'US'),
        makeToken('rbr-sh-cas-us-police-1', 'police', 'US'),
        makeToken('rbr-sh-cas-arvn-troop-1', 'troops', 'ARVN'),
        makeToken('rbr-sh-cas-arvn-police-1', 'police', 'ARVN'),
      ],
      [AVAILABLE_VC]: [
        makeToken('rbr-sh-cas-avail-vc', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected shaded move');

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: QUANG_TIN },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // With die roll 1-6, some cubes get removed. Check routing.
    const usCasualties = countMatching(final, CASUALTIES_US, (t) =>
      t.props.faction === 'US' && (t.type === 'troops' || t.type === 'police'),
    );
    const arvnAvailable = countMatching(final, AVAILABLE_ARVN, (t) =>
      t.props.faction === 'ARVN' && (t.type === 'troops' || t.type === 'police'),
    );
    const totalRemoved = usCasualties + arvnAvailable;

    assert.ok(totalRemoved >= 1, 'At least 1 cube should be removed (die roll min is 1)');
    assert.ok(totalRemoved <= 5, 'At most 5 cubes can be removed (5 cubes total)');

    // US cubes should go to casualties, not available
    assert.equal(
      countMatching(final, AVAILABLE_US, (t) => String(t.id).startsWith('rbr-sh-cas-us-')),
      0,
      'US cubes must go to casualties, not available',
    );
  });

  it('shaded removes US cubes before ARVN cubes', () => {
    const def = compileDef();
    // 2 US cubes + 3 ARVN cubes. Need a die roll of 4 to test priority:
    // Should remove all 2 US, then 2 ARVN
    const setup = setupState(def, 100023, 0, {
      [KIEN_HOA]: [
        makeToken('rbr-sh-pri-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('rbr-sh-pri-us-troop-1', 'troops', 'US'),
        makeToken('rbr-sh-pri-us-troop-2', 'troops', 'US'),
        makeToken('rbr-sh-pri-arvn-troop-1', 'troops', 'ARVN'),
        makeToken('rbr-sh-pri-arvn-troop-2', 'troops', 'ARVN'),
        makeToken('rbr-sh-pri-arvn-troop-3', 'troops', 'ARVN'),
      ],
      [AVAILABLE_VC]: [
        makeToken('rbr-sh-pri-avail-vc', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: KIEN_HOA },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const usCasualties = countMatching(final, CASUALTIES_US, (t) => t.props.faction === 'US');
    const arvnAvailable = countMatching(final, AVAILABLE_ARVN, (t) => t.props.faction === 'ARVN');
    const totalRemoved = usCasualties + arvnAvailable;

    // If any ARVN were removed, ALL US must have been removed first
    if (arvnAvailable > 0) {
      assert.equal(
        usCasualties,
        2,
        'All US cubes must be removed before any ARVN cubes',
      );
    }
    // Total removed should match die roll (1-6), capped at 5 (total cubes)
    assert.ok(totalRemoved >= 1 && totalRemoved <= 5, `Total removed ${totalRemoved} should be between 1 and 5`);
  });

  it('shaded die roll exceeding cube count removes all cubes without error', () => {
    const def = compileDef();
    // Only 2 cubes total — any die roll >= 3 exceeds
    const setup = setupState(def, 100024, 0, {
      [KIEN_GIANG]: [
        makeToken('rbr-sh-exc-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('rbr-sh-exc-us-troop', 'troops', 'US'),
        makeToken('rbr-sh-exc-arvn-troop', 'troops', 'ARVN'),
      ],
      [AVAILABLE_VC]: [
        makeToken('rbr-sh-exc-avail-vc', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: KIEN_GIANG },
    ];

    // Should not throw regardless of die roll
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const totalCubesRemaining = countMatching(final, KIEN_GIANG, (t) =>
      (t.type === 'troops' || t.type === 'police') && (t.props.faction === 'US' || t.props.faction === 'ARVN'),
    );
    // At most 2 cubes were there, die roll min 1 → at least 1 removed
    assert.ok(totalCubesRemaining <= 1, 'At least 1 cube should have been removed');
  });

  it('shaded places 1 VC piece into the target Lowland after removal', () => {
    const def = compileDef();
    const setup = setupState(def, 100025, 0, {
      [PHU_BON]: [
        makeToken('rbr-sh-place-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('rbr-sh-place-us-troop', 'troops', 'US'),
      ],
      [AVAILABLE_VC]: [
        makeToken('rbr-sh-place-avail-vc-1', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('rbr-sh-place-avail-vc-2', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: PHU_BON },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // Original 1 VC guerrilla + 1 placed = at least 2 VC in the zone
    // (die roll may remove some US troops but not VC)
    const vcInTarget = countMatching(final, PHU_BON, (t) => t.props.faction === 'VC');
    assert.ok(vcInTarget >= 2, `Expected at least 2 VC in target (original + placed), got ${vcInTarget}`);

    // Available should have 1 fewer VC
    const vcAvailable = countMatching(final, AVAILABLE_VC, (t) => t.props.faction === 'VC');
    assert.equal(vcAvailable, 1, 'One VC should remain in available after placement');
  });

  it('shaded VC placement offers choice between base and guerrilla', () => {
    const def = compileDef();
    const setup = setupState(def, 100026, 0, {
      [BA_XUYEN]: [
        makeToken('rbr-sh-choice-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('rbr-sh-choice-us-troop', 'troops', 'US'),
      ],
      [AVAILABLE_VC]: [
        makeToken('rbr-sh-choice-avail-vc-base', 'base', 'VC', { tunnel: 'untunneled' }),
        makeToken('rbr-sh-choice-avail-vc-guerrilla', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: BA_XUYEN },
      // Choose the base specifically to verify bases are eligible
      {
        when: (r) => r.name === '$vcPieceToPlace',
        value: 'rbr-sh-choice-avail-vc-base',
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, BA_XUYEN, (t) => String(t.id) === 'rbr-sh-choice-avail-vc-base'),
      1,
      'VC base should be placed in the target Lowland when chosen',
    );
  });

  it('shaded does not remove non-cube US pieces (bases)', () => {
    const def = compileDef();
    const setup = setupState(def, 100027, 0, {
      [KIEN_PHONG]: [
        makeToken('rbr-sh-usbase-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('rbr-sh-usbase-us-base', 'base', 'US', { tunnel: 'untunneled' }),
        makeToken('rbr-sh-usbase-us-troop', 'troops', 'US'),
      ],
      [AVAILABLE_VC]: [
        makeToken('rbr-sh-usbase-avail-vc', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: KIEN_PHONG },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, KIEN_PHONG, (t) => String(t.id) === 'rbr-sh-usbase-us-base'),
      1,
      'US base should remain — only cubes (troops/police) are removed',
    );
  });

  it('shaded does not remove non-cube ARVN pieces (bases)', () => {
    const def = compileDef();
    const setup = setupState(def, 100028, 0, {
      [KIEN_HOA]: [
        makeToken('rbr-sh-abase-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('rbr-sh-abase-arvn-base', 'base', 'ARVN', { tunnel: 'untunneled' }),
        makeToken('rbr-sh-abase-arvn-troop', 'troops', 'ARVN'),
      ],
      [AVAILABLE_VC]: [
        makeToken('rbr-sh-abase-avail-vc', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetLowland', value: KIEN_HOA },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, KIEN_HOA, (t) => String(t.id) === 'rbr-sh-abase-arvn-base'),
      1,
      'ARVN base should remain — only cubes (troops/police) are removed',
    );
  });

  it('shaded excludes non-Lowland terrain from targets', () => {
    const def = compileDef();
    const setup = setupState(def, 100029, 0, {
      // Jungle with VC — should NOT be valid
      [TAY_NINH]: [
        makeToken('rbr-sh-excl-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('rbr-sh-excl-us-troop', 'troops', 'US'),
      ],
      // City with VC — should NOT be valid
      [SAIGON]: [
        makeToken('rbr-sh-excl-sai-vc', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('rbr-sh-excl-sai-us', 'troops', 'US'),
      ],
      // Lowland with VC — SHOULD be valid
      [KIEN_PHONG]: [
        makeToken('rbr-sh-excl-kp-vc', 'guerrilla', 'VC', { activity: 'active' }),
      ],
      [AVAILABLE_VC]: [
        makeToken('rbr-sh-excl-avail-vc', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');

    const options = pending.options.map((o) => String(o.value));
    assert.equal(options.includes(TAY_NINH), false, 'Jungle must not be a shaded target');
    assert.equal(options.includes(SAIGON), false, 'City must not be a shaded target');
    assert.equal(options.includes(KIEN_PHONG), true, 'Lowland with VC should be a valid target');
  });
});
