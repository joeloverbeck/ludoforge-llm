import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
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

const CARD_ID = 'card-123';

const SAIGON = 'saigon:none';
const HUE = 'hue:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';

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

/**
 * Sets up a card-driven state for Vietnamization testing.
 * Play condition: leaderBoxCardCount >= 2 AND < 20 US troops on map.
 * After clearAllZones there are 0 US troops, so the condition is auto-satisfied
 * unless the caller explicitly places >= 20 US troops.
 */
const setupVietnamizationState = (
  def: GameDef,
  seed: number,
  zones: Readonly<Record<string, readonly Token[]>>,
  options?: {
    readonly globalVars?: Readonly<Record<string, unknown>>;
  },
): GameState => {
  const baseState = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(baseState);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected production FITL event deck');

  // Build zones with card in discard
  const builtZones: Record<string, Token[]> = {
    [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
  };

  // Copy user-provided zones
  for (const [zoneId, tokens] of Object.entries(zones)) {
    builtZones[zoneId] = [...(builtZones[zoneId] ?? []), ...tokens];
  }

  return {
    ...baseState,
    activePlayer: asPlayerId(1), // ARVN
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: 'arvn',
          secondEligible: 'us',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: { ...baseState.zones, ...builtZones },
    globalVars: {
      ...baseState.globalVars,
      leaderBoxCardCount: 2,
      ...(options?.globalVars ?? {}),
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

const countTokens = (state: GameState, zoneId: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zoneId] ?? []).filter((token) => predicate(token as Token)).length;

/**
 * Decision overrides for the distributeTokens step (place ARVN cubes).
 * The engine asks: 1) select tokens, 2) choose destination for each.
 */
const makeVietnamizationOverrides = (
  tokenIds: readonly string[],
  destinations: readonly string[],
): readonly DecisionOverrideRule[] => [
  {
    when: (r) => r.decisionKey.includes('distributeTokens') && r.decisionKey.includes('selectTokens'),
    value: tokenIds.map(asTokenId),
  },
  ...destinations.map((dest, i) => ({
    when: (r: { decisionKey: string }) => r.decisionKey.endsWith(`chooseDestination[${i}]`),
    value: dest,
  })),
];

describe('FITL card-123 Vietnamization', () => {
  // ── Happy Path ──

  it('Happy path: all 4 effects execute in sequence', () => {
    const def = compileDef();
    const setup = setupVietnamizationState(def, 123001, {
      'available-ARVN:none': [
        makeToken('arvn-t1', 'troops', 'ARVN'),
        makeToken('arvn-t2', 'troops', 'ARVN'),
        makeToken('arvn-t3', 'troops', 'ARVN'),
        makeToken('arvn-t4', 'troops', 'ARVN'),
      ],
      'out-of-play-ARVN:none': [
        makeToken('arvn-oop-1', 'police', 'ARVN'),
        makeToken('arvn-oop-2', 'troops', 'ARVN'),
      ],
    }, {
      globalVars: { arvnResources: 30, aid: 20 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Vietnamization unshaded event should be legal');

    const overrides = makeVietnamizationOverrides(
      ['arvn-t1', 'arvn-t2', 'arvn-t3', 'arvn-t4'],
      [SAIGON, SAIGON, HUE, QUANG_TRI],
    );
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // Step 1: +12 resources
    assert.equal(
      (final.globalVars as Record<string, number>).arvnResources,
      42,
      'ARVN resources should be 30 + 12 = 42',
    );

    // Step 2: +12 aid
    assert.equal(
      (final.globalVars as Record<string, number>).aid,
      32,
      'Aid should be 20 + 12 = 32',
    );

    // Step 3: out-of-play emptied
    assert.equal(
      countTokens(final, 'out-of-play-ARVN:none', (t) => t.props.faction === 'ARVN'),
      0,
      'All ARVN pieces should be moved from out-of-play to available',
    );

    // Step 4: 4 cubes placed on map
    assert.equal(
      countTokens(final, SAIGON, (t) => t.props.faction === 'ARVN'),
      2,
      'Saigon should have 2 ARVN cubes',
    );
    assert.equal(
      countTokens(final, HUE, (t) => t.props.faction === 'ARVN'),
      1,
      'Hue should have 1 ARVN cube',
    );
    assert.equal(
      countTokens(final, QUANG_TRI, (t) => t.props.faction === 'ARVN'),
      1,
      'Quang Tri should have 1 ARVN cube',
    );
  });

  // ── Resource Capping ──

  it('ARVN Resources capped at 75', () => {
    const def = compileDef();
    const setup = setupVietnamizationState(def, 123002, {
      'available-ARVN:none': [
        makeToken('arvn-cap-t1', 'troops', 'ARVN'),
      ],
    }, {
      globalVars: { arvnResources: 70, aid: 10 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeVietnamizationOverrides(
      ['arvn-cap-t1'],
      [SAIGON],
    );
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      (final.globalVars as Record<string, number>).arvnResources,
      75,
      'ARVN resources should be capped at 75 (not 82)',
    );
  });

  it('Aid capped at 75', () => {
    const def = compileDef();
    const setup = setupVietnamizationState(def, 123003, {
      'available-ARVN:none': [
        makeToken('arvn-aidcap-t1', 'troops', 'ARVN'),
      ],
    }, {
      globalVars: { arvnResources: 10, aid: 68 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeVietnamizationOverrides(
      ['arvn-aidcap-t1'],
      [SAIGON],
    );
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      (final.globalVars as Record<string, number>).aid,
      75,
      'Aid should be capped at 75 (not 80)',
    );
  });

  it('Both resources and aid capped simultaneously', () => {
    const def = compileDef();
    const setup = setupVietnamizationState(def, 123004, {
      'available-ARVN:none': [
        makeToken('arvn-bothcap-t1', 'troops', 'ARVN'),
      ],
    }, {
      globalVars: { arvnResources: 70, aid: 70 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeVietnamizationOverrides(
      ['arvn-bothcap-t1'],
      [SAIGON],
    );
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      (final.globalVars as Record<string, number>).arvnResources,
      75,
      'ARVN resources should be capped at 75',
    );
    assert.equal(
      (final.globalVars as Record<string, number>).aid,
      75,
      'Aid should be capped at 75',
    );
  });

  // ── moveAll Edge Cases ──

  it('Empty out-of-play: moveAll is no-op, other effects still execute', () => {
    const def = compileDef();
    const setup = setupVietnamizationState(def, 123005, {
      'available-ARVN:none': [
        makeToken('arvn-nooop-t1', 'troops', 'ARVN'),
        makeToken('arvn-nooop-t2', 'troops', 'ARVN'),
        makeToken('arvn-nooop-t3', 'troops', 'ARVN'),
        makeToken('arvn-nooop-t4', 'troops', 'ARVN'),
      ],
    }, {
      globalVars: { arvnResources: 20, aid: 15 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeVietnamizationOverrides(
      ['arvn-nooop-t1', 'arvn-nooop-t2', 'arvn-nooop-t3', 'arvn-nooop-t4'],
      [SAIGON, SAIGON, HUE, HUE],
    );
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      (final.globalVars as Record<string, number>).arvnResources,
      32,
      'Resources should still increase even with empty out-of-play',
    );
    assert.equal(
      (final.globalVars as Record<string, number>).aid,
      27,
      'Aid should still increase even with empty out-of-play',
    );
    assert.equal(
      countTokens(final, SAIGON, (t) => t.props.faction === 'ARVN'),
      2,
      'Cubes should still be placed',
    );
  });

  it('Out-of-play tokens become available for placement', () => {
    const def = compileDef();
    // Start with 0 in available, 4 in out-of-play.
    // After moveAll, the 4 move to available, then distributeTokens can draw from them.
    const setup = setupVietnamizationState(def, 123006, {
      'out-of-play-ARVN:none': [
        makeToken('arvn-oop-a', 'troops', 'ARVN'),
        makeToken('arvn-oop-b', 'troops', 'ARVN'),
        makeToken('arvn-oop-c', 'troops', 'ARVN'),
        makeToken('arvn-oop-d', 'troops', 'ARVN'),
      ],
    }, {
      globalVars: { arvnResources: 10, aid: 10 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeVietnamizationOverrides(
      ['arvn-oop-a', 'arvn-oop-b', 'arvn-oop-c', 'arvn-oop-d'],
      [SAIGON, HUE, QUANG_TRI, SAIGON],
    );
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'out-of-play-ARVN:none', (t) => t.props.faction === 'ARVN'),
      0,
      'Out-of-play should be empty after moveAll',
    );
    // All 4 pieces were moved to available by moveAll, then placed on map by distributeTokens
    const onMap =
      countTokens(final, SAIGON, (t) => t.props.faction === 'ARVN') +
      countTokens(final, HUE, (t) => t.props.faction === 'ARVN') +
      countTokens(final, QUANG_TRI, (t) => t.props.faction === 'ARVN');
    assert.equal(onMap, 4, '4 cubes should be placed on map from formerly out-of-play pieces');
  });

  // ── Fewer Than 4 Cubes ──

  it('Fewer than 4 cubes available: places as many as possible', () => {
    const def = compileDef();
    const setup = setupVietnamizationState(def, 123007, {
      'available-ARVN:none': [
        makeToken('arvn-few-t1', 'troops', 'ARVN'),
        makeToken('arvn-few-t2', 'troops', 'ARVN'),
      ],
    }, {
      globalVars: { arvnResources: 10, aid: 10 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeVietnamizationOverrides(
      ['arvn-few-t1', 'arvn-few-t2'],
      [SAIGON, HUE],
    );
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const onMap =
      countTokens(final, SAIGON, (t) => t.props.faction === 'ARVN') +
      countTokens(final, HUE, (t) => t.props.faction === 'ARVN');
    assert.equal(onMap, 2, 'Only 2 cubes should be placed when only 2 available');
  });

  // ── Mixed Cube Types ──

  it('Mixed cube types: troops and police can both be placed', () => {
    const def = compileDef();
    const setup = setupVietnamizationState(def, 123008, {
      'available-ARVN:none': [
        makeToken('arvn-mix-t1', 'troops', 'ARVN'),
        makeToken('arvn-mix-t2', 'troops', 'ARVN'),
        makeToken('arvn-mix-p1', 'police', 'ARVN'),
        makeToken('arvn-mix-p2', 'police', 'ARVN'),
      ],
    }, {
      globalVars: { arvnResources: 10, aid: 10 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeVietnamizationOverrides(
      ['arvn-mix-t1', 'arvn-mix-p1', 'arvn-mix-t2', 'arvn-mix-p2'],
      [SAIGON, SAIGON, HUE, HUE],
    );
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, SAIGON, (t) => t.props.faction === 'ARVN' && t.type === 'troops'),
      1,
      'Saigon should have 1 ARVN troop',
    );
    assert.equal(
      countTokens(final, SAIGON, (t) => t.props.faction === 'ARVN' && t.type === 'police'),
      1,
      'Saigon should have 1 ARVN police',
    );
    assert.equal(
      countTokens(final, HUE, (t) => t.props.faction === 'ARVN'),
      2,
      'Hue should have 2 ARVN cubes (1 troop + 1 police)',
    );
  });

  // ── Play Condition Boundaries ──

  it('Play condition boundary: 19 US troops on map → legal', () => {
    const def = compileDef();
    const usTroopsZones: Record<string, Token[]> = {
      'available-ARVN:none': [makeToken('arvn-pc19-t1', 'troops', 'ARVN')],
    };
    // Place 19 US troops across map spaces
    for (let i = 0; i < 19; i++) {
      const zone = i < 10 ? SAIGON : HUE;
      usTroopsZones[zone] = [
        ...(usTroopsZones[zone] ?? []),
        makeToken(`us-troop-${i}`, 'troops', 'US'),
      ];
    }
    const setup = setupVietnamizationState(def, 123009, usTroopsZones, {
      globalVars: { arvnResources: 10, aid: 10 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Vietnamization should be legal with 19 US troops (< 20)');
  });

  it('Play condition boundary: 20 US troops on map → no effects', () => {
    const def = compileDef();
    const usTroopsZones: Record<string, Token[]> = {
      'available-ARVN:none': [makeToken('arvn-pc20-t1', 'troops', 'ARVN')],
    };
    // Place 20 US troops
    for (let i = 0; i < 20; i++) {
      const zone = i < 10 ? SAIGON : HUE;
      usTroopsZones[zone] = [
        ...(usTroopsZones[zone] ?? []),
        makeToken(`us-troop-20-${i}`, 'troops', 'US'),
      ];
    }
    const setup = setupVietnamizationState(def, 123010, usTroopsZones, {
      globalVars: { arvnResources: 10, aid: 10 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    if (move === undefined) {
      // Play condition checked at legalMoves — event not offered
      return;
    }

    // Play condition checked at execution — effects should be no-ops
    const overrides = makeVietnamizationOverrides(['arvn-pc20-t1'], [SAIGON]);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    assert.equal(
      (final.globalVars as Record<string, number>).arvnResources,
      10,
      'ARVN resources should be unchanged when play condition fails',
    );
    assert.equal(
      (final.globalVars as Record<string, number>).aid,
      10,
      'Aid should be unchanged when play condition fails',
    );
  });

  it('Play condition: leaderBoxCardCount < 2 → no effects', () => {
    const def = compileDef();
    const setup = setupVietnamizationState(def, 123011, {
      'available-ARVN:none': [makeToken('arvn-lbc-t1', 'troops', 'ARVN')],
    }, {
      globalVars: { arvnResources: 10, aid: 10, leaderBoxCardCount: 1 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    if (move === undefined) {
      // Play condition checked at legalMoves — event not offered
      return;
    }

    // Play condition checked at execution — effects should be no-ops
    const overrides = makeVietnamizationOverrides(['arvn-lbc-t1'], [SAIGON]);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    assert.equal(
      (final.globalVars as Record<string, number>).arvnResources,
      10,
      'ARVN resources should be unchanged when play condition fails',
    );
    assert.equal(
      (final.globalVars as Record<string, number>).aid,
      10,
      'Aid should be unchanged when play condition fails',
    );
  });
});
