import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EffectRuntimeError,
  applyEffect,
  applyEffects,
  asPhaseId,
  asPlayerId,
  createRng,
  isEvalErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-control-flow-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'x', type: 'int', init: 0, min: 0, max: 500 },
    { name: 'sum', type: 'int', init: 0, min: 0, max: 5000 },
    { name: 'count', type: 'int', init: 0, min: 0, max: 5000 },
    { name: 'bonus', type: 'int', init: 0, min: 0, max: 5000 },
  ],
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
  globalVars: { x: 0, sum: 0, count: 0, bonus: 0 },
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
  rng: createRng(42n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  ...overrides,
});

describe('effects control-flow handlers', () => {
  it('if executes then branch when predicate is true', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      if: {
        when: { op: '==', left: 1, right: 1 },
        then: [{ setVar: { scope: 'global', var: 'x', value: 3 } }],
        else: [{ setVar: { scope: 'global', var: 'x', value: 9 } }],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.x, 3);
  });

  it('if executes else branch when predicate is false', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      if: {
        when: { op: '==', left: 1, right: 2 },
        then: [{ setVar: { scope: 'global', var: 'x', value: 3 } }],
        else: [{ setVar: { scope: 'global', var: 'x', value: 9 } }],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.x, 9);
  });

  it('if with false predicate and no else is a no-op', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      if: {
        when: { op: '==', left: 1, right: 2 },
        then: [{ setVar: { scope: 'global', var: 'x', value: 3 } }],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('let binding is visible inside the in block', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      let: {
        bind: '$value',
        value: 7,
        in: [{ addVar: { scope: 'global', var: 'sum', delta: { ref: 'binding', name: '$value' } } }],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.sum, 7);
  });

  it('let binding does not leak outside the in block', () => {
    const ctx = makeCtx();
    const effects: readonly EffectAST[] = [
      {
        let: {
          bind: '$value',
          value: 4,
          in: [{ addVar: { scope: 'global', var: 'sum', delta: { ref: 'binding', name: '$value' } } }],
        },
      },
      { addVar: { scope: 'global', var: 'sum', delta: { ref: 'binding', name: '$value' } } },
    ];

    assert.throws(() => applyEffects(effects, ctx), (error: unknown) => {
      return isEvalErrorCode(error, 'MISSING_BINDING');
    });
  });

  it('forEach iterates every element when collection size is within limit', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      forEach: {
        bind: '$n',
        over: { query: 'intsInRange', min: 1, max: 3 },
        effects: [{ addVar: { scope: 'global', var: 'sum', delta: { ref: 'binding', name: '$n' } } }],
        limit: 3,
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.sum, 6);
  });

  it('forEach with empty collection performs zero iterations', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      forEach: {
        bind: '$n',
        over: { query: 'intsInRange', min: 5, max: 4 },
        effects: [{ addVar: { scope: 'global', var: 'sum', delta: 1 } }],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state, ctx.state);
    assert.equal(result.rng, ctx.rng);
  });

  it('forEach enforces default limit of 100', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      forEach: {
        bind: '$n',
        over: { query: 'intsInRange', min: 1, max: 120 },
        effects: [{ addVar: { scope: 'global', var: 'count', delta: 1 } }],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.count, 100);
  });

  it('forEach enforces explicit limit and truncates deterministically to first results', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      forEach: {
        bind: '$n',
        over: { query: 'intsInRange', min: 1, max: 5 },
        effects: [{ addVar: { scope: 'global', var: 'sum', delta: { ref: 'binding', name: '$n' } } }],
        limit: 2,
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.sum, 3);
  });

  it('forEach throws runtime error for invalid limit values', () => {
    const ctx = makeCtx();

    assert.throws(
      () =>
        applyEffect(
          {
            forEach: {
              bind: '$n',
              over: { query: 'intsInRange', min: 1, max: 3 },
              effects: [],
              limit: 0,
            },
          },
          ctx,
        ),
      (error: unknown) => {
        assert.ok(error instanceof EffectRuntimeError);
        return String(error).includes('forEach.limit');
      },
    );

    assert.throws(
      () =>
        applyEffect(
          {
            forEach: {
              bind: '$n',
              over: { query: 'intsInRange', min: 1, max: 3 },
              effects: [],
              limit: 1.5,
            },
          },
          ctx,
        ),
      (error: unknown) => {
        assert.ok(error instanceof EffectRuntimeError);
        return String(error).includes('forEach.limit');
      },
    );
  });

  it('nested forEach/let/if composition threads state across iterations', () => {
    const ctx = makeCtx();
    const effect: EffectAST = {
      forEach: {
        bind: '$n',
        over: { query: 'intsInRange', min: 1, max: 3 },
        effects: [
          {
            let: {
              bind: '$delta',
              value: { op: '*', left: { ref: 'binding', name: '$n' }, right: 2 },
              in: [
                {
                  if: {
                    when: { op: '>', left: { ref: 'binding', name: '$delta' }, right: 4 },
                    then: [{ addVar: { scope: 'global', var: 'bonus', delta: 1 } }],
                    else: [{ addVar: { scope: 'global', var: 'sum', delta: { ref: 'binding', name: '$delta' } } }],
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.sum, 6);
    assert.equal(result.state.globalVars.bonus, 1);
  });
});
