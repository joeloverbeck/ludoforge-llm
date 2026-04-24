// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  applyDecision,
  asActionId,
  asDecisionFrameId,
  type DecisionKey,
  asPhaseId,
  asPlayerId,
  type SeatId,
  asTurnId,
  createGameDefRuntime,
  publishMicroturn,
  resolveActiveDeciderSeatIdForPlayer,
  rollbackToActionSelection,
  type ActionDef,
  type DecisionStackFrame,
  type GameDef,
  type GameState,
} from '../../../../src/kernel/index.js';
import { eff } from '../../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../../helpers/gamedef-fixtures.js';

const chooseOneEffect = (bind: string, values: readonly string[]) => eff({
  chooseOne: {
    internalDecisionId: `decision:${bind}`,
    bind,
    options: { query: 'enums', values: [...values] },
  },
});

const makeDef = (actions: readonly ActionDef[]): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'probe-hole-rollback', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [{ name: 'done', type: 'int', init: 0, min: 0, max: 10 }],
    perPlayerVars: [],
    zones: [{ id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions,
    triggers: [],
    terminal: {
      conditions: [{ when: { op: '>=', left: { _t: 2 as const, ref: 'gvar', var: 'done' }, right: 1 }, result: { type: 'draw' } }],
    },
  });

const makeState = (def: GameDef): GameState => ({
  globalVars: { done: 0 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 0,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
  decisionStack: [],
  nextFrameId: asDecisionFrameId(0),
  nextTurnId: asTurnId(0),
  activeDeciderSeatId: resolveActiveDeciderSeatIdForPlayer(def, 0),
});

const badAction: ActionDef = {
  id: asActionId('bad'),
  actor: 'active',
  executor: 'actor',
  phase: [asPhaseId('main')],
  params: [],
  pre: null,
  cost: [],
  effects: [
    chooseOneEffect('$first', ['A']),
    chooseOneEffect('$second', ['B']),
    eff({ addVar: { scope: 'global', var: 'done', delta: 1 } }),
  ],
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

describe('probe-hole rollback safety net', () => {
  it('rolls back to the nearest actionSelection frame and blacklists the offending action', () => {
    const def = makeDef([badAction, passAction]);
    const runtime = createGameDefRuntime(def);
    let state = makeState(def);
    const actionSelection = publishMicroturn(def, state, runtime);
    state = applyDecision(def, state, actionSelection.legalActions[0]!, undefined, runtime).state;
    const firstChoice = publishMicroturn(def, state, runtime);
    state = applyDecision(def, state, firstChoice.legalActions[0]!, undefined, runtime).state;

    const rolledBack = rollbackToActionSelection(def, state, runtime, 'forced test failure');

    assert.notEqual(rolledBack, null);
    assert.equal(rolledBack!.state.decisionStack?.length, 1);
    assert.deepEqual(rolledBack!.state.unavailableActionsPerTurn?.['0:0'], [asActionId('bad')]);
    assert.equal(rolledBack!.logEntry.blacklistedActionId, asActionId('bad'));
    assert.equal(rolledBack!.logEntry.rolledBackFrames, 1);
    assert.notEqual(rolledBack!.logEntry.stateHashBefore, rolledBack!.logEntry.stateHashAfter);
  });

  it('returns null when no actionSelection frame exists', () => {
    const def = makeDef([badAction]);
    const runtime = createGameDefRuntime(def);
    const state = {
      ...makeState(def),
      decisionStack: [{
        frameId: asDecisionFrameId(0),
        parentFrameId: null,
        turnId: asTurnId(0),
        context: { kind: 'chooseOne', seatId: '0' as SeatId, decisionKey: '$x' as DecisionKey, options: [] },
        effectFrame: { programCounter: 0, boundedIterationCursors: {}, localBindings: {}, pendingTriggerQueue: [] },
      } satisfies DecisionStackFrame],
    };

    assert.equal(rollbackToActionSelection(def, state, runtime, 'forced test failure'), null);
  });

  it('returns null when the nearest actionSelection action is already blacklisted', () => {
    const def = makeDef([badAction]);
    const runtime = createGameDefRuntime(def);
    const state = {
      ...makeState(def),
      unavailableActionsPerTurn: { '0:0': [asActionId('bad')] },
      decisionStack: [{
        frameId: asDecisionFrameId(0),
        parentFrameId: null,
        turnId: asTurnId(0),
        context: {
          kind: 'actionSelection',
          seatId: '0' as SeatId,
          eligibleActions: [asActionId('bad')],
        },
        effectFrame: {
          programCounter: 0,
          boundedIterationCursors: {},
          localBindings: {},
          pendingTriggerQueue: [],
          decisionHistory: [{
            seatId: '0' as SeatId,
            decision: { kind: 'actionSelection', actionId: asActionId('bad'), move: { actionId: asActionId('bad'), params: {} } },
            decisionContextKind: 'actionSelection',
            decisionKey: null,
            frameId: asDecisionFrameId(0),
          }],
        },
      } satisfies DecisionStackFrame],
    };

    assert.equal(rollbackToActionSelection(def, state, runtime, 'forced test failure'), null);
  });

  it('publishes the authored pass fallback when every action is blacklisted', () => {
    const def = makeDef([badAction, passAction]);
    const state = {
      ...makeState(def),
      unavailableActionsPerTurn: { '0:0': [asActionId('bad'), asActionId('pass')] },
    };
    const published = publishMicroturn(def, state, createGameDefRuntime(def));

    assert.deepEqual(
      published.legalActions
        .filter((decision) => decision.kind === 'actionSelection')
        .map((decision) => decision.actionId),
      [asActionId('pass')],
    );
  });

  it('clears turn-scoped blacklist entries at turn retirement', () => {
    const def = makeDef([passAction]);
    const runtime = createGameDefRuntime(def);
    const retirementFrame: DecisionStackFrame = {
      frameId: asDecisionFrameId(0),
      parentFrameId: null,
      turnId: asTurnId(0),
      context: { kind: 'turnRetirement', seatId: '__kernel', retiringTurnId: asTurnId(0) },
      effectFrame: { programCounter: 0, boundedIterationCursors: {}, localBindings: {}, pendingTriggerQueue: [] },
    };
    const state = {
      ...makeState(def),
      decisionStack: [retirementFrame],
      unavailableActionsPerTurn: { '0:0': [asActionId('bad')], '1:0': [asActionId('other')] },
      activeDeciderSeatId: '__kernel' as const,
    };
    const published = publishMicroturn(def, state, runtime);
    const retired = applyDecision(def, state, published.legalActions[0]!, undefined, runtime).state;

    assert.deepEqual(retired.unavailableActionsPerTurn, { '1:0': [asActionId('other')] });
  });

  it('keeps recovery logs out of the decision log accumulator', () => {
    const simulatorSource = readFileSync('src/sim/simulator.ts', 'utf8');

    assert.equal(/decisionLogs\.push\([^)]*probeHole/i.test(simulatorSource), false);
    assert.equal(/decisionLogs\.push\([^)]*rollback\.logEntry/i.test(simulatorSource), false);
    assert.match(simulatorSource, /probeHoleRecoveries\.push\(rollback\.logEntry\)/);
  });
});
