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
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones, makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec, getFitlProductionFixture } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-104';

// ── Zones ───────────────────────────────────────────────────────────────

const LOC_HUE_DA_NANG = 'loc-hue-da-nang:none';
const MARCH_ORIGIN = 'quang-nam:none';
const QUANG_NAM = 'quang-nam:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';

// ── Helpers ─────────────────────────────────────────────────────────────

type MarkerState = 'inactive' | 'unshaded' | 'shaded';

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

const countTokens = (
  state: GameState,
  zoneId: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zoneId] ?? []).filter((token) => predicate(token as Token)).length;

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: number,
  eligibility: Readonly<Record<'us' | 'arvn' | 'nva' | 'vc', boolean>>,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc' | null,
  zones: Readonly<Record<string, readonly Token[]>>,
  globalMarkers?: Readonly<Record<string, string>>,
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        seatOrder: ['vc', 'nva', 'us', 'arvn'],
        eligibility,
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
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...zones,
    },
    ...(globalMarkers !== undefined ? { globalMarkers: { ...base.globalMarkers, ...globalMarkers } } : {}),
  };
};

const findMainForceBnsMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

// ── Capability helpers (for mechanical effect tests) ────────────────────

const FITL_PRODUCTION_FIXTURE = getFitlProductionFixture();
assertNoErrors(FITL_PRODUCTION_FIXTURE.parsed);
assert.equal(FITL_PRODUCTION_FIXTURE.compiled.diagnostics.some((d) => d.severity === 'error'), false);
const FITL_PRODUCTION_DEF: GameDef = FITL_PRODUCTION_FIXTURE.gameDef;

const withGlobalMarker = (state: GameState, marker: string, value: MarkerState): GameState => ({
  ...state,
  globalMarkers: {
    ...state.globalMarkers,
    [marker]: value,
  },
});

const addTokenToZone = (state: GameState, zone: string, token: Token): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [zone]: [...(state.zones[zone] ?? []), token],
  },
});

/**
 * Build an isolated initial state with cleared zones for capability testing.
 * Matches the pattern used by the existing March capability tests.
 */
const makeCapabilityState = (
  def: GameDef,
  seed: number,
  activePlayer: number,
  marker: MarkerState,
  extraGlobalVars?: Readonly<Record<string, number | boolean>>,
): GameState => {
  const start = makeIsolatedInitialState(def, seed, 4, { turnOrderMode: 'roundRobin' });
  return withGlobalMarker(
    {
      ...start,
      activePlayer: asPlayerId(activePlayer),
      globalVars: {
        ...start.globalVars,
        ...(extraGlobalVars ?? {}),
      },
    },
    'cap_mainForceBns',
    marker,
  );
};

// ═════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════

describe('FITL card-104 Main Force Bns', () => {
  // ── Metadata & compilation ──────────────────────────────────────────

  it('compiles with correct metadata and rules text', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined, 'card-104 must compile');

    assert.equal(card?.metadata?.period, '1965');
    assert.deepEqual(card?.metadata?.seatOrder, ['VC', 'NVA', 'US', 'ARVN']);
    assert.equal(card?.sideMode, 'dual');
    assert.deepEqual(card?.metadata?.tags ?? card?.tags, ['capability', 'VC']);
    assert.equal(
      card?.unshaded?.text,
      'Capability: March into Support/LoC Activates if moving plus non-Base COIN >1 (vice >3).',
    );
    assert.equal(
      card?.shaded?.text,
      'Capability: 1 VC Ambush space may remove 2 enemy pieces.',
    );
  });

  it('both sides encode set-global-marker effects (no targets, no branches)', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    // Unshaded: pure marker set, no branches, no targets, no freeOperationGrants
    assert.equal(card?.unshaded?.branches, undefined);
    assert.equal(card?.unshaded?.freeOperationGrants, undefined);
    assert.equal(card?.unshaded?.eligibilityOverrides, undefined);

    // Shaded: same — pure marker set
    assert.equal(card?.shaded?.branches, undefined);
    assert.equal(card?.shaded?.freeOperationGrants, undefined);
    assert.equal(card?.shaded?.eligibilityOverrides, undefined);
  });

  // ── Unshaded event execution (marker setting) ──────────────────────

  it('unshaded event sets cap_mainForceBns marker to "unshaded"', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 104001, 2, {
      us: false,
      arvn: false,
      nva: true,
      vc: true,
    }, 'vc', 'nva', {});

    const move = findMainForceBnsMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Main Force Bns unshaded event move');

    const final = applyMove(def, setup, move!).state;
    assert.equal(
      final.globalMarkers?.cap_mainForceBns,
      'unshaded',
      'Playing unshaded should set cap_mainForceBns to "unshaded"',
    );
  });

  it('unshaded overwrites existing shaded marker', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(
      def, 104002, 2,
      { us: false, arvn: false, nva: true, vc: true },
      'vc', 'nva', {},
      { cap_mainForceBns: 'shaded' },
    );

    const move = findMainForceBnsMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined);

    const final = applyMove(def, setup, move!).state;
    assert.equal(
      final.globalMarkers?.cap_mainForceBns,
      'unshaded',
      'Playing unshaded when marker was shaded should overwrite to "unshaded"',
    );
  });

  // ── Shaded event execution (marker setting) ────────────────────────

  it('shaded event sets cap_mainForceBns marker to "shaded"', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 104003, 2, {
      us: false,
      arvn: false,
      nva: true,
      vc: true,
    }, 'vc', 'nva', {});

    const move = findMainForceBnsMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Main Force Bns shaded event move');

    const final = applyMove(def, setup, move!).state;
    assert.equal(
      final.globalMarkers?.cap_mainForceBns,
      'shaded',
      'Playing shaded should set cap_mainForceBns to "shaded"',
    );
  });

  it('shaded overwrites existing unshaded marker', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(
      def, 104004, 2,
      { us: false, arvn: false, nva: true, vc: true },
      'vc', 'nva', {},
      { cap_mainForceBns: 'unshaded' },
    );

    const move = findMainForceBnsMove(def, setup, 'shaded');
    assert.notEqual(move, undefined);

    const final = applyMove(def, setup, move!).state;
    assert.equal(
      final.globalMarkers?.cap_mainForceBns,
      'shaded',
      'Playing shaded when marker was unshaded should overwrite to "shaded"',
    );
  });

  // ── Unshaded mechanical effect — March maxActivatedGuerrillas ──────
  //
  // The unshaded cap raises maxActivatedGuerrillas from 1 (default) to 99.
  // With 2+ movers to a LoC/Support destination, the default only activates 1
  // guerrilla; unshaded allows all to activate.

  it('unshaded March allows all movers to activate (max 99 vs default max 1)', () => {
    const mover1 = asTokenId('mfb-march-g1');
    const mover2 = asTokenId('mfb-march-g2');
    const start = makeCapabilityState(FITL_PRODUCTION_DEF, 104100, 3, 'unshaded', { vcResources: 6 });

    const setup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(start, MARCH_ORIGIN, makeToken('mfb-march-g1', 'guerrilla', 'VC', { activity: 'underground' })),
          MARCH_ORIGIN,
          makeToken('mfb-march-g2', 'guerrilla', 'VC', { activity: 'underground' }),
        ),
        LOC_HUE_DA_NANG,
        makeToken('mfb-march-us1', 'troops', 'US'),
      ),
      LOC_HUE_DA_NANG,
      makeToken('mfb-march-us2', 'troops', 'US'),
    );

    const final = applyMoveWithResolvedDecisionIds(FITL_PRODUCTION_DEF, setup, {
      actionId: asActionId('march'),
      params: {
        $targetSpaces: [LOC_HUE_DA_NANG],
        [`$movingGuerrillas@${LOC_HUE_DA_NANG}`]: [mover1, mover2],
        [`$movingTroops@${LOC_HUE_DA_NANG}`]: [],
      },
    }).state;

    assert.equal(
      countTokens(final, LOC_HUE_DA_NANG, (t) =>
        t.props.faction === 'VC' && t.type === 'guerrilla' && t.props.activity === 'active'),
      2,
      'Unshaded cap should allow both moved VC guerrillas to activate',
    );
  });

  it('inactive/shaded March caps activation at 1 guerrilla (default max)', () => {
    const run = (marker: MarkerState, seed: number): GameState => {
      const mover1 = asTokenId(`mfb-${marker}-g1`);
      const mover2 = asTokenId(`mfb-${marker}-g2`);
      const start = makeCapabilityState(FITL_PRODUCTION_DEF, seed, 3, marker, { vcResources: 6 });

      const setup = addTokenToZone(
        addTokenToZone(
          addTokenToZone(
            addTokenToZone(start, MARCH_ORIGIN, makeToken(`mfb-${marker}-g1`, 'guerrilla', 'VC', { activity: 'underground' })),
            MARCH_ORIGIN,
            makeToken(`mfb-${marker}-g2`, 'guerrilla', 'VC', { activity: 'underground' }),
          ),
          LOC_HUE_DA_NANG,
          makeToken(`mfb-${marker}-us1`, 'troops', 'US'),
        ),
        LOC_HUE_DA_NANG,
        makeToken(`mfb-${marker}-us2`, 'troops', 'US'),
      );

      return applyMoveWithResolvedDecisionIds(FITL_PRODUCTION_DEF, setup, {
        actionId: asActionId('march'),
        params: {
          $targetSpaces: [LOC_HUE_DA_NANG],
          [`$movingGuerrillas@${LOC_HUE_DA_NANG}`]: [mover1, mover2],
          [`$movingTroops@${LOC_HUE_DA_NANG}`]: [],
        },
      }).state;
    };

    const inactive = run('inactive', 104101);
    const shaded = run('shaded', 104102);

    assert.equal(
      countTokens(inactive, LOC_HUE_DA_NANG, (t) =>
        t.props.faction === 'VC' && t.type === 'guerrilla' && t.props.activity === 'active'),
      1,
      'Inactive cap should limit March activation to max 1 guerrilla',
    );
    assert.equal(
      countTokens(shaded, LOC_HUE_DA_NANG, (t) =>
        t.props.faction === 'VC' && t.type === 'guerrilla' && t.props.activity === 'active'),
      1,
      'Shaded cap should not grant the unshaded March activation bonus',
    );
  });

  it('unshaded March activates on LoC destination (no support required)', () => {
    // LoC spaces don't have support levels — activation triggers from threshold alone.
    // Threshold: moving + non-Base COIN > 3. 2 movers + 2 COIN = 4 > 3 → activation.
    const mover1 = asTokenId('mfb-loc-g1');
    const mover2 = asTokenId('mfb-loc-g2');
    const start = makeCapabilityState(FITL_PRODUCTION_DEF, 104103, 3, 'unshaded', { vcResources: 6 });

    const setup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(start, MARCH_ORIGIN, makeToken('mfb-loc-g1', 'guerrilla', 'VC', { activity: 'underground' })),
          MARCH_ORIGIN,
          makeToken('mfb-loc-g2', 'guerrilla', 'VC', { activity: 'underground' }),
        ),
        LOC_HUE_DA_NANG,
        makeToken('mfb-loc-us1', 'troops', 'US'),
      ),
      LOC_HUE_DA_NANG,
      makeToken('mfb-loc-us2', 'troops', 'US'),
    );

    const final = applyMoveWithResolvedDecisionIds(FITL_PRODUCTION_DEF, setup, {
      actionId: asActionId('march'),
      params: {
        $targetSpaces: [LOC_HUE_DA_NANG],
        [`$movingGuerrillas@${LOC_HUE_DA_NANG}`]: [mover1, mover2],
        [`$movingTroops@${LOC_HUE_DA_NANG}`]: [],
      },
    }).state;

    assert.equal(
      countTokens(final, LOC_HUE_DA_NANG, (t) =>
        t.props.faction === 'VC' && t.type === 'guerrilla' && t.props.activity === 'active'),
      2,
      'Both guerrillas should activate on LoC destination with unshaded cap',
    );
  });

  it('unshaded March activates on Support destination', () => {
    // Province with Active Support + sufficient COIN presence.
    // Threshold: moving + non-Base COIN > 3. 2 movers + 2 COIN = 4 > 3 → activation.
    const mover1 = asTokenId('mfb-sup-g1');
    const mover2 = asTokenId('mfb-sup-g2');
    const supportSpace = QUANG_TRI;
    const start = makeCapabilityState(FITL_PRODUCTION_DEF, 104104, 3, 'unshaded', { vcResources: 6 });

    const withSupportMarker: GameState = {
      ...start,
      markers: {
        ...start.markers,
        [supportSpace]: {
          ...(start.markers[supportSpace] ?? {}),
          supportOpposition: 'activeSupport',
        },
      },
    };

    const setup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(withSupportMarker, MARCH_ORIGIN, makeToken('mfb-sup-g1', 'guerrilla', 'VC', { activity: 'underground' })),
          MARCH_ORIGIN,
          makeToken('mfb-sup-g2', 'guerrilla', 'VC', { activity: 'underground' }),
        ),
        supportSpace,
        makeToken('mfb-sup-us1', 'troops', 'US'),
      ),
      supportSpace,
      makeToken('mfb-sup-us2', 'troops', 'US'),
    );

    const final = applyMoveWithResolvedDecisionIds(FITL_PRODUCTION_DEF, setup, {
      actionId: asActionId('march'),
      params: {
        $targetSpaces: [supportSpace],
        [`$movingGuerrillas@${supportSpace}`]: [mover1, mover2],
        [`$movingTroops@${supportSpace}`]: [],
      },
    }).state;

    assert.equal(
      countTokens(final, supportSpace, (t) =>
        t.props.faction === 'VC' && t.type === 'guerrilla' && t.props.activity === 'active'),
      2,
      'Both guerrillas should activate in Support province with unshaded cap',
    );
  });

  // ── Shaded mechanical effect — VC Ambush removal budget ────────────
  //
  // The shaded cap raises the Ambush removalBudgetExpr from 1 to 2 per space.
  // This budget applies to EVERY ambushed space, not just one.

  it('shaded VC Ambush removes 2 enemy pieces instead of 1 in a single space', () => {
    const space = QUANG_NAM;
    const start = makeCapabilityState(FITL_PRODUCTION_DEF, 104200, 3, 'shaded');

    const setup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(start, space, makeToken('mfb-amb-vc-g', 'guerrilla', 'VC', { activity: 'underground' })),
        space,
        makeToken('mfb-amb-us1', 'troops', 'US'),
      ),
      space,
      makeToken('mfb-amb-us2', 'troops', 'US'),
    );

    const final = applyMoveWithResolvedDecisionIds(FITL_PRODUCTION_DEF, setup, {
      actionId: asActionId('ambushVc'),
      params: {
        $targetSpaces: [space],
        [`$ambushTargetMode@${space}`]: 'self',
      },
    }).state;

    assert.equal(
      (final.zones['casualties-US:none'] ?? []).length,
      2,
      'Shaded cap should remove 2 enemy pieces in VC Ambush',
    );
  });

  it('shaded VC Ambush clamps to 1 when only 1 enemy piece exists', () => {
    const space = QUANG_NAM;
    const start = makeCapabilityState(FITL_PRODUCTION_DEF, 104201, 3, 'shaded');

    const setup = addTokenToZone(
      addTokenToZone(start, space, makeToken('mfb-clamp-vc-g', 'guerrilla', 'VC', { activity: 'underground' })),
      space,
      makeToken('mfb-clamp-us1', 'troops', 'US'),
    );

    const final = applyMoveWithResolvedDecisionIds(FITL_PRODUCTION_DEF, setup, {
      actionId: asActionId('ambushVc'),
      params: {
        $targetSpaces: [space],
        [`$ambushTargetMode@${space}`]: 'self',
      },
    }).state;

    assert.equal(
      (final.zones['casualties-US:none'] ?? []).length,
      1,
      'Shaded cap should clamp to 1 removal when only 1 enemy piece is present',
    );
  });

  it('shaded VC Ambush removes non-base pieces before bases (priority ordering)', () => {
    const space = QUANG_NAM;
    const start = makeCapabilityState(FITL_PRODUCTION_DEF, 104202, 3, 'shaded');

    // 2 US troops + 1 US base — budget=2 should remove 2 troops, base stays
    const setup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(start, space, makeToken('mfb-pri-vc-g', 'guerrilla', 'VC', { activity: 'underground' })),
          space,
          makeToken('mfb-pri-us-troop1', 'troops', 'US'),
        ),
        space,
        makeToken('mfb-pri-us-troop2', 'troops', 'US'),
      ),
      space,
      makeToken('mfb-pri-us-base', 'base', 'US'),
    );

    const final = applyMoveWithResolvedDecisionIds(FITL_PRODUCTION_DEF, setup, {
      actionId: asActionId('ambushVc'),
      params: {
        $targetSpaces: [space],
        [`$ambushTargetMode@${space}`]: 'self',
      },
    }).state;

    // Both troops should be removed (to casualties), base should remain
    assert.equal(
      (final.zones['casualties-US:none'] ?? []).length,
      2,
      'Both US troops should go to casualties',
    );
    assert.equal(
      countTokens(final, space, (t) => String(t.id) === 'mfb-pri-us-base'),
      1,
      'US base should remain in space (troops removed first by priority)',
    );
  });

  it('shaded VC Ambush with mixed COIN factions removes from multiple factions', () => {
    const space = QUANG_NAM;
    const start = makeCapabilityState(FITL_PRODUCTION_DEF, 104203, 3, 'shaded');

    const setup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(start, space, makeToken('mfb-mix-vc-g', 'guerrilla', 'VC', { activity: 'underground' })),
        space,
        makeToken('mfb-mix-us1', 'troops', 'US'),
      ),
      space,
      makeToken('mfb-mix-arvn1', 'troops', 'ARVN'),
    );

    const final = applyMoveWithResolvedDecisionIds(FITL_PRODUCTION_DEF, setup, {
      actionId: asActionId('ambushVc'),
      params: {
        $targetSpaces: [space],
        [`$ambushTargetMode@${space}`]: 'self',
      },
    }).state;

    // US troop → casualties-US, ARVN troop → available-ARVN
    const usCasualties = countTokens(final, 'casualties-US:none', (t) =>
      String(t.id) === 'mfb-mix-us1');
    const arvnAvailable = countTokens(final, 'available-ARVN:none', (t) =>
      String(t.id) === 'mfb-mix-arvn1');

    assert.equal(usCasualties + arvnAvailable, 2, 'Both COIN pieces should be removed from the space');
    assert.equal(
      countTokens(final, space, (t) =>
        (t.props.faction === 'US' || t.props.faction === 'ARVN') && t.type === 'troops'),
      0,
      'No COIN troops should remain in the ambushed space',
    );
  });

  it('2-space VC Ambush: shaded budget=2 applies to every ambushed space', () => {
    // The profile sets removalBudgetExpr=2 for ALL spaces, not just one.
    const spaceA = QUANG_NAM;
    const spaceB = QUANG_TRI;
    const start = makeCapabilityState(FITL_PRODUCTION_DEF, 104204, 3, 'shaded');

    const setup = addTokenToZone(
      addTokenToZone(
        addTokenToZone(
          addTokenToZone(
            addTokenToZone(
              addTokenToZone(start, spaceA, makeToken('mfb-2sp-vc-gA', 'guerrilla', 'VC', { activity: 'underground' })),
              spaceA,
              makeToken('mfb-2sp-us1A', 'troops', 'US'),
            ),
            spaceA,
            makeToken('mfb-2sp-us2A', 'troops', 'US'),
          ),
          spaceB,
          makeToken('mfb-2sp-vc-gB', 'guerrilla', 'VC', { activity: 'underground' }),
        ),
        spaceB,
        makeToken('mfb-2sp-us1B', 'troops', 'US'),
      ),
      spaceB,
      makeToken('mfb-2sp-us2B', 'troops', 'US'),
    );

    const final = applyMoveWithResolvedDecisionIds(FITL_PRODUCTION_DEF, setup, {
      actionId: asActionId('ambushVc'),
      params: {
        $targetSpaces: [spaceA, spaceB],
        [`$ambushTargetMode@${spaceA}`]: 'self',
        [`$ambushTargetMode@${spaceB}`]: 'self',
      },
    }).state;

    // Budget=2 per space × 2 spaces = 4 total removals
    const totalUsCasualties = (final.zones['casualties-US:none'] ?? []).length;
    assert.equal(
      totalUsCasualties,
      4,
      '2-space VC Ambush with shaded cap: budget=2 per space × 2 spaces = 4 total removals',
    );
  });

  it('inactive/unshaded cap preserves single removal per VC Ambush space', () => {
    const space = QUANG_NAM;

    const run = (marker: MarkerState, seed: number): GameState => {
      const start = makeCapabilityState(FITL_PRODUCTION_DEF, seed, 3, marker);

      const setup = addTokenToZone(
        addTokenToZone(
          addTokenToZone(start, space, makeToken(`mfb-ctrl-${marker}-g`, 'guerrilla', 'VC', { activity: 'underground' })),
          space,
          makeToken(`mfb-ctrl-${marker}-us1`, 'troops', 'US'),
        ),
        space,
        makeToken(`mfb-ctrl-${marker}-us2`, 'troops', 'US'),
      );

      return applyMoveWithResolvedDecisionIds(FITL_PRODUCTION_DEF, setup, {
        actionId: asActionId('ambushVc'),
        params: {
          $targetSpaces: [space],
          [`$ambushTargetMode@${space}`]: 'self',
        },
      }).state;
    };

    const inactive = run('inactive', 104205);
    const unshaded = run('unshaded', 104206);

    assert.equal(
      (inactive.zones['casualties-US:none'] ?? []).length,
      1,
      'Inactive cap should only remove 1 enemy piece per Ambush space',
    );
    assert.equal(
      (unshaded.zones['casualties-US:none'] ?? []).length,
      1,
      'Unshaded cap should only remove 1 enemy piece per Ambush space (double removal is shaded-only)',
    );
  });
});
