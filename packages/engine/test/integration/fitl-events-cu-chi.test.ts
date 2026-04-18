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

const CARD_ID = 'card-102';

// Map spaces (provinces)
const QUANG_TRI = 'quang-tri-thua-thien:none';
const BINH_DINH = 'binh-dinh:none';
const KIEN_PHONG = 'kien-phong:none';
const QUANG_TIN = 'quang-tin-quang-ngai:none';
const TAY_NINH = 'tay-ninh:none';

// Cities
const SAIGON = 'saigon:none';
const HUE = 'hue:none';

// Holding zones
const AVAILABLE_VC = 'available-VC:none';
const AVAILABLE_NVA = 'available-NVA:none';

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
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const countMatching = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

// ─── Compilation & Structure ───

describe('FITL card-102 Cu Chi', () => {
  it('compiles with correct metadata', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const card = eventDeck!.cards.find((c) => c.id === CARD_ID);
    assert.notEqual(card, undefined, 'card-102 must exist');
    assert.equal(card!.metadata?.period, '1965');
    assert.deepEqual(card!.metadata?.seatOrder, ['VC', 'NVA', 'US', 'ARVN']);
    assert.equal(card!.sideMode, 'dual');
  });

  // ─── Unshaded: Remove all Guerrillas from 1 space with Tunnel + COIN Control ───

  it('unshaded removes ALL guerrillas (active + underground, NVA + VC) from chosen space', () => {
    const def = compileDef();
    // 1 VC tunneled base + 1 VC active guerrilla + 1 NVA underground guerrilla = 3 insurgent
    // Need >= 4 COIN pieces for COIN Control (strict >)
    const setup = setupState(def, 200001, 0, {
      [KIEN_PHONG]: [
        makeToken('cc-vc-base-1', 'base', 'VC', { tunnel: 'tunneled' }),
        makeToken('cc-vc-guerrilla-1', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('cc-nva-guerrilla-1', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('cc-us-troop-1', 'troops', 'US'),
        makeToken('cc-us-troop-2', 'troops', 'US'),
        makeToken('cc-us-troop-3', 'troops', 'US'),
        makeToken('cc-arvn-troop-1', 'troops', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected unshaded move');

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetSpace', value: KIEN_PHONG },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, KIEN_PHONG, (t) => t.type === 'guerrilla'),
      0,
      'All guerrillas should be removed',
    );
    // Bases and troops remain
    assert.equal(
      countMatching(final, KIEN_PHONG, (t) => t.type === 'base'),
      1,
      'Base should remain',
    );
    assert.equal(
      countMatching(final, KIEN_PHONG, (t) => t.type === 'troops'),
      4,
      'All troops should remain',
    );
  });

  it('unshaded only offers spaces with BOTH tunneled base AND COIN control', () => {
    const def = compileDef();
    // Valid space: tunneled base + COIN control
    // Invalid space: no tunnel, has COIN control
    const setup = setupState(def, 200002, 0, {
      [KIEN_PHONG]: [
        makeToken('cc-sel-vc-base', 'base', 'VC', { tunnel: 'tunneled' }),
        makeToken('cc-sel-us-troop-1', 'troops', 'US'),
        makeToken('cc-sel-us-troop-2', 'troops', 'US'),
        makeToken('cc-sel-us-troop-3', 'troops', 'US'),
        makeToken('cc-sel-arvn-troop-1', 'troops', 'ARVN'),
      ],
      [QUANG_TRI]: [
        makeToken('cc-sel-qt-us-troop', 'troops', 'US'),
        makeToken('cc-sel-qt-arvn-troop', 'troops', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');

    const options = pending.options.map((o) => String(o.value));
    assert.equal(options.includes(KIEN_PHONG), true, 'Space with tunnel + COIN control should be valid');
    assert.equal(options.includes(QUANG_TRI), false, 'Space without tunneled base must be excluded');
  });

  it('unshaded excludes space with tunneled base but NO COIN control', () => {
    const def = compileDef();
    // Tunneled base but more insurgents than COIN
    // 1 VC tunneled base + 2 VC guerrillas = 3 insurgent, 2 US troops = 2 COIN → not COIN controlled
    const setup = setupState(def, 200003, 0, {
      [BINH_DINH]: [
        makeToken('cc-noc-vc-base', 'base', 'VC', { tunnel: 'tunneled' }),
        makeToken('cc-noc-vc-guerrilla-1', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('cc-noc-vc-guerrilla-2', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('cc-noc-us-troop-1', 'troops', 'US'),
        makeToken('cc-noc-us-troop-2', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    // No qualifying space → move unavailable or no valid targets
    if (move !== undefined) {
      const pending = legalChoicesEvaluate(def, setup, move);
      if (pending.kind === 'pending') {
        const options = pending.options.map((o) => String(o.value));
        assert.equal(
          options.includes(BINH_DINH),
          false,
          'Space with tunneled base but no COIN control must be excluded',
        );
      }
    }
  });

  it('unshaded excludes space with COIN control but NO tunneled base', () => {
    const def = compileDef();
    // COIN controlled but no base at all
    const setup = setupState(def, 200004, 0, {
      [QUANG_TIN]: [
        makeToken('cc-nobase-us-troop-1', 'troops', 'US'),
        makeToken('cc-nobase-us-troop-2', 'troops', 'US'),
        makeToken('cc-nobase-arvn-troop-1', 'troops', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    if (move !== undefined) {
      const pending = legalChoicesEvaluate(def, setup, move);
      if (pending.kind === 'pending') {
        const options = pending.options.map((o) => String(o.value));
        assert.equal(
          options.includes(QUANG_TIN),
          false,
          'Space without any base must be excluded',
        );
      }
    }
  });

  it('unshaded excludes space with untunneled base even if COIN controlled', () => {
    const def = compileDef();
    // Untunneled base + COIN control → should be excluded
    const setup = setupState(def, 200005, 0, {
      [TAY_NINH]: [
        makeToken('cc-untun-vc-base', 'base', 'VC', { tunnel: 'untunneled' }),
        makeToken('cc-untun-us-troop-1', 'troops', 'US'),
        makeToken('cc-untun-us-troop-2', 'troops', 'US'),
        makeToken('cc-untun-us-troop-3', 'troops', 'US'),
        makeToken('cc-untun-arvn-troop-1', 'troops', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    if (move !== undefined) {
      const pending = legalChoicesEvaluate(def, setup, move);
      if (pending.kind === 'pending') {
        const options = pending.options.map((o) => String(o.value));
        assert.equal(
          options.includes(TAY_NINH),
          false,
          'Space with untunneled base must be excluded',
        );
      }
    }
  });

  it('unshaded leaves non-guerrilla pieces intact (bases, troops, police)', () => {
    const def = compileDef();
    const setup = setupState(def, 200006, 0, {
      [KIEN_PHONG]: [
        makeToken('cc-intact-vc-base', 'base', 'VC', { tunnel: 'tunneled' }),
        makeToken('cc-intact-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('cc-intact-nva-guerrilla', 'guerrilla', 'NVA', { activity: 'active' }),
        makeToken('cc-intact-us-troop-1', 'troops', 'US'),
        makeToken('cc-intact-us-troop-2', 'troops', 'US'),
        makeToken('cc-intact-arvn-troop-1', 'troops', 'ARVN'),
        makeToken('cc-intact-arvn-police-1', 'police', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetSpace', value: KIEN_PHONG },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, KIEN_PHONG, (t) => t.type === 'base'),
      1,
      'Base should remain',
    );
    assert.equal(
      countMatching(final, KIEN_PHONG, (t) => t.type === 'troops'),
      3,
      'All troops should remain',
    );
    assert.equal(
      countMatching(final, KIEN_PHONG, (t) => t.type === 'police'),
      1,
      'Police should remain',
    );
  });

  it('unshaded routes NVA guerrillas to available-NVA and VC guerrillas to available-VC', () => {
    const def = compileDef();
    const setup = setupState(def, 200007, 0, {
      [KIEN_PHONG]: [
        makeToken('cc-route-vc-base', 'base', 'VC', { tunnel: 'tunneled' }),
        makeToken('cc-route-vc-guerrilla-1', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('cc-route-nva-guerrilla-1', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('cc-route-us-troop-1', 'troops', 'US'),
        makeToken('cc-route-us-troop-2', 'troops', 'US'),
        makeToken('cc-route-us-troop-3', 'troops', 'US'),
        makeToken('cc-route-arvn-troop-1', 'troops', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetSpace', value: KIEN_PHONG },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, AVAILABLE_VC, (t) => String(t.id) === 'cc-route-vc-guerrilla-1'),
      1,
      'VC guerrilla should go to available-VC',
    );
    assert.equal(
      countMatching(final, AVAILABLE_NVA, (t) => String(t.id) === 'cc-route-nva-guerrilla-1'),
      1,
      'NVA guerrilla should go to available-NVA',
    );
  });

  it('unshaded move unavailable when no space meets criteria', () => {
    const def = compileDef();
    // No tunneled bases anywhere
    const setup = setupState(def, 200008, 0, {
      [KIEN_PHONG]: [
        makeToken('cc-empty-us-troop-1', 'troops', 'US'),
        makeToken('cc-empty-us-troop-2', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.equal(move, undefined, 'Move should not be available when no space has tunnel + COIN control');
  });

  it('unshaded budget 99 handles many guerrillas', () => {
    const def = compileDef();
    // 1 tunneled base + 6 guerrillas = 7 insurgent → need 8 COIN
    const setup = setupState(def, 200009, 0, {
      [KIEN_PHONG]: [
        makeToken('cc-many-vc-base', 'base', 'VC', { tunnel: 'tunneled' }),
        makeToken('cc-many-vc-g1', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('cc-many-vc-g2', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('cc-many-vc-g3', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('cc-many-nva-g1', 'guerrilla', 'NVA', { activity: 'active' }),
        makeToken('cc-many-nva-g2', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('cc-many-nva-g3', 'guerrilla', 'NVA', { activity: 'active' }),
        makeToken('cc-many-us-t1', 'troops', 'US'),
        makeToken('cc-many-us-t2', 'troops', 'US'),
        makeToken('cc-many-us-t3', 'troops', 'US'),
        makeToken('cc-many-us-t4', 'troops', 'US'),
        makeToken('cc-many-arvn-t1', 'troops', 'ARVN'),
        makeToken('cc-many-arvn-t2', 'troops', 'ARVN'),
        makeToken('cc-many-arvn-t3', 'troops', 'ARVN'),
        makeToken('cc-many-arvn-t4', 'troops', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetSpace', value: KIEN_PHONG },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, KIEN_PHONG, (t) => t.type === 'guerrilla'),
      0,
      'All 6 guerrillas should be removed',
    );
  });

  it('unshaded works with city spaces (not province-only)', () => {
    const def = compileDef();
    // City (Hue) with tunneled base + COIN control
    // 1 NVA tunneled base + 1 VC guerrilla = 2 insurgent → need 3 COIN
    const setup = setupState(def, 200010, 0, {
      [HUE]: [
        makeToken('cc-city-nva-base', 'base', 'NVA', { tunnel: 'tunneled' }),
        makeToken('cc-city-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('cc-city-us-troop-1', 'troops', 'US'),
        makeToken('cc-city-us-troop-2', 'troops', 'US'),
        makeToken('cc-city-arvn-troop-1', 'troops', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'City with tunnel + COIN control should be a valid target');

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');

    const options = pending.options.map((o) => String(o.value));
    assert.equal(options.includes(HUE), true, 'Hue (city) should be a valid unshaded target');
  });

  // ─── Shaded: Place Tunnel markers on Insurgent Bases in 1 Province + Place Guerrillas ───

  it('shaded only targets Provinces (not cities)', () => {
    const def = compileDef();
    const setup = setupState(def, 200020, 0, {
      [SAIGON]: [
        makeToken('cc-sh-sai-vc-base', 'base', 'VC', { tunnel: 'untunneled' }),
      ],
      [KIEN_PHONG]: [
        makeToken('cc-sh-kp-vc-base', 'base', 'VC', { tunnel: 'untunneled' }),
      ],
      [AVAILABLE_NVA]: [
        makeToken('cc-sh-avail-nva-g', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
      [AVAILABLE_VC]: [
        makeToken('cc-sh-avail-vc-g', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const pending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') throw new Error('Expected pending');

    const options = pending.options.map((o) => String(o.value));
    assert.equal(options.includes(SAIGON), false, 'City must not be a shaded target');
    assert.equal(options.includes(KIEN_PHONG), true, 'Province should be a valid shaded target');
  });

  it('shaded sets tunnel=tunneled on ALL NVA and VC bases in province', () => {
    const def = compileDef();
    const setup = setupState(def, 200021, 0, {
      [KIEN_PHONG]: [
        makeToken('cc-sh-tun-vc-base-1', 'base', 'VC', { tunnel: 'untunneled' }),
        makeToken('cc-sh-tun-vc-base-2', 'base', 'VC', { tunnel: 'untunneled' }),
        makeToken('cc-sh-tun-nva-base-1', 'base', 'NVA', { tunnel: 'untunneled' }),
      ],
      [AVAILABLE_NVA]: [
        makeToken('cc-sh-tun-avail-nva', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
      [AVAILABLE_VC]: [
        makeToken('cc-sh-tun-avail-vc', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetProvince', value: KIEN_PHONG },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const basesInZone = (final.zones[KIEN_PHONG] ?? []).filter(
      (t) => t.type === 'base' && (t.props.faction === 'VC' || t.props.faction === 'NVA'),
    );
    assert.equal(basesInZone.length, 3, 'All 3 insurgent bases should remain');
    for (const base of basesInZone) {
      assert.equal(
        base.props.tunnel,
        'tunneled',
        `Base ${String(base.id)} should be tunneled`,
      );
    }
  });

  it('shaded places 1 NVA guerrilla from available-NVA', () => {
    const def = compileDef();
    const setup = setupState(def, 200022, 0, {
      [BINH_DINH]: [
        makeToken('cc-sh-nva-vc-base', 'base', 'VC', { tunnel: 'untunneled' }),
      ],
      [AVAILABLE_NVA]: [
        makeToken('cc-sh-nva-avail-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('cc-sh-nva-avail-g2', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
      [AVAILABLE_VC]: [
        makeToken('cc-sh-nva-avail-vc', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetProvince', value: BINH_DINH },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const nvaInTarget = countMatching(final, BINH_DINH, (t) =>
      t.props.faction === 'NVA' && t.type === 'guerrilla',
    );
    assert.equal(nvaInTarget, 1, 'Exactly 1 NVA guerrilla should be placed');

    const nvaRemaining = countMatching(final, AVAILABLE_NVA, (t) =>
      t.props.faction === 'NVA' && t.type === 'guerrilla',
    );
    assert.equal(nvaRemaining, 1, '1 NVA guerrilla should remain in available');
  });

  it('shaded places 1 VC guerrilla from available-VC', () => {
    const def = compileDef();
    const setup = setupState(def, 200023, 0, {
      [BINH_DINH]: [
        makeToken('cc-sh-vc-nva-base', 'base', 'NVA', { tunnel: 'untunneled' }),
      ],
      [AVAILABLE_NVA]: [
        makeToken('cc-sh-vc-avail-nva', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
      [AVAILABLE_VC]: [
        makeToken('cc-sh-vc-avail-g1', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('cc-sh-vc-avail-g2', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetProvince', value: BINH_DINH },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const vcInTarget = countMatching(final, BINH_DINH, (t) =>
      t.props.faction === 'VC' && t.type === 'guerrilla',
    );
    assert.equal(vcInTarget, 1, 'Exactly 1 VC guerrilla should be placed');

    const vcRemaining = countMatching(final, AVAILABLE_VC, (t) =>
      t.props.faction === 'VC' && t.type === 'guerrilla',
    );
    assert.equal(vcRemaining, 1, '1 VC guerrilla should remain in available');
  });

  it('shaded handles empty available pool gracefully', () => {
    const def = compileDef();
    // NVA pool empty, VC pool has 1
    const setup = setupState(def, 200024, 0, {
      [KIEN_PHONG]: [
        makeToken('cc-sh-empty-vc-base', 'base', 'VC', { tunnel: 'untunneled' }),
      ],
      [AVAILABLE_VC]: [
        makeToken('cc-sh-empty-avail-vc', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
      // No NVA in available
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Move should still be legal even if one pool is empty');

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetProvince', value: KIEN_PHONG },
    ];

    // Should not throw
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // VC guerrilla should still be placed
    const vcInTarget = countMatching(final, KIEN_PHONG, (t) =>
      t.props.faction === 'VC' && t.type === 'guerrilla',
    );
    assert.equal(vcInTarget, 1, 'VC guerrilla should still be placed even if NVA pool is empty');
  });

  it('shaded is idempotent on already-tunneled bases', () => {
    const def = compileDef();
    const setup = setupState(def, 200025, 0, {
      [KIEN_PHONG]: [
        makeToken('cc-sh-idem-vc-base', 'base', 'VC', { tunnel: 'tunneled' }),
        makeToken('cc-sh-idem-nva-base', 'base', 'NVA', { tunnel: 'tunneled' }),
      ],
      [AVAILABLE_NVA]: [
        makeToken('cc-sh-idem-avail-nva', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
      [AVAILABLE_VC]: [
        makeToken('cc-sh-idem-avail-vc', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetProvince', value: KIEN_PHONG },
    ];

    // Should not throw — tunneled stays tunneled
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const basesInZone = (final.zones[KIEN_PHONG] ?? []).filter(
      (t) => t.type === 'base' && (t.props.faction === 'VC' || t.props.faction === 'NVA'),
    );
    for (const base of basesInZone) {
      assert.equal(base.props.tunnel, 'tunneled', `Base ${String(base.id)} should remain tunneled`);
    }
  });

  it('shaded leaves non-base pieces untouched (except newly placed guerrillas)', () => {
    const def = compileDef();
    const setup = setupState(def, 200026, 0, {
      [KIEN_PHONG]: [
        makeToken('cc-sh-leave-vc-base', 'base', 'VC', { tunnel: 'untunneled' }),
        makeToken('cc-sh-leave-us-troop', 'troops', 'US'),
        makeToken('cc-sh-leave-arvn-troop', 'troops', 'ARVN'),
        makeToken('cc-sh-leave-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
      ],
      [AVAILABLE_NVA]: [
        makeToken('cc-sh-leave-avail-nva', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
      [AVAILABLE_VC]: [
        makeToken('cc-sh-leave-avail-vc', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (r) => r.name === '$targetProvince', value: KIEN_PHONG },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // US troop and ARVN troop unchanged
    assert.equal(
      countMatching(final, KIEN_PHONG, (t) => t.type === 'troops' && t.props.faction === 'US'),
      1,
      'US troop should remain',
    );
    assert.equal(
      countMatching(final, KIEN_PHONG, (t) => t.type === 'troops' && t.props.faction === 'ARVN'),
      1,
      'ARVN troop should remain',
    );
    // Original VC guerrilla untouched (still there) + 1 placed VC guerrilla + 1 placed NVA guerrilla
    const totalGuerrillas = countMatching(final, KIEN_PHONG, (t) => t.type === 'guerrilla');
    assert.equal(totalGuerrillas, 3, 'Original guerrilla + 2 placed guerrillas = 3');
  });
});
