import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advancePhase,
  applyMove,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  createEvalRuntimeResources,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-46';
const FIRST_SPACE = 'quang-nam:none';
const SECOND_SPACE = 'quang-tri-thua-thien:none';

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

const findCard46Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const withActivePlayer = (state: GameState, player: 0 | 1 | 2 | 3): GameState => ({
  ...state,
  activePlayer: asPlayerId(player),
});

describe('FITL card-46 559th Transport Grp', () => {
  it('encodes exact rules text, immediate Trail hit, required free Infiltrate sequencing, and Trail-based payouts', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined, 'Expected card-46 in production deck');

    assert.equal(card?.title, '559th Transport Grp');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'ARVN', 'VC', 'US']);
    assert.equal(
      card?.unshaded?.text,
      'Degrade the Trail by 2 boxes. Until Coup, Infiltrate is max 1 space. MOMENTUM',
    );
    assert.deepEqual(card?.unshaded?.effects, [{ addVar: { scope: 'global', var: 'trail', delta: -2 } }]);
    assert.deepEqual(card?.unshaded?.lastingEffects, [
      {
        id: 'mom-559th-transport-grp',
        duration: 'round',
        setupEffects: [{ setVar: { scope: 'global', var: 'mom_559thTransportGrp', value: true } }],
        teardownEffects: [{ setVar: { scope: 'global', var: 'mom_559thTransportGrp', value: false } }],
      },
    ]);

    assert.equal(
      card?.shaded?.text,
      'NVA free Infiltrate. Then NVA add 3 times and VC 2 times Trail value in Resources.',
    );
    assert.equal(card?.shaded?.effectTiming, 'afterGrants');
    assert.deepEqual(card?.shaded?.freeOperationGrants, [
      {
        seat: 'nva',
        sequence: { batch: '559th-transport-grp-nva', step: 0 },
        viabilityPolicy: 'requireUsableAtIssue',
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'specialActivity',
        actionIds: ['infiltrate'],
      },
    ]);
    assert.deepEqual(card?.shaded?.effects, [
      {
        let: {
          bind: '$trailValue',
          value: { ref: 'gvar', var: 'trail' },
          in: [
            {
              addVar: {
                scope: 'global',
                var: 'nvaResources',
                delta: { op: '*', left: 3, right: { ref: 'binding', name: '$trailValue' } },
              },
            },
            {
              addVar: {
                scope: 'global',
                var: 'vcResources',
                delta: { op: '*', left: 2, right: { ref: 'binding', name: '$trailValue' } },
              },
            },
          ],
        },
      },
    ]);
  });

  it('unshaded degrades Trail immediately, caps Infiltrate to 1 space until Coup reset, and then releases the cap', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 4601, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(2),
      turnOrderState: { type: 'roundRobin' },
      globalVars: {
        ...base.globalVars,
        trail: 1,
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
        [FIRST_SPACE]: [makeToken('559-un-base-1', 'base', 'NVA', { tunnel: 'untunneled' })],
        [SECOND_SPACE]: [makeToken('559-un-base-2', 'base', 'NVA', { tunnel: 'untunneled' })],
        'available-NVA:none': [
          makeToken('559-un-avail-1', 'troops', 'NVA'),
          makeToken('559-un-avail-2', 'troops', 'NVA'),
          makeToken('559-un-avail-3', 'troops', 'NVA'),
          makeToken('559-un-avail-4', 'troops', 'NVA'),
        ],
      },
    };

    const move = findCard46Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-46 unshaded event move');

    const afterEvent = applyMove(def, setup, move!).state;
    assert.equal(afterEvent.globalVars.trail, 0, 'Unshaded should degrade Trail by 2 with floor at 0');
    assert.equal(afterEvent.globalVars.mom_559thTransportGrp, true, 'Unshaded should activate 559th Transport Group momentum');

    assert.doesNotThrow(
      () =>
        applyMoveWithResolvedDecisionIds(def, withActivePlayer(afterEvent, 2), {
          actionId: asActionId('infiltrate'),
          params: {
            $targetSpaces: [FIRST_SPACE],
            [`$infiltrateMode@${FIRST_SPACE}`]: 'build-up',
            [`$infiltrateGuerrillasToReplace@${FIRST_SPACE}`]: [],
          },
        }),
      'Momentum should still allow a one-space Infiltrate',
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, withActivePlayer(afterEvent, 2), {
          actionId: asActionId('infiltrate'),
          params: {
            $targetSpaces: [FIRST_SPACE, SECOND_SPACE],
            [`$infiltrateMode@${FIRST_SPACE}`]: 'build-up',
            [`$infiltrateMode@${SECOND_SPACE}`]: 'build-up',
            [`$infiltrateGuerrillasToReplace@${FIRST_SPACE}`]: [],
            [`$infiltrateGuerrillasToReplace@${SECOND_SPACE}`]: [],
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );

    const preparedForCoupReset: GameState = {
      ...afterEvent,
      currentPhase: asPhaseId('coupCommitment'),
      zones: {
        ...afterEvent.zones,
        'played:none': [makeToken('played-coup-559', 'card', 'none', { isCoup: true })],
        'lookahead:none': [makeToken('lookahead-559', 'card', 'none', { isCoup: false })],
        'deck:none': [makeToken('deck-559', 'card', 'none', { isCoup: false })],
      },
    };

    const evalRuntimeResources = createEvalRuntimeResources();
    const atReset = advancePhase({ def, state: preparedForCoupReset, evalRuntimeResources });
    assert.equal(atReset.currentPhase, asPhaseId('coupReset'));
    assert.equal(atReset.globalVars.trail, 1, 'Coup reset should normalize Trail from 0 to 1');
    assert.equal(atReset.globalVars.mom_559thTransportGrp, false, 'Coup reset must clear 559th momentum');

    const afterReset = advancePhase({ def, state: atReset, evalRuntimeResources });
    assert.equal(afterReset.currentPhase, asPhaseId('main'));

    assert.doesNotThrow(
      () =>
        applyMoveWithResolvedDecisionIds(def, withActivePlayer(afterReset, 2), {
          actionId: asActionId('infiltrate'),
          params: {
            $targetSpaces: [FIRST_SPACE, SECOND_SPACE],
            [`$infiltrateMode@${FIRST_SPACE}`]: 'build-up',
            [`$infiltrateMode@${SECOND_SPACE}`]: 'build-up',
            [`$infiltrateGuerrillasToReplace@${FIRST_SPACE}`]: [],
            [`$infiltrateGuerrillasToReplace@${SECOND_SPACE}`]: [],
          },
        }),
      'Two-space Infiltrate should be legal again after Coup reset',
    );
  });

  it('shaded defers Trail-based resources until the required free Infiltrate resolves', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 4602, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(2),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(base),
          currentCard: {
            ...requireCardDrivenRuntime(base).currentCard,
            firstEligible: 'nva',
            secondEligible: 'arvn',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
      globalVars: {
        ...base.globalVars,
        trail: 2,
        nvaResources: 5,
        vcResources: 1,
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
        [FIRST_SPACE]: [makeToken('559-sh-base', 'base', 'NVA', { tunnel: 'untunneled' })],
        'available-NVA:none': [
          makeToken('559-sh-avail-1', 'troops', 'NVA'),
          makeToken('559-sh-avail-2', 'troops', 'NVA'),
        ],
      },
    };

    const move = findCard46Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-46 shaded event move');

    const immediateAfterEvent = applyMove(def, setup, move!, { advanceToDecisionPoint: false }).state;
    const immediateFreeMoves = legalMoves(def, immediateAfterEvent).filter(
      (candidate) => String(candidate.actionId) === 'infiltrate' && candidate.freeOperation === true,
    );
    assert.equal(immediateFreeMoves.length > 0, true, 'Expected a required free Infiltrate decision immediately after the event issues its grant');

    const afterEvent = applyMove(def, setup, move!).state;
    assert.equal(afterEvent.globalVars.nvaResources, 5, 'Shaded payout should wait until free Infiltrate resolves');
    assert.equal(afterEvent.globalVars.vcResources, 1, 'Shaded payout should wait until free Infiltrate resolves');

    const pendingAfterEvent = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pendingAfterEvent.length, 1, 'Shaded should queue exactly one free Infiltrate grant');
    assert.equal(pendingAfterEvent[0]?.operationClass, 'specialActivity');
    assert.deepEqual(pendingAfterEvent[0]?.actionIds, ['infiltrate']);

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(2),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'nva',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const freeInfiltrate = legalMoves(def, grantReadyState).find(
      (candidate) => String(candidate.actionId) === 'infiltrate' && candidate.freeOperation === true,
    );
    assert.notEqual(freeInfiltrate, undefined, 'Expected required free Infiltrate move');

    const afterFreeInfiltrate = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      ...freeInfiltrate!,
      params: {
        $targetSpaces: [FIRST_SPACE],
        [`$infiltrateMode@${FIRST_SPACE}`]: 'build-up',
        [`$infiltrateGuerrillasToReplace@${FIRST_SPACE}`]: [],
      },
    }).state;

    assert.equal(afterFreeInfiltrate.globalVars.nvaResources, 11, 'Shaded should add 3 x Trail after free Infiltrate');
    assert.equal(afterFreeInfiltrate.globalVars.vcResources, 5, 'Shaded should add 2 x Trail after free Infiltrate');
    assert.deepEqual(requireCardDrivenRuntime(afterFreeInfiltrate).pendingFreeOperationGrants ?? [], []);
  });

  it('shaded resolves resource gains immediately when no Infiltrate is currently usable', () => {
    const def = compileDef();
    const base = clearAllZones(initialState(def, 4603, 4).state);

    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(2),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(base),
          currentCard: {
            ...requireCardDrivenRuntime(base).currentCard,
            firstEligible: 'nva',
            secondEligible: 'arvn',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
      globalVars: {
        ...base.globalVars,
        trail: 2,
        nvaResources: 7,
        vcResources: 3,
      },
      zones: {
        ...base.zones,
        'played:none': [makeToken(CARD_ID, 'card', 'none')],
      },
    };

    const move = findCard46Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-46 shaded event move');

    const afterEvent = applyMove(def, setup, move!).state;
    assert.equal(afterEvent.globalVars.nvaResources, 13, 'Shaded should still add 3 x Trail when no Infiltrate grant can issue');
    assert.equal(afterEvent.globalVars.vcResources, 7, 'Shaded should still add 2 x Trail when no Infiltrate grant can issue');
    assert.deepEqual(requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [], []);
  });
});
