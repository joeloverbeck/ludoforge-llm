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

const phaseId = asPhaseId('main');

const createDef = (): GameDef => asTaggedGameDef({
  metadata: { id: 'atomic-legal-actions', players: { min: 2, max: 2 } },
  seats: [{ id: '0' }, { id: '1' }],
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
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
          internalDecisionId: 'decision:$pick',
          bind: '$pick',
          options: { query: 'enums', values: ['a', 'b'] },
        },
      }),
      eff({ addVar: { scope: 'global', var: 'score', delta: 1 } }),
    ],
    limits: [],
  } satisfies ActionDef],
  triggers: [],
  terminal: { conditions: [] },
});

const createState = (def: GameDef): GameState => ({
  globalVars: { score: 0 },
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

describe('atomic legal actions', () => {
  it('applies every published actionSelection, chooseOne, and turnRetirement decision directly', () => {
    const def = createDef();
    const runtime = createGameDefRuntime(def);

    const initial = createState(def);
    const actionSelection = publishMicroturn(def, initial, runtime);
    for (const decision of actionSelection.legalActions) {
      const decisionRecord = decision as unknown as Record<string, unknown>;
      assert.equal('certificateIndex' in decisionRecord, false);
      assert.equal('template' in decisionRecord, false);
      assert.doesNotThrow(() => {
        applyDecision(def, initial, decision, undefined, runtime);
      });
    }

    const afterAction = applyDecision(def, initial, actionSelection.legalActions[0]!, undefined, runtime).state;
    const chooseOne = publishMicroturn(def, afterAction, runtime);
    for (const decision of chooseOne.legalActions) {
      assert.doesNotThrow(() => {
        applyDecision(def, afterAction, decision, undefined, runtime);
      });
    }

    const retirementFrame: DecisionStackFrame = {
      frameId: asDecisionFrameId(0),
      parentFrameId: null,
      turnId: asTurnId(0),
      context: { kind: 'turnRetirement', seatId: '__kernel', retiringTurnId: asTurnId(0) },
      accumulatedBindings: {},
      effectFrame: { programCounter: 0, boundedIterationCursors: {}, localBindings: {}, pendingTriggerQueue: [] },
    };
    const retirementState = {
      ...createState(def),
      decisionStack: [retirementFrame],
      activeDeciderSeatId: '__kernel' as const,
    };
    const retirement = publishMicroturn(def, retirementState, runtime);
    for (const decision of retirement.legalActions) {
      assert.doesNotThrow(() => {
        applyDecision(def, retirementState, decision, undefined, runtime);
      });
    }
  });
});
