import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  applyEffect,
  asPhaseId,
  asPlayerId,
  asZoneId,
  createRng,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-choice-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 10 }],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('hand:0'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('hand:1'), owner: 'player', visibility: 'owner', ordering: 'stack' },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: {
    phases: [],
    activePlayerOrder: 'roundRobin',
  },
  actions: [],
  triggers: [],
  endConditions: [],
});

const makeState = (): GameState => ({
  globalVars: { score: 3 },
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'hand:0': [],
    'hand:1': [],
    'discard:none': [],
  },
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
  markers: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph([]),
  state: makeState(),
  rng: createRng(19n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  ...overrides,
});

describe('effects choice assertions', () => {
  it('chooseOne succeeds when selected move param is in evaluated domain', () => {
    const ctx = makeCtx({ moveParams: { $choice: 'beta' } });
    const effect: EffectAST = {
      chooseOne: {
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseOne throws when move param binding is missing', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      chooseOne: {
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('missing move param binding');
    });
  });

  it('chooseOne throws when selected value is outside domain', () => {
    const ctx = makeCtx({ moveParams: { $choice: 'delta' } });
    const effect: EffectAST = {
      chooseOne: {
        bind: '$choice',
        options: { query: 'enums', values: ['alpha', 'beta'] },
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('outside options domain');
    });
  });

  it('chooseN succeeds for exact-length unique in-domain array', () => {
    const ctx = makeCtx({ moveParams: { $picks: ['alpha', 'gamma'] } });
    const effect: EffectAST = {
      chooseN: {
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        n: 2,
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN throws on duplicate selections', () => {
    const ctx = makeCtx({ moveParams: { $picks: ['alpha', 'alpha'] } });
    const effect: EffectAST = {
      chooseN: {
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta'] },
        n: 2,
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('must be unique');
    });
  });

  it('chooseN throws on wrong cardinality', () => {
    const ctx = makeCtx({ moveParams: { $picks: ['alpha'] } });
    const effect: EffectAST = {
      chooseN: {
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta'] },
        n: 2,
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('cardinality mismatch');
    });
  });

  it('chooseN throws on out-of-domain selections', () => {
    const ctx = makeCtx({ moveParams: { $picks: ['alpha', 'delta'] } });
    const effect: EffectAST = {
      chooseN: {
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        n: 2,
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('outside options domain');
    });
  });

  it('chooseN supports up-to cardinality with max only', () => {
    const ctx = makeCtx({ moveParams: { $picks: ['alpha'] } });
    const effect: EffectAST = {
      chooseN: {
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        max: 2,
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN supports min..max cardinality ranges', () => {
    const ctx = makeCtx({ moveParams: { $picks: ['alpha', 'beta'] } });
    const effect: EffectAST = {
      chooseN: {
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        min: 1,
        max: 2,
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('chooseN range throws when selected count is outside min..max', () => {
    const ctx = makeCtx({ moveParams: { $picks: [] } });
    const effect: EffectAST = {
      chooseN: {
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        min: 1,
        max: 2,
      },
    };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('cardinality mismatch');
    });
  });

  it('chooseN throws when n is negative or non-integer', () => {
    const negativeCtx = makeCtx({ moveParams: { $picks: [] } });
    const nonIntegerCtx = makeCtx({ moveParams: { $picks: ['alpha'] } });

    assert.throws(
      () =>
        applyEffect(
          {
            chooseN: {
              bind: '$picks',
              options: { query: 'enums', values: ['alpha'] },
              n: -1,
            },
          },
          negativeCtx,
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('non-negative integer'),
    );

    assert.throws(
      () =>
        applyEffect(
          {
            chooseN: {
              bind: '$picks',
              options: { query: 'enums', values: ['alpha'] },
              n: 1.5,
            },
          },
          nonIntegerCtx,
        ),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('non-negative integer'),
    );
  });

  it('chooseN throws when cardinality declaration mixes n with max', () => {
    const ctx = makeCtx({ moveParams: { $picks: ['alpha'] } });
    const effect = {
      chooseN: {
        bind: '$picks',
        options: { query: 'enums', values: ['alpha', 'beta', 'gamma'] },
        n: 1,
        max: 2,
      },
    } as unknown as EffectAST;

    assert.throws(
      () => applyEffect(effect, ctx),
      (error: unknown) => isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('either exact n or range'),
    );
  });

  it('bindings shadow moveParams in options query evaluation for chooseOne', () => {
    const ctx = makeCtx({
      moveParams: { $owner: asPlayerId(0), $pickedZone: 'hand:1' },
      bindings: { $owner: asPlayerId(1) },
    });
    const effect: EffectAST = {
      chooseOne: {
        bind: '$pickedZone',
        options: { query: 'zones', filter: { owner: { chosen: '$owner' } } },
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });
});
