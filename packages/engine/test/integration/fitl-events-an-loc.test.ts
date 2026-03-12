import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';
import {
  applyMove,
  ILLEGAL_MOVE_REASONS,
  asActionId,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  probeMoveViability,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';

const CARD_ID = 'card-71';
const SOUTH_LOC = 'loc-hue-da-nang:none';
const HUE = 'hue:none';
const SAIGON = 'saigon:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';

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

const countTokens = (state: GameState, zoneId: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zoneId] ?? []).filter((token) => predicate(token as Token)).length;

const hasToken = (state: GameState, zoneId: string, tokenId: string): boolean =>
  (state.zones[zoneId] ?? []).some((token) => String((token as Token).id) === tokenId);

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activeSeat: 'arvn' | 'nva',
  zones: Readonly<Record<string, readonly Token[]>>,
  options?: {
    readonly monsoon?: boolean;
  },
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected FITL event deck');
  const currentCardState =
    activeSeat === 'arvn'
      ? {
          firstEligible: 'arvn' as const,
          secondEligible: 'nva' as const,
          actedSeats: [] as string[],
          passedSeats: [] as string[],
          nonPassCount: 0,
          firstActionClass: null,
        }
      : {
          firstEligible: 'arvn' as const,
          secondEligible: 'nva' as const,
          actedSeats: [] as string[],
          passedSeats: ['arvn'],
          nonPassCount: 0,
          firstActionClass: null,
        };
  const lookaheadZone =
    def.turnOrder?.type === 'cardDriven'
      ? def.turnOrder.config.turnFlow.cardLifecycle.lookahead
      : null;

  return {
    ...base,
    activePlayer: asPlayerId(activeSeat === 'arvn' ? 1 : 2),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: currentCardState.firstEligible,
          secondEligible: currentCardState.secondEligible,
          actedSeats: currentCardState.actedSeats,
          passedSeats: currentCardState.passedSeats,
          nonPassCount: currentCardState.nonPassCount,
          firstActionClass: currentCardState.firstActionClass,
        },
      },
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(options?.monsoon !== true || lookaheadZone === null
        ? {}
        : { [lookaheadZone]: [makeToken('an-loc-monsoon', 'card', 'none', { isCoup: true })] }),
      ...zones,
    },
  };
};

const buildCardMove = (def: GameDef, side: 'unshaded' | 'shaded'): Move => {
  const eventDeckId = def.eventDecks?.[0]?.id;
  if (eventDeckId === undefined) {
    assert.fail('Expected FITL event deck');
  }
  return {
    actionId: asActionId('event'),
    params: {
      eventCardId: CARD_ID,
      eventDeckId,
      side,
    },
  };
};

const DEF = compileDef();

describe('FITL card-71 An Loc', () => {
  it('compiles card 71 with exact rules text, South-Vietnam ARVN targeting, and a March-then-double-Attack city sequence', () => {
    const def = DEF;
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.title, 'An Loc');
    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['ARVN', 'NVA', 'US', 'VC']);
    assert.equal(card?.unshaded?.text, 'In a space in the South with ARVN, remove all NVA Troops and place 3 ARVN Troops.');
    assert.equal(card?.shaded?.text, 'NVA free Marches Troops into a City and free Attacks there twice.');
    assert.equal((card?.unshaded?.effects?.[0] as { chooseOne?: { bind?: string } } | undefined)?.chooseOne?.bind, '$anLocUnshadedSpace');
    assert.equal(typeof (card?.unshaded?.effects?.[1] as { moveAll?: unknown } | undefined)?.moveAll, 'object');
    assert.equal((card?.unshaded?.effects?.[2] as { chooseN?: { bind?: string } } | undefined)?.chooseN?.bind, '$anLocArvnTroops');
    assert.equal(typeof (card?.unshaded?.effects?.[3] as { forEach?: unknown } | undefined)?.forEach, 'object');
    assert.deepEqual(card?.shaded?.freeOperationGrants?.map((grant) => ({
      sequence: grant.sequence,
      uses: grant.uses,
      actionIds: grant.actionIds,
      viabilityPolicy: grant.viabilityPolicy,
      allowDuringMonsoon: grant.allowDuringMonsoon,
      completionPolicy: grant.completionPolicy,
      outcomePolicy: grant.outcomePolicy,
      moveZoneBindings: grant.moveZoneBindings,
      moveZoneProbeBindings: grant.moveZoneProbeBindings,
      sequenceContext: grant.sequenceContext,
    })), [
      {
        sequence: { batch: 'an-loc-nva', step: 0 },
        uses: undefined,
        actionIds: ['march'],
        viabilityPolicy: 'requireUsableForEventPlay',
        allowDuringMonsoon: true,
        completionPolicy: 'required',
        outcomePolicy: 'mustChangeGameplayState',
        moveZoneBindings: ['$targetSpaces'],
        moveZoneProbeBindings: ['$targetSpaces', '$chainSpaces'],
        sequenceContext: { captureMoveZoneCandidatesAs: 'an-loc-city' },
      },
      {
        sequence: { batch: 'an-loc-nva', step: 1 },
        uses: 2,
        actionIds: ['attack'],
        viabilityPolicy: undefined,
        allowDuringMonsoon: undefined,
        completionPolicy: 'required',
        outcomePolicy: 'mustChangeGameplayState',
        moveZoneBindings: ['$targetSpaces'],
        moveZoneProbeBindings: undefined,
        sequenceContext: { requireMoveZoneCandidatesFrom: 'an-loc-city' },
      },
    ]);
  });

  it('unshaded targets a South Vietnam LoC with ARVN, removes only NVA troops there, and places exactly 3 ARVN troops', () => {
    const def = DEF;
    const setup = setupCardDrivenState(def, 71001, 'arvn', {
      [SOUTH_LOC]: [
        makeToken('an-loc-arvn-t', 'troops', 'ARVN'),
        makeToken('an-loc-arvn-p', 'police', 'ARVN'),
        makeToken('an-loc-nva-t1', 'troops', 'NVA'),
        makeToken('an-loc-nva-t2', 'troops', 'NVA'),
        makeToken('an-loc-nva-g', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
      'available-ARVN:none': [
        makeToken('an-loc-avail-1', 'troops', 'ARVN'),
        makeToken('an-loc-avail-2', 'troops', 'ARVN'),
        makeToken('an-loc-avail-3', 'troops', 'ARVN'),
        makeToken('an-loc-avail-4', 'troops', 'ARVN'),
      ],
    });

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (request) => request.name === '$anLocUnshadedSpace', value: SOUTH_LOC },
      {
        when: (request) => request.name === '$anLocArvnTroops',
        value: ['an-loc-avail-1', 'an-loc-avail-2', 'an-loc-avail-3'],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, buildCardMove(def, 'unshaded'), { overrides }).state;

    assert.equal(countTokens(final, SOUTH_LOC, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 0);
    assert.equal(hasToken(final, SOUTH_LOC, 'an-loc-nva-g'), true, 'Unshaded must not remove non-troop NVA pieces');
    assert.equal(countTokens(final, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'), 2);
    assert.equal(countTokens(final, SOUTH_LOC, (token) => token.props.faction === 'ARVN' && token.type === 'troops'), 4);
    assert.equal(countTokens(final, 'available-ARVN:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'), 1);
  });

  it('unshaded removes all NVA troops even when fewer than 3 ARVN troops are available to place', () => {
    const def = DEF;
    const setup = setupCardDrivenState(def, 71002, 'arvn', {
      [HUE]: [
        makeToken('an-loc-city-arvn', 'troops', 'ARVN'),
        makeToken('an-loc-city-nva-t1', 'troops', 'NVA'),
        makeToken('an-loc-city-nva-t2', 'troops', 'NVA'),
      ],
      'available-ARVN:none': [
        makeToken('an-loc-few-1', 'troops', 'ARVN'),
        makeToken('an-loc-few-2', 'troops', 'ARVN'),
      ],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, buildCardMove(def, 'unshaded'), {
      overrides: [{ when: (request) => request.name === '$anLocUnshadedSpace', value: HUE }],
    }).state;

    assert.equal(countTokens(final, HUE, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 0);
    assert.equal(countTokens(final, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'), 2);
    assert.equal(countTokens(final, HUE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'), 3);
    assert.equal(countTokens(final, 'available-ARVN:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'), 0);
  });

  it('unshaded is unavailable when no South Vietnam space contains any ARVN pieces', () => {
    const def = DEF;
    const setup = setupCardDrivenState(def, 71003, 'arvn', {
      [HUE]: [makeToken('an-loc-no-arvn-us', 'troops', 'US')],
      [QUANG_TRI]: [makeToken('an-loc-no-arvn-nva', 'troops', 'NVA')],
    });

    const result = probeMoveViability(def, setup, buildCardMove(def, 'unshaded'));
    assert.equal(result.viable, false);
    assert.equal(result.code, 'ILLEGAL_MOVE');
    if (result.code === 'ILLEGAL_MOVE') {
      assert.equal(result.context.reason, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE);
    }
  });

  it('suppresses shaded when no legal troop March into a City witness exists', () => {
    const def = DEF;
    const setup = setupCardDrivenState(
      def,
      710031,
      'nva',
      {
        [QUANG_TRI]: [
          makeToken('an-loc-no-troop-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
        ],
        [HUE]: [
          makeToken('an-loc-no-troop-us-1', 'troops', 'US'),
        ],
      },
      { monsoon: true },
    );

    const moves = legalMoves(def, setup).filter(
      (move) =>
        String(move.actionId) === 'event'
        && move.params.eventCardId === CARD_ID
        && move.params.side === 'shaded',
    );
    assert.equal(moves.length, 0);

    assert.throws(
      () => applyMove(def, setup, buildCardMove(def, 'shaded')),
      (error: unknown) => {
        if (!(error instanceof Error)) {
          return false;
        }
        const details = error as Error & { readonly reason?: string };
        return details.reason === ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE;
      },
    );
  });

  it('shaded grants a zero-cost Monsoon March into exactly one City and then forces two same-city Attacks', () => {
    const def = DEF;
    const setup = setupCardDrivenState(
      def,
      71004,
      'nva',
      {
        [QUANG_TRI]: [
          makeToken('an-loc-march-t1', 'troops', 'NVA'),
          makeToken('an-loc-march-t2', 'troops', 'NVA'),
          makeToken('an-loc-march-t3', 'troops', 'NVA'),
          makeToken('an-loc-march-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
        ],
        [HUE]: [
          makeToken('an-loc-hue-us-1', 'troops', 'US'),
          makeToken('an-loc-hue-us-2', 'troops', 'US'),
          makeToken('an-loc-hue-us-3', 'troops', 'US'),
        ],
        [SAIGON]: [
          makeToken('an-loc-saigon-us', 'troops', 'US'),
        ],
      },
      { monsoon: true },
    );

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, buildCardMove(def, 'shaded')).state;
    assert.equal(requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants?.length, 2);

    const provinceProbe = probeMoveViability(def, afterEvent, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: {
        $targetSpaces: [QUANG_TRI],
        $chainSpaces: [],
        [`$movingGuerrillas@${QUANG_TRI}`]: [],
        [`$movingTroops@${QUANG_TRI}`]: [asTokenId('an-loc-march-t1')],
      },
    });
    assert.equal(provinceProbe.viable, false, 'The free March must target a City');

    const guerrillaOnlyProbe = probeMoveViability(def, afterEvent, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: {
        $targetSpaces: [HUE],
        $chainSpaces: [],
        [`$movingGuerrillas@${HUE}`]: [asTokenId('an-loc-march-g1')],
        [`$movingTroops@${HUE}`]: [],
      },
    });
    assert.equal(guerrillaOnlyProbe.viable, false, 'The free March must move at least one NVA troop into the City');

    const marchProbe = probeMoveViability(def, afterEvent, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: {
        $targetSpaces: [HUE],
        $chainSpaces: [],
        [`$movingGuerrillas@${HUE}`]: [],
        [`$movingTroops@${HUE}`]: [
          asTokenId('an-loc-march-t1'),
          asTokenId('an-loc-march-t2'),
          asTokenId('an-loc-march-t3'),
        ],
      },
    });
    assert.equal(marchProbe.viable, true, 'The shaded event should surface a free Monsoon March into a city');

    const afterMarch = applyMoveWithResolvedDecisionIds(def, afterEvent, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: {
        $targetSpaces: [HUE],
        $chainSpaces: [],
        [`$movingGuerrillas@${HUE}`]: [],
        [`$movingTroops@${HUE}`]: [
          asTokenId('an-loc-march-t1'),
          asTokenId('an-loc-march-t2'),
          asTokenId('an-loc-march-t3'),
        ],
      },
    }).state;

    assert.equal(afterMarch.globalVars.nvaResources, setup.globalVars.nvaResources, 'The free March must cost 0 Resources');
    assert.equal(countTokens(afterMarch, HUE, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 3);
    assert.equal(requireCardDrivenRuntime(afterMarch).pendingFreeOperationGrants?.length, 1);

    const wrongCityAfterMarch = probeMoveViability(def, afterMarch, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: { $targetSpaces: [SAIGON], $attackMode: 'troops-attack' },
    });
    assert.equal(wrongCityAfterMarch.viable, false, 'The first free Attack must stay locked to the marched-into city');

    const firstAttackProbe = probeMoveViability(def, afterMarch, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: { $targetSpaces: [HUE], $attackMode: 'troops-attack' },
    });
    assert.equal(firstAttackProbe.viable, true, 'The first free Attack should open only after the March resolves');

    const afterFirstAttack = applyMoveWithResolvedDecisionIds(def, afterMarch, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: { $targetSpaces: [HUE], $attackMode: 'troops-attack' },
    }).state;

    assert.equal(requireCardDrivenRuntime(afterFirstAttack).pendingFreeOperationGrants?.length, 1);
    assert.equal(countTokens(afterFirstAttack, HUE, (token) => token.props.faction === 'US' && token.type === 'troops'), 2);

    const wrongCitySecondProbe = probeMoveViability(def, afterFirstAttack, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: { $targetSpaces: [SAIGON], $attackMode: 'troops-attack' },
    });
    assert.equal(wrongCitySecondProbe.viable, false, 'The second free Attack must also remain locked to the same city');

    const secondAttackProbe = probeMoveViability(def, afterFirstAttack, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: { $targetSpaces: [HUE], $attackMode: 'troops-attack' },
    });
    assert.equal(secondAttackProbe.viable, true, 'The second free Attack should still be available in the same city');

    const afterSecondAttack = applyMoveWithResolvedDecisionIds(def, afterFirstAttack, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: { $targetSpaces: [HUE], $attackMode: 'troops-attack' },
    }).state;

    assert.equal(countTokens(afterSecondAttack, HUE, (token) => token.props.faction === 'US' && token.type === 'troops'), 1);
    assert.equal(countTokens(afterSecondAttack, HUE, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 1);
    assert.deepEqual(requireCardDrivenRuntime(afterSecondAttack).pendingFreeOperationGrants ?? [], []);
  });
});
