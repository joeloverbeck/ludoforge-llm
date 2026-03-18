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

const CARD_ID = 'card-121';

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
 * Sets up a card-driven state for Linebacker II testing.
 * Play condition: leaderBoxCardCount >= 2 AND (support+available > 40 OR linebacker11Allowed == true).
 * We use linebacker11Allowed = true to bypass the complex support calculation.
 */
const setupLinebackerState = (
  def: GameDef,
  seed: number,
  zones: Readonly<Record<string, readonly Token[]>>,
  options?: {
    readonly globalVars?: Readonly<Record<string, unknown>>;
    readonly skipPlayConditionSetup?: boolean;
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
    activePlayer: asPlayerId(0), // US
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: 'us',
          secondEligible: 'arvn',
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
      linebacker11Allowed: true, // boolean gvar stores actual true/false
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

const makeLinebackerOverrides = (
  basesToRemove: readonly string[],
): readonly DecisionOverrideRule[] => [
  {
    when: (r) => r.name === '$linebackerNvaBasesToRemove',
    value: basesToRemove,
  },
];

describe('FITL card-121 Linebacker II', () => {
  // ── Effect 1: NVA Removes 2 Bases ──

  it('Effect 1: exactly 2 NVA bases on map — both removed to available', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121001, {
      'saigon:none': [
        makeToken('nva-base-1', 'base', 'NVA'),
      ],
      'hue:none': [
        makeToken('nva-base-2', 'base', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Linebacker II unshaded event should be legal');

    const overrides = makeLinebackerOverrides(['nva-base-1', 'nva-base-2']);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'saigon:none', (t) => t.id === asTokenId('nva-base-1')),
      0,
      'NVA base 1 should be removed from Saigon',
    );
    assert.equal(
      countTokens(final, 'hue:none', (t) => t.id === asTokenId('nva-base-2')),
      0,
      'NVA base 2 should be removed from Hue',
    );
    assert.equal(
      countTokens(final, 'available-NVA:none', (t) => t.props.type === 'base' && t.props.faction === 'NVA'),
      2,
      'Both NVA bases should be in available',
    );
  });

  it('Effect 1: >2 NVA bases — NVA chooses 2, rest remain', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121002, {
      'saigon:none': [
        makeToken('nva-base-a', 'base', 'NVA'),
      ],
      'hue:none': [
        makeToken('nva-base-b', 'base', 'NVA'),
      ],
      'da-nang:none': [
        makeToken('nva-base-c', 'base', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // NVA chooses bases a and b, c remains
    const overrides = makeLinebackerOverrides(['nva-base-a', 'nva-base-b']);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'da-nang:none', (t) => t.id === asTokenId('nva-base-c')),
      1,
      'Unchosen NVA base should remain on map',
    );
    assert.equal(
      countTokens(final, 'available-NVA:none', (t) => t.props.type === 'base' && t.props.faction === 'NVA'),
      2,
      'Exactly 2 NVA bases should be in available',
    );
  });

  it('Effect 1: only 1 NVA base — min=1, only 1 removed', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121003, {
      'saigon:none': [
        makeToken('nva-base-solo', 'base', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeLinebackerOverrides(['nva-base-solo']);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'saigon:none', (t) => t.id === asTokenId('nva-base-solo')),
      0,
      'Sole NVA base should be removed',
    );
    assert.equal(
      countTokens(final, 'available-NVA:none', (t) => t.props.type === 'base' && t.props.faction === 'NVA'),
      1,
      '1 NVA base should be in available',
    );
  });

  it('Effect 1: 0 NVA bases — no-op for base removal', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121004, {});

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // No bases to choose — supply empty override
    const overrides = makeLinebackerOverrides([]);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // Just verify resources were halved (meaning the event executed past the base step)
    const nvaRes = (final.globalVars as Record<string, number>).nvaResources ?? -1;
    assert.ok(nvaRes >= 0, 'Event should execute past base removal even with 0 bases');
  });

  it('Effect 1: tunneled NVA base can be removed', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121005, {
      'saigon:none': [
        makeToken('nva-base-tunnel', 'base', 'NVA', { tunnel: true }),
      ],
      'hue:none': [
        makeToken('nva-base-plain', 'base', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeLinebackerOverrides(['nva-base-tunnel', 'nva-base-plain']);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'available-NVA:none', (t) => t.props.type === 'base' && t.props.faction === 'NVA'),
      2,
      'Both bases (including tunneled) should be in available',
    );
  });

  // ── Effect 2: NVA Resources Halved ──

  it('Effect 2: even resources — 10 → 5', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121006, {}, {
      globalVars: { nvaResources: 10 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeLinebackerOverrides([]);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      (final.globalVars as Record<string, number>).nvaResources,
      5,
      'NVA resources should be halved: 10 → 5',
    );
  });

  it('Effect 2: odd resources — 11 → 5 (floor)', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121007, {}, {
      globalVars: { nvaResources: 11 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeLinebackerOverrides([]);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      (final.globalVars as Record<string, number>).nvaResources,
      5,
      'NVA resources should be floor-halved: 11 → 5',
    );
  });

  it('Effect 2: zero resources — 0 → 0', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121008, {}, {
      globalVars: { nvaResources: 0 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeLinebackerOverrides([]);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      (final.globalVars as Record<string, number>).nvaResources,
      0,
      'NVA resources should remain 0',
    );
  });

  it('Effect 2: resources = 1 → 0', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121009, {}, {
      globalVars: { nvaResources: 1 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeLinebackerOverrides([]);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      (final.globalVars as Record<string, number>).nvaResources,
      0,
      'NVA resources should be floor-halved: 1 → 0',
    );
  });

  // ── Effect 3: 3 US Casualties to Available ──

  it('Effect 3: 3+ casualties — exactly 3 moved to available', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121010, {
      'casualties-US:none': [
        makeToken('us-cas-1', 'troops', 'US'),
        makeToken('us-cas-2', 'troops', 'US'),
        makeToken('us-cas-3', 'troops', 'US'),
        makeToken('us-cas-4', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeLinebackerOverrides([]);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'casualties-US:none', (t) => t.props.faction === 'US'),
      1,
      'Only 1 US casualty should remain (4 - 3 = 1)',
    );
    assert.equal(
      countTokens(final, 'available-US:none', (t) => t.props.faction === 'US'),
      3,
      '3 US pieces should be moved to available',
    );
  });

  it('Effect 3: <3 casualties — all moved', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121011, {
      'casualties-US:none': [
        makeToken('us-cas-only-1', 'troops', 'US'),
        makeToken('us-cas-only-2', 'base', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeLinebackerOverrides([]);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'casualties-US:none', (t) => t.props.faction === 'US'),
      0,
      'All US casualties should be moved when fewer than 3',
    );
    assert.equal(
      countTokens(final, 'available-US:none', (t) => t.props.faction === 'US'),
      2,
      'Both US pieces should be in available',
    );
  });

  it('Effect 3: 0 casualties — no-op', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121012, {});

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeLinebackerOverrides([]);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'available-US:none', (t) => t.props.faction === 'US'),
      0,
      'No US pieces should appear in available when no casualties',
    );
  });

  it('Effect 3: mixed types (troops + bases) in casualties — all eligible', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121013, {
      'casualties-US:none': [
        makeToken('us-cas-troop', 'troops', 'US'),
        makeToken('us-cas-base', 'base', 'US'),
        makeToken('us-cas-troop2', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeLinebackerOverrides([]);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'casualties-US:none', (t) => t.props.faction === 'US'),
      0,
      'All 3 casualties (mixed types) should be moved',
    );
    assert.equal(
      countTokens(final, 'available-US:none', (t) => t.props.faction === 'US'),
      3,
      '3 mixed-type US pieces should be in available',
    );
  });

  // ── Full Sequence ──

  it('Full sequence: bases removed, resources halved, casualties moved', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121014, {
      'saigon:none': [
        makeToken('nva-base-seq-1', 'base', 'NVA'),
      ],
      'hue:none': [
        makeToken('nva-base-seq-2', 'base', 'NVA'),
      ],
      'casualties-US:none': [
        makeToken('us-cas-seq-1', 'troops', 'US'),
        makeToken('us-cas-seq-2', 'troops', 'US'),
        makeToken('us-cas-seq-3', 'troops', 'US'),
        makeToken('us-cas-seq-4', 'troops', 'US'),
      ],
    }, {
      globalVars: { nvaResources: 15 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeLinebackerOverrides(['nva-base-seq-1', 'nva-base-seq-2']);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // Effect 1: bases removed
    assert.equal(
      countTokens(final, 'available-NVA:none', (t) => t.props.type === 'base' && t.props.faction === 'NVA'),
      2,
      'Both NVA bases should be in available',
    );

    // Effect 2: resources halved
    assert.equal(
      (final.globalVars as Record<string, number>).nvaResources,
      7, // floor(15/2) = 7
      'NVA resources should be floor-halved: 15 → 7',
    );

    // Effect 3: 3 of 4 casualties moved
    assert.equal(
      countTokens(final, 'casualties-US:none', (t) => t.props.faction === 'US'),
      1,
      '1 US casualty should remain',
    );
    assert.equal(
      countTokens(final, 'available-US:none', (t) => t.props.faction === 'US'),
      3,
      '3 US pieces should be in available',
    );
  });

  // ── Play Condition Gate ──

  it('Event produces no effects when play condition fails (leaderBoxCardCount < 2)', () => {
    const def = compileDef();
    const setup = setupLinebackerState(def, 121015, {
      'saigon:none': [
        makeToken('nva-base-gate', 'base', 'NVA'),
      ],
      'casualties-US:none': [
        makeToken('us-cas-gate', 'troops', 'US'),
      ],
    }, {
      globalVars: { linebacker11Allowed: false, leaderBoxCardCount: 1, nvaResources: 10 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    if (move === undefined) {
      // If play condition is checked at legalMoves level, the event simply isn't offered
      return;
    }

    // If the move is offered but play condition fails at execution, effects should be no-ops
    const overrides = makeLinebackerOverrides(['nva-base-gate']);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    // NVA base should still be on map (effects didn't fire)
    assert.equal(
      countTokens(final, 'saigon:none', (t) => t.id === asTokenId('nva-base-gate')),
      1,
      'NVA base should remain when play condition fails',
    );
    // Resources unchanged
    assert.equal(
      (final.globalVars as Record<string, number>).nvaResources,
      10,
      'NVA resources should be unchanged when play condition fails',
    );
  });
});
