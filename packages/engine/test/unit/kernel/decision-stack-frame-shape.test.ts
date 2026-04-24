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
  metadata: { id: 'decision-stack-frame-shape', players: { min: 2, max: 2 } },
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

describe('decision stack frame shape', () => {
  it('retains continuation bindings only on the root frame', () => {
    const def = createDef();
    const runtime = createGameDefRuntime(def);

    const initial = createState(def);
    const actionSelection = publishMicroturn(def, initial, runtime);
    const afterAction = applyDecision(def, initial, actionSelection.legalActions[0]!, undefined, runtime).state;

    assert.equal(afterAction.decisionStack?.length, 2);
    assert.deepEqual(afterAction.decisionStack?.[0]?.continuationBindings, {});
    assert.equal(afterAction.decisionStack?.[1]?.continuationBindings, undefined);

    const chooseOne = publishMicroturn(def, afterAction, runtime);
    const branch = chooseOne.legalActions.find((entry) => entry.kind === 'chooseOne');
    assert.ok(branch);
    const afterChooseOne = applyDecision(def, afterAction, branch!, undefined, runtime).state;

    assert.equal(afterChooseOne.decisionStack?.length, 2);
    assert.equal(afterChooseOne.decisionStack?.[1]?.continuationBindings, undefined);

    const chooseN = publishMicroturn(def, afterChooseOne, runtime);
    const addDecision = chooseN.legalActions.find(
      (entry) => entry.kind === 'chooseNStep' && entry.command === 'add' && entry.value === 'a',
    );
    assert.ok(addDecision);
    const afterAdd = applyDecision(def, afterChooseOne, addDecision!, undefined, runtime).state;

    assert.deepEqual(afterAdd.decisionStack?.[0]?.continuationBindings, {
      '$branch': 'left',
      '$targets': ['a'],
    });
    assert.equal(afterAdd.decisionStack?.[1]?.continuationBindings, undefined);
  });
});
