import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPlayerId,
  asTokenId,
  initialState,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-70';
const QUI_NHON = 'qui-nhon:none';
const PHU_BON = 'phu-bon-phu-yen:none';
const KHANH_HOA = 'khanh-hoa:none';
const LOC_KONTUM_QUI_NHON = 'loc-kontum-qui-nhon:none';
const ROKS_TOKEN_INTERPRETATIONS = [
  {
    when: {
      op: 'and',
      args: [
        { prop: 'faction', op: 'eq', value: 'ARVN' },
        { prop: 'type', op: 'in', value: ['troops', 'police'] },
      ],
    },
    assign: {
      faction: 'US',
      type: 'troops',
    },
  },
] as const;
const ROKS_SWEEP_ZONE_FILTER = {
  op: 'in',
  item: { _t: 2, ref: 'zoneProp', zone: '$zone', prop: 'id' },
  set: { _t: 1, scalarArray: [QUI_NHON, 'binh-dinh:none', 'kontum:none', 'pleiku-darlac:none', PHU_BON, KHANH_HOA, 'cam-ranh:none'] },
} as const;

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, string | number | boolean>>,
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

const withLookaheadCoup = (def: GameDef, state: GameState): GameState => {
  if (state.turnOrderState.type !== 'cardDriven' || def.turnOrder?.type !== 'cardDriven') {
    return state;
  }
  const lookaheadZone = def.turnOrder.config.turnFlow.cardLifecycle.lookahead;
  const lookahead = state.zones[lookaheadZone] ?? [];
  const [top, ...rest] = lookahead;
  const coupTop: Token = top === undefined
    ? makeToken('roks-lookahead-coup', 'card', 'none', { isCoup: true })
    : {
      ...top,
      props: {
        ...top.props,
        isCoup: true,
      },
    };
  return {
    ...state,
    zones: {
      ...state.zones,
      [lookaheadZone]: [coupTop, ...rest],
    },
  };
};

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: number,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc',
  zones: Readonly<Record<string, readonly Token[]>>,
  options?: {
    readonly globalMarkerOverrides?: Readonly<Record<string, string>>;
    readonly markerOverrides?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  },
): GameState => {
  const base = withLookaheadCoup(def, clearAllZones(initialState(def, seed, 4).state));
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    globalMarkers: {
      ...base.globalMarkers,
      ...(options?.globalMarkerOverrides ?? {}),
    },
    markers: {
      ...base.markers,
      ...(options?.markerOverrides ?? {}),
    },
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
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
  };
};

const countTokens = (state: GameState, zoneId: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zoneId] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-70 ROKs', () => {
  it('ARVN branch opens the mixed-US operation window, allows Monsoon Sweep, moves mixed cubes, activates guerrillas, and assaults with Abrams/base doubling using all US+ARVN cubes', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(
      def,
      70001,
      1,
      'arvn',
      'us',
      {
        [QUI_NHON]: [
          makeToken('roks-us-troop-adj', 'troops', 'US', { type: 'troops' }),
          makeToken('roks-arvn-police-adj', 'police', 'ARVN', { type: 'police' }),
        ],
        [PHU_BON]: [
          makeToken('roks-arvn-troop-in-place', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('roks-us-base', 'base', 'US', { type: 'base' }),
          makeToken('roks-vc-guerrilla-1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('roks-vc-guerrilla-2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('roks-vc-guerrilla-3', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
          makeToken('roks-vc-base', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
        ],
      },
      {
        globalMarkerOverrides: {
          cap_abrams: 'unshaded',
        },
      },
    );

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('event'),
      params: {
        eventCardId: CARD_ID,
        side: 'unshaded',
        branch: 'roks-execute-as-arvn',
      },
    }).state;
    const pendingAfterEvent = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pendingAfterEvent.length, 2);
    assert.equal(pendingAfterEvent[0]?.seat, 'arvn');
    assert.equal(pendingAfterEvent[0]?.executeAsSeat, 'us');
    assert.deepEqual(pendingAfterEvent[0]?.actionIds, ['sweep']);
    assert.deepEqual(pendingAfterEvent[0]?.zoneFilter, ROKS_SWEEP_ZONE_FILTER);
    assert.deepEqual(pendingAfterEvent[0]?.tokenInterpretations, ROKS_TOKEN_INTERPRETATIONS);
    assert.equal(pendingAfterEvent[0]?.allowDuringMonsoon, true);

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(1),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'arvn',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const afterSweep = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      actionId: asActionId('sweep'),
      freeOperation: true,
      params: {
        $targetSpaces: [PHU_BON],
        $movingAdjacentTroops: ['roks-us-troop-adj', 'roks-arvn-police-adj'],
      },
    }).state;
    assert.equal(
      countTokens(afterSweep, PHU_BON, (token) => token.id === asTokenId('roks-us-troop-adj')),
      1,
      'ROKs Sweep should move adjacent US troops into Phu Bon',
    );
    assert.equal(
      countTokens(afterSweep, PHU_BON, (token) => token.id === asTokenId('roks-arvn-police-adj')),
      1,
      'ROKs Sweep should move adjacent ARVN Police as if they were US Troops',
    );
    assert.equal(
      countTokens(afterSweep, PHU_BON, (token) => token.type === 'guerrilla' && token.props.activity === 'active' && token.props.faction === 'VC'),
      3,
      'ROKs Sweep should activate underground guerrillas using the combined US+ARVN cube count',
    );

    const final = applyMoveWithResolvedDecisionIds(def, afterSweep, {
      actionId: asActionId('assault'),
      freeOperation: true,
      params: {
        $targetSpaces: [PHU_BON],
        $abramsSpace: [PHU_BON],
      },
    }).state;

    assert.equal(
      countTokens(final, PHU_BON, (token) => token.props.faction === 'VC'),
      0,
      'ROKs Assault should remove all VC in Phu Bon using mixed US+ARVN cube damage',
    );
    assert.equal(
      countTokens(final, 'available-VC:none', (token) => token.id === asTokenId('roks-vc-base')),
      1,
      'ROKs Assault should apply Abrams base-first removal with the mixed-cube US profile',
    );
    assert.equal(final.globalVars.fitl_roksMixedUsOperation, undefined);
  });

  it('US branch hands decision control to US and allows assault on the Phu Bon-linked LoC using ARVN cubes as US troops', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 70002, 1, 'arvn', 'us', {
      [PHU_BON]: [
        makeToken('roks-us-branch-sweep-cube', 'troops', 'ARVN', { type: 'troops' }),
      ],
      [LOC_KONTUM_QUI_NHON]: [
        makeToken('roks-loc-arvn-troop', 'troops', 'ARVN', { type: 'troops' }),
        makeToken('roks-loc-arvn-police', 'police', 'ARVN', { type: 'police' }),
        makeToken('roks-loc-vc-guerrilla', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        makeToken('roks-loc-vc-base', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
      ],
    });

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('event'),
      params: {
        eventCardId: CARD_ID,
        side: 'unshaded',
        branch: 'roks-execute-as-us',
      },
    }).state;
    const pendingAfterEvent = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(afterEvent.activePlayer, asPlayerId(0), 'US branch should hand the free-operation decisions to US');
    assert.equal(pendingAfterEvent[0]?.seat, 'us');
    assert.equal(pendingAfterEvent[0]?.executeAsSeat, 'us');
    assert.deepEqual(pendingAfterEvent[0]?.tokenInterpretations, ROKS_TOKEN_INTERPRETATIONS);

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(0),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'us',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const afterSweep = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      actionId: asActionId('sweep'),
      freeOperation: true,
      params: {
        $targetSpaces: [PHU_BON],
        $movingAdjacentTroops: [],
      },
    }).state;

    const final = applyMoveWithResolvedDecisionIds(def, afterSweep, {
      actionId: asActionId('assault'),
      freeOperation: true,
      params: {
        $targetSpaces: [LOC_KONTUM_QUI_NHON],
        $abramsSpace: [],
      },
    }).state;

    assert.equal(
      countTokens(final, LOC_KONTUM_QUI_NHON, (token) => token.props.faction === 'VC'),
      0,
      'ROKs Assault should treat the listed Phu Bon-linked LoC as in-scope and use ARVN cubes as US troops there',
    );
  });

  it('shaded shifts Qui Nhon, Phu Bon, and Khanh Hoa one level each toward Active Opposition and clamps at the lattice edge', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected event deck');

    const base = clearAllZones(initialState(def, 70003, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(1),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      },
      markers: {
        ...base.markers,
        [QUI_NHON]: { supportOpposition: 'passiveSupport' },
        [PHU_BON]: { supportOpposition: 'neutral' },
        [KHANH_HOA]: { supportOpposition: 'activeOpposition' },
      },
    };

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('event'),
      params: {
        eventCardId: CARD_ID,
        side: 'shaded',
        branch: 'none',
      },
    }).state;
    assert.equal(final.markers[QUI_NHON]?.supportOpposition, 'neutral');
    assert.equal(final.markers[PHU_BON]?.supportOpposition, 'passiveOpposition');
    assert.equal(final.markers[KHANH_HOA]?.supportOpposition, 'activeOpposition');
  });
});
