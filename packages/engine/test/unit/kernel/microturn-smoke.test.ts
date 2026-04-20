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
  createGameDefRuntime,
  publishMicroturn,
  resolveActiveDeciderSeatIdForPlayer,
  type ActionDef,
  type DecisionStackFrame,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const makeBaseDef = (actions: readonly ActionDef[]): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'microturn-smoke', players: { min: 2, max: 2 } },
    seats: [{ id: '0' }, { id: '1' }],
    constants: {},
    globalVars: [{ name: 'resources', type: 'int', init: 0, min: 0, max: 10 }],
    perPlayerVars: [],
    zones: [{ id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions,
    triggers: [],
    terminal: { conditions: [] },
  });

const makeBaseState = (def: GameDef, overrides?: Partial<GameState>): GameState => ({
  globalVars: { resources: 0 },
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
  ...overrides,
});

const chooseOneEffect = (bind: string, values: readonly string[]) => eff({
  chooseOne: {
    internalDecisionId: `decision:${bind}`,
    bind,
    options: { query: 'enums', values: [...values] },
  },
});

describe('microturn bridge smoke', () => {
  it('publishes and applies a simple action-selection decision through the legacy move path', () => {
    const action: ActionDef = {
      id: asActionId('gain'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } })],
      limits: [],
    };
    const def = makeBaseDef([action]);
    const runtime = createGameDefRuntime(def);
    const state = makeBaseState(def);

    const microturn = publishMicroturn(def, state, runtime);
    assert.equal(microturn.kind, 'actionSelection');
    assert.equal(microturn.legalActions.length, 1);
    assert.equal(microturn.legalActions[0]?.kind, 'actionSelection');

    const applied = applyDecision(def, state, microturn.legalActions[0]!, undefined, runtime);
    assert.equal(applied.state.globalVars.resources, 1);
    assert.equal(applied.state.turnCount, 1);
    assert.deepEqual(applied.state.decisionStack, []);
    assert.equal(applied.log.decisionContextKind, 'actionSelection');
    assert.equal(applied.log.turnRetired, true);
  });

  it('bridges a simple chooseOne sequence with a suspended root frame', () => {
    const action: ActionDef = {
      id: asActionId('choose-and-gain'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        chooseOneEffect('$target', ['A', 'B']),
        eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } }),
      ],
      limits: [],
    };
    const def = makeBaseDef([action]);
    const runtime = createGameDefRuntime(def);
    const state = makeBaseState(def);

    const actionSelection = publishMicroturn(def, state, runtime);
    const afterActionSelection = applyDecision(def, state, actionSelection.legalActions[0]!, undefined, runtime);
    assert.equal(afterActionSelection.state.decisionStack?.length, 2);

    const chooseOne = publishMicroturn(def, afterActionSelection.state, runtime);
    assert.equal(chooseOne.kind, 'chooseOne');
    assert.equal(chooseOne.legalActions.length, 2);

    const chosen = chooseOne.legalActions.find((entry) => entry.kind === 'chooseOne' && entry.value === 'A');
    assert.ok(chosen);

    const afterChoice = applyDecision(def, afterActionSelection.state, chosen, undefined, runtime);
    assert.equal(afterChoice.state.globalVars.resources, 1);
    assert.equal(afterChoice.state.turnCount, 1);
    assert.deepEqual(afterChoice.state.decisionStack, []);
    assert.equal(afterChoice.log.decisionContextKind, 'chooseOne');
    assert.equal(afterChoice.log.turnRetired, true);
  });

  it('resolves an explicit turnRetirement frame for round-robin one-phase states', () => {
    const def = makeBaseDef([]);
    const runtime = createGameDefRuntime(def);
    const retirementFrame: DecisionStackFrame = {
      frameId: asDecisionFrameId(0),
      parentFrameId: null,
      turnId: asTurnId(0),
      context: {
        kind: 'turnRetirement',
        seatId: '__kernel',
        retiringTurnId: asTurnId(0),
      },
      accumulatedBindings: {},
      effectFrame: {
        programCounter: 0,
        boundedIterationCursors: {},
        localBindings: {},
        pendingTriggerQueue: [],
      },
    };
    const state = makeBaseState(def, {
      decisionStack: [retirementFrame],
      activeDeciderSeatId: '__kernel',
    });

    const microturn = publishMicroturn(def, state, runtime);
    assert.equal(microturn.kind, 'turnRetirement');

    const applied = applyDecision(def, state, microturn.legalActions[0]!, undefined, runtime);
    assert.equal(applied.state.turnCount, 1);
    assert.equal(applied.state.activePlayer, asPlayerId(1));
    assert.deepEqual(applied.state.decisionStack, []);
    assert.equal(applied.log.turnRetired, true);
  });
});

