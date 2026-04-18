// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createCollector,
  isEffectErrorCode,
  legalChoicesDiscover,
  type ActionDef,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamValue,
} from '../../../src/kernel/index.js';
import { makeExecutionEffectContext } from '../../helpers/effect-context-test-helpers.js';
import { eff } from '../../helpers/effect-tag-helper.js';

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
  zoneVars: {},
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
  _runningHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
  reveals: undefined,
  globalMarkers: undefined,
  activeLastingEffects: undefined,
  interruptPhaseStack: undefined,
});

const chooseOneEffect: EffectAST = eff({
  chooseOne: {
    internalDecisionId: 'decision:$token',
    bind: '$token',
    options: { query: 'tokensInZone', zone: 'hand:0' },
  },
});

const makeMove = (params: Record<string, unknown>): Move => ({
  actionId: asActionId('decide'),
  params: params as Move['params'],
});

const makeEffectContext = (moveParams: Readonly<Record<string, MoveParamValue>>): EffectContext => {
  const def = makeDef([chooseOneEffect]);
  const state = makeState();
  return makeExecutionEffectContext({
    def,
    state,
    moveParams,
    collector: createCollector(),
  });
};

describe('choice membership parity', () => {
  it('accepts token-id selections across legalChoices and effect execution', () => {
    const def = makeDef([chooseOneEffect]);
    const state = makeState();

    const pending = legalChoicesDiscover(def, state, makeMove({}));
    assert.equal(pending.kind, 'pending');
    assert.deepEqual(pending.options.map((option) => option.value), [asTokenId('tok-1')]);

    assert.deepEqual(legalChoicesDiscover(def, state, makeMove({ '$token': asTokenId('tok-1') })), {
      kind: 'complete',
      complete: true,
    });

    const effectResult = applyEffect(chooseOneEffect, makeEffectContext({ '$token': asTokenId('tok-1') }));
    assert.equal(effectResult.state.zones['hand:0']?.length, 1);
  });

  it('rejects out-of-domain selections across legalChoices and effect execution', () => {
    const def = makeDef([chooseOneEffect]);
    const state = makeState();

    assert.throws(
      () => legalChoicesDiscover(def, state, makeMove({ '$token': asTokenId('tok-missing') })),
      (error: unknown) => error instanceof Error && error.message.includes('invalid selection for chooseOne'),
    );

    assert.throws(
      () => applyEffect(chooseOneEffect, makeEffectContext({ '$token': asTokenId('tok-missing') })),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('outside options domain'),
    );
  });
});
