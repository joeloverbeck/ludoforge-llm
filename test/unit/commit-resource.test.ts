import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyEffect,
  applyEffects,
  asPhaseId,
  asPlayerId,
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
  metadata: { id: 'commit-resource-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'pot', type: 'int', init: 0, min: 0, max: 50 },
    { name: 'globalFlag', type: 'boolean', init: false },
  ],
  perPlayerVars: [
    { name: 'coins', type: 'int', init: 0, min: 0, max: 50 },
    { name: 'committed', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'locked', type: 'boolean', init: false },
  ],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { pot: 4, globalFlag: false },
  perPlayerVars: {
    '0': { coins: 10, committed: 1, locked: false },
    '1': { coins: 7, committed: 2, locked: false },
  },
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(1),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  turnOrderState: { type: 'roundRobin' },
  markers: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(9n),
  activePlayer: asPlayerId(1),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

describe('commitResource effect', () => {
  it('transfers exact amount when source and destination both have capacity', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      commitResource: {
        from: { scope: 'pvar', player: 'actor', var: 'coins' },
        to: { scope: 'global', var: 'pot' },
        amount: 3,
      },
    };

    const result = applyEffect(effect, ctx);

    assert.equal(result.state.perPlayerVars['0']?.coins, 7);
    assert.equal(result.state.globalVars.pot, 7);
    assert.deepEqual(result.emittedEvents, [
      { type: 'varChanged', scope: 'perPlayer', player: asPlayerId(0), var: 'coins', oldValue: 10, newValue: 7 },
      { type: 'varChanged', scope: 'global', var: 'pot', oldValue: 4, newValue: 7 },
    ]);
  });

  it('clamps over-requested amount to available source balance (all-in)', () => {
    const ctx = makeCtx();

    const result = applyEffect(
      {
        commitResource: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'global', var: 'pot' },
          amount: 999,
        },
      },
      ctx,
    );

    assert.equal(result.state.perPlayerVars['0']?.coins, 0);
    assert.equal(result.state.globalVars.pot, 14);
  });

  it('applies min all-in trigger when regular transfer would be below min', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        perPlayerVars: {
          ...makeState().perPlayerVars,
          '0': { coins: 3, committed: 1, locked: false },
        },
      },
    });

    const result = applyEffect(
      {
        commitResource: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'global', var: 'pot' },
          amount: 2,
          min: 4,
        },
      },
      ctx,
    );

    assert.equal(result.state.perPlayerVars['0']?.coins, 0);
    assert.equal(result.state.globalVars.pot, 7);
  });

  it('caps transfer using max after all-in calculation', () => {
    const ctx = makeCtx();

    const result = applyEffect(
      {
        commitResource: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'global', var: 'pot' },
          amount: 9,
          max: 4,
        },
      },
      ctx,
    );

    assert.equal(result.state.perPlayerVars['0']?.coins, 6);
    assert.equal(result.state.globalVars.pot, 8);
  });

  it('binds actual transferred amount, not requested amount', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          commitResource: {
            from: { scope: 'pvar', player: 'actor', var: 'coins' },
            to: { scope: 'global', var: 'pot' },
            amount: 999,
            actualBind: '$actual',
          },
        },
        { addVar: { scope: 'global', var: 'pot', delta: { ref: 'binding', name: '$actual' } } },
      ],
      ctx,
    );

    assert.equal(result.state.globalVars.pot, 24);
  });

  it('is a no-op for zero transfer and still exports actualBind=0', () => {
    const ctx = makeCtx();
    const result = applyEffects(
      [
        {
          commitResource: {
            from: { scope: 'pvar', player: 'actor', var: 'coins' },
            to: { scope: 'global', var: 'pot' },
            amount: 0,
            actualBind: '$actual',
          },
        },
        { addVar: { scope: 'global', var: 'pot', delta: { ref: 'binding', name: '$actual' } } },
      ],
      ctx,
    );

    assert.equal(result.state, ctx.state);
    assert.deepEqual(result.emittedEvents, []);
  });

  it('preserves total resources for source/destination pair over a transfer matrix', () => {
    for (const amount of [0, 1, 5, 9, 10, 50]) {
      for (const min of [undefined, 0, 3, 20] as const) {
        for (const max of [undefined, 2, 7, 30] as const) {
          const ctx = makeCtx();
          const beforeTotal = Number(ctx.state.perPlayerVars['0']?.coins ?? 0) + Number(ctx.state.globalVars.pot ?? 0);
          const effect: EffectAST = {
            commitResource: {
              from: { scope: 'pvar', player: 'actor', var: 'coins' },
              to: { scope: 'global', var: 'pot' },
              amount,
              ...(min === undefined ? {} : { min }),
              ...(max === undefined ? {} : { max }),
            },
          };
          const result = applyEffect(effect, ctx);
          const afterTotal = Number(result.state.perPlayerVars['0']?.coins ?? 0) + Number(result.state.globalVars.pot ?? 0);
          assert.equal(afterTotal, beforeTotal);
        }
      }
    }
  });

  it('transfers to another player per-player variable', () => {
    const ctx = makeCtx();
    const result = applyEffect(
      {
        commitResource: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'pvar', player: 'active', var: 'committed' },
          amount: 5,
        },
      },
      ctx,
    );

    assert.equal(result.state.perPlayerVars['0']?.coins, 5);
    assert.equal(result.state.perPlayerVars['1']?.committed, 7);
  });

  it('caps transfer by destination max headroom while preserving conservation', () => {
    const ctx = makeCtx({
      state: {
        ...makeState(),
        perPlayerVars: {
          ...makeState().perPlayerVars,
          '1': { coins: 7, committed: 19, locked: false },
        },
      },
    });

    const result = applyEffect(
      {
        commitResource: {
          from: { scope: 'pvar', player: 'actor', var: 'coins' },
          to: { scope: 'pvar', player: 'active', var: 'committed' },
          amount: 6,
        },
      },
      ctx,
    );

    assert.equal(result.state.perPlayerVars['0']?.coins, 9);
    assert.equal(result.state.perPlayerVars['1']?.committed, 20);
    const beforeTotal =
      Number(ctx.state.perPlayerVars['0']?.coins ?? 0) + Number(ctx.state.perPlayerVars['1']?.committed ?? 0);
    const afterTotal =
      Number(result.state.perPlayerVars['0']?.coins ?? 0) + Number(result.state.perPlayerVars['1']?.committed ?? 0);
    assert.equal(afterTotal, beforeTotal);
  });

  it('throws EFFECT_RUNTIME when to.scope is pvar and to.player is missing', () => {
    const ctx = makeCtx();
    assert.throws(
      () =>
        applyEffect(
          {
            commitResource: {
              from: { scope: 'pvar', player: 'actor', var: 'coins' },
              to: { scope: 'pvar', var: 'committed' },
              amount: 1,
            },
          },
          ctx,
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('to.player is required'),
    );
  });

  it('throws EFFECT_RUNTIME for boolean variable source or destination', () => {
    const ctx = makeCtx();
    assert.throws(
      () =>
        applyEffect(
          {
            commitResource: {
              from: { scope: 'pvar', player: 'actor', var: 'locked' },
              to: { scope: 'global', var: 'pot' },
              amount: 1,
            },
          },
          ctx,
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('non-int variable'),
    );

    assert.throws(
      () =>
        applyEffect(
          {
            commitResource: {
              from: { scope: 'pvar', player: 'actor', var: 'coins' },
              to: { scope: 'global', var: 'globalFlag' },
              amount: 1,
            },
          },
          ctx,
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('non-int variable'),
    );
  });
});
