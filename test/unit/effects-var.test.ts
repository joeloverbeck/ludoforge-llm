import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EffectRuntimeError,
  applyEffect,
  asPhaseId,
  asPlayerId,
  createRng,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-var-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'score', type: 'int', init: 0, min: 0, max: 10 },
    { name: 'round', type: 'int', init: 1, min: 1, max: 9 },
  ],
  perPlayerVars: [
    { name: 'hp', type: 'int', init: 0, min: 0, max: 20 },
    { name: 'mana', type: 'int', init: 0, min: 0, max: 9 },
  ],
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
  globalVars: { score: 3, round: 2 },
  perPlayerVars: {
    '0': { hp: 6, mana: 1 },
    '1': { hp: 8, mana: 4 },
  },
  playerCount: 2,
  zones: {},
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(1),
  turnCount: 1,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
  stateHash: 0n,
  actionUsage: {},
});

const makeCtx = (overrides?: Partial<EffectContext>): EffectContext => ({
  def: makeDef(),
  state: makeState(),
  rng: createRng(17n),
  activePlayer: asPlayerId(1),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  ...overrides,
});

describe('effects var handlers', () => {
  it('setVar updates a global variable and preserves unrelated state branches', () => {
    const ctx = makeCtx();
    const effect: EffectAST = { setVar: { scope: 'global', var: 'score', value: 9 } };

    const result = applyEffect(effect, ctx);

    assert.equal(result.state.globalVars.score, 9);
    assert.equal(result.state.globalVars.round, ctx.state.globalVars.round);
    assert.equal(result.state.perPlayerVars, ctx.state.perPlayerVars);
    assert.equal(result.state.zones, ctx.state.zones);
    assert.notEqual(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('setVar updates only the selected per-player variable cell', () => {
    const ctx = makeCtx();
    const effect: EffectAST = { setVar: { scope: 'pvar', player: 'actor', var: 'hp', value: 11 } };

    const result = applyEffect(effect, ctx);

    assert.equal(result.state.perPlayerVars['0']?.hp, 11);
    assert.equal(result.state.perPlayerVars['1']?.hp, 8);
    assert.equal(result.state.perPlayerVars['1'], ctx.state.perPlayerVars['1']);
    assert.equal(result.state.globalVars, ctx.state.globalVars);
  });

  it('setVar clamps values to min/max bounds', () => {
    const ctx = makeCtx();

    const clampedHigh = applyEffect({ setVar: { scope: 'global', var: 'score', value: 999 } }, ctx);
    assert.equal(clampedHigh.state.globalVars.score, 10);

    const clampedLow = applyEffect({ setVar: { scope: 'pvar', player: 'actor', var: 'hp', value: -4 } }, ctx);
    assert.equal(clampedLow.state.perPlayerVars['0']?.hp, 0);
  });

  it('addVar applies signed deltas for global and per-player vars', () => {
    const ctx = makeCtx();

    const globalResult = applyEffect({ addVar: { scope: 'global', var: 'score', delta: -2 } }, ctx);
    assert.equal(globalResult.state.globalVars.score, 1);

    const pvarResult = applyEffect({ addVar: { scope: 'pvar', player: 'active', var: 'hp', delta: 5 } }, ctx);
    assert.equal(pvarResult.state.perPlayerVars['1']?.hp, 13);
  });

  it('addVar clamps values to min/max bounds', () => {
    const ctx = makeCtx();

    const clampedHigh = applyEffect({ addVar: { scope: 'global', var: 'score', delta: 30 } }, ctx);
    assert.equal(clampedHigh.state.globalVars.score, 10);

    const clampedLow = applyEffect({ addVar: { scope: 'pvar', player: 'actor', var: 'hp', delta: -30 } }, ctx);
    assert.equal(clampedLow.state.perPlayerVars['0']?.hp, 0);
  });

  it('throws EFFECT_RUNTIME for unknown variable names', () => {
    const ctx = makeCtx();

    assert.throws(() => applyEffect({ setVar: { scope: 'global', var: 'missing', value: 1 } }, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('Unknown global variable');
    });
  });

  it('throws EFFECT_RUNTIME when evaluated setVar/addVar numeric inputs are not integers', () => {
    const ctx = makeCtx();

    assert.throws(() => applyEffect({ setVar: { scope: 'global', var: 'score', value: true } }, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('setVar.value');
    });

    assert.throws(() => applyEffect({ addVar: { scope: 'global', var: 'score', delta: 'x' } }, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('addVar.delta');
    });
  });

  it('throws EFFECT_RUNTIME when per-player selector resolves to non-scalar cardinality', () => {
    const ctx = makeCtx();

    assert.throws(() => applyEffect({ setVar: { scope: 'pvar', player: 'all', var: 'hp', value: 1 } }, ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('exactly one resolved player');
    });
  });

  it('uses moveParams for chosen selectors and lets bindings override moveParams', () => {
    const ctx = makeCtx({
      moveParams: { $target: asPlayerId(1), value: 3 },
      bindings: { value: 6 },
    });
    const effect: EffectAST = {
      addVar: {
        scope: 'pvar',
        player: { chosen: '$target' },
        var: 'mana',
        delta: { ref: 'binding', name: 'value' },
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.perPlayerVars['1']?.mana, 9);
  });

  it('returns original state reference when clamped/updated value is unchanged', () => {
    const ctx = makeCtx();
    const effect: EffectAST = { setVar: { scope: 'global', var: 'score', value: 3 } };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('throws EffectRuntimeError when pvar scope omits player selector', () => {
    const ctx = makeCtx();
    const effect: EffectAST = { addVar: { scope: 'pvar', var: 'hp', delta: 1 } };

    assert.throws(() => applyEffect(effect, ctx), (error: unknown) => {
      assert.ok(error instanceof EffectRuntimeError);
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('requires player selector');
    });
  });
});
