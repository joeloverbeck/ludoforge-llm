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
  asActionId,
  ILLEGAL_MOVE_REASONS,
  asPlayerId,
  asTokenId,
  initialState,
  probeMoveViability,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';

const CARD_ID = 'card-59';
const PLEIKU = 'pleiku-darlac:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const QUANG_NAM = 'quang-nam:none';
const CENTRAL_LAOS = 'central-laos:none';
const SAIGON = 'saigon:none';

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
  zones: Readonly<Record<string, readonly Token[]>>,
  options?: {
    readonly monsoon?: boolean;
    readonly trail?: number;
  },
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');
  const lookaheadZone =
    def.turnOrder?.type === 'cardDriven'
      ? def.turnOrder.config.turnFlow.cardLifecycle.lookahead
      : null;

  return {
    ...base,
    activePlayer: asPlayerId(2),
    globalVars: {
      ...base.globalVars,
      ...(options?.trail === undefined ? {} : { trail: options.trail }),
    },
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
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(options?.monsoon !== true || lookaheadZone === null
        ? {}
        : { [lookaheadZone]: [makeToken('plei-mei-monsoon', 'card', 'none', { isCoup: true })] }),
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

// Hoist compilation to module level — compileProductionSpec() is internally cached,
// but this avoids per-test assertion overhead and function-call cost.
const DEF = compileDef();

describe('FITL card-59 Plei Mei', () => {
  it('compiles card 59 with the exact rules text and a March then Attack-or-Ambush grant sequence', () => {
    const def = DEF;
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.title, 'Plei Mei');
    assert.equal(card?.metadata?.period, '1965');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'VC', 'ARVN', 'US']);
    assert.equal(card?.unshaded?.text, 'Remove any 3 NVA pieces from a space with or adjacent to a COIN Base.');
    assert.equal(
      card?.shaded?.text,
      'NVA free March from any spaces outside South Vietnam, then free Attack or Ambush any 1 space.',
    );
    assert.equal(card?.unshaded?.targets?.[0]?.id, '$pleiMeiUnshadedSpace');
    assert.deepEqual(card?.shaded?.freeOperationGrants?.map((grant) => ({
      sequence: grant.sequence,
      actionIds: grant.actionIds,
      allowDuringMonsoon: grant.allowDuringMonsoon,
      completionPolicy: grant.completionPolicy,
      outcomePolicy: grant.outcomePolicy,
      moveZoneBindings: grant.moveZoneBindings,
      moveZoneProbeBindings: grant.moveZoneProbeBindings,
    })), [
      {
        sequence: { batch: 'plei-mei-nva', step: 0 },
        actionIds: ['march'],
        allowDuringMonsoon: true,
        completionPolicy: 'skipIfNoLegalCompletion',
        outcomePolicy: 'mustChangeGameplayState',
        moveZoneBindings: ['$targetSpaces', '$chainSpaces'],
        moveZoneProbeBindings: ['$targetSpaces', '$chainSpaces'],
      },
      {
        sequence: { batch: 'plei-mei-nva', step: 1 },
        actionIds: ['attack', 'ambushNva'],
        allowDuringMonsoon: undefined,
        completionPolicy: 'required',
        outcomePolicy: 'mustChangeGameplayState',
        moveZoneBindings: ['$targetSpaces'],
        moveZoneProbeBindings: ['$targetSpaces'],
      },
    ]);
  });

  it('unshaded removes exactly 3 chosen NVA pieces from one eligible space, including bases', () => {
    const def = DEF;
    const setup = setupCardDrivenState(def, 59001, {
      [PLEIKU]: [
        makeToken('plei-coin-base-adjacent', 'troops', 'US'),
        makeToken('plei-nva-t1', 'troops', 'NVA'),
        makeToken('plei-nva-t2', 'troops', 'NVA'),
        makeToken('plei-nva-g1', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('plei-nva-base', 'base', 'NVA', { tunnel: 'untunneled' }),
      ],
      'kontum:none': [makeToken('plei-arvn-base', 'base', 'ARVN')],
      [QUANG_TRI]: [
        makeToken('plei-other-nva', 'troops', 'NVA'),
      ],
    });

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (request) => request.name === '$pleiMeiUnshadedSpace', value: PLEIKU },
      {
        when: (request) => request.name === '$pleiMeiNvaPieces',
        value: ['plei-nva-t1', 'plei-nva-g1', 'plei-nva-base'],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, buildCardMove(def, 'unshaded'), { overrides }).state;

    assert.equal(hasToken(final, PLEIKU, 'plei-nva-t1'), false);
    assert.equal(hasToken(final, PLEIKU, 'plei-nva-g1'), false);
    assert.equal(hasToken(final, PLEIKU, 'plei-nva-base'), false);
    assert.equal(hasToken(final, PLEIKU, 'plei-nva-t2'), true, 'The unchosen fourth NVA piece should remain');
    assert.equal(hasToken(final, QUANG_TRI, 'plei-other-nva'), true, 'The event must remove from only one single space');
    assert.equal(countTokens(final, 'available-NVA:none', () => true), 3);
  });

  it('unshaded removes all available NVA pieces when the selected eligible space has fewer than 3', () => {
    const def = DEF;
    const setup = setupCardDrivenState(def, 59002, {
      [QUANG_TRI]: [
        makeToken('plei-few-nva-t1', 'troops', 'NVA'),
        makeToken('plei-few-nva-b1', 'base', 'NVA', { tunnel: 'tunneled' }),
        makeToken('plei-us-base', 'base', 'US'),
      ],
    });

    const final = applyMoveWithResolvedDecisionIds(def, setup, buildCardMove(def, 'unshaded'), {
      overrides: [{ when: (request) => request.name === '$pleiMeiUnshadedSpace', value: QUANG_TRI }],
    }).state;

    assert.equal(countTokens(final, QUANG_TRI, (token) => token.props.faction === 'NVA'), 0);
    assert.equal(countTokens(final, 'available-NVA:none', () => true), 2);
  });

  it('unshaded is unavailable when no NVA pieces are in a space with or adjacent to a COIN base', () => {
    const def = DEF;
    const setup = setupCardDrivenState(def, 59003, {
      [PLEIKU]: [makeToken('plei-no-coin-nva', 'troops', 'NVA')],
      [SAIGON]: [makeToken('plei-us-no-adjacent', 'troops', 'US')],
    });

    const result = probeMoveViability(def, setup, buildCardMove(def, 'unshaded'));
    assert.equal(result.viable, false);
    assert.equal(result.code, 'ILLEGAL_MOVE');
    if (result.code === 'ILLEGAL_MOVE') {
      assert.equal(result.context.reason, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE);
    }
  });

  it('shaded grants a free Monsoon March from outside South Vietnam only, at zero cost, then a free exact-one-space Attack', () => {
    const def = DEF;
    const setup = setupCardDrivenState(
      def,
      59004,
      {
        [CENTRAL_LAOS]: [
          makeToken('plei-march-t1', 'troops', 'NVA'),
          makeToken('plei-march-t2', 'troops', 'NVA'),
        ],
        [QUANG_TRI]: [
          makeToken('plei-attack-us', 'troops', 'US'),
        ],
      },
      { monsoon: true, trail: 1 },
    );

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, buildCardMove(def, 'shaded')).state;
    const afterEventRuntime = requireCardDrivenRuntime(afterEvent);
    assert.equal(afterEventRuntime.pendingFreeOperationGrants?.length, 2);
    const marchProbe = probeMoveViability(def, afterEvent, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: {
        $targetSpaces: [QUANG_TRI],
        $chainSpaces: [],
        [`$movingGuerrillas@${QUANG_TRI}`]: [],
        [`$movingTroops@${QUANG_TRI}`]: [asTokenId('plei-march-t1'), asTokenId('plei-march-t2')],
      },
    });
    assert.equal(marchProbe.viable, true, 'The shaded event should surface a free March immediately after resolving');
    const attackNotYetProbe = probeMoveViability(def, afterEvent, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: { $targetSpaces: [QUANG_TRI], $attackMode: 'troops-attack' },
    });
    assert.equal(attackNotYetProbe.viable, false, 'Only the first sequence step should surface before the March resolves');

    const afterMarch = applyMoveWithResolvedDecisionIds(def, afterEvent, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: {
        $targetSpaces: [QUANG_TRI],
        $chainSpaces: [],
        [`$movingGuerrillas@${QUANG_TRI}`]: [],
        [`$movingTroops@${QUANG_TRI}`]: [asTokenId('plei-march-t1'), asTokenId('plei-march-t2')],
      },
    }).state;

    assert.equal(afterMarch.globalVars.nvaResources, setup.globalVars.nvaResources, 'The free March should cost 0 Resources');
    assert.equal(countTokens(afterMarch, QUANG_TRI, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 2);
    assert.equal(requireCardDrivenRuntime(afterMarch).pendingFreeOperationGrants?.length, 1);
    const marchDoneProbe = probeMoveViability(def, afterMarch, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: {
        $targetSpaces: [QUANG_TRI],
        $chainSpaces: [],
        [`$movingGuerrillas@${QUANG_TRI}`]: [],
        [`$movingTroops@${QUANG_TRI}`]: [asTokenId('plei-march-t1'), asTokenId('plei-march-t2')],
      },
    });
    assert.equal(marchDoneProbe.viable, false, 'The March grant should stop surfacing after its required step resolves');
    const attackViableProbe = probeMoveViability(def, afterMarch, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: { $targetSpaces: [QUANG_TRI], $attackMode: 'troops-attack' },
    });
    assert.equal(attackViableProbe.viable, true, 'The follow-up free Attack should appear only after the March resolves');

    const afterAttack = applyMoveWithResolvedDecisionIds(def, afterMarch, {
      actionId: asActionId('attack'),
      freeOperation: true,
      params: {
        $targetSpaces: [QUANG_TRI],
        $attackMode: 'troops-attack',
      },
    }).state;

    assert.equal(countTokens(afterAttack, QUANG_TRI, (token) => token.props.faction === 'US'), 0);
    assert.equal(countTokens(afterAttack, QUANG_TRI, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 1);
    assert.deepEqual(requireCardDrivenRuntime(afterAttack).pendingFreeOperationGrants ?? [], []);
  });

  it('shaded rejects a free March that tries to move any piece from South Vietnam', () => {
    const def = DEF;
    const setup = setupCardDrivenState(
      def,
      59005,
      {
        [CENTRAL_LAOS]: [makeToken('plei-outside-t1', 'troops', 'NVA')],
        [QUANG_NAM]: [makeToken('plei-inside-t1', 'troops', 'NVA')],
      },
      { monsoon: true, trail: 1 },
    );

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, buildCardMove(def, 'shaded')).state;

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, afterEvent, {
          actionId: asActionId('march'),
          freeOperation: true,
          params: {
            $targetSpaces: [QUANG_TRI],
            $chainSpaces: [],
            [`$movingGuerrillas@${QUANG_TRI}`]: [],
            [`$movingTroops@${QUANG_TRI}`]: [asTokenId('plei-inside-t1')],
          },
        }),
      /(?:Illegal move|zoneFilterMismatch|FREE_OPERATION_NOT_GRANTED|choiceRuntimeValidationFailed)/,
      'The free March must not move NVA pieces from South Vietnam origins',
    );
  });

  it('suppresses shaded play when no legal free March origin exists outside South Vietnam', () => {
    const def = DEF;
    const setup = setupCardDrivenState(
      def,
      59007,
      {
        [QUANG_NAM]: [makeToken('plei-only-inside-t1', 'troops', 'NVA')],
        [PLEIKU]: [makeToken('plei-target-us', 'troops', 'US')],
      },
      { trail: 1 },
    );

    const result = probeMoveViability(def, setup, buildCardMove(def, 'shaded'));
    assert.equal(result.viable, false);
    assert.equal(result.code, 'ILLEGAL_MOVE');
    if (result.code === 'ILLEGAL_MOVE') {
      assert.equal(result.context.reason, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE);
    }
  });

  it('shaded allows a free Ambush in any one legal space, not only a March destination', () => {
    const def = DEF;
    const setup = setupCardDrivenState(
      def,
      59006,
      {
        [CENTRAL_LAOS]: [
          makeToken('plei-ambush-marcher', 'troops', 'NVA'),
        ],
        [PLEIKU]: [
          makeToken('plei-ambush-target-us', 'troops', 'US'),
        ],
        [SAIGON]: [
          makeToken('plei-ambush-local-g', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('plei-ambush-saigon-us', 'troops', 'US'),
        ],
      },
      { trail: 1 },
    );

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, buildCardMove(def, 'shaded')).state;
    const afterMarch = applyMoveWithResolvedDecisionIds(def, afterEvent, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: {
        $targetSpaces: [QUANG_TRI],
        $chainSpaces: [],
        [`$movingGuerrillas@${QUANG_TRI}`]: [],
        [`$movingTroops@${QUANG_TRI}`]: [asTokenId('plei-ambush-marcher')],
      },
    }).state;

    const marchDoneProbe = probeMoveViability(def, afterMarch, {
      actionId: asActionId('march'),
      freeOperation: true,
      params: {
        $targetSpaces: [QUANG_TRI],
        $chainSpaces: [],
        [`$movingGuerrillas@${QUANG_TRI}`]: [],
        [`$movingTroops@${QUANG_TRI}`]: [asTokenId('plei-ambush-marcher')],
      },
    });
    assert.equal(marchDoneProbe.viable, false, 'The March grant should stop surfacing once the sequence advances to the Ambush step');
    const ambushViableProbe = probeMoveViability(def, afterMarch, {
      actionId: asActionId('ambushNva'),
      freeOperation: true,
      params: {
        $targetSpaces: [SAIGON],
        [`$ambushTargetMode@${SAIGON}`]: 'self',
      },
    });
    assert.equal(ambushViableProbe.viable, true, 'The follow-up free Ambush should surface once the March resolves in a legal Ambush state');

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, afterMarch, {
          actionId: asActionId('ambushNva'),
          freeOperation: true,
          params: {
            $targetSpaces: [PLEIKU, SAIGON],
            [`$ambushTargetMode@${PLEIKU}`]: 'self',
            [`$ambushTargetMode@${SAIGON}`]: 'self',
          },
        }),
      /(?:Illegal move|zoneFilterMismatch|FREE_OPERATION_NOT_GRANTED|choiceRuntimeValidationFailed)/,
      'The follow-up must be limited to exactly one space',
    );

    const afterAmbush = applyMoveWithResolvedDecisionIds(def, afterMarch, {
      actionId: asActionId('ambushNva'),
      freeOperation: true,
      params: {
        $targetSpaces: [SAIGON],
        [`$ambushTargetMode@${SAIGON}`]: 'self',
      },
    }).state;

    assert.equal(countTokens(afterAmbush, SAIGON, (token) => token.props.faction === 'US'), 0);
    assert.equal(
      countTokens(afterAmbush, SAIGON, (token) => token.props.faction === 'NVA' && token.type === 'guerrilla' && token.props.activity === 'active'),
      1,
      'The free Ambush should use the local underground guerrilla even outside the March destination',
    );
  });
});
