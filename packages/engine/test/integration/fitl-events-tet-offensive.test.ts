// @test-class: architectural-invariant
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

const CARD_ID = 'card-124';

// South Vietnam cities
const SAIGON = 'saigon:none';
const HUE = 'hue:none';
const DA_NANG = 'da-nang:none';
// South Vietnam provinces
const QUANG_TRI = 'quang-tri-thua-thien:none';

// South Vietnam LoC
const LOC_HUE_DA_NANG = 'loc-hue-da-nang:none';


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
 * Sets up a card-driven state for Tet Offensive testing.
 * The play condition requires leaderBoxCardCount >= 2 AND >20 VC guerrillas in SV.
 * This helper automatically satisfies the play condition by placing extra VC guerrillas
 * in SV spaces that are NOT in the `zones` override (to avoid interference with test setups).
 */
const setupTetState = (
  def: GameDef,
  seed: number,
  zones: Readonly<Record<string, readonly Token[]>>,
  options?: {
    readonly markers?: Readonly<Record<string, Record<string, unknown>>>;
    readonly globalVars?: Readonly<Record<string, number>>;
    readonly globalMarkers?: Readonly<Record<string, string>>;
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

  // Auto-satisfy play condition: place 22 ACTIVE VC guerrillas in filler SV spaces.
  // Using active (not underground) guerrillas so they count for the play condition
  // (>20 VC guerrillas in SV) but do NOT trigger the terror chooseN
  // (which only matches underground VC). This avoids marker shift issues in filler spaces.
  const fillerSpaces = [
    'binh-dinh:none', 'pleiku-darlac:none', 'phu-bon-phu-yen:none',
    'khanh-hoa:none', 'binh-tuy-binh-thuan:none', 'quang-duc-long-khanh:none',
    'tay-ninh:none', 'phuoc-long:none', 'kien-phong:none',
    'kien-hoa-vinh-binh:none', 'ba-xuyen:none',
  ];
  if (!options?.skipPlayConditionSetup) {
    let placed = 0;
    for (const space of fillerSpaces) {
      if (placed >= 22) break;
      if (builtZones[space] !== undefined) continue;
      builtZones[space] = [];
      for (let j = 0; j < 2 && placed < 22; j++) {
        builtZones[space]!.push(
          makeToken(`tet-filler-${placed}`, 'guerrilla', 'VC', { activity: 'active' }),
        );
        placed++;
      }
    }
  }

  let state: GameState = {
    ...baseState,
    activePlayer: asPlayerId(3), // VC
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: 'vc',
          secondEligible: 'nva',
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
      leaderBoxCardCount: 2, // satisfy play condition
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
 * Standard overrides for Tet Offensive event execution.
 * The chooseN for terror spaces is mandatory (min=max=eligible count),
 * so we must supply ALL eligible spaces. The order controls marker assignment priority.
 */
const makeTetOverrides = (terrorSpaceOrder: readonly string[], extraOverrides?: readonly DecisionOverrideRule[]): readonly DecisionOverrideRule[] => [
  {
    when: (request) => request.decisionKey.includes('tetTerrorSpaces'),
    value: terrorSpaceOrder,
  },
  {
    when: (request) => request.decisionKey.includes('distributeTokens'),
    value: [],
  },
  ...(extraOverrides ?? []),
];

describe('FITL card-124 Tet Offensive', () => {
  // ── STEP 1: Free Terror ──

  it('Step 1: Free Terror in SV spaces with underground VC — activates guerrilla, places terror, costs 0 resources', () => {
    const def = compileDef();
    // Place underground VC in exactly one SV province (+ filler guerrillas elsewhere)
    const setup = setupTetState(def, 124001, {
      [QUANG_TRI]: [
        makeToken('tet-vc-g1', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
      'available-VC:none': [],
    }, {
      markers: { [QUANG_TRI]: { supportOpposition: 'neutral' } },
    });

    const vcResourcesBefore = (setup.globalVars as Record<string, number>).vcResources ?? 0;
    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Tet Offensive unshaded event move should be legal');

    // All filler spaces also have underground VC — collect all eligible spaces
    // The test just needs to include QUANG_TRI plus all filler spaces
    const allEligibleSpaces: string[] = [];
    for (const [zoneId, tokens] of Object.entries(setup.zones)) {
      if (zoneId.endsWith(':none') && !zoneId.startsWith('available') && !zoneId.startsWith('casualties') && !zoneId.startsWith('out-of-play')) {
        const hasUndergroundVC = (tokens ?? []).some(
          (t) => (t as Token).props.faction === 'VC' && (t as Token).type === 'guerrilla' && (t as Token).props.activity === 'underground',
        );
        if (hasUndergroundVC) {
          allEligibleSpaces.push(zoneId);
        }
      }
    }

    const overrides = makeTetOverrides(allEligibleSpaces);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // Guerrilla in Quang Tri should be activated
    assert.equal(
      countTokens(final, QUANG_TRI, (t) => t.props.faction === 'VC' && t.type === 'guerrilla' && t.props.activity === 'active'),
      1,
      'VC guerrilla in Quang Tri should be activated by free Terror',
    );

    // Resources should NOT decrease (free terror)
    const vcResourcesAfter = (final.globalVars as Record<string, number>).vcResources ?? 0;
    assert.equal(vcResourcesAfter, vcResourcesBefore, 'Free Terror should not cost VC resources');
  });

  it('Step 1: SV spaces with only active VC guerrillas are skipped', () => {
    const def = compileDef();
    const setup = setupTetState(def, 124003, {
      [QUANG_TRI]: [
        makeToken('tet-active-vc-g1', 'guerrilla', 'VC', { activity: 'active' }),
      ],
      'available-VC:none': [],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // Quang Tri should NOT be in eligible spaces since it only has active guerrillas
    const allEligibleSpaces: string[] = [];
    for (const [zoneId, tokens] of Object.entries(setup.zones)) {
      if (zoneId.endsWith(':none') && !zoneId.startsWith('available') && !zoneId.startsWith('casualties') && !zoneId.startsWith('out-of-play')) {
        const hasUndergroundVC = (tokens ?? []).some(
          (t) => (t as Token).props.faction === 'VC' && (t as Token).type === 'guerrilla' && (t as Token).props.activity === 'underground',
        );
        if (hasUndergroundVC) allEligibleSpaces.push(zoneId);
      }
    }
    assert.equal(allEligibleSpaces.includes(QUANG_TRI), false, 'Quang Tri with only active VC should not be eligible');

    const overrides = makeTetOverrides(allEligibleSpaces);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // Active guerrilla should remain active (untouched by terror)
    assert.equal(
      countTokens(final, QUANG_TRI, (t) => t.props.faction === 'VC' && t.props.activity === 'active'),
      1,
      'Active VC guerrilla should remain active',
    );
  });

  it('Step 1: LoC spaces get sabotage marker instead of terror', () => {
    const def = compileDef();
    const setup = setupTetState(def, 124004, {
      [LOC_HUE_DA_NANG]: [
        makeToken('tet-loc-vc-g1', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
      'available-VC:none': [],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const allEligibleSpaces: string[] = [];
    for (const [zoneId, tokens] of Object.entries(setup.zones)) {
      if (zoneId.endsWith(':none') && !zoneId.startsWith('available') && !zoneId.startsWith('casualties') && !zoneId.startsWith('out-of-play')) {
        const hasUndergroundVC = (tokens ?? []).some(
          (t) => (t as Token).props.faction === 'VC' && (t as Token).type === 'guerrilla' && (t as Token).props.activity === 'underground',
        );
        if (hasUndergroundVC) allEligibleSpaces.push(zoneId);
      }
    }

    const overrides = makeTetOverrides(allEligibleSpaces);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      (final.markers[LOC_HUE_DA_NANG] as Record<string, unknown>)?.sabotage,
      'sabotage',
      'LoC space should get sabotage marker from free Terror',
    );
  });

  it('Step 1: support shifts toward opposition when terror marker is placed', () => {
    const def = compileDef();
    const setup = setupTetState(def, 124006, {
      [QUANG_TRI]: [
        makeToken('tet-shift-vc-g1', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
      'available-VC:none': [],
    }, {
      markers: { [QUANG_TRI]: { supportOpposition: 'passiveSupport' } },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const allEligibleSpaces: string[] = [];
    for (const [zoneId, tokens] of Object.entries(setup.zones)) {
      if (zoneId.endsWith(':none') && !zoneId.startsWith('available') && !zoneId.startsWith('casualties') && !zoneId.startsWith('out-of-play')) {
        const hasUndergroundVC = (tokens ?? []).some(
          (t) => (t as Token).props.faction === 'VC' && (t as Token).type === 'guerrilla' && (t as Token).props.activity === 'underground',
        );
        if (hasUndergroundVC) allEligibleSpaces.push(zoneId);
      }
    }
    // Put Quang Tri first so it gets the terror marker before filler spaces
    const orderedSpaces = [QUANG_TRI, ...allEligibleSpaces.filter((s) => s !== QUANG_TRI)];

    const overrides = makeTetOverrides(orderedSpaces);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      (final.markers[QUANG_TRI] as Record<string, unknown>)?.supportOpposition,
      'neutral',
      'Passive Support should shift to Neutral after terror marker placement',
    );
  });

  // ── STEP 2: Place 6 VC pieces ──

  it('Step 2: distributes up to 6 available VC pieces to cities', () => {
    const def = compileDef();
    const setup = setupTetState(def, 124010, {
      'available-VC:none': [
        makeToken('tet-avail-vc-g1', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('tet-avail-vc-g2', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('tet-avail-vc-g3', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('tet-avail-vc-g4', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('tet-avail-vc-g5', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('tet-avail-vc-g6', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('tet-avail-vc-g7', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    // Collect eligible terror spaces (filler spaces)
    const allEligibleSpaces: string[] = [];
    for (const [zoneId, tokens] of Object.entries(setup.zones)) {
      if (zoneId.endsWith(':none') && !zoneId.startsWith('available') && !zoneId.startsWith('casualties') && !zoneId.startsWith('out-of-play')) {
        const hasUndergroundVC = (tokens ?? []).some(
          (t) => (t as Token).props.faction === 'VC' && (t as Token).type === 'guerrilla' && (t as Token).props.activity === 'underground',
        );
        if (hasUndergroundVC) allEligibleSpaces.push(zoneId);
      }
    }

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.decisionKey.includes('tetTerrorSpaces'),
        value: allEligibleSpaces,
      },
      {
        when: (request) => request.decisionKey.includes('distributeTokens') && request.decisionKey.includes('selectTokens'),
        value: [
          asTokenId('tet-avail-vc-g1'), asTokenId('tet-avail-vc-g2'),
          asTokenId('tet-avail-vc-g3'), asTokenId('tet-avail-vc-g4'),
          asTokenId('tet-avail-vc-g5'), asTokenId('tet-avail-vc-g6'),
        ],
      },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[0]'), value: SAIGON },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[1]'), value: SAIGON },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[2]'), value: HUE },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[3]'), value: HUE },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[4]'), value: DA_NANG },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[5]'), value: DA_NANG },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'available-VC:none', (t) => t.props.faction === 'VC'),
      1,
      'Should have 1 VC piece remaining in Available after placing 6',
    );
    assert.equal(countTokens(final, SAIGON, (t) => t.props.faction === 'VC'), 2, 'Saigon should have 2 VC pieces');
    assert.equal(countTokens(final, HUE, (t) => t.props.faction === 'VC'), 2, 'Hue should have 2 VC pieces');
    assert.equal(countTokens(final, DA_NANG, (t) => t.props.faction === 'VC'), 2, 'Da Nang should have 2 VC pieces');
  });

  // ── STEP 3: Combined Attack ──

  it('Step 3: combined VC+NVA attack activates all guerrillas', () => {
    const def = compileDef();
    // Put guerrillas + COIN in Saigon for attack
    const setup = setupTetState(def, 124012, {
      [SAIGON]: [
        makeToken('tet-atk-vc-g1', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('tet-atk-nva-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('tet-atk-us-t1', 'troops', 'US'),
      ],
      'available-VC:none': [],
      'casualties-US:none': [],
      'available-ARVN:none': [],
      'available-NVA:none': [],
    }, {
      markers: { [SAIGON]: { supportOpposition: 'neutral' } },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const allEligibleSpaces: string[] = [];
    for (const [zoneId, tokens] of Object.entries(setup.zones)) {
      if (zoneId.endsWith(':none') && !zoneId.startsWith('available') && !zoneId.startsWith('casualties') && !zoneId.startsWith('out-of-play')) {
        const hasUndergroundVC = (tokens ?? []).some(
          (t) => (t as Token).props.faction === 'VC' && (t as Token).type === 'guerrilla' && (t as Token).props.activity === 'underground',
        );
        if (hasUndergroundVC) allEligibleSpaces.push(zoneId);
      }
    }

    const overrides = makeTetOverrides(allEligibleSpaces);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // All guerrillas in Saigon should be activated
    assert.equal(
      countTokens(final, SAIGON, (t) =>
        (t.props.faction === 'VC' || t.props.faction === 'NVA')
        && t.type === 'guerrilla'
        && t.props.activity === 'underground',
      ),
      0,
      'All VC and NVA guerrillas in Saigon should be activated after combined attack',
    );
  });

  it('Step 3: spaces without COIN enemies are not attacked', () => {
    const def = compileDef();
    // VC + NVA guerrillas but no COIN
    const setup = setupTetState(def, 124015, {
      [QUANG_TRI]: [
        makeToken('tet-no-enemy-vc-g1', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('tet-no-enemy-nva-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
      'available-VC:none': [],
    }, {
      markers: { [QUANG_TRI]: { supportOpposition: 'neutral' } },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const allEligibleSpaces: string[] = [];
    for (const [zoneId, tokens] of Object.entries(setup.zones)) {
      if (zoneId.endsWith(':none') && !zoneId.startsWith('available') && !zoneId.startsWith('casualties') && !zoneId.startsWith('out-of-play')) {
        const hasUndergroundVC = (tokens ?? []).some(
          (t) => (t as Token).props.faction === 'VC' && (t as Token).type === 'guerrilla' && (t as Token).props.activity === 'underground',
        );
        if (hasUndergroundVC) allEligibleSpaces.push(zoneId);
      }
    }

    const overrides = makeTetOverrides(allEligibleSpaces);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // VC guerrilla activated by terror (Step 1), NVA guerrilla not activated (no attack — no COIN)
    // Terror activates exactly 1 VC guerrilla; NVA guerrilla isn't targeted by terror
    const vcInQT = countTokens(final, QUANG_TRI, (t) => t.props.faction === 'VC' && t.type === 'guerrilla');
    const nvaInQT = countTokens(final, QUANG_TRI, (t) => t.props.faction === 'NVA' && t.type === 'guerrilla');
    assert.equal(vcInQT + nvaInQT, 2, 'Both guerrillas should remain in Quang Tri (no attack without COIN)');
    assert.equal(
      countTokens(final, QUANG_TRI, (t) => t.props.faction === 'NVA' && t.type === 'guerrilla' && t.props.activity === 'underground'),
      1,
      'NVA guerrilla should remain underground (no attack triggered)',
    );
  });

  // ── FULL SEQUENCE ──

  it('full sequence: Step 1 terror + Step 2 place + Step 3 attack', () => {
    const def = compileDef();
    const setup = setupTetState(def, 124017, {
      // Step 1: underground VC in Quang Tri for terror
      [QUANG_TRI]: [
        makeToken('tet-full-vc-g1', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
      // Step 3: guerrillas + COIN in Saigon for attack
      [SAIGON]: [
        makeToken('tet-full-vc-g2', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('tet-full-nva-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('tet-full-us-t1', 'troops', 'US'),
      ],
      // Step 2: available VC pieces
      'available-VC:none': [
        makeToken('tet-full-avail-1', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('tet-full-avail-2', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
      'casualties-US:none': [],
      'available-NVA:none': [],
    }, {
      markers: {
        [QUANG_TRI]: { supportOpposition: 'neutral' },
        [SAIGON]: { supportOpposition: 'neutral' },
      },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const allEligibleSpaces: string[] = [];
    for (const [zoneId, tokens] of Object.entries(setup.zones)) {
      if (zoneId.endsWith(':none') && !zoneId.startsWith('available') && !zoneId.startsWith('casualties') && !zoneId.startsWith('out-of-play')) {
        const hasUndergroundVC = (tokens ?? []).some(
          (t) => (t as Token).props.faction === 'VC' && (t as Token).type === 'guerrilla' && (t as Token).props.activity === 'underground',
        );
        if (hasUndergroundVC) allEligibleSpaces.push(zoneId);
      }
    }

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.decisionKey.includes('tetTerrorSpaces'),
        value: allEligibleSpaces,
      },
      {
        // Step 2: place 2 VC pieces in Saigon
        when: (request) => request.decisionKey.includes('distributeTokens') && request.decisionKey.includes('selectTokens'),
        value: [asTokenId('tet-full-avail-1'), asTokenId('tet-full-avail-2')],
      },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[0]'), value: SAIGON },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[1]'), value: SAIGON },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    // Step 1: Quang Tri guerrilla activated
    assert.equal(
      countTokens(final, QUANG_TRI, (t) => t.props.faction === 'VC' && t.props.activity === 'active'),
      1,
      'Step 1: Quang Tri VC guerrilla should be activated by terror',
    );

    // Step 2: VC pieces placed in Saigon
    assert.equal(
      countTokens(final, 'available-VC:none', (t) => t.props.faction === 'VC'),
      0,
      'Step 2: all available VC pieces should have been placed',
    );

    // Step 3: Saigon guerrillas activated for attack
    assert.equal(
      countTokens(final, SAIGON, (t) =>
        (t.props.faction === 'VC' || t.props.faction === 'NVA')
        && t.type === 'guerrilla'
        && t.props.activity === 'underground',
      ),
      0,
      'Step 3: all Saigon guerrillas should be activated for combined attack',
    );
  });

  it('Step 1: all 15 markers already placed — guerrillas still activate but no marker placed', () => {
    const def = compileDef();
    const setup = setupTetState(def, 124020, {
      [QUANG_TRI]: [
        makeToken('tet-full-markers-vc-g1', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
      'available-VC:none': [],
    }, {
      markers: { [QUANG_TRI]: { supportOpposition: 'neutral' } },
      globalVars: { terrorSabotageMarkersPlaced: 15, leaderBoxCardCount: 2 },
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const allEligibleSpaces: string[] = [];
    for (const [zoneId, tokens] of Object.entries(setup.zones)) {
      if (zoneId.endsWith(':none') && !zoneId.startsWith('available') && !zoneId.startsWith('casualties') && !zoneId.startsWith('out-of-play')) {
        const hasUndergroundVC = (tokens ?? []).some(
          (t) => (t as Token).props.faction === 'VC' && (t as Token).type === 'guerrilla' && (t as Token).props.activity === 'underground',
        );
        if (hasUndergroundVC) allEligibleSpaces.push(zoneId);
      }
    }

    const overrides = makeTetOverrides(allEligibleSpaces);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, QUANG_TRI, (t) => t.props.faction === 'VC' && t.props.activity === 'active'),
      1,
      'VC guerrilla should activate even when all markers are exhausted',
    );
    assert.equal(
      (final.globalVars as Record<string, number>).terrorSabotageMarkersPlaced,
      15,
      'Marker count should remain at 15',
    );
  });
});
