// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyDecision,
  asActionId,
  asDecisionFrameId,
  asPhaseId,
  asPlayerId,
  asTurnId,
  assertValidatedGameDef,
  createGameDefRuntime,
  initialState,
  publishMicroturn,
  rollbackToActionSelection,
  terminalResult,
  type ActionDef,
  type DecisionStackFrame,
  type GameDef,
} from '../../src/kernel/index.js';
import { eff } from '../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../helpers/gamedef-fixtures.js';

const chooseOneEffect = (bind: string, values: readonly string[]) => eff({
  chooseOne: {
    internalDecisionId: `decision:${bind}`,
    bind,
    options: { query: 'enums', values: [...values] },
  },
});

const badAction: ActionDef = {
  id: asActionId('bad'),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [chooseOneEffect('$after', ['after'])],
  limits: [],
};

const passAction: ActionDef = {
  id: asActionId('pass'),
  tags: ['pass'],
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [eff({ addVar: { scope: 'global', var: 'done', delta: 1 } })],
  limits: [],
};

const makeDef = (): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'rollback-safety-net', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [{ name: 'done', type: 'int', init: 0, min: 0, max: 10 }],
    perPlayerVars: [],
    zones: [{ id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [badAction, passAction],
    triggers: [],
    terminal: {
      conditions: [{ when: { op: '>=', left: { _t: 2 as const, ref: 'gvar', var: 'done' }, right: 1 }, result: { type: 'draw' } }],
    },
  });

describe('probe-hole rollback integration safety net', () => {
  it('rolls back an in-progress action and reaches terminal through the authored pass fallback', () => {
    const def = assertValidatedGameDef(makeDef());
    const runtime = createGameDefRuntime(def);
    const baseState = initialState(def, 1, 2, undefined, runtime).state;
    const actionFrame: DecisionStackFrame = {
      frameId: asDecisionFrameId(0),
      parentFrameId: null,
      turnId: asTurnId(0),
      context: { kind: 'actionSelection', seatId: '0' as never, eligibleActions: [asActionId('bad')] },
      effectFrame: {
        programCounter: 0,
        boundedIterationCursors: {},
        localBindings: {},
        pendingTriggerQueue: [],
        decisionHistory: [{
          seatId: '0' as never,
          decision: { kind: 'actionSelection', actionId: asActionId('bad'), move: { actionId: asActionId('bad'), params: {} } },
          decisionContextKind: 'actionSelection',
          decisionKey: null,
          frameId: asDecisionFrameId(0),
        }],
      },
    };
    const childFrame: DecisionStackFrame = {
      frameId: asDecisionFrameId(1),
      parentFrameId: actionFrame.frameId,
      turnId: asTurnId(0),
      context: { kind: 'chooseOne', seatId: '0' as never, decisionKey: '$after' as never, options: [] },
      effectFrame: { programCounter: 0, boundedIterationCursors: {}, localBindings: {}, pendingTriggerQueue: [] },
    };
    const failedState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      decisionStack: [actionFrame, childFrame],
      nextFrameId: asDecisionFrameId(2),
      activeDeciderSeatId: '0' as never,
    };

    const rollback = rollbackToActionSelection(def, failedState, runtime, 'synthetic probe hole');
    assert.notEqual(rollback, null);
    const microturn = publishMicroturn(def, rollback!.state, runtime);
    assert.deepEqual(microturn.legalActions.map((decision) => decision.kind === 'actionSelection' ? decision.actionId : null), [asActionId('pass')]);
    const applied = applyDecision(def, rollback!.state, microturn.legalActions[0]!, undefined, runtime).state;

    assert.equal(terminalResult(def, applied, runtime)?.type, 'draw');
    assert.equal(rollback!.logEntry.blacklistedActionId, asActionId('bad'));
    assert.equal(rollback!.logEntry.rolledBackFrames, 1);
  });
});
