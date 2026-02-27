import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeExecutionEffectContext, type EffectContextTestOverrides } from '../helpers/effect-context-test-helpers.js';
import { lowerEffectArray, type EffectLoweringContext } from '../../src/cnl/compile-effects.js';
import {
  buildAdjacencyGraph,
  EffectBudgetExceededError,
  applyEffect,
  applyEffects,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  getMaxEffectOps,
  isEffectErrorCode,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  createCollector,
} from '../../src/kernel/index.js';

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-runtime-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [{ name: 'x', type: 'int', init: 0, min: 0, max: 10 }],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set' },
    { id: asZoneId('adjacent:none'), owner: 'none', visibility: 'public', ordering: 'set', adjacentTo: [{ to: asZoneId('board:none') }] },
  ],
  tokenTypes: [],
  setup: [],
  turnStructure: {
    phases: [],
  },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { x: 0 },
  perPlayerVars: {},
  zoneVars: {},
  playerCount: 2,
  zones: {
    'board:none': [],
    'adjacent:none': [],
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

const makeCtx = (overrides?: EffectContextTestOverrides): EffectContext => makeExecutionEffectContext({
  def: makeDef(),
  adjacencyGraph: buildAdjacencyGraph(makeDef().zones),
  state: makeState(),
  rng: createRng(7n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
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

const chooseOneEffect: EffectAST = {
  chooseOne: {
    internalDecisionId: 'decision:$choice',
    bind: '$choice',
    options: { query: 'enums', values: ['a', 'b'] },
  },
};

const moveTokenAdjacentEffect: EffectAST = {
  moveTokenAdjacent: {
    token: '$token',
    from: 'board:none',
  },
};

const loweringContext: EffectLoweringContext = {
  ownershipByBase: {
    board: 'none',
    adjacent: 'none',
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

  it('applies dispatcher in list order through chooseOne assertions', () => {
    const ctx = makeCtx({ maxEffectOps: 10, moveParams: { 'decision:$choice': 'a' } });
    const result = applyEffects([setVarEffect, addVarEffect, ifEffect, chooseOneEffect], ctx);

    assert.equal(result.state.globalVars.x, 2);
    assert.equal(result.rng, ctx.rng);
  });

  it('shares the same effect budget across nested control-flow execution', () => {
    const ctx = makeCtx({ maxEffectOps: 2 });
    const nestedEffect: EffectAST = {
      if: {
        when: { op: '==', left: 1, right: 1 },
        then: [setVarEffect, addVarEffect],
      },
    };

    assert.throws(() => applyEffects([nestedEffect], ctx), (error: unknown) => {
      assert.ok(error instanceof EffectBudgetExceededError);
      return true;
    });
  });

  it('throws SPATIAL_DESTINATION_REQUIRED for moveTokenAdjacent without direction', () => {
    const ctx = makeCtx({ maxEffectOps: 5 });

    assert.throws(() => applyEffects([moveTokenAdjacentEffect], ctx), (error: unknown) => {
      return isEffectErrorCode(error, 'SPATIAL_DESTINATION_REQUIRED');
    });
  });

  it('applyEffect enforces the same budget guard as applyEffects', () => {
    const ctx = makeCtx({ maxEffectOps: 0 });
    assert.throws(() => applyEffect(setVarEffect, ctx), (error: unknown) => {
      assert.ok(error instanceof EffectBudgetExceededError);
      return true;
    });
  });

  it('gotoPhaseExact jumps without executing intermediate phase onEnter effects', () => {
    const def: GameDef = {
      ...makeDef(),
      globalVars: [{ name: 'x', type: 'int', init: 0, min: 0, max: 20 }],
      turnStructure: {
        phases: [
          { id: asPhaseId('operations') },
          { id: asPhaseId('commitment'), onEnter: [{ addVar: { scope: 'global', var: 'x', delta: 5 } }] },
          { id: asPhaseId('reset') },
        ],
      },
    };
    const state: GameState = {
      ...makeState(),
      currentPhase: asPhaseId('operations'),
    };
    const effect: EffectAST = { gotoPhaseExact: { phase: 'reset' } };
    const result = applyEffect(effect, makeCtx({ def, state }));

    assert.equal(result.state.currentPhase, asPhaseId('reset'));
    assert.equal(result.state.globalVars.x, 0);
    assert.equal(result.state.turnCount, 1);
  });

  it('advancePhase preserves stepwise lifecycle semantics', () => {
    const def: GameDef = {
      ...makeDef(),
      globalVars: [{ name: 'x', type: 'int', init: 0, min: 0, max: 20 }],
      turnStructure: {
        phases: [
          { id: asPhaseId('operations') },
          { id: asPhaseId('commitment'), onEnter: [{ addVar: { scope: 'global', var: 'x', delta: 5 } }] },
          { id: asPhaseId('reset') },
        ],
      },
    };
    const state: GameState = {
      ...makeState(),
      currentPhase: asPhaseId('operations'),
    };
    const effect: EffectAST = { advancePhase: {} };
    const result = applyEffect(effect, makeCtx({ def, state }));

    assert.equal(result.state.currentPhase, asPhaseId('commitment'));
    assert.equal(result.state.globalVars.x, 5);
    assert.equal(result.state.turnCount, 1);
  });

  it('gotoPhaseExact rejects crossing a turn boundary to an earlier phase', () => {
    const def: GameDef = {
      ...makeDef(),
      turnStructure: {
        phases: [{ id: asPhaseId('operations') }, { id: asPhaseId('commitment') }, { id: asPhaseId('reset') }],
      },
    };
    const state: GameState = {
      ...makeState(),
      currentPhase: asPhaseId('reset'),
      turnCount: 4,
    };
    const effect: EffectAST = { gotoPhaseExact: { phase: 'commitment' } };
    assert.throws(() => applyEffect(effect, makeCtx({ def, state })), (error: unknown) => {
      return isEffectErrorCode(error, 'EFFECT_RUNTIME') && String(error).includes('cannot cross a turn boundary');
    });
  });

  it('matches budget pass/fail behavior between lowered distributeTokens and equivalent manual primitives', () => {
    const lowered = lowerEffectArray(
      [
        {
          distributeTokens: {
            tokens: { query: 'tokensInZone', zone: 'board' },
            destinations: { query: 'zones' },
            n: 1,
          },
        },
      ],
      loweringContext,
      'doc.actions.0.effects',
    );

    assert.equal(lowered.diagnostics.length, 0);
    assert.ok(lowered.value !== null);
    if (lowered.value === null) {
      return;
    }
    const loweredEffects = lowered.value;

    const manual: EffectAST[] = [
      {
        chooseN: {
          internalDecisionId: 'decision:doc.actions.0.effects.0.distributeTokens.selectTokens',
          bind: '$__selected_doc_actions_0_effects_0_distributeTokens',
          options: { query: 'tokensInZone', zone: 'board:none' },
          n: 1,
        },
      },
      {
        forEach: {
          bind: '$__token_doc_actions_0_effects_0_distributeTokens',
          over: { query: 'binding', name: '$__selected_doc_actions_0_effects_0_distributeTokens' },
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:doc.actions.0.effects.0.distributeTokens.chooseDestination',
                bind: '$__destination_doc_actions_0_effects_0_distributeTokens',
                options: { query: 'zones' },
              },
            },
            {
              moveToken: {
                token: '$__token_doc_actions_0_effects_0_distributeTokens',
                from: { zoneExpr: { ref: 'tokenZone', token: '$__token_doc_actions_0_effects_0_distributeTokens' } },
                to: { zoneExpr: { ref: 'binding', name: '$__destination_doc_actions_0_effects_0_distributeTokens' } },
              },
            },
          ],
        },
      },
    ];

    const token: Token = { id: asTokenId('t1'), type: 'piece', props: {} };
    const state: GameState = {
      ...makeState(),
      zones: {
        ...makeState().zones,
        'board:none': [token],
        'adjacent:none': [],
      },
    };
    const moveParams = {
      'decision:doc.actions.0.effects.0.distributeTokens.selectTokens': ['t1'],
      'decision:doc.actions.0.effects.0.distributeTokens.chooseDestination[0]': 'adjacent:none',
    };

    const loweredPass = applyEffects(loweredEffects, makeCtx({ state, moveParams, maxEffectOps: 4 }));
    const manualPass = applyEffects(manual, makeCtx({ state, moveParams, maxEffectOps: 4 }));
    assert.deepEqual(loweredPass.state.zones, manualPass.state.zones);

    assert.throws(() => applyEffects(loweredEffects, makeCtx({ state, moveParams, maxEffectOps: 3 })), (error: unknown) => {
      assert.ok(error instanceof EffectBudgetExceededError);
      return true;
    });
    assert.throws(() => applyEffects(manual, makeCtx({ state, moveParams, maxEffectOps: 3 })), (error: unknown) => {
      assert.ok(error instanceof EffectBudgetExceededError);
      return true;
    });
  });
});
