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
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../helpers/gamedef-fixtures.js';

const phaseId = asPhaseId('main');

const createDef = (): GameDef => asTaggedGameDef({
  metadata: { id: 'decision-stack-invariants', players: { min: 2, max: 2 } },
  seats: [{ id: '0' }, { id: '1' }],
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [{ id: 'board:none', owner: 'none', visibility: 'public', ordering: 'set' }],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: phaseId }] },
  actions: [{
    id: asActionId('nested'),
    actor: 'active',
    executor: 'actor',
    phase: [phaseId],
    params: [],
    pre: null,
    cost: [],
    effects: [
      eff({
        chooseOne: {
          internalDecisionId: 'decision:$branch',
          bind: '$branch',
          options: { query: 'enums', values: ['left'] },
        },
      }),
      eff({
        chooseN: {
          internalDecisionId: 'decision:$targets',
          bind: '$targets',
          options: { query: 'enums', values: ['a', 'b'] },
          min: 1,
          max: 2,
        },
      }),
    ],
    limits: [],
  } satisfies ActionDef],
  triggers: [],
  terminal: { conditions: [] },
});

const createState = (def: GameDef): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: { 'board:none': [] },
  nextTokenOrdinal: 0,
  currentPhase: phaseId,
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

describe('decision stack invariants', () => {
  it('keeps frame ids monotonic, parent chains coherent, and turn grouping stable across nested decisions', () => {
    const def = createDef();
    const runtime = createGameDefRuntime(def);
    const initial = createState(def);

    const actionSelection = publishMicroturn(def, initial, runtime);
    const afterAction = applyDecision(def, initial, actionSelection.legalActions[0]!, undefined, runtime).state;
    const actionStack = afterAction.decisionStack ?? [];
    assert.equal(afterAction.nextFrameId, asDecisionFrameId(2));
    assert.equal(afterAction.nextTurnId, asTurnId(0));
    assert.equal(actionStack.length, 2);
    assert.equal(actionStack[0]?.parentFrameId, null);
    assert.equal(actionStack[1]?.parentFrameId, actionStack[0]?.frameId ?? null);
    assert.equal(actionStack[0]?.turnId, actionStack[1]?.turnId);
    assert.equal(actionStack[1]?.continuationBindings, undefined);

    const chooseOne = publishMicroturn(def, afterAction, runtime);
    const branch = chooseOne.legalActions.find((entry) => entry.kind === 'chooseOne');
    assert.ok(branch);
    const afterChooseOne = applyDecision(def, afterAction, branch, undefined, runtime).state;
    const chooseOneStack = afterChooseOne.decisionStack ?? [];
    assert.equal(afterChooseOne.nextFrameId, asDecisionFrameId(3));
    assert.equal(afterChooseOne.nextTurnId, asTurnId(0));
    assert.equal(chooseOneStack.length, 2);
    assert.equal(chooseOneStack[0]?.frameId, actionStack[0]?.frameId);
    assert.equal(chooseOneStack[1]?.frameId, asDecisionFrameId(2));
    assert.equal(chooseOneStack[1]?.parentFrameId, chooseOneStack[0]?.frameId ?? null);
    assert.equal(chooseOneStack[0]?.turnId, chooseOneStack[1]?.turnId);
    assert.equal(chooseOneStack[1]?.continuationBindings, undefined);

    let chooseN = publishMicroturn(def, afterChooseOne, runtime);
    const addDecision = chooseN.legalActions.find(
      (entry) => entry.kind === 'chooseNStep' && entry.command === 'add' && entry.value === 'a',
    );
    assert.ok(addDecision);
    const afterAdd = applyDecision(def, afterChooseOne, addDecision, undefined, runtime).state;
    const afterAddStack = afterAdd.decisionStack ?? [];
    assert.equal(afterAdd.nextFrameId, afterChooseOne.nextFrameId);
    assert.equal(afterAdd.nextTurnId, afterChooseOne.nextTurnId);
    assert.equal(afterAddStack[1]?.parentFrameId, afterAddStack[0]?.frameId ?? null);
    assert.equal(afterAddStack[0]?.turnId, afterAddStack[1]?.turnId);
    assert.equal(afterAddStack[1]?.continuationBindings, undefined);

    chooseN = publishMicroturn(def, afterAdd, runtime);
    const confirmDecision = chooseN.legalActions.find(
      (entry) => entry.kind === 'chooseNStep' && entry.command === 'confirm',
    );
    assert.ok(confirmDecision);
    const retired = applyDecision(def, afterAdd, confirmDecision, undefined, runtime).state;
    assert.deepEqual(retired.decisionStack, []);
    assert.equal(retired.nextTurnId, asTurnId(1));
  });
});
