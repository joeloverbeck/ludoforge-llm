import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildAdjacencyGraph,
  applyEffect,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  type EffectContext,
  type EffectAST,
  type GameDef,
  type GameState,
  type Token,
  createCollector,
} from '../../../src/kernel/index.js';

const token = (id: string): Token => ({ id: asTokenId(id), type: 'card', props: {} });

const makeDef = (): GameDef => ({
  metadata: { id: 'effects-property-test', players: { min: 1, max: 2 } },
  constants: {},
  globalVars: [{ name: 'meter', type: 'int', init: 0, min: 0, max: 10 }],
  perPlayerVars: [],
  zones: [
    { id: asZoneId('deck:none'), owner: 'none', visibility: 'hidden', ordering: 'stack' },
    { id: asZoneId('discard:none'), owner: 'none', visibility: 'public', ordering: 'stack' },
  ],
  tokenTypes: [{ id: 'card', props: {} }],
  setup: [],
  turnStructure: { phases: [] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const makeState = (): GameState => ({
  globalVars: { meter: 4 },
  perPlayerVars: {},
  playerCount: 2,
  zones: {
    'deck:none': [token('d1'), token('d2'), token('d3'), token('d4')],
    'discard:none': [token('x1')],
  },
  nextTokenOrdinal: 5,
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(0),
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
  rng: createRng(77n),
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  moveParams: {},
  collector: createCollector(),
  ...overrides,
});

const totalTokens = (state: GameState): number => Object.values(state.zones).reduce((sum, zone) => sum + zone.length, 0);

describe('effects property-style invariants', () => {
  it('movement effects conserve total token count across representative tokens/seeds', () => {
    const seeds = [1n, 7n, 23n, 101n] as const;

    for (const seed of seeds) {
      for (const tokenId of ['d1', 'd2', 'd3', 'd4'] as const) {
        const ctx = makeCtx({ rng: createRng(seed), bindings: { $t: asTokenId(tokenId) } });
        const before = totalTokens(ctx.state);
        const moved = applyEffect({ moveToken: { token: '$t', from: 'deck:none', to: 'discard:none', position: 'random' } }, ctx);
        const afterMove = totalTokens(moved.state);
        const movedAll = applyEffect({ moveAll: { from: 'discard:none', to: 'deck:none' } }, { ...ctx, state: moved.state, rng: moved.rng });
        const afterMoveAll = totalTokens(movedAll.state);

        assert.equal(afterMove, before);
        assert.equal(afterMoveAll, before);
      }
    }
  });

  it('setVar and addVar always keep int variable within declared [min,max]', () => {
    const candidates = [-100, -11, -1, 0, 1, 3, 9, 10, 11, 100] as const;

    for (const value of candidates) {
      const setResult = applyEffect({ setVar: { scope: 'global', var: 'meter', value } }, makeCtx());
      const meter = setResult.state.globalVars.meter;
      assert.ok(meter !== undefined);
      assert.ok(meter >= 0);
      assert.ok(meter <= 10);
    }

    for (const delta of candidates) {
      const addResult = applyEffect({ addVar: { scope: 'global', var: 'meter', delta } }, makeCtx());
      const meter = addResult.state.globalVars.meter;
      assert.ok(meter !== undefined);
      assert.ok(meter >= 0);
      assert.ok(meter <= 10);
    }
  });

  it('forEach applies nested effects exactly min(collectionSize, limit) times', () => {
    const scenarios: ReadonlyArray<{ size: number; limit: number }> = [
      { size: 0, limit: 5 },
      { size: 1, limit: 5 },
      { size: 4, limit: 2 },
      { size: 8, limit: 8 },
      { size: 12, limit: 3 },
    ];

    for (const scenario of scenarios) {
      const state: GameState = {
        ...makeState(),
        globalVars: { meter: 0 },
      };
      const ctx = makeCtx({ state });
      const effect: EffectAST = {
        forEach: {
          bind: '$n',
          over: { query: 'intsInRange', min: 1, max: scenario.size },
          limit: scenario.limit,
          effects: [{ addVar: { scope: 'global', var: 'meter', delta: 1 } }],
        },
      };

      const result = applyEffect(effect, ctx);
      assert.equal(result.state.globalVars.meter, Math.min(scenario.size, scenario.limit));
    }
  });

  it('createToken/destroyToken deltas are exactly +1 and -1', () => {
    const ctx = makeCtx();
    const before = totalTokens(ctx.state);

    const created = applyEffect({ createToken: { type: 'card', zone: 'deck:none' } }, ctx);
    const createdTotal = totalTokens(created.state);
    assert.equal(createdTotal, before + 1);

    const createdId = created.state.zones['deck:none']?.[0]?.id;
    assert.ok(createdId !== undefined);

    const destroyed = applyEffect(
      { destroyToken: { token: '$created' } },
      { ...ctx, state: created.state, rng: created.rng, bindings: { $created: createdId } },
    );
    const destroyedTotal = totalTokens(destroyed.state);
    assert.equal(destroyedTotal, before);
  });

  it('successful chooseN selections remain exact-length and unique', () => {
    const selections: ReadonlyArray<readonly string[]> = [
      ['alpha'],
      ['alpha', 'beta'],
      ['beta', 'gamma'],
      ['alpha', 'gamma', 'delta'],
    ];

    for (const picks of selections) {
      const ctx = makeCtx({ moveParams: { 'decision:$picks': [...picks] } });
      const result = applyEffect(
        {
          chooseN: {
            internalDecisionId: 'decision:$picks',
            bind: '$picks',
            options: { query: 'enums', values: ['alpha', 'beta', 'gamma', 'delta'] },
            n: picks.length,
          },
        },
        ctx,
      );

      const selected = result.state === ctx.state ? (ctx.moveParams['decision:$picks'] as string[]) : [];
      assert.equal(selected.length, picks.length);
      assert.equal(new Set(selected).size, picks.length);
      assert.equal(result.state, ctx.state);
      assert.equal(result.rng, ctx.rng);
    }
  });
});
