// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
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

const CARD_96 = 'card-96';
const CARD_124 = 'card-124';

// South Vietnam spaces
const QUANG_NAM = 'quang-nam:none';
const HUE = 'hue:none';
const SAIGON = 'saigon:none';

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
 * Sets up a card-driven state for card-96 APC testing.
 * Active player defaults to VC (seat 0 in seatOrder: VC-US-ARVN-NVA).
 * Card-96 eligibility order is VC-US-ARVN-NVA.
 */
const setupApcState = (
  def: GameDef,
  seed: number,
  activePlayer: 0 | 1 | 2 | 3,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc' | null,
  overrides?: {
    readonly globalVars?: Partial<GameState['globalVars']>;
    readonly zones?: Readonly<Record<string, readonly Token[]>>;
    readonly markers?: Partial<GameState['markers']>;
    readonly zoneVars?: Partial<GameState['zoneVars']>;
  },
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  // Build zones: card-96 must be at index [0] of the discard zone.
  // Override zones may also add tokens to the discard zone (e.g. card-124
  // for shaded tests), so we merge rather than overwrite.
  const overrideZones: Record<string, readonly Token[]> = overrides?.zones ?? {};
  const discardZone = eventDeck!.discardZone;
  const builtZones: Record<string, Token[]> = {};
  for (const [zoneId, tokens] of Object.entries(base.zones)) {
    builtZones[zoneId] = [...(tokens as Token[])];
  }
  // Start the discard zone with card-96 as the first token (required by resolveCurrentEventCardState)
  builtZones[discardZone] = [
    makeToken(CARD_96, 'card', 'none'),
    ...(overrideZones[discardZone] ?? []),
  ];
  // Copy all other override zones
  for (const [zoneId, tokens] of Object.entries(overrideZones)) {
    if (zoneId !== discardZone) {
      builtZones[zoneId] = [...tokens];
    }
  }

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    globalVars: {
      ...base.globalVars,
      aid: 30,
      patronage: 12,
      arvnResources: 20,
      totalEcon: 12,
      ...(overrides?.globalVars ?? {}),
    },
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        seatOrder: ['vc', 'us', 'arvn', 'nva'],
        eligibility: { us: true, arvn: true, nva: true, vc: true },
        currentCard: {
          ...runtime.currentCard,
          firstEligible,
          secondEligible,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: builtZones as GameState['zones'],
    markers: (
      overrides?.markers === undefined
        ? base.markers
        : { ...base.markers, ...overrides.markers }
    ) as GameState['markers'],
    zoneVars: (
      overrides?.zoneVars === undefined
        ? base.zoneVars
        : { ...base.zoneVars, ...overrides.zoneVars }
    ) as GameState['zoneVars'],
  };
};

const findEventMove = (
  def: GameDef,
  state: GameState,
  side: 'unshaded' | 'shaded',
): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_96),
  );

describe('FITL card-96 APC', () => {
  // ── Compilation invariants ──────────────────────────────────────────────

  it('encodes card-96 with correct text, interrupt wiring, and shaded Tet macro', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_96);
    assert.notEqual(card, undefined);

    assert.equal(card?.sideMode, 'dual');
    assert.equal(
      card?.unshaded?.text,
      'US and ARVN immediately Pacify as if Support Phase, but cost is 0. Shift at most 1 level per space.',
    );
    assert.equal(card?.shaded?.text?.includes('Tet Offensive'), true);

    // Unshaded: pushInterruptPhase to apcPacify
    const pushEffect = card?.unshaded?.effects?.[0] as { pushInterruptPhase?: { phase?: string } } | undefined;
    assert.equal(pushEffect?.pushInterruptPhase?.phase, 'apcPacify');

    // APC actions registered
    const interruptIds = def.turnStructure.interrupts?.map((phase) => String(phase.id)) ?? [];
    assert.equal(interruptIds.includes('apcPacify'), true);
    assert.equal(def.actions.some((action) => String(action.id) === 'apcPacifyUS'), true);
    assert.equal(def.actions.some((action) => String(action.id) === 'apcPacifyARVN'), true);
    assert.equal(def.actions.some((action) => String(action.id) === 'apcPacifyPass'), true);
    assert.equal(def.actions.some((action) => String(action.id) === 'resolveApcPacify'), true);
  });

  // ── Unshaded: US pacifies at cost 0 ────────────────────────────────────

  it('unshaded: US removes terror at cost 0 and ARVN resources are unchanged', () => {
    const def = compileDef();
    // US is active player (seat index 0)
    const setup = setupApcState(def, 96001, 0, 'vc', 'us', {
      zones: {
        [QUANG_NAM]: [
          makeToken('apc-us-t-1', 'troops', 'US'),
          makeToken('apc-arvn-p-1', 'police', 'ARVN'),
        ],
      },
      markers: {
        [QUANG_NAM]: { supportOpposition: 'neutral' },
      },
      zoneVars: {
        [QUANG_NAM]: { terrorCount: 2 },
      },
    });

    const eventMove = findEventMove(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined, 'Expected card-96 unshaded event move');

    const afterEvent = applyMove(def, setup, eventMove!).state;
    assert.equal(afterEvent.currentPhase, 'apcPacify');
    assert.equal(afterEvent.activePlayer, asPlayerId(0));

    // US can pacify (removeTerror)
    const interruptMoves = legalMoves(def, afterEvent);
    assert.equal(interruptMoves.some((move) => String(move.actionId) === 'apcPacifyUS'), true);

    const afterTerror = applyMove(def, afterEvent, {
      actionId: asActionId('apcPacifyUS'),
      params: { targetSpace: QUANG_NAM, action: 'removeTerror' },
    }).state;
    assert.equal(afterTerror.zoneVars[QUANG_NAM]?.terrorCount ?? 0, 0, 'Terror should be removed');
    assert.equal(afterTerror.globalVars.arvnResources, 20, 'ARVN resources should be unchanged (free)');
  });

  // ── Unshaded: Shift capped at 1 ───────────────────────────────────────

  it('unshaded: shift is capped at 1 level per space', () => {
    const def = compileDef();
    const setup = setupApcState(def, 96002, 0, 'vc', 'us', {
      zones: {
        [QUANG_NAM]: [
          makeToken('apc-us-t-2', 'troops', 'US'),
          makeToken('apc-arvn-p-2', 'police', 'ARVN'),
        ],
      },
      markers: {
        [QUANG_NAM]: { supportOpposition: 'passiveOpposition' },
      },
      zoneVars: {
        [QUANG_NAM]: { terrorCount: 0 },
      },
    });

    const eventMove = findEventMove(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined);

    const afterEvent = applyMove(def, setup, eventMove!).state;
    assert.equal(afterEvent.currentPhase, 'apcPacify');

    // First shift: passiveOpposition → neutral
    const afterShift1 = applyMove(def, afterEvent, {
      actionId: asActionId('apcPacifyUS'),
      params: { targetSpace: QUANG_NAM, action: 'shiftSupport' },
    }).state;
    assert.equal(afterShift1.markers[QUANG_NAM]?.supportOpposition, 'neutral');
    assert.equal(afterShift1.markers[QUANG_NAM]?.coupSupportShiftCount, 'one');

    // Second shift in same space should NOT be legal (capped at 1)
    const movesAfterShift = legalMoves(def, afterShift1);
    const secondShiftAvailable = movesAfterShift.some(
      (move) =>
        String(move.actionId) === 'apcPacifyUS'
        && move.params.targetSpace === QUANG_NAM
        && move.params.action === 'shiftSupport',
    );
    assert.equal(secondShiftAvailable, false, 'Second shift in same space should be blocked by APC 1-level cap');
  });

  // ── Unshaded: Both factions act ────────────────────────────────────────

  it('unshaded: both US and ARVN can pacify, then resolve pops the phase', () => {
    const def = compileDef();
    // US is seat 0, ARVN is seat 1
    const setup = setupApcState(def, 96003, 0, 'vc', 'us', {
      zones: {
        [QUANG_NAM]: [
          makeToken('apc-us-t-3', 'troops', 'US'),
          makeToken('apc-arvn-p-3', 'police', 'ARVN'),
          makeToken('apc-arvn-t-3', 'troops', 'ARVN'),
        ],
      },
      markers: {
        [QUANG_NAM]: { supportOpposition: 'neutral' },
      },
      zoneVars: {
        [QUANG_NAM]: { terrorCount: 1 },
      },
    });

    const eventMove = findEventMove(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined);

    const afterEvent = applyMove(def, setup, eventMove!).state;
    assert.equal(afterEvent.currentPhase, 'apcPacify');

    // US removes terror (free)
    const afterUSTerror = applyMove(def, afterEvent, {
      actionId: asActionId('apcPacifyUS'),
      params: { targetSpace: QUANG_NAM, action: 'removeTerror' },
    }).state;
    assert.equal(afterUSTerror.zoneVars[QUANG_NAM]?.terrorCount ?? 0, 0);
    assert.equal(afterUSTerror.globalVars.arvnResources, 20, 'No cost for APC pacification');

    // US passes
    const afterUSPass = applyMove(def, afterUSTerror, {
      actionId: asActionId('apcPacifyPass'),
      params: {},
    }).state;

    // Switch to ARVN (seat 1)
    const arvnState = { ...afterUSPass, activePlayer: asPlayerId(1) };

    // ARVN should be able to pacify the same space (now terror-free, shift)
    const arvnMoves = legalMoves(def, arvnState);
    const arvnCanPacify = arvnMoves.some(
      (move) => String(move.actionId) === 'apcPacifyARVN',
    );
    assert.equal(arvnCanPacify, true, 'ARVN should be able to pacify in APC phase');

    // ARVN shifts support
    const afterARVNShift = applyMove(def, arvnState, {
      actionId: asActionId('apcPacifyARVN'),
      params: { targetSpace: QUANG_NAM, action: 'shiftSupport' },
    }).state;
    assert.equal(afterARVNShift.markers[QUANG_NAM]?.supportOpposition, 'passiveSupport');
    assert.equal(afterARVNShift.globalVars.arvnResources, 20, 'No cost for APC');

    // Resolve pops phase
    const final = applyMove(def, afterARVNShift, {
      actionId: asActionId('resolveApcPacify'),
      params: {},
    }).state;
    assert.equal(final.currentPhase, 'main');
  });

  // ── Unshaded: No eligible spaces → only pass/resolve legal ─────────────

  it('unshaded: when no spaces have COIN control + police + troops, only pass/resolve are legal', () => {
    const def = compileDef();
    // No COIN pieces anywhere
    const setup = setupApcState(def, 96004, 0, 'vc', 'us', {});

    const eventMove = findEventMove(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined);

    const afterEvent = applyMove(def, setup, eventMove!).state;
    assert.equal(afterEvent.currentPhase, 'apcPacify');

    const moves = legalMoves(def, afterEvent);
    assert.equal(moves.some((move) => String(move.actionId) === 'apcPacifyUS'), false);
    assert.equal(
      moves.some(
        (move) => String(move.actionId) === 'apcPacifyPass' || String(move.actionId) === 'resolveApcPacify',
      ),
      true,
    );
  });

  // ── Shaded: Tet played → return to VC ──────────────────────────────────

  it('shaded: if Tet Offensive is in played zone, returns it to leader box', () => {
    const def = compileDef();
    // VC is active, card-124 is in played:none (the discard zone).
    // setupApcState merges card-96 at [0] + additional tokens from overrides.
    // The token needs a cardId prop to match the `prop: cardId` filter on card-96 shaded.
    const setup = setupApcState(def, 96005, 3, 'vc', 'us', {
      zones: {
        'played:none': [makeToken(CARD_124, 'card', 'none', { cardId: CARD_124 })],
      },
    });

    const eventMove = findEventMove(def, setup, 'shaded');
    assert.notEqual(eventMove, undefined, 'Expected card-96 shaded event move');

    const afterEvent = applyMove(def, setup, eventMove!).state;

    // Card-124 should have moved from played:none to leader:none
    const inPlayed = (afterEvent.zones['played:none'] ?? []).some(
      (token) => String(token.id) === CARD_124,
    );
    const inLeader = (afterEvent.zones['leader:none'] ?? []).some(
      (token) => String(token.id) === CARD_124,
    );
    assert.equal(inPlayed, false, 'card-124 should no longer be in played:none');
    assert.equal(inLeader, true, 'card-124 should be in leader:none');
  });

  // ── Shaded: Tet not played → General Uprising fires ────────────────────

  it('shaded: if Tet Offensive is NOT in played zone, General Uprising macro fires', () => {
    const def = compileDef();
    // VC is active, card-124 is NOT in played:none (it's nowhere).
    // Place underground VC guerrillas in an SV space so the terror chooseN has a target.
    const setup = setupApcState(def, 96006, 3, 'vc', 'us', {
      zones: {
        [SAIGON]: [
          makeToken('apc-vc-g-1', 'guerrilla', 'VC', { activity: 'underground' }),
          makeToken('apc-us-t-5', 'troops', 'US'),
        ],
      },
      markers: {
        [SAIGON]: { supportOpposition: 'activeSupport' },
      },
    });

    const eventMove = findEventMove(def, setup, 'shaded');
    assert.notEqual(eventMove, undefined, 'Expected card-96 shaded event move');

    // General Uprising macro requires decision overrides for the chooseN and distributeTokens.
    // We supply all eligible terror spaces and skip distributeTokens placement.
    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.decisionKey.includes('tetTerrorSpaces'),
        value: [SAIGON],
      },
      {
        when: (request) => request.decisionKey.includes('distributeTokens'),
        value: [],
      },
    ];

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, eventMove!, { overrides }).state;
    assert.notEqual(afterEvent, undefined, 'General Uprising should execute without crashing');

    // The VC guerrilla in Saigon should have been activated (by free Terror)
    const vcGuerrillaActive = (afterEvent.zones[SAIGON] ?? []).some(
      (t) => (t as Token).props.faction === 'VC' && (t as Token).type === 'guerrilla' && (t as Token).props.activity === 'active',
    );
    assert.equal(vcGuerrillaActive, true, 'VC guerrilla should be activated by General Uprising free Terror');
  });

  // ── Shaded: Terror removal is free (cost 0) ───────────────────────────

  it('unshaded: terror removal deducts no resources', () => {
    const def = compileDef();
    const setup = setupApcState(def, 96007, 0, 'vc', 'us', {
      zones: {
        [HUE]: [
          makeToken('apc-us-t-6', 'troops', 'US'),
          makeToken('apc-arvn-p-6', 'police', 'ARVN'),
        ],
      },
      markers: {
        [HUE]: { supportOpposition: 'neutral' },
      },
      zoneVars: {
        [HUE]: { terrorCount: 3 },
      },
      globalVars: {
        arvnResources: 5,
      },
    });

    const eventMove = findEventMove(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined);

    const afterEvent = applyMove(def, setup, eventMove!).state;

    const afterTerror = applyMove(def, afterEvent, {
      actionId: asActionId('apcPacifyUS'),
      params: { targetSpace: HUE, action: 'removeTerror' },
    }).state;
    assert.equal(afterTerror.zoneVars[HUE]?.terrorCount ?? 0, 0);
    assert.equal(afterTerror.globalVars.arvnResources, 5, 'No resource cost for APC terror removal');
  });
});
