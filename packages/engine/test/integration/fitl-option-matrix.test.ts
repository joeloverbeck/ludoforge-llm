import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  type ActionPipelineDef,
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const createDef = (): GameDef =>
  ({
    metadata: { id: 'fitl-option-matrix-int', players: { min: 3, max: 3 }, maxTriggerDepth: 8 },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['0', '1', '2'], overrideWindows: [] },
          optionMatrix: [
            { first: 'event', second: ['operation', 'operationPlusSpecialActivity'] },
            { first: 'operation', second: ['limitedOperation'] },
            { first: 'operationPlusSpecialActivity', second: ['limitedOperation', 'event'] },
          ],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
    actions: [
      {
        id: asActionId('pass'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('event'),
capabilities: ['cardEvent'],
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('limitedOperation'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('operationPlusSpecialActivity'),
actor: 'active',
executor: 'actor',
phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const compileProductionDef = (): GameDef => {
  const { parsed, validatorDiagnostics, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.deepEqual(validatorDiagnostics, []);
  const compileErrors = compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  assert.deepEqual(compileErrors, []);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const asSecondEligibleMatrixWindow = (
  state: GameState,
  firstActionClass: 'event' | 'operation' | 'operationPlusSpecialActivity',
): GameState => {
  const runtime = requireCardDrivenRuntime(state);
  return {
    ...state,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(1),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: '1',
          secondEligible: '2',
          actedSeats: ['0'],
          passedSeats: [],
          nonPassCount: 1,
          firstActionClass,
        },
      },
    },
  };
};

const actionClasses = (moves: readonly Move[]): readonly string[] =>
  [...new Set(moves.map((move) => {
    const actionId = String(move.actionId);
    if (actionId === 'pass') {
      return 'pass';
    }
    if (actionId === 'event') {
      return 'event';
    }
    return move.actionClass ?? 'unclassified';
  }))].sort();

describe('FITL option matrix integration', () => {
  const operationPipeline: ActionPipelineDef = {
    id: 'operation-profile',
    actionId: asActionId('operation'),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [{ effects: [] }],
    atomicity: 'partial',
  };

  it('compiles production FITL spec with Rule 2.3.4 option matrix rows', () => {
    const gameDef = compileProductionDef();
    assert.equal(gameDef.turnOrder?.type, 'cardDriven');

    const turnFlow = gameDef.turnOrder?.type === 'cardDriven' ? gameDef.turnOrder.config.turnFlow : null;
    assert.notEqual(turnFlow, null);
    assert.deepEqual(turnFlow?.optionMatrix, [
      { first: 'operation', second: ['limitedOperation'] },
      { first: 'operationPlusSpecialActivity', second: ['limitedOperation', 'event'] },
      { first: 'event', second: ['operation', 'operationPlusSpecialActivity'] },
    ]);
  });

  it('gates second eligible legal moves after first eligible resolves event', () => {
    const def = createDef();
    const start = initialState(def, 31, 3).state;
    const firstMove: Move = { actionId: asActionId('event'), params: {} };
    const afterFirst = applyMove(def, start, firstMove).state;

    assert.equal(afterFirst.activePlayer, asPlayerId(1));
    assert.equal(requireCardDrivenRuntime(afterFirst).currentCard.firstActionClass, 'event');
    assert.deepEqual(
      legalMoves(def, afterFirst).map((move) => move.actionId),
      [asActionId('pass'), asActionId('operation'), asActionId('operationPlusSpecialActivity')],
    );
  });

  it('treats limitedOperation as operation for next eligible matrix classification', () => {
    const def = createDef();
    const start = initialState(def, 37, 3).state;
    const firstMove: Move = { actionId: asActionId('limitedOperation'), params: {} };
    const afterFirst = applyMove(def, start, firstMove).state;

    assert.equal(afterFirst.activePlayer, asPlayerId(1));
    assert.equal(requireCardDrivenRuntime(afterFirst).currentCard.firstActionClass, 'operation');
    assert.deepEqual(
      legalMoves(def, afterFirst).map((move) => move.actionId),
      [asActionId('pass'), asActionId('limitedOperation')],
    );
  });

  it('applies option-matrix gating to pipeline-backed operation templates', () => {
    const def = { ...createDef(), actionPipelines: [operationPipeline] } as unknown as GameDef;
    const start = initialState(def, 53, 3).state;
    const firstMove: Move = { actionId: asActionId('operation'), params: {} };
    const afterFirst = applyMove(def, start, firstMove).state;

    assert.equal(afterFirst.activePlayer, asPlayerId(1));
    assert.equal(requireCardDrivenRuntime(afterFirst).currentCard.firstActionClass, 'operation');
    assert.deepEqual(
      legalMoves(def, afterFirst).map((move) => move.actionId),
      [asActionId('pass'), asActionId('limitedOperation')],
    );
  });

  it('allows event or limitedOperation after first eligible resolves operationPlusSpecialActivity', () => {
    const def = createDef();
    const start = initialState(def, 47, 3).state;
    const firstMove: Move = { actionId: asActionId('operationPlusSpecialActivity'), params: {} };
    const afterFirst = applyMove(def, start, firstMove).state;

    assert.equal(afterFirst.activePlayer, asPlayerId(1));
    assert.equal(requireCardDrivenRuntime(afterFirst).currentCard.firstActionClass, 'operationPlusSpecialActivity');
    assert.deepEqual(
      legalMoves(def, afterFirst).map((move) => move.actionId),
      [asActionId('pass'), asActionId('event'), asActionId('limitedOperation')],
    );
  });

  it('enforces production runtime matrix row for first=event', () => {
    const def = compileProductionDef();
    const start = initialState(def, 101, 4).state;
    const secondEligible = asSecondEligibleMatrixWindow(start, 'event');

    assert.deepEqual(actionClasses(legalMoves(def, secondEligible)), ['operation', 'operationPlusSpecialActivity', 'pass']);
  });

  it('enforces production runtime matrix row for first=operation', () => {
    const def = compileProductionDef();
    const start = initialState(def, 103, 4).state;
    const secondEligible = asSecondEligibleMatrixWindow(start, 'operation');

    assert.deepEqual(actionClasses(legalMoves(def, secondEligible)), ['limitedOperation', 'pass']);
  });

  it('enforces production runtime matrix row for first=operationPlusSpecialActivity', () => {
    const def = compileProductionDef();
    const start = initialState(def, 107, 4).state;
    const secondEligible = asSecondEligibleMatrixWindow(start, 'operationPlusSpecialActivity');

    assert.deepEqual(actionClasses(legalMoves(def, secondEligible)), ['event', 'limitedOperation', 'pass']);
  });

  it('does not apply option-matrix filtering during interrupt phases', () => {
    const def = {
      ...createDef(),
      turnStructure: {
        phases: [{ id: asPhaseId('main') }],
        interrupts: [{ id: asPhaseId('commitment') }],
      },
      actions: createDef().actions.map((action) => ({
        ...action,
        phase: [asPhaseId('main'), asPhaseId('commitment')],
      })),
    } as unknown as GameDef;

    const start = initialState(def, 109, 3).state;
    const inInterrupt: GameState = {
      ...start,
      currentPhase: asPhaseId('commitment'),
      activePlayer: asPlayerId(1),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(start),
          currentCard: {
            ...requireCardDrivenRuntime(start).currentCard,
            firstEligible: '1',
            secondEligible: '2',
            actedSeats: ['0'],
            passedSeats: [],
            nonPassCount: 1,
            firstActionClass: 'operation',
          },
        },
      },
    };

    assert.deepEqual(
      legalMoves(def, inInterrupt).map((move) => move.actionId),
      [
        asActionId('pass'),
        asActionId('event'),
        asActionId('operation'),
        asActionId('limitedOperation'),
        asActionId('operationPlusSpecialActivity'),
      ],
    );
  });
});
