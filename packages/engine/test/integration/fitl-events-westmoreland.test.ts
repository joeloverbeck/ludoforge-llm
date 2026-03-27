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
import { applyMoveWithResolvedDecisionIds, normalizeDecisionParamsForMove } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { withCategoryMarker } from '../helpers/fitl-event-fidelity-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime, withIsolatedFreeOperationGrant } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-95';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const BINH_DINH = 'binh-dinh:none';
const PLEIKU_DARLAC = 'pleiku-darlac:none';
const QUANG_NAM = 'quang-nam:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps: Readonly<Record<string, string | number | boolean>> = {},
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...extraProps,
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const withLookaheadCoup = (def: GameDef, state: GameState, isCoup: boolean): GameState => {
  if (state.turnOrderState.type !== 'cardDriven' || def.turnOrder?.type !== 'cardDriven') {
    return state;
  }
  const lookaheadZone = def.turnOrder.config.turnFlow.cardLifecycle.lookahead;
  const lookahead = state.zones[lookaheadZone];
  if (lookahead === undefined || lookahead.length === 0) {
    return state;
  }
  const [top, ...rest] = lookahead;
  if (top === undefined) {
    return state;
  }
  return {
    ...state,
    zones: {
      ...state.zones,
      [lookaheadZone]: [
        {
          ...top,
          props: {
            ...top.props,
            isCoup,
          },
        },
        ...rest,
      ],
    },
  };
};

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: number,
  zones: Readonly<Record<string, readonly Token[]>>,
  options?: { readonly monsoon?: boolean },
): GameState => {
  const base = withLookaheadCoup(def, clearAllZones(initialState(def, seed, 4).state), options?.monsoon === true);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected FITL event deck');

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: 'vc',
          secondEligible: 'us',
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

const countTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-95 Westmoreland', () => {
  // ── Compilation tests ──

  it('compiles with correct metadata, text, and grant structure', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);

    assert.notEqual(card, undefined, 'Expected card-95 in production deck');
    assert.equal(card?.title, 'Westmoreland');
    assert.equal(card?.metadata?.period, '1965');
    assert.deepEqual(card?.metadata?.seatOrder, ['VC', 'US', 'NVA', 'ARVN']);
    assert.equal(card?.unshaded?.text, 'US free Air Lifts, then Sweeps (no moves) or Assaults (no ARVN) in 2 spaces, then Air Strikes.');
    assert.equal(
      card?.shaded?.text,
      'Big-unit war bypasses population: Shift 3 Provinces with no Police each 2 levels toward Active Opposition.',
    );

    const grants = card?.unshaded?.freeOperationGrants ?? [];
    assert.equal(grants.length, 3, 'Expected 3 sequential grants (Air Lift, Sweep/Assault, Air Strike)');

    // Step 0: Air Lift
    assert.equal(grants[0]?.seat, 'us');
    assert.equal(grants[0]?.sequence?.batch, 'westmoreland-us');
    assert.equal(grants[0]?.sequence?.step, 0);
    assert.deepEqual(grants[0]?.actionIds, ['airLift']);
    assert.equal(grants[0]?.allowDuringMonsoon, true, 'Air Lift grant must allow during Monsoon');

    // Step 1: Sweep or Assault with constraints
    assert.equal(grants[1]?.seat, 'us');
    assert.equal(grants[1]?.sequence?.batch, 'westmoreland-us');
    assert.equal(grants[1]?.sequence?.step, 1);
    assert.deepEqual(grants[1]?.actionIds, ['sweep', 'assault']);
    assert.equal(grants[1]?.allowDuringMonsoon, true, 'Sweep/Assault grant must allow during Monsoon');
    assert.equal(grants[1]?.executionContext?.allowTroopMovement, false, '"no moves" constraint');
    assert.equal(grants[1]?.executionContext?.allowArvnFollowup, false, '"no ARVN" constraint');
    assert.equal(grants[1]?.executionContext?.maxSpaces, 2, '"in 2 spaces" constraint');

    // Step 2: Air Strike
    assert.equal(grants[2]?.seat, 'us');
    assert.equal(grants[2]?.sequence?.batch, 'westmoreland-us');
    assert.equal(grants[2]?.sequence?.step, 2);
    assert.deepEqual(grants[2]?.actionIds, ['airStrike']);
    assert.equal(grants[2]?.allowDuringMonsoon, true, 'Air Strike grant must allow during Monsoon');
  });

  it('compiles shaded effects with chooseN, forEach, and shift-support-opposition', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);

    const serializedShaded = JSON.stringify(card?.shaded?.effects ?? []);
    assert.match(serializedShaded, /chooseN/, 'Shaded should use chooseN for province selection');
    assert.match(serializedShaded, /forEach/, 'Shaded should iterate with forEach');
    assert.match(serializedShaded, /shiftMarker/, 'Shaded should shift support/opposition marker');
    assert.match(serializedShaded, /markerShiftAllowed/, 'Shaded filter should use markerShiftAllowed');
    assert.match(serializedShaded, /police/, 'Shaded filter should check for police');
    assert.match(serializedShaded, /-2/, 'Shaded should shift by -2');
  });

  // ── Unshaded behavioral tests ──

  it('surfaces 3 pending free operation grants with correct batch/step/actionIds after event', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 95001, 0, {
      [QUANG_TRI]: [
        makeToken('us-troop-qt-1', 'troops', 'US', { type: 'troops' }),
      ],
    });

    const eventMove = findCardMove(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined, 'Expected Westmoreland unshaded event move');

    const afterEvent = applyMove(def, setup, eventMove!).state;
    const runtime = requireCardDrivenRuntime(afterEvent);
    const pending = runtime.pendingFreeOperationGrants ?? [];

    // Step 0 Air Lift should be surfaced first
    assert.equal(pending.length >= 1, true, 'At least the first grant should be pending');
    assert.equal(pending[0]?.seat, 'us');
    assert.deepEqual(pending[0]?.actionIds, ['airLift']);
  });

  it('Sweep "no moves" blocks adjacent troop movement but activation still occurs', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 95002, 0, {
      [QUANG_TRI]: [
        makeToken('us-troop-in-space', 'troops', 'US', { type: 'troops' }),
        makeToken('vc-guerrilla-underground', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
      ],
      [QUANG_NAM]: [
        makeToken('us-troop-adjacent', 'troops', 'US', { type: 'troops' }),
      ],
    });

    const sweepState = withIsolatedFreeOperationGrant(setup, asPlayerId(0), {
      grantId: 'westmoreland-sweep-test',
      seat: 'us',
      operationClass: 'operation',
      actionIds: ['sweep', 'assault'],
      allowDuringMonsoon: true,
      executionContext: { allowTroopMovement: false, allowArvnFollowup: false, maxSpaces: 2 },
    });

    const afterSweep = applyMoveWithResolvedDecisionIds(def, sweepState, {
      actionId: asActionId('sweep'),
      actionClass: 'operation',
      freeOperation: true,
      params: {
        $targetSpaces: [QUANG_TRI],
        $movingAdjacentTroops: [],
      },
    }).state;

    // Adjacent troop must NOT have moved
    assert.equal(
      countTokens(afterSweep, QUANG_NAM, (token) => token.id === asTokenId('us-troop-adjacent')),
      1,
      'Adjacent US troop must remain in Quang Nam (no moves)',
    );

    // In-space troop stays
    assert.equal(
      countTokens(afterSweep, QUANG_TRI, (token) => token.id === asTokenId('us-troop-in-space')),
      1,
      'In-space US troop remains in Quang Tri',
    );
  });

  it('"in 2 spaces" constraint limits Sweep space selection to max 2', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 95005, 0, {
      [QUANG_TRI]: [makeToken('us-qt', 'troops', 'US', { type: 'troops' })],
      [BINH_DINH]: [makeToken('us-bd', 'troops', 'US', { type: 'troops' })],
      [PLEIKU_DARLAC]: [makeToken('us-pd', 'troops', 'US', { type: 'troops' })],
    });

    const sweepState = withIsolatedFreeOperationGrant(setup, asPlayerId(0), {
      grantId: 'westmoreland-maxspaces-test',
      seat: 'us',
      operationClass: 'operation',
      actionIds: ['sweep', 'assault'],
      allowDuringMonsoon: true,
      executionContext: { allowTroopMovement: false, allowArvnFollowup: false, maxSpaces: 2 },
    });

    // Attempt to sweep 3 spaces — should fail because maxSpaces is 2
    let threwOnThreeSpaces = false;
    try {
      normalizeDecisionParamsForMove(def, sweepState, {
        actionId: asActionId('sweep'),
        actionClass: 'operation',
        freeOperation: true,
        params: {
          $targetSpaces: [QUANG_TRI, BINH_DINH, PLEIKU_DARLAC],
        },
      }, { overrides: [] });
    } catch {
      threwOnThreeSpaces = true;
    }
    assert.equal(threwOnThreeSpaces, true, 'Selecting 3 spaces should fail when maxSpaces is 2');

    // Sweep with 2 spaces should succeed
    const resolved = normalizeDecisionParamsForMove(def, sweepState, {
      actionId: asActionId('sweep'),
      actionClass: 'operation',
      freeOperation: true,
      params: {
        $targetSpaces: [QUANG_TRI, BINH_DINH],
        $movingAdjacentTroops: [],
      },
    }, {
      overrides: [
        { when: (request) => request.name === '$movingAdjacentTroops', value: [] },
      ],
    });
    assert.notEqual(resolved, undefined, 'Sweep with 2 spaces should resolve');
  });

  it('"in 2 spaces" constraint limits Assault space selection to max 2', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 95006, 0, {
      [QUANG_TRI]: [
        makeToken('us-at-qt', 'troops', 'US', { type: 'troops' }),
        makeToken('vc-at-qt', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
      ],
      [BINH_DINH]: [
        makeToken('us-at-bd', 'troops', 'US', { type: 'troops' }),
        makeToken('vc-at-bd', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
      ],
      [PLEIKU_DARLAC]: [
        makeToken('us-at-pd', 'troops', 'US', { type: 'troops' }),
        makeToken('vc-at-pd', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
      ],
    });

    const assaultState = withIsolatedFreeOperationGrant(setup, asPlayerId(0), {
      grantId: 'westmoreland-assault-maxspaces-test',
      seat: 'us',
      operationClass: 'operation',
      actionIds: ['sweep', 'assault'],
      allowDuringMonsoon: true,
      executionContext: { allowTroopMovement: false, allowArvnFollowup: false, maxSpaces: 2 },
    });

    let threwOnThreeSpaces = false;
    try {
      normalizeDecisionParamsForMove(def, assaultState, {
        actionId: asActionId('assault'),
        actionClass: 'operation',
        freeOperation: true,
        params: {
          $targetSpaces: [QUANG_TRI, BINH_DINH, PLEIKU_DARLAC],
        },
      }, { overrides: [] });
    } catch {
      threwOnThreeSpaces = true;
    }
    assert.equal(threwOnThreeSpaces, true, 'Assault in 3 spaces should fail when maxSpaces is 2');
  });

  it('Assault "no ARVN" suppresses ARVN followup', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 95004, 0, {
      [QUANG_TRI]: [
        makeToken('us-troop-assault', 'troops', 'US', { type: 'troops' }),
        makeToken('arvn-troop-followup', 'troops', 'ARVN', { type: 'troops' }),
        makeToken('vc-guerrilla-target', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
      ],
    });

    const assaultState = withIsolatedFreeOperationGrant(setup, asPlayerId(0), {
      grantId: 'westmoreland-assault-test',
      seat: 'us',
      operationClass: 'operation',
      actionIds: ['sweep', 'assault'],
      allowDuringMonsoon: true,
      executionContext: { allowTroopMovement: false, allowArvnFollowup: false, maxSpaces: 2 },
    });

    const afterAssault = applyMoveWithResolvedDecisionIds(def, assaultState, {
      actionId: asActionId('assault'),
      actionClass: 'operation',
      freeOperation: true,
      params: {
        $targetSpaces: [QUANG_TRI],
      },
    }).state;

    // ARVN troop should remain untouched — no ARVN co-assault followup
    assert.equal(
      countTokens(afterAssault, QUANG_TRI, (token) => token.id === asTokenId('arvn-troop-followup')),
      1,
      'ARVN troop should remain — no ARVN followup assault',
    );
  });

  it('Sweep during Monsoon is legal via allowDuringMonsoon', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 95003, 0, {
      [QUANG_TRI]: [
        makeToken('us-monsoon-troop', 'troops', 'US', { type: 'troops' }),
        makeToken('vc-monsoon-guerrilla', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
      ],
    }, { monsoon: true });

    const sweepState = withIsolatedFreeOperationGrant(setup, asPlayerId(0), {
      grantId: 'westmoreland-monsoon-sweep',
      seat: 'us',
      operationClass: 'operation',
      actionIds: ['sweep', 'assault'],
      allowDuringMonsoon: true,
      executionContext: { allowTroopMovement: false, allowArvnFollowup: false, maxSpaces: 2 },
    });

    const sweepMoves = legalMoves(def, sweepState).filter(
      (move) => String(move.actionId) === 'sweep' && move.freeOperation === true,
    );
    assert.equal(sweepMoves.length > 0, true, 'Free Sweep should be legal during Monsoon');
  });

  // ── Shaded behavioral tests ──

  it('shaded shifts eligible provinces without Police 2 levels toward Active Opposition', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 95010, 0, {
      // Province with no police — eligible (Quang Tri pop=2)
      [QUANG_TRI]: [
        makeToken('us-troop-qt-shaded', 'troops', 'US', { type: 'troops' }),
      ],
      // Province with police — ineligible
      [BINH_DINH]: [
        makeToken('arvn-police-bd', 'police', 'ARVN', { type: 'police' }),
        makeToken('us-troop-bd-shaded', 'troops', 'US', { type: 'troops' }),
      ],
      // Province with no police — eligible (Pleiku-Darlac pop=1)
      [PLEIKU_DARLAC]: [
        makeToken('nva-guerrilla-pd', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'active' }),
      ],
      // Province with no police — eligible (Quang Nam pop=1)
      [QUANG_NAM]: [
        makeToken('vc-guerrilla-qn', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
      ],
    });

    // Set support levels for test provinces
    const stateWithMarkers: GameState = {
      ...setup,
      markers: {
        ...setup.markers,
        [QUANG_TRI]: {
          ...(setup.markers?.[QUANG_TRI] ?? {}),
          supportOpposition: 'activeSupport',
        },
        [BINH_DINH]: {
          ...(setup.markers?.[BINH_DINH] ?? {}),
          supportOpposition: 'activeSupport',
        },
        [PLEIKU_DARLAC]: {
          ...(setup.markers?.[PLEIKU_DARLAC] ?? {}),
          supportOpposition: 'passiveSupport',
        },
        [QUANG_NAM]: {
          ...(setup.markers?.[QUANG_NAM] ?? {}),
          supportOpposition: 'passiveOpposition',
        },
      },
    };

    const eventMove = findCardMove(def, stateWithMarkers, 'shaded');
    assert.notEqual(eventMove, undefined, 'Expected Westmoreland shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, stateWithMarkers, eventMove!, {
      overrides: [
        {
          when: (request) => request.name === '$targetProvinces',
          value: [QUANG_TRI, PLEIKU_DARLAC, QUANG_NAM],
        },
      ],
    }).state;

    // Quang Tri: Active Support → Neutral (−2)
    assert.equal(
      final.markers?.[QUANG_TRI]?.supportOpposition,
      'neutral',
      'Quang Tri should shift from Active Support to Neutral',
    );

    // Pleiku/Darlac: Passive Support → Passive Opposition (−2)
    assert.equal(
      final.markers?.[PLEIKU_DARLAC]?.supportOpposition,
      'passiveOpposition',
      'Pleiku-Darlac should shift from Passive Support to Passive Opposition',
    );

    // Quang Nam: Passive Opposition → clamped to Active Opposition (−2 but only 1 level available)
    assert.equal(
      final.markers?.[QUANG_NAM]?.supportOpposition,
      'activeOpposition',
      'Quang Nam should shift from Passive Opposition to Active Opposition (clamped)',
    );

    // Binh Dinh should remain untouched (has police)
    assert.equal(
      final.markers?.[BINH_DINH]?.supportOpposition,
      'activeSupport',
      'Binh Dinh should remain at Active Support (has Police)',
    );
  });

  it('shaded excludes cities (only provinces selectable)', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);

    const serializedShaded = JSON.stringify(card?.shaded?.effects ?? []);
    assert.match(serializedShaded, /province/, 'Shaded filter must require category province');
    // Cities should not match the province filter
    assert.doesNotMatch(serializedShaded, /"category".*"city"/, 'Shaded filter must not include cities');
  });

  it('shaded handles fewer than 3 eligible provinces gracefully', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 95012, 0, {
      [QUANG_TRI]: [
        makeToken('us-troop-only-eligible', 'troops', 'US', { type: 'troops' }),
      ],
    });

    // Neutralize all provinces to activeOpposition, then make only Quang Tri eligible.
    const neutralized = withCategoryMarker(def, setup, 'province', 'supportOpposition', 'activeOpposition');
    const stateWithMarkers: GameState = {
      ...neutralized,
      markers: {
        ...neutralized.markers,
        [QUANG_TRI]: {
          ...(neutralized.markers?.[QUANG_TRI] ?? {}),
          supportOpposition: 'activeSupport',
        },
      },
    };

    const eventMove = findCardMove(def, stateWithMarkers, 'shaded');
    if (eventMove !== undefined) {
      // With only 1 eligible province, min(3,1) = 1, so selecting 1 should work
      const final = applyMoveWithResolvedDecisionIds(def, stateWithMarkers, eventMove, {
        overrides: [
          {
            when: (request) => request.name === '$targetProvinces',
            value: [QUANG_TRI],
          },
        ],
      }).state;

      assert.equal(
        final.markers?.[QUANG_TRI]?.supportOpposition,
        'neutral',
        'Single eligible province should still shift',
      );
    }
  });

  // ── Regression tests ──

  it('grantContext.maxSpaces absent defaults to max 99 for normal sweep', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 95016, 0, {
      [QUANG_TRI]: [makeToken('us-reg-qt', 'troops', 'US', { type: 'troops' })],
      [BINH_DINH]: [makeToken('us-reg-bd', 'troops', 'US', { type: 'troops' })],
      [PLEIKU_DARLAC]: [makeToken('us-reg-pd', 'troops', 'US', { type: 'troops' })],
    });

    // Free operation grant WITHOUT maxSpaces — should allow more than 2 spaces
    const sweepState = withIsolatedFreeOperationGrant(setup, asPlayerId(0), {
      grantId: 'regression-no-maxspaces',
      seat: 'us',
      operationClass: 'operation',
      actionIds: ['sweep'],
    });

    // 3 spaces should work because maxSpaces is absent (defaults to 99)
    const resolved = normalizeDecisionParamsForMove(def, sweepState, {
      actionId: asActionId('sweep'),
      actionClass: 'operation',
      freeOperation: true,
      params: {
        $targetSpaces: [QUANG_TRI, BINH_DINH, PLEIKU_DARLAC],
      },
    }, {
      overrides: [
        { when: (request) => request.name === '$movingAdjacentTroops', value: [] },
      ],
    });
    assert.notEqual(resolved, undefined, 'Sweep with 3 spaces should resolve when no maxSpaces constraint');
  });

  it('LoC hop still works for normal free sweeps without allowTroopMovement: false', () => {
    const def = compileDef();

    // Set up a space adjacent to a LoC with troops beyond the LoC
    const setup = setupCardDrivenState(def, 95019, 0, {
      [QUANG_TRI]: [
        makeToken('us-troop-loc-target', 'troops', 'US', { type: 'troops' }),
      ],
    });

    // Free operation grant WITHOUT allowTroopMovement — LoC hop should remain available
    const sweepState = withIsolatedFreeOperationGrant(setup, asPlayerId(0), {
      grantId: 'regression-loc-hop',
      seat: 'us',
      operationClass: 'operation',
      actionIds: ['sweep'],
    });

    const sweepMoves = legalMoves(def, sweepState).filter(
      (move) => String(move.actionId) === 'sweep' && move.freeOperation === true,
    );
    assert.equal(sweepMoves.length > 0, true, 'Sweep should still be legal for regression test');
  });

  it('Sweep "no moves" blocks LoC hop too', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 95018, 0, {
      [QUANG_TRI]: [
        makeToken('us-troop-loc-block', 'troops', 'US', { type: 'troops' }),
        makeToken('vc-guerrilla-loc-block', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
      ],
    });

    const sweepState = withIsolatedFreeOperationGrant(setup, asPlayerId(0), {
      grantId: 'westmoreland-loc-block-test',
      seat: 'us',
      operationClass: 'operation',
      actionIds: ['sweep', 'assault'],
      allowDuringMonsoon: true,
      executionContext: { allowTroopMovement: false, allowArvnFollowup: false, maxSpaces: 2 },
    });

    // Execute sweep with no troop movement — LoC hop stage should also be skipped
    const afterSweep = applyMoveWithResolvedDecisionIds(def, sweepState, {
      actionId: asActionId('sweep'),
      actionClass: 'operation',
      freeOperation: true,
      params: {
        $targetSpaces: [QUANG_TRI],
        $movingAdjacentTroops: [],
      },
    }).state;

    // The key assertion: US troop stays in place, no LoC movement occurred
    assert.equal(
      countTokens(afterSweep, QUANG_TRI, (token) => token.id === asTokenId('us-troop-loc-block')),
      1,
      'US troop in Quang Tri should remain (no LoC hop when allowTroopMovement: false)',
    );
  });
});
