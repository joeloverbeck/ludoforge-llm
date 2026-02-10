import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EffectBudgetExceededError,
  SpatialNotImplementedError,
  applyEffect,
  applyEffects,
  asPhaseId,
  asPlayerId,
  createRng,
  getMaxEffectOps,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-runtime-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [{ name: 'x', type: 'int', init: 0, min: 0, max: 10 }],
  perPlayerVars: [],
  zones: [],
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
  globalVars: { x: 0 },
  perPlayerVars: {},
  playerCount: 2,
  zones: {},
  nextTokenOrdinal: 0,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeDef(),
  state: makeState(),
  rng: createRng(7n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  ...overrides,
});

const setVarEffect: EffectAST = {
  setVar: {
    scope: 'global',
    var: 'x',
    value: 1,
  },
};

const addVarEffect: EffectAST = {
  addVar: {
    scope: 'global',
    var: 'x',
    delta: 1,
  },
};

const ifEffect: EffectAST = {
  if: {
    when: { op: '==', left: 1, right: 1 },
    then: [],
  },
};

const moveTokenAdjacentEffect: EffectAST = {
  moveTokenAdjacent: {
    token: '$token',
    from: 'board:none',
  },
};

describe('effects runtime foundation', () => {
  it('returns default and override maxEffectOps values', () => {
    assert.equal(getMaxEffectOps({}), 10_000);
    assert.equal(getMaxEffectOps({ maxEffectOps: 12 }), 12);
  });

  it('returns unchanged state and rng when applyEffects receives an empty list', () => {
    const ctx = makeCtx();
    const result = applyEffects([], ctx);

    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('throws EffectBudgetExceededError before dispatch when budget is exhausted', () => {
    const ctx = makeCtx({ maxEffectOps: 0 });

    assert.throws(() => applyEffects([setVarEffect], ctx), (error: unknown) => {
      assert.ok(error instanceof EffectBudgetExceededError);
      return true;
    });
  });

  it('applies dispatcher in list order and reports the first unimplemented effect kind', () => {
    const ctx = makeCtx({ maxEffectOps: 10 });

    assert.throws(() => applyEffects([setVarEffect, addVarEffect, ifEffect], ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_NOT_IMPLEMENTED') && error.message.includes('if');
    });
  });

  it('throws SpatialNotImplementedError for moveTokenAdjacent', () => {
    const ctx = makeCtx({ maxEffectOps: 5 });

    assert.throws(() => applyEffects([moveTokenAdjacentEffect], ctx), (error: unknown) => {
      assert.ok(error instanceof SpatialNotImplementedError);
      return true;
    });
  });

  it('applyEffect enforces the same budget guard as applyEffects', () => {
    const ctx = makeCtx({ maxEffectOps: 0 });
    assert.throws(() => applyEffect(setVarEffect, ctx), (error: unknown) => {
      assert.ok(error instanceof EffectBudgetExceededError);
      return true;
    });
  });
});
