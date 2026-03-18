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

const CARD_ID = 'card-122';

// South Vietnam provinces
const QUANG_TRI = 'quang-tri-thua-thien:none';
// South Vietnam cities
const HUE = 'hue:none';
// South Vietnam LoCs
const LOC_HUE_DA_NANG = 'loc-hue-da-nang:none';
const LOC_HUE_KHE_SANH = 'loc-hue-khe-sanh:none';

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
 * Sets up a card-driven state for Easter Offensive testing.
 * Play condition: leaderBoxCardCount >= 2 AND more NVA Troops than US Troops on map.
 * This helper auto-satisfies the play condition by placing NVA troops in filler spaces
 * (more than any US troops present).
 */
const setupEasterOffensiveState = (
  def: GameDef,
  seed: number,
  zones: Readonly<Record<string, readonly Token[]>>,
  options?: {
    readonly globalVars?: Readonly<Record<string, unknown>>;
    readonly globalMarkers?: Readonly<Record<string, string>>;
    readonly markers?: Readonly<Record<string, Record<string, unknown>>>;
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

  // Auto-satisfy play condition: place NVA troops in filler spaces so
  // NVA troops on map > US troops on map. We place 6 NVA troops across
  // filler spaces that aren't already occupied by user zones.
  const fillerSpaces = [
    'tay-ninh:none', 'phuoc-long:none', 'kien-phong:none',
  ];
  if (!options?.skipPlayConditionSetup) {
    let placed = 0;
    for (const space of fillerSpaces) {
      if (placed >= 6) break;
      if (builtZones[space] !== undefined) continue;
      builtZones[space] = [];
      for (let j = 0; j < 2 && placed < 6; j++) {
        builtZones[space]!.push(
          makeToken(`eo-filler-troop-${placed}`, 'troops', 'NVA'),
        );
        placed++;
      }
    }
  }

  let state: GameState = {
    ...baseState,
    activePlayer: asPlayerId(2), // NVA
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: 'nva',
          secondEligible: 'vc',
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

  if (options?.markers) {
    const merged = Object.fromEntries(
      Object.entries(options.markers).map(([zoneId, zoneMarkers]) => [
        zoneId,
        {
          ...((state.markers as Record<string, Record<string, string>>)[zoneId] ?? {}),
          ...zoneMarkers,
        },
      ]),
    );
    state = { ...state, markers: { ...state.markers, ...merged } as GameState['markers'] };
  }

  if (options?.globalMarkers) {
    state = { ...state, globalMarkers: { ...state.globalMarkers, ...options.globalMarkers } };
  }

  return state;
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
 * Build overrides for a simple Easter Offensive execution.
 * Step 1: march to specified destinations, moving specified pieces.
 * Step 2: LoC troop movement overrides.
 * Step 3: no decisions unless PT-76 shaded.
 */
/**
 * Build overrides for Easter Offensive execution.
 *
 * Bind names at runtime keep the literal param placeholder:
 *   `$eoMovingGuerrillas@{$destSpace}` (not interpolated with zone ID).
 * So guerrilla/troop overrides use flat arrays applied to each
 * forEach iteration in sequence.
 */
const makeEasterOffensiveOverrides = (opts: {
  readonly marchDestinations?: readonly string[];
  readonly marchGuerrillas?: readonly string[];
  readonly marchTroops?: readonly string[];
  readonly locTroops?: readonly string[];
  readonly locDest?: string;
  readonly pt76EnhancedSpace?: string;
  readonly extraOverrides?: readonly DecisionOverrideRule[];
}): readonly DecisionOverrideRule[] => [
  // Step 1: march destinations
  {
    when: (r) => r.name === '$eoMarchDestinations',
    value: opts.marchDestinations ?? [],
  },
  // Step 1: guerrillas to march (flat list, same for each destination iteration)
  {
    when: (r) => r.name.includes('eoMovingGuerrillas'),
    value: opts.marchGuerrillas ?? [],
  },
  // Step 1: troops to march (flat list)
  {
    when: (r) => r.name.includes('eoMovingTroops'),
    value: opts.marchTroops ?? [],
  },
  // Step 2: LoC troops to move (inner macro — hygiene-renamed bind name)
  {
    when: (r) => r.name.includes('eoLocTroops'),
    value: opts.locTroops ?? [],
  },
  // Step 2: LoC destination (inner macro — hygiene-renamed bind name)
  ...(opts.locDest !== undefined
    ? [{
        when: (r: { readonly name: string }) => r.name.includes('eoLocDest'),
        value: opts.locDest,
      }]
    : []),
  // Step 3: PT-76 enhanced space
  ...(opts.pt76EnhancedSpace !== undefined
    ? [{
        when: (r: { readonly name: string }) => r.name === '$eoPt76EnhancedSpace',
        value: opts.pt76EnhancedSpace,
      }]
    : []),
  ...(opts.extraOverrides ?? []),
];

describe('FITL card-122 Easter Offensive', () => {
  // ── PRECONDITIONS ──

  it('play condition satisfied — event is legal', () => {
    const def = compileDef();
    const setup = setupEasterOffensiveState(def, 122001, {
      [QUANG_TRI]: [
        makeToken('eo-nva-troop-1', 'troops', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Easter Offensive unshaded event should be legal');
  });

  it('play condition NOT satisfied (fewer NVA troops) — event is no-op', () => {
    const def = compileDef();
    // Place more US troops than NVA troops (7 US > 6 NVA filler),
    // skip play condition auto-setup to have 0 NVA troops
    const setup = setupEasterOffensiveState(def, 122002, {
      [QUANG_TRI]: [
        makeToken('eo-us-troop-1', 'troops', 'US'),
      ],
    }, {
      skipPlayConditionSetup: true,
      globalVars: { leaderBoxCardCount: 0 }, // also fail the leaderBox condition
    });

    // Pivotal events always appear in legalMoves; playCondition checked at execution
    const move = findCardMove(def, setup, 'unshaded');
    if (move === undefined) return;

    // Run with default overrides (no march destinations)
    const overrides = makeEasterOffensiveOverrides({});
    const final = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    // US troop should remain — play condition not met, event is no-op
    assert.equal(
      countTokens(final, QUANG_TRI, (t) => t.props.faction === 'US' && t.type === 'troops'),
      1,
      'US troop should remain — play condition not met, event is no-op',
    );
  });

  // ── STEP 1: NVA FREE MARCHES ──

  it('Step 1: free march moves NVA guerrillas and troops to destination', () => {
    const def = compileDef();
    // Place NVA pieces adjacent to Hue (in Quang Tri)
    const setup = setupEasterOffensiveState(def, 122003, {
      [QUANG_TRI]: [
        makeToken('eo-march-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('eo-march-t1', 'troops', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // March into Hue (adjacent to Quang Tri)
    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [HUE],
      marchGuerrillas: ['eo-march-g1'],
      marchTroops: ['eo-march-t1'],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, HUE, (t) => t.id === asTokenId('eo-march-g1')),
      1,
      'Guerrilla should have marched to Hue',
    );
    assert.equal(
      countTokens(final, HUE, (t) => t.id === asTokenId('eo-march-t1')),
      1,
      'Troop should have marched to Hue',
    );
    assert.equal(
      countTokens(final, QUANG_TRI, (t) => t.props.faction === 'NVA'),
      0,
      'No NVA pieces should remain in Quang Tri',
    );
  });

  it('Step 1: activation rule fires on LoC with moving+COIN > 3', () => {
    const def = compileDef();
    // Place NVA guerrillas adjacent to LoC, and COIN pieces on LoC
    const setup = setupEasterOffensiveState(def, 122004, {
      [QUANG_TRI]: [
        makeToken('eo-act-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('eo-act-g2', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('eo-act-t1', 'troops', 'NVA'),
      ],
      [LOC_HUE_DA_NANG]: [
        makeToken('eo-us-troop-loc', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // March 2 guerrillas + 1 troop into LoC (3 moving + 1 COIN = 4 > 3)
    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [LOC_HUE_DA_NANG],
      marchGuerrillas: ['eo-act-g1', 'eo-act-g2'],
      marchTroops: ['eo-act-t1'],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // Guerrillas should be activated (set to active)
    assert.equal(
      countTokens(final, LOC_HUE_DA_NANG, (t) =>
        t.id === asTokenId('eo-act-g1') && t.props.activity === 'active'),
      1,
      'First guerrilla should be activated on LoC',
    );
    assert.equal(
      countTokens(final, LOC_HUE_DA_NANG, (t) =>
        t.id === asTokenId('eo-act-g2') && t.props.activity === 'active'),
      1,
      'Second guerrilla should be activated on LoC',
    );
  });

  it('Step 1: claymores removes 1 guerrilla on march to activation-eligible space', () => {
    const def = compileDef();
    const setup = setupEasterOffensiveState(def, 122005, {
      [QUANG_TRI]: [
        makeToken('eo-clay-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('eo-clay-g2', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('eo-clay-t1', 'troops', 'NVA'),
        makeToken('eo-clay-t2', 'troops', 'NVA'),
      ],
      [LOC_HUE_DA_NANG]: [
        makeToken('eo-us-clay-loc', 'troops', 'US'),
      ],
    }, {
      globalVars: { mom_claymores: true },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // March 2 guerrillas + 2 troops (4 moving + 1 COIN = 5 > 3, triggers activation + claymores)
    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [LOC_HUE_DA_NANG],
      marchGuerrillas: ['eo-clay-g1', 'eo-clay-g2'],
      marchTroops: ['eo-clay-t1', 'eo-clay-t2'],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // 1 guerrilla should be removed to available by claymores
    const nvaGuerrillasOnLoc = countTokens(final, LOC_HUE_DA_NANG,
      (t) => t.props.faction === 'NVA' && t.type === 'guerrilla');
    assert.equal(nvaGuerrillasOnLoc, 1, 'Claymores should remove 1 of 2 guerrillas');

    const nvaGuerrillasInAvail = countTokens(final, 'available-NVA:none',
      (t) => t.type === 'guerrilla');
    assert.ok(nvaGuerrillasInAvail >= 1, 'Removed guerrilla should be in NVA available');
  });

  it('Step 1: free march costs zero NVA resources', () => {
    const def = compileDef();
    const setup = setupEasterOffensiveState(def, 122006, {
      [QUANG_TRI]: [
        makeToken('eo-cost-t1', 'troops', 'NVA'),
      ],
    }, {
      globalVars: { nvaResources: 5 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const nvaResourcesBefore = (setup.globalVars as Record<string, number>).nvaResources;

    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [HUE],
      marchTroops: ['eo-cost-t1'],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const nvaResourcesAfter = (final.globalVars as Record<string, number>).nvaResources;
    assert.equal(nvaResourcesAfter, nvaResourcesBefore, 'Free march should cost zero NVA resources');
  });

  it('Step 1: march with 0 destinations selected — no-op', () => {
    const def = compileDef();
    const setup = setupEasterOffensiveState(def, 122007, {
      [QUANG_TRI]: [
        makeToken('eo-noop-t1', 'troops', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // Select zero march destinations
    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // Troop should remain where it was
    assert.equal(
      countTokens(final, QUANG_TRI, (t) => t.id === asTokenId('eo-noop-t1')),
      1,
      'NVA troop should remain in Quang Tri when 0 destinations selected',
    );
  });

  // ── STEP 2: LOC TROOP MOVEMENT ──

  it('Step 2: NVA troops on LoC with no US/ARVN move to adjacent space', () => {
    const def = compileDef();
    // Place NVA troops on a LoC with no COIN pieces
    const setup = setupEasterOffensiveState(def, 122008, {
      [LOC_HUE_DA_NANG]: [
        makeToken('eo-loc-t1', 'troops', 'NVA'),
        makeToken('eo-loc-t2', 'troops', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // No march destinations (Step 1 skip), then move LoC troops to Hue
    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
      locTroops: ['eo-loc-t1', 'eo-loc-t2'],
      locDest: HUE,
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, HUE, (t) => t.props.faction === 'NVA' && t.type === 'troops'),
      2,
      'Both NVA troops should have moved from LoC to Hue',
    );
    assert.equal(
      countTokens(final, LOC_HUE_DA_NANG, (t) => t.props.faction === 'NVA'),
      0,
      'No NVA pieces should remain on LoC',
    );
  });

  it('Step 2: LoC with US/ARVN — filtered out, no movement', () => {
    const def = compileDef();
    // Place NVA troops + US troop on the same LoC
    const setup = setupEasterOffensiveState(def, 122009, {
      [LOC_HUE_DA_NANG]: [
        makeToken('eo-loc-blocked-t1', 'troops', 'NVA'),
        makeToken('eo-us-on-loc', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // No march, no LoC decisions needed (LoC with US should not appear in forEach)
    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // NVA troop should remain on LoC (not eligible for Step 2)
    assert.equal(
      countTokens(final, LOC_HUE_DA_NANG, (t) => t.id === asTokenId('eo-loc-blocked-t1')),
      1,
      'NVA troop on LoC with US should remain (not eligible for Step 2)',
    );
  });

  it('Step 2: LoC troop movement optional — can choose zero troops', () => {
    const def = compileDef();
    const setup = setupEasterOffensiveState(def, 122010, {
      [LOC_HUE_DA_NANG]: [
        makeToken('eo-loc-opt-t1', 'troops', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // Select zero troops (opt out of movement)
    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
      locTroops: [],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, LOC_HUE_DA_NANG, (t) => t.id === asTokenId('eo-loc-opt-t1')),
      1,
      'NVA troop should remain on LoC when 0 troops selected',
    );
  });

  // ── STEP 3: ALL NVA TROOPS FREE ATTACK ──

  it('Step 3: troops attack — 4 NVA troops → 2 COIN removed (floor(4/2))', () => {
    const def = compileDef();
    const setup = setupEasterOffensiveState(def, 122011, {
      [QUANG_TRI]: [
        makeToken('eo-atk-t1', 'troops', 'NVA'),
        makeToken('eo-atk-t2', 'troops', 'NVA'),
        makeToken('eo-atk-t3', 'troops', 'NVA'),
        makeToken('eo-atk-t4', 'troops', 'NVA'),
        makeToken('eo-arvn-1', 'troops', 'ARVN'),
        makeToken('eo-arvn-2', 'troops', 'ARVN'),
        makeToken('eo-arvn-3', 'troops', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // floor(4/2) = 2 ARVN troops removed
    const arvnRemaining = countTokens(final, QUANG_TRI,
      (t) => t.props.faction === 'ARVN' && t.type === 'troops');
    assert.equal(arvnRemaining, 1, '4 NVA troops → floor(4/2)=2 COIN removed, 1 ARVN should remain');
  });

  it('Step 3: troops attack — 3 NVA troops → 1 COIN removed (floor(3/2))', () => {
    const def = compileDef();
    const setup = setupEasterOffensiveState(def, 122012, {
      [QUANG_TRI]: [
        makeToken('eo-atk3-t1', 'troops', 'NVA'),
        makeToken('eo-atk3-t2', 'troops', 'NVA'),
        makeToken('eo-atk3-t3', 'troops', 'NVA'),
        makeToken('eo-arvn3-1', 'troops', 'ARVN'),
        makeToken('eo-arvn3-2', 'troops', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const arvnRemaining = countTokens(final, QUANG_TRI,
      (t) => t.props.faction === 'ARVN' && t.type === 'troops');
    assert.equal(arvnRemaining, 1, '3 NVA troops → floor(3/2)=1 COIN removed, 1 ARVN should remain');
  });

  it('Step 3: troops attack — 1 NVA troop → 0 COIN removed (floor(1/2)=0)', () => {
    const def = compileDef();
    const setup = setupEasterOffensiveState(def, 122013, {
      [QUANG_TRI]: [
        makeToken('eo-atk1-t1', 'troops', 'NVA'),
        makeToken('eo-arvn1-1', 'troops', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const arvnRemaining = countTokens(final, QUANG_TRI,
      (t) => t.props.faction === 'ARVN' && t.type === 'troops');
    assert.equal(arvnRemaining, 1, '1 NVA troop → floor(1/2)=0 COIN removed, ARVN should remain');
  });

  it('Step 3: attack attrition — per US piece removed, 1 NVA piece lost', () => {
    const def = compileDef();
    const setup = setupEasterOffensiveState(def, 122014, {
      [QUANG_TRI]: [
        makeToken('eo-attr-t1', 'troops', 'NVA'),
        makeToken('eo-attr-t2', 'troops', 'NVA'),
        makeToken('eo-attr-t3', 'troops', 'NVA'),
        makeToken('eo-attr-t4', 'troops', 'NVA'),
        makeToken('eo-us-attr-1', 'troops', 'US'),
        makeToken('eo-us-attr-2', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // floor(4/2) = 2 COIN removed; US pieces go to casualties
    // US pieces removed = 2, so 2 NVA pieces lost to attrition
    const usCasualties = countTokens(final, 'casualties-US:none',
      (t) => t.props.faction === 'US');
    assert.equal(usCasualties, 2, '2 US troops should be in casualties');

    const nvaRemaining = countTokens(final, QUANG_TRI,
      (t) => t.props.faction === 'NVA');
    assert.equal(nvaRemaining, 2, '2 NVA pieces should remain after attrition (4 - 2 attrition)');

    const nvaAvail = countTokens(final, 'available-NVA:none',
      (t) => t.props.faction === 'NVA');
    assert.ok(nvaAvail >= 2, '2 NVA pieces should be in available from attrition');
  });

  it('Step 3: PT-76 shaded — enhanced space gets full damage (nvaTroops, not halved)', () => {
    const def = compileDef();
    const setup = setupEasterOffensiveState(def, 122015, {
      [QUANG_TRI]: [
        makeToken('eo-pt76-t1', 'troops', 'NVA'),
        makeToken('eo-pt76-t2', 'troops', 'NVA'),
        makeToken('eo-pt76-t3', 'troops', 'NVA'),
        makeToken('eo-pt76-arvn-1', 'troops', 'ARVN'),
        makeToken('eo-pt76-arvn-2', 'troops', 'ARVN'),
        makeToken('eo-pt76-arvn-3', 'troops', 'ARVN'),
      ],
    }, {
      globalMarkers: { cap_pt76: 'shaded' },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // PT-76 shaded: choose Quang Tri as enhanced space
    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
      pt76EnhancedSpace: QUANG_TRI,
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // Enhanced: damage = 3 (full nvaTroops), not floor(3/2)=1
    const arvnRemaining = countTokens(final, QUANG_TRI,
      (t) => t.props.faction === 'ARVN' && t.type === 'troops');
    assert.equal(arvnRemaining, 0, 'PT-76 enhanced: 3 NVA troops → 3 COIN removed (full damage)');
  });

  it('Step 3: troops attack in all eligible spaces (mandatory forEach)', () => {
    const def = compileDef();
    // Place NVA troops + COIN in two different spaces
    const setup = setupEasterOffensiveState(def, 122016, {
      [QUANG_TRI]: [
        makeToken('eo-multi-t1', 'troops', 'NVA'),
        makeToken('eo-multi-t2', 'troops', 'NVA'),
        makeToken('eo-multi-arvn-1', 'troops', 'ARVN'),
      ],
      [HUE]: [
        makeToken('eo-multi-t3', 'troops', 'NVA'),
        makeToken('eo-multi-t4', 'troops', 'NVA'),
        makeToken('eo-multi-us-1', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // Quang Tri: floor(2/2)=1 ARVN removed
    const arvnQT = countTokens(final, QUANG_TRI,
      (t) => t.props.faction === 'ARVN' && t.type === 'troops');
    assert.equal(arvnQT, 0, 'Quang Tri: floor(2/2)=1 ARVN removed');

    // Hue: floor(2/2)=1 US removed → 1 NVA attrition
    const usHue = countTokens(final, HUE,
      (t) => t.props.faction === 'US' && t.type === 'troops');
    assert.equal(usHue, 0, 'Hue: floor(2/2)=1 US removed');
  });

  // ── NO-OP SCENARIOS ──

  it('no eligible march destinations — Step 1 is no-op', () => {
    const def = compileDef();
    // NVA troops exist but none adjacent to any empty space they can march into
    // Put all NVA troops in filler spaces (auto-setup), no adjacent NVA to test spaces
    const setup = setupEasterOffensiveState(def, 122017, {});

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // Select 0 destinations
    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
    });

    // Should complete without error
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;
    assert.ok(final, 'Event should complete even with 0 march destinations');
  });

  it('no eligible LoCs — Step 2 is no-op', () => {
    const def = compileDef();
    // No NVA troops on any LoC
    const setup = setupEasterOffensiveState(def, 122018, {
      [QUANG_TRI]: [
        makeToken('eo-noloc-t1', 'troops', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // Troop stays in Quang Tri (no LoC movement happened)
    assert.equal(
      countTokens(final, QUANG_TRI, (t) => t.id === asTokenId('eo-noloc-t1')),
      1,
      'NVA troop in province should not be moved by Step 2',
    );
  });

  it('no eligible attack spaces — Step 3 is no-op', () => {
    const def = compileDef();
    // NVA troops exist but no COIN pieces coexist in same space
    const setup = setupEasterOffensiveState(def, 122019, {
      [QUANG_TRI]: [
        makeToken('eo-noatk-t1', 'troops', 'NVA'),
      ],
      [HUE]: [
        makeToken('eo-noatk-us-1', 'troops', 'US'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // US troop in Hue remains (no NVA troops there for attack)
    assert.equal(
      countTokens(final, HUE, (t) => t.props.faction === 'US'),
      1,
      'US troop should remain in Hue (no NVA troops there)',
    );
    // NVA troop in Quang Tri remains (no COIN there for attack)
    assert.equal(
      countTokens(final, QUANG_TRI, (t) => t.props.faction === 'NVA'),
      1,
      'NVA troop should remain in Quang Tri (no COIN there)',
    );
  });

  // ── FULL SEQUENCE ──

  it('full 3-step sequence end-to-end', () => {
    const def = compileDef();
    // Setup: NVA guerrilla+troops in Quang Tri (adjacent to Hue and LoC-Hue-Da Nang),
    // NVA troops on LoC with no US/ARVN,
    // ARVN pieces in Hue for attack target
    const setup = setupEasterOffensiveState(def, 122020, {
      [QUANG_TRI]: [
        makeToken('eo-e2e-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('eo-e2e-t1', 'troops', 'NVA'),
      ],
      [LOC_HUE_KHE_SANH]: [
        makeToken('eo-e2e-loc-t1', 'troops', 'NVA'),
      ],
      [HUE]: [
        makeToken('eo-e2e-arvn-1', 'troops', 'ARVN'),
        makeToken('eo-e2e-arvn-2', 'troops', 'ARVN'),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // Step 1: march guerrilla + troop from Quang Tri to Hue
    // Step 2: move LoC troop to Hue
    // Step 3: attack Hue (NVA troops vs ARVN)
    const overrides = makeEasterOffensiveOverrides({
      marchDestinations: [HUE],
      marchGuerrillas: ['eo-e2e-g1'],
      marchTroops: ['eo-e2e-t1'],
      locTroops: ['eo-e2e-loc-t1'],
      locDest: HUE,
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // After Step 1: Hue has 1 guerrilla + 1 troop + 2 ARVN
    // After Step 2: Hue has 1 guerrilla + 2 troops + 2 ARVN
    // Step 3: 2 NVA troops in Hue → floor(2/2)=1 ARVN removed

    // Verify pieces reached Hue
    const nvaInHue = countTokens(final, HUE, (t) => t.props.faction === 'NVA');
    assert.ok(nvaInHue >= 1, 'NVA pieces should be in Hue after marching');

    // Verify some ARVN were removed by attack
    const arvnInHue = countTokens(final, HUE,
      (t) => t.props.faction === 'ARVN' && t.type === 'troops');
    assert.ok(arvnInHue < 2, 'Attack should have removed at least 1 ARVN troop');

    // Verify LoC is empty
    assert.equal(
      countTokens(final, LOC_HUE_KHE_SANH, (t) => t.props.faction === 'NVA'),
      0,
      'LoC should be empty after troop movement',
    );
  });
});
