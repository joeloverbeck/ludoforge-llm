import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  isEffectErrorCode,
  legalChoices,
  type ActionDef,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamValue,
} from '../../../src/kernel/index.js';

const makeDef = (effects: readonly EffectAST[]): GameDef =>
  ({
    metadata: { id: 'choice-membership-parity', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
      { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
    ],
    tokenTypes: [{ id: 'piece', props: {} }],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('decide'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects,
        limits: [],
      } as ActionDef,
    ],
    triggers: [],
    terminal: { conditions: [] },
  }) as unknown as GameDef;

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'hand:0': [{ id: asTokenId('tok-1'), type: 'piece', props: {} }],
    'discard:none': [],
  },
  nextTokenOrdinal: 1,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const chooseOneEffect: EffectAST = {
  chooseOne: {
    internalDecisionId: 'decision:$token',
    bind: '$token',
    options: { query: 'tokensInZone', zone: 'hand:0' },
  },
};

const makeMove = (params: Record<string, unknown>): Move => ({
  actionId: asActionId('decide'),
  params: params as Move['params'],
});

const makeEffectContext = (moveParams: Readonly<Record<string, MoveParamValue>>): EffectContext => {
  const def = makeDef([chooseOneEffect]);
  const state = makeState();
  return {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state,
    rng: createRng(11n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: {},
    moveParams,
    collector: createCollector(),
  };
};

describe('choice membership parity', () => {
  it('accepts token-id selections across legalChoices and effect execution', () => {
    const def = makeDef([chooseOneEffect]);
    const state = makeState();

    const pending = legalChoices(def, state, makeMove({}));
    assert.equal(pending.kind, 'pending');
    assert.deepEqual(pending.options, [asTokenId('tok-1')]);

    assert.deepEqual(legalChoices(def, state, makeMove({ 'decision:$token': asTokenId('tok-1') })), {
      kind: 'complete',
      complete: true,
    });

    const effectResult = applyEffect(chooseOneEffect, makeEffectContext({ 'decision:$token': asTokenId('tok-1') }));
    assert.equal(effectResult.state.zones['hand:0']?.length, 1);
  });

  it('rejects out-of-domain selections across legalChoices and effect execution', () => {
    const def = makeDef([chooseOneEffect]);
    const state = makeState();

    assert.throws(
      () => legalChoices(def, state, makeMove({ 'decision:$token': asTokenId('tok-missing') })),
      (error: unknown) => error instanceof Error && error.message.includes('invalid selection for chooseOne'),
    );

    assert.throws(
      () => applyEffect(chooseOneEffect, makeEffectContext({ 'decision:$token': asTokenId('tok-missing') })),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('outside options domain'),
    );
  });
});
