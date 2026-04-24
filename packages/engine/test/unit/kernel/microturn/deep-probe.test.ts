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
  isBridgeableNextDecision,
  publishMicroturn,
  resolveActiveDeciderSeatIdForPlayer,
  type ActionDef,
  type ChoicePendingRequest,
  type DecisionKey,
  type GameDef,
  type GameState,
  type Move,
} from '../../../../src/kernel/index.js';
import { LruCache } from '../../../../src/shared/lru-cache.js';
import { eff } from '../../../helpers/effect-tag-helper.js';
import { asTaggedGameDef } from '../../../helpers/gamedef-fixtures.js';

const makeBaseDef = (actions: readonly ActionDef[]): GameDef =>
  asTaggedGameDef({
    metadata: { id: 'deep-probe-smoke', players: { min: 2, max: 2 } },
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

const makeBaseState = (def: GameDef): GameState => ({
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
});

const chooseOneEffect = (bind: string, values: readonly string[]) => eff({
  chooseOne: {
    internalDecisionId: `decision:${bind}`,
    bind,
    options: { query: 'enums', values: [...values] },
  },
});

const chooseNExactEffect = (bind: string, values: readonly string[], n: number) => eff({
  chooseN: {
    internalDecisionId: `decision:${bind}`,
    bind,
    options: { query: 'enums', values: [...values] },
    n,
  },
});

describe('microturn deep publication probe', () => {
  it('treats depth zero as an optimistic bridge', () => {
    const action: ActionDef = {
      id: asActionId('noop'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const def = makeBaseDef([action]);
    const runtime = createGameDefRuntime(def);
    const state = makeBaseState(def);
    const move: Move = { actionId: action.id, params: {} };
    const request: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      type: 'chooseOne',
      decisionKey: '$choice' as DecisionKey,
      name: '$choice',
      options: [],
      targetKinds: [],
    };

    assert.equal(isBridgeableNextDecision({ def, state, runtime, move, depthBudget: 0 }, request), true);
  });

  it('rejects zero-option choice requests within budget', () => {
    const action: ActionDef = {
      id: asActionId('noop'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    };
    const def = makeBaseDef([action]);
    const runtime = createGameDefRuntime(def);
    const state = makeBaseState(def);
    const move: Move = { actionId: action.id, params: {} };
    const request: ChoicePendingRequest = {
      kind: 'pending',
      complete: false,
      type: 'chooseN',
      decisionKey: '$targets' as DecisionKey,
      name: '$targets',
      options: [],
      targetKinds: [],
      selected: [],
      canConfirm: false,
    };

    assert.equal(isBridgeableNextDecision({ def, state, runtime, move, depthBudget: 3 }, request), false);
  });

  it('does not publish an action whose selected continuation opens an empty choice frame', () => {
    const action: ActionDef = {
      id: asActionId('dead-end'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        chooseOneEffect('$first', ['A']),
        chooseOneEffect('$second', []),
        eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } }),
      ],
      limits: [],
    };
    const def = makeBaseDef([action]);
    const runtime = createGameDefRuntime(def);

    assert.throws(
      () => publishMicroturn(def, makeBaseState(def), runtime),
      /MICROTURN_CONSTRUCTIBILITY_INVARIANT: no simple actionSelection moves are currently bridgeable/,
    );
  });

  it('keeps bridgeable choice and chooseN continuations publishable and pure across repeated invocations', () => {
    const action: ActionDef = {
      id: asActionId('bridgeable'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        chooseOneEffect('$first', ['A']),
        chooseNExactEffect('$targets', ['B'], 1),
        eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } }),
      ],
      limits: [],
    };
    const def = makeBaseDef([action]);
    const runtime = createGameDefRuntime(def);
    let state = makeBaseState(def);

    const firstPublication = publishMicroturn(def, state, runtime);
    const secondPublication = publishMicroturn(def, state, runtime);
    assert.equal(firstPublication.kind, 'actionSelection');
    assert.equal(secondPublication.kind, 'actionSelection');
    assert.deepEqual(secondPublication.legalActions, firstPublication.legalActions);

    state = applyDecision(def, state, firstPublication.legalActions[0]!, undefined, runtime).state;
    const choice = publishMicroturn(def, state, runtime);
    assert.equal(choice.kind, 'chooseOne');
    state = applyDecision(def, state, choice.legalActions[0]!, undefined, runtime).state;

    assert.equal(state.globalVars.resources, 1);
    assert.deepEqual(state.decisionStack, []);
  });

  it('keeps publication verdicts identical when the probe cache is disabled', () => {
    const deadEnd: ActionDef = {
      id: asActionId('dead-end'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        chooseOneEffect('$first', ['A']),
        chooseOneEffect('$second', []),
      ],
      limits: [],
    };
    const bridgeable: ActionDef = {
      id: asActionId('bridgeable'),
      actor: 'active',
      executor: 'actor',
      phase: [asPhaseId('main')],
      params: [],
      pre: null,
      cost: [],
      effects: [
        chooseOneEffect('$first', ['A']),
        eff({ addVar: { scope: 'global', var: 'resources', delta: 1 } }),
      ],
      limits: [],
    };
    const def = makeBaseDef([deadEnd, bridgeable]);
    const state = makeBaseState(def);
    const runtime = createGameDefRuntime(def);
    const noCacheRuntime = {
      ...runtime,
      publicationProbeCache: new LruCache<string, boolean>(0),
    };

    const cachedPublication = publishMicroturn(def, state, runtime);
    const uncachedPublication = publishMicroturn(def, state, noCacheRuntime);

    assert.equal(cachedPublication.kind, 'actionSelection');
    assert.equal(uncachedPublication.kind, 'actionSelection');
    assert.deepEqual(uncachedPublication.legalActions, cachedPublication.legalActions);
  });
});
