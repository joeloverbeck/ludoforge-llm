import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  type ActionPipelineDef,
  asActionId,
  asPhaseId,
  asPlayerId,
  ILLEGAL_MOVE_REASONS,
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
    seats: [{ id: 'us' }, { id: 'arvn' }, { id: 'nva' }],
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
          eligibility: { seats: ['us', 'arvn', 'nva'], overrideWindows: [] },
          actionClassByActionId: {
            pass: 'pass',
            event: 'event',
            operation: 'operation',
            limitedOperation: 'limitedOperation',
            operationPlusSpecialActivity: 'operationPlusSpecialActivity',
          },
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
          firstEligible: 'arvn',
          secondEligible: 'nva',
          actedSeats: ['US'],
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
    // operation-class action gets variants for both compatible constrained classes
    assert.deepEqual(
      legalMoves(def, afterFirst).map((move) => move.actionId),
      [asActionId('pass'), asActionId('operation'), asActionId('operation'), asActionId('operationPlusSpecialActivity')],
    );
  });

  it('treats limitedOperation as operation for next eligible matrix classification', () => {
    const def = createDef();
    const start = initialState(def, 37, 3).state;
    const firstMove: Move = { actionId: asActionId('limitedOperation'), params: {} };
    const afterFirst = applyMove(def, start, firstMove).state;

    assert.equal(afterFirst.activePlayer, asPlayerId(1));
    assert.equal(requireCardDrivenRuntime(afterFirst).currentCard.firstActionClass, 'operation');
    // operation-class action also gets a limitedOperation variant
    assert.deepEqual(
      legalMoves(def, afterFirst).map((move) => move.actionId),
      [asActionId('pass'), asActionId('operation'), asActionId('limitedOperation')],
    );
  });

  it('applies option-matrix gating to pipeline-backed operation templates', () => {
    const def = { ...createDef(), actionPipelines: [operationPipeline] } as unknown as GameDef;
    const start = initialState(def, 53, 3).state;
    const firstMove: Move = { actionId: asActionId('operation'), params: {} };
    const afterFirst = applyMove(def, start, firstMove).state;

    assert.equal(afterFirst.activePlayer, asPlayerId(1));
    assert.equal(requireCardDrivenRuntime(afterFirst).currentCard.firstActionClass, 'operation');
    // operation-class action also gets a limitedOperation variant
    assert.deepEqual(
      legalMoves(def, afterFirst).map((move) => move.actionId),
      [asActionId('pass'), asActionId('operation'), asActionId('limitedOperation')],
    );
  });

  it('allows event or limitedOperation after first eligible resolves operationPlusSpecialActivity', () => {
    const def = createDef();
    const start = initialState(def, 47, 3).state;
    const firstMove: Move = { actionId: asActionId('operationPlusSpecialActivity'), params: {} };
    const afterFirst = applyMove(def, start, firstMove).state;

    assert.equal(afterFirst.activePlayer, asPlayerId(1));
    assert.equal(requireCardDrivenRuntime(afterFirst).currentCard.firstActionClass, 'operationPlusSpecialActivity');
    // operation-class action also gets a limitedOperation variant
    assert.deepEqual(
      legalMoves(def, afterFirst).map((move) => move.actionId),
      [asActionId('pass'), asActionId('event'), asActionId('operation'), asActionId('limitedOperation')],
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
            firstEligible: 'arvn',
            secondEligible: 'nva',
            actedSeats: ['US'],
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

  it('production 2nd-after-event: operations get operation+operationPlusSpecialActivity; SAs get operationPlusSpecialActivity only', () => {
    const def = compileProductionDef();
    const start = initialState(def, 113, 4).state;
    const secondEligible = asSecondEligibleMatrixWindow(start, 'event');

    const moves = legalMoves(def, secondEligible);

    // At least one operation should appear with both operation and operationPlusSpecialActivity variants
    const operationMoves = moves.filter((move) => move.actionClass === 'operation');
    const opPlusSaMoves = moves.filter((move) => move.actionClass === 'operationPlusSpecialActivity');
    assert.ok(operationMoves.length > 0, 'should have operation-classified moves');
    assert.ok(opPlusSaMoves.length > 0, 'should have operationPlusSpecialActivity-classified moves');

    // Operation action IDs should appear in both groups (the same action as two class variants)
    const operationIds = new Set(operationMoves.map((move) => String(move.actionId)));
    const opPlusSaIds = new Set(opPlusSaMoves.map((move) => String(move.actionId)));
    // All operation-classified IDs should also have an operationPlusSpecialActivity variant
    for (const id of operationIds) {
      assert.ok(opPlusSaIds.has(id), `operation '${id}' should also have operationPlusSpecialActivity variant`);
    }

    // SA moves (if any for this faction) should appear only with operationPlusSpecialActivity
    const saOnlyMoves = opPlusSaMoves.filter((move) => !operationIds.has(String(move.actionId)));
    for (const move of saOnlyMoves) {
      const matchingOpMoves = moves.filter((m) => String(m.actionId) === String(move.actionId) && m.actionClass === 'operation');
      assert.equal(matchingOpMoves.length, 0, `SA '${move.actionId}' should not appear with operation class`);
    }
  });

  it('production 2nd-after-operation: operations get limitedOperation; SAs excluded', () => {
    const def = compileProductionDef();
    const start = initialState(def, 117, 4).state;
    const secondEligible = asSecondEligibleMatrixWindow(start, 'operation');

    const moves = legalMoves(def, secondEligible);

    // Operations should appear only with limitedOperation variant
    const trainMoves = moves.filter((move) => String(move.actionId) === 'train');
    assert.deepEqual(trainMoves.map((move) => move.actionClass), ['limitedOperation']);

    // Special activities should be excluded entirely
    const adviseMoves = moves.filter((move) => String(move.actionId) === 'advise');
    assert.deepEqual(adviseMoves, []);

    const airStrikeMoves = moves.filter((move) => String(move.actionId) === 'airStrike');
    assert.deepEqual(airStrikeMoves, []);
  });

  it('production 2nd-after-Op+SA: operations get limitedOperation; SAs excluded; events available', () => {
    const def = compileProductionDef();
    const start = initialState(def, 119, 4).state;
    const secondEligible = asSecondEligibleMatrixWindow(start, 'operationPlusSpecialActivity');

    const moves = legalMoves(def, secondEligible);

    // Operations should appear with limitedOperation variant
    const sweepMoves = moves.filter((move) => String(move.actionId) === 'sweep');
    assert.deepEqual(sweepMoves.map((move) => move.actionClass), ['limitedOperation']);

    // Special activities should be excluded
    const airLiftMoves = moves.filter((move) => String(move.actionId) === 'airLift');
    assert.deepEqual(airLiftMoves, []);

    // Events should be available
    const classes = actionClasses(moves);
    assert.ok(classes.includes('event'), 'events should be available after Op+SA');
  });

  it('production 1st eligible (unconstrained): all operations and SAs available', () => {
    const def = compileProductionDef();
    const start = initialState(def, 127, 4).state;

    // First eligible, no constraint (nonPassCount=0)
    const runtime = requireCardDrivenRuntime(start);
    const firstEligible: GameState = {
      ...start,
      currentPhase: asPhaseId('main'),
      activePlayer: asPlayerId(0),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...runtime,
          currentCard: {
            ...runtime.currentCard,
            firstEligible: 'us',
            secondEligible: 'arvn',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const moves = legalMoves(def, firstEligible);
    const actionIds = moves.map((move) => String(move.actionId));

    // Operations should be present
    assert.ok(actionIds.includes('train'), 'train should be available');
    assert.ok(actionIds.includes('patrol'), 'patrol should be available');

    // Special activities should be present
    assert.ok(actionIds.includes('advise'), 'advise should be available');
    assert.ok(actionIds.includes('airStrike'), 'airStrike should be available');
  });

  it('allows compatible actionClass override (operation → limitedOperation) during apply', () => {
    const def = createDef();
    const start = initialState(def, 131, 3).state;
    const firstMove: Move = { actionId: asActionId('operation'), params: {} };
    const afterFirst = applyMove(def, start, firstMove).state;

    // operation → limitedOperation is a compatible downgrade, not a mismatch
    const result = applyMove(def, afterFirst, {
      actionId: asActionId('operation'),
      params: {},
      actionClass: 'limitedOperation',
    });
    assert.notEqual(result.state, null);
  });

  it('rejects incompatible actionClass override (event → limitedOperation) during apply', () => {
    const def = createDef();
    const start = initialState(def, 131, 3).state;

    assert.throws(
      () =>
        applyMove(def, start, {
          actionId: asActionId('event'),
          params: {},
          actionClass: 'limitedOperation',
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const details = error as Error & { reason?: unknown; context?: Record<string, unknown> };
        assert.equal(details.reason, ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH);
        assert.deepEqual(details.context, {
          actionId: asActionId('event'),
          params: {},
          reason: ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH,
          mappedActionClass: 'event',
          submittedActionClass: 'limitedOperation',
        });
        return true;
      },
    );
  });
});
