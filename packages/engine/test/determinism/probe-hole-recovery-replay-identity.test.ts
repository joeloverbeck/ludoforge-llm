// @test-class: architectural-invariant

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asDecisionFrameId,
  type DecisionKey,
  asPhaseId,
  asPlayerId,
  type SeatId,
  asTurnId,
  createGameDefRuntime,
  resolveActiveDeciderSeatIdForPlayer,
  rollbackToActionSelection,
  serializeTrace,
  type ActionDef,
  type DecisionStackFrame,
  type GameDef,
  type GameState,
  type GameTrace,
  type ProbeHoleRecoveryLog,
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

const makeDef = (actions: readonly ActionDef[]): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'probe-hole-recovery-replay-identity', players: { min: 2, max: 2 } },
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

const actionSelectionFrame = (): DecisionStackFrame => ({
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
});

const probeHoleFrame = (): DecisionStackFrame => ({
  frameId: asDecisionFrameId(1),
  parentFrameId: asDecisionFrameId(0),
  turnId: asTurnId(0),
  context: { kind: 'chooseOne', seatId: '0' as SeatId, decisionKey: '$first' as DecisionKey, options: [] },
  effectFrame: { programCounter: 0, boundedIterationCursors: {}, localBindings: {}, pendingTriggerQueue: [] },
});

const makeRecoverableState = (def: GameDef): GameState => ({
  ...makeState(def),
  decisionStack: [actionSelectionFrame(), probeHoleFrame()],
  nextFrameId: asDecisionFrameId(2),
});

const makeTrace = (
  def: GameDef,
  finalState: GameState,
  logEntry: ProbeHoleRecoveryLog,
): GameTrace => ({
  gameDefId: def.metadata.id,
  seed: 144,
  decisions: [],
  probeHoleRecoveries: [logEntry],
  recoveredFromProbeHole: 1,
  compoundTurns: [],
  finalState,
  result: null,
  turnsCount: finalState.turnCount,
  stopReason: 'maxTurns',
  traceProtocolVersion: 'spec-140',
});

describe('probe-hole recovery replay identity', () => {
  it('serializes identical recovery traces from identical rollback states', () => {
    const def = makeDef([badAction, passAction]);
    const reason = 'forced deterministic recovery replay proof';

    const first = rollbackToActionSelection(def, makeRecoverableState(def), createGameDefRuntime(def), reason);
    const second = rollbackToActionSelection(def, makeRecoverableState(def), createGameDefRuntime(def), reason);

    assert.notEqual(first, null);
    assert.notEqual(second, null);

    assert.equal(first!.state.stateHash, second!.state.stateHash);
    assert.equal(first!.logEntry.stateHashBefore, second!.logEntry.stateHashBefore);
    assert.equal(first!.logEntry.stateHashAfter, second!.logEntry.stateHashAfter);
    assert.notEqual(first!.logEntry.stateHashBefore, first!.logEntry.stateHashAfter);
    assert.deepEqual(first!.state.unavailableActionsPerTurn, second!.state.unavailableActionsPerTurn);
    assert.deepEqual(first!.logEntry, second!.logEntry);

    const firstTrace = makeTrace(def, first!.state, first!.logEntry);
    const secondTrace = makeTrace(def, second!.state, second!.logEntry);

    assert.equal(firstTrace.recoveredFromProbeHole, firstTrace.probeHoleRecoveries.length);
    assert.equal(secondTrace.recoveredFromProbeHole, secondTrace.probeHoleRecoveries.length);
    assert.equal(
      JSON.stringify(serializeTrace(firstTrace)),
      JSON.stringify(serializeTrace(secondTrace)),
    );
  });
});
