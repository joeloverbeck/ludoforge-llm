import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  applyEffects,
  asPhaseId,
  asPlayerId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-reveal-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'set' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'set' },
    { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [{ id: 'piece', props: { faction: 'string' } }],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
}) as unknown as GameDef;

const makeState = (): GameState => ({
  globalVars: {},
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'hand:0': [],
    'hand:1': [],
    'board:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => {
  const def = makeDef();
  return {
    def,
    adjacencyGraph: buildAdjacencyGraph(def.zones),
    state: makeState(),
    rng: createRng(9n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: {},
    moveParams: {},
    collector: createCollector(),
    ...overrides,
  };
};

describe('effects reveal', () => {
  it('appends a zone grant for a specific player selector', () => {
    const effect: EffectAST = { reveal: { zone: 'hand:0', to: { id: asPlayerId(1) } } };
    const result = applyEffect(effect, makeCtx());

    assert.deepEqual(result.state.reveals, {
      'hand:0': [{ observers: [asPlayerId(1)] }],
    });
  });

  it('stores public grant when to is all', () => {
    const effect: EffectAST = { reveal: { zone: 'hand:0', to: 'all' } };
    const result = applyEffect(effect, makeCtx());

    assert.deepEqual(result.state.reveals, {
      'hand:0': [{ observers: 'all' }],
    });
  });

  it('accumulates multiple reveal grants for the same zone', () => {
    const effects: readonly EffectAST[] = [
      { reveal: { zone: 'hand:0', to: { id: asPlayerId(0) } } },
      { reveal: { zone: 'hand:0', to: { id: asPlayerId(1) } } },
    ];

    const result = applyEffects(effects, makeCtx());

    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(0)] },
        { observers: [asPlayerId(1)] },
      ],
    });
  });

  it('preserves filter metadata in reveal grants', () => {
    const effect: EffectAST = {
      reveal: {
        zone: 'hand:0',
        to: { id: asPlayerId(1) },
        filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
      },
    };

    const result = applyEffect(effect, makeCtx());
    assert.deepEqual(result.state.reveals, {
      'hand:0': [
        { observers: [asPlayerId(1)], filter: [{ prop: 'faction', op: 'eq', value: 'US' }] },
      ],
    });
  });

  it('throws runtime error when state is missing resolved zone entry', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        zones: {
          'hand:1': [],
          'board:none': [],
        },
      },
    });

    assert.throws(
      () => applyEffect({ reveal: { zone: 'hand:0', to: 'all' } }, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('Zone state not found'),
    );
  });
});
