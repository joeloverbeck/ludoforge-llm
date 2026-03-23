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
import { applyMoveWithResolvedDecisionIds, normalizeDecisionParamsForMove, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime, withIsolatedFreeOperationGrant } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-92';
const CAN_THO = 'can-tho:none';
const KIEN_PHONG = 'kien-phong:none';
const KIEN_HOA = 'kien-hoa-vinh-binh:none';
const BA_XUYEN = 'ba-xuyen:none';
const KIEN_GIANG = 'kien-giang-an-xuyen:none';
const TAY_NINH = 'tay-ninh:none';
const NE_CAMBODIA = 'northeast-cambodia:none';
const LOC_CAN_THO_CHAU_DOC = 'loc-can-tho-chau-doc:none';
const LOC_CAN_THO_BAC_LIEU = 'loc-can-tho-bac-lieu:none';
const LOC_CAN_THO_LONG_PHU = 'loc-can-tho-long-phu:none';
const LOC_SAIGON_CAN_THO = 'loc-saigon-can-tho:none';

const SEALORDS_TARGETS = [
  KIEN_PHONG,
  KIEN_HOA,
  BA_XUYEN,
  KIEN_GIANG,
  LOC_CAN_THO_CHAU_DOC,
  LOC_CAN_THO_BAC_LIEU,
  LOC_CAN_THO_LONG_PHU,
] as const;

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

const resolveMatchingLimitedFreeMove = (
  def: GameDef,
  state: GameState,
  actionId: 'sweep' | 'assault',
  overrides: readonly DecisionOverrideRule[],
): Move => {
  for (const move of legalMoves(def, state).filter((candidate) => String(candidate.actionId) === actionId && candidate.freeOperation === true)) {
    try {
      return normalizeDecisionParamsForMove(def, state, { ...move, actionClass: 'limitedOperation' }, { overrides });
    }
    catch {
      // Try the next surfaced grant.
    }
  }
  throw new Error(`Expected resolvable limited free move for ${actionId}`);
};

const countTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-92 SEALORDS', () => {
  it('encodes exact text, exact target set, Monsoon-legal per-space grants, in-place Sweep flags, and US no-followup flags', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);

    assert.notEqual(card, undefined, 'Expected card-92 in production deck');
    assert.equal(card?.title, 'SEALORDS');
    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['VC', 'US', 'NVA', 'ARVN']);
    assert.equal(card?.unshaded?.text, 'ARVN then US free Sweep in place or Assault in each space adjacent to Can Tho.');
    assert.equal(
      card?.shaded?.text,
      'NVA or VC moves any of its pieces (including unTunneled Bases) from Cambodia/Tay Ninh to spaces adjacent to Can Tho.',
    );

    const grants = card?.unshaded?.freeOperationGrants ?? [];
    assert.equal(grants.length, 14, 'Expected 7 ARVN grants then 7 US grants');

    const arvnGrants = grants.filter((grant) => grant.seat === 'arvn');
    const usGrants = grants.filter((grant) => grant.seat === 'us');
    assert.equal(arvnGrants.length, 7);
    assert.equal(usGrants.length, 7);
    assert.equal(arvnGrants.every((grant) => grant.sequence?.step === 0), true);
    assert.equal(usGrants.every((grant) => grant.sequence?.step === 1), true);
    assert.equal(grants.every((grant) => grant.operationClass === 'limitedOperation'), true);
    assert.equal(grants.every((grant) => grant.allowDuringMonsoon === true), true);
    assert.equal(grants.every((grant) => JSON.stringify(grant.actionIds) === JSON.stringify(['sweep', 'assault'])), true);
    assert.equal(grants.every((grant) => grant.executionContext?.allowTroopMovement === false), true);
    assert.equal(usGrants.every((grant) => grant.executionContext?.allowArvnFollowup === false), true);

    const targetSet = new Set(SEALORDS_TARGETS);
    const zoneFilterTarget = (grant: NonNullable<typeof grants[number]>): string =>
      String((grant.zoneFilter as { right?: unknown } | undefined)?.right);
    const arvnSelected = new Set(arvnGrants.map(zoneFilterTarget));
    const usSelected = new Set(usGrants.map(zoneFilterTarget));
    assert.deepEqual([...arvnSelected].sort(), [...targetSet].sort());
    assert.deepEqual([...usSelected].sort(), [...targetSet].sort());
    assert.equal(arvnSelected.has(LOC_SAIGON_CAN_THO), false, 'Saigon-Can Tho must remain out of scope');
  });

  it('surfaces only the ARVN Sealords grant first during Monsoon and clears the free-op window after it resolves', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 92001, 3, {
      [KIEN_PHONG]: [
        makeToken('arvn-kien-phong', 'troops', 'ARVN', { type: 'troops' }),
        makeToken('vc-kien-phong-underground', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
      ],
      [BA_XUYEN]: [
        makeToken('us-ba-xuyen', 'troops', 'US', { type: 'troops' }),
        makeToken('vc-ba-xuyen-underground', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
      ],
      [LOC_SAIGON_CAN_THO]: [
        makeToken('us-saigon-can-tho', 'troops', 'US', { type: 'troops' }),
        makeToken('vc-saigon-can-tho-active', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
      ],
    }, { monsoon: true });

    const eventMove = findCardMove(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined, 'Expected Sealords unshaded event move');

    const afterEvent = applyMove(def, setup, eventMove!).state;
    const pending = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pending.some((grant) => grant.seat === 'arvn'), true);
    assert.equal(pending.some((grant) => grant.seat === 'us'), false, 'US grants should not activate before ARVN completes');
    assert.equal(pending.length, 1, 'Only the currently usable first ARVN grant should be active');

    const legalAfterEvent = legalMoves(def, afterEvent).filter((move) => move.freeOperation === true);
    assert.equal(legalAfterEvent.some((move) => String(move.actionId) === 'sweep'), true, 'ARVN Sweep should stay legal during Monsoon');
    assert.equal(
      legalAfterEvent.every((move) => String(move.actionId) === 'sweep' || String(move.actionId) === 'assault'),
      true,
    );
    const arvnSweep = resolveMatchingLimitedFreeMove(def, afterEvent, 'sweep', [
      { when: (request) => request.name === '$targetSpaces', value: [KIEN_PHONG] },
      { when: (request) => request.name === `$movingTroops@${KIEN_PHONG}`, value: [] },
    ]);
    const afterArvnSweep = applyMove(def, afterEvent, arvnSweep).state;

    assert.deepEqual(
      requireCardDrivenRuntime(afterArvnSweep).pendingFreeOperationGrants ?? [],
      [],
      'After the only usable ARVN grant resolves, no further Sealords free-op grant should remain in this setup',
    );

    assert.equal(
      countTokens(afterArvnSweep, LOC_SAIGON_CAN_THO, (token) => token.id === asTokenId('us-saigon-can-tho')),
      1,
      'The out-of-scope Saigon-Can Tho space must remain untouched',
    );
  });

  it('enforces Sweep in place and suppresses the US Assault ARVN follow-up', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 92002, 0, {
      [CAN_THO]: [
        makeToken('adjacent-arvn-troop', 'troops', 'ARVN', { type: 'troops' }),
        makeToken('adjacent-us-troop', 'troops', 'US', { type: 'troops' }),
      ],
      [KIEN_PHONG]: [
        makeToken('arvn-kien-phong-only', 'troops', 'ARVN', { type: 'troops' }),
        makeToken('vc-kien-phong-only', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'underground' }),
      ],
      [KIEN_GIANG]: [
        makeToken('us-kien-giang-only', 'troops', 'US', { type: 'troops' }),
        makeToken('arvn-kien-giang-followup', 'troops', 'ARVN', { type: 'troops' }),
        makeToken('vc-kien-giang-base', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
      ],
    }, { monsoon: true });

    const eventMove = findCardMove(def, setup, 'unshaded');
    assert.notEqual(eventMove, undefined, 'Expected Sealords unshaded event move');
    const afterEvent = applyMove(def, setup, eventMove!).state;
    const arvnSweepState = withIsolatedFreeOperationGrant(afterEvent, asPlayerId(1), {
      grantId: 'sealords-test-arvn-sweep',
      seat: 'arvn',
      operationClass: 'limitedOperation',
      actionIds: ['sweep', 'assault'],
      zoneFilter: { op: '==', left: { _t: 2 as const, ref: 'zoneProp', zone: '$zone', prop: 'id' }, right: KIEN_PHONG },
      moveZoneBindings: ['$targetSpaces'],
      allowDuringMonsoon: true,
      executionContext: { allowTroopMovement: false },
      viabilityPolicy: 'requireUsableAtIssue',
      completionPolicy: 'required',
      outcomePolicy: 'mustChangeGameplayState',
      postResolutionTurnFlow: 'resumeCardFlow',
    });
    const afterArvn = applyMoveWithResolvedDecisionIds(def, arvnSweepState, {
      actionId: asActionId('sweep'),
      actionClass: 'limitedOperation',
      freeOperation: true,
      params: {
        $targetSpaces: [KIEN_PHONG],
        [`$movingTroops@${KIEN_PHONG}`]: [],
      },
    }).state;

    assert.equal(
      countTokens(afterArvn, CAN_THO, (token) => token.id === asTokenId('adjacent-arvn-troop')),
      1,
      'Sealords Sweep must remain in place and leave adjacent ARVN troops unmoved',
    );

    const usAssaultState = withIsolatedFreeOperationGrant(afterArvn, asPlayerId(0), {
      grantId: 'sealords-test-us-assault',
      seat: 'us',
      operationClass: 'limitedOperation',
      actionIds: ['sweep', 'assault'],
      zoneFilter: { op: '==', left: { _t: 2 as const, ref: 'zoneProp', zone: '$zone', prop: 'id' }, right: KIEN_GIANG },
      moveZoneBindings: ['$targetSpaces'],
      allowDuringMonsoon: true,
      executionContext: { allowTroopMovement: false, allowArvnFollowup: false },
      viabilityPolicy: 'requireUsableAtIssue',
      completionPolicy: 'required',
      outcomePolicy: 'mustChangeGameplayState',
      postResolutionTurnFlow: 'resumeCardFlow',
    });
    const final = applyMoveWithResolvedDecisionIds(def, usAssaultState, {
      actionId: asActionId('assault'),
      actionClass: 'limitedOperation',
      freeOperation: true,
      params: {
        $targetSpaces: [KIEN_GIANG],
      },
    }).state;

    assert.equal(
      countTokens(final, 'available-VC:none', (token) => token.id === asTokenId('vc-kien-giang-base')),
      1,
      'US Assault should still remove the VC base',
    );
    assert.equal(
      countTokens(final, KIEN_GIANG, (token) => token.id === asTokenId('arvn-kien-giang-followup')),
      1,
      'ARVN should not perform a hidden follow-up assault',
    );
  });

  it('shaded relocates eligible pieces from Cambodia/Tay Ninh only, includes untunneled bases, and excludes loc-saigon-can-tho:none', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 92003, 0, {
      [TAY_NINH]: [
        makeToken('vc-untunneled-base', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
        makeToken('vc-tunneled-base', 'base', 'VC', { type: 'base', tunnel: 'tunneled' }),
      ],
      [NE_CAMBODIA]: [
        makeToken('vc-cambodia-guerrilla', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
      ],
      [KIEN_GIANG]: [makeToken('arvn-delta-cube', 'troops', 'ARVN', { type: 'troops' })],
    });

    const eventMove = findCardMove(def, setup, 'shaded');
    assert.notEqual(eventMove, undefined, 'Expected Sealords shaded event move');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, setup, eventMove!, {
          overrides: [
            { when: (request) => request.name === '$sealordsFaction', value: 'VC' },
            {
              when: (request) => request.name === '$sealordsPieces',
              value: [asTokenId('vc-untunneled-base'), asTokenId('vc-tunneled-base')],
            },
          ],
        }),
      /Illegal move|outside options domain|choiceRuntimeValidationFailed/,
      'Tunneled bases must not be selectable for Sealords shaded movement',
    );

    const final = applyMoveWithResolvedDecisionIds(def, setup, eventMove!, {
      overrides: [
        { when: (request) => request.name === '$sealordsFaction', value: 'VC' },
        {
          when: (request) => request.name === '$sealordsPieces',
          value: [asTokenId('vc-untunneled-base'), asTokenId('vc-cambodia-guerrilla')],
        },
        {
          when: (request) => request.name === '$sealordsDestination@vc-untunneled-base',
          value: KIEN_GIANG,
        },
        {
          when: (request) => request.name === '$sealordsDestination@vc-cambodia-guerrilla',
          value: LOC_CAN_THO_BAC_LIEU,
        },
      ],
    }).state;

    assert.equal(countTokens(final, TAY_NINH, (token) => token.id === asTokenId('vc-untunneled-base')), 0);
    assert.equal(countTokens(final, NE_CAMBODIA, (token) => token.id === asTokenId('vc-cambodia-guerrilla')), 0);
    assert.equal(countTokens(final, KIEN_GIANG, (token) => token.id === asTokenId('vc-untunneled-base')), 1);
    assert.equal(countTokens(final, LOC_CAN_THO_BAC_LIEU, (token) => token.id === asTokenId('vc-cambodia-guerrilla')), 1);
    assert.equal(
      countTokens(final, TAY_NINH, (token) => token.id === asTokenId('vc-tunneled-base')),
      1,
      'Tunneled bases must remain in place',
    );
    assert.equal(
      countTokens(final, LOC_SAIGON_CAN_THO, (token) => token.props.faction === 'VC'),
      0,
      'Saigon-Can Tho must remain out of scope for shaded destinations',
    );
  });

  it('shaded rejects base movement onto LoCs and becomes a no-op when the chosen faction has no eligible pieces', () => {
    const def = compileDef();
    const baseOnly = setupCardDrivenState(def, 92004, 0, {
      [TAY_NINH]: [makeToken('nva-base-only', 'base', 'NVA', { type: 'base', tunnel: 'untunneled' })],
    });

    const eventMove = findCardMove(def, baseOnly, 'shaded');
    assert.notEqual(eventMove, undefined, 'Expected Sealords shaded event move');
    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, baseOnly, eventMove!, {
          overrides: [
            { when: (request) => request.name === '$sealordsFaction', value: 'NVA' },
            { when: (request) => request.name === '$sealordsPieces', value: [asTokenId('nva-base-only')] },
            { when: (request) => request.name === '$sealordsDestination@nva-base-only', value: LOC_CAN_THO_CHAU_DOC },
          ],
        }),
      /Illegal move|outside options domain|choiceRuntimeValidationFailed/,
      'Bases must not be able to relocate onto LoCs',
    );

    const noOpSetup = setupCardDrivenState(def, 92005, 0, {
      [TAY_NINH]: [makeToken('vc-only-piece', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' })],
    });
    const noOpMove = findCardMove(def, noOpSetup, 'shaded');
    assert.notEqual(noOpMove, undefined, 'Expected Sealords shaded event move');
    const noOpFinal = applyMoveWithResolvedDecisionIds(def, noOpSetup, noOpMove!, {
      overrides: [{ when: (request) => request.name === '$sealordsFaction', value: 'NVA' }],
    }).state;

    assert.equal(
      countTokens(noOpFinal, TAY_NINH, (token) => token.id === asTokenId('vc-only-piece')),
      1,
      'Choosing a faction with no eligible pieces should leave the board unchanged',
    );
  });
});
