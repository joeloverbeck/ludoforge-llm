import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { countCombinations, combinations } from '../../../src/kernel/combinatorics.js';
import {
  applyEffect,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  buildAdjacencyGraph,
  createCollector,
  createRng,
  type EffectAST,
  type EffectContext,
  type GameDef,
  type GameState,
  type Token,
  type ZoneDef,
} from '../../../src/kernel/index.js';

const sourceZone = asZoneId('source:none');
const sinkZone = asZoneId('sink:none');

const testDef: GameDef = {
  metadata: { id: 'evaluate-subset-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'winner', type: 'int', init: 0, min: -9999, max: 9999 },
    { name: 'scratch', type: 'int', init: 0, min: -9999, max: 9999 },
  ],
  perPlayerVars: [],
  zones: [
    { id: sourceZone, owner: 'none', visibility: 'public', ordering: 'set' },
    { id: sinkZone, owner: 'none', visibility: 'public', ordering: 'set' },
  ],
  tokenTypes: [{ id: 'piece', props: { value: 'int' } }],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
} as unknown as GameDef;

const makeToken = (id: string, value: number): Token => ({
  id: asTokenId(id),
  type: 'piece',
  props: { value },
});

const makeCtx = (sourceTokens: readonly Token[], globalVars?: Record<string, number>): EffectContext => {
  const state: GameState = {
    globalVars: {
      winner: 0,
      scratch: 0,
      ...(globalVars ?? {}),
    },
    perPlayerVars: {},
    playerCount: 2,
    zones: {
      [sourceZone]: [...sourceTokens],
      [sinkZone]: [],
    },
    nextTokenOrdinal: 100,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
  };
  const zoneDefs: readonly ZoneDef[] = testDef.zones;
  return {
    def: testDef,
    adjacencyGraph: buildAdjacencyGraph(zoneDefs),
    state,
    rng: createRng(1n),
    activePlayer: asPlayerId(0),
    actorPlayer: asPlayerId(0),
    bindings: {},
    moveParams: {},
    collector: createCollector(),
  };
};

describe('evaluateSubset effect', () => {
  it('enumerates deterministic combinations correctly', () => {
    assert.equal(countCombinations(5, 3), 10);
    assert.equal(countCombinations(7, 5), 21);
    assert.equal(countCombinations(4, 2), 6);

    const values = ['a', 'b', 'c', 'd'];
    assert.deepEqual([...combinations(values, 2)], [
      ['a', 'b'],
      ['a', 'c'],
      ['a', 'd'],
      ['b', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
  });

  it('selects the best subset score and writes it through in-continuation', () => {
    const ctx = makeCtx([
      makeToken('t1', 1),
      makeToken('t2', 4),
      makeToken('t3', 3),
    ]);

    const effect: EffectAST = {
      evaluateSubset: {
        source: { query: 'tokensInZone', zone: sourceZone },
        subsetSize: 2,
        subsetBind: '$subset',
        compute: [],
        scoreExpr: {
          aggregate: {
            op: 'sum',
            query: { query: 'binding', name: '$subset' },
            bind: '$token',
            valueExpr: { ref: 'tokenProp', token: '$token', prop: 'value' },
          },
        },
        resultBind: '$bestScore',
        in: [
          { setVar: { scope: 'global', var: 'winner', value: { ref: 'binding', name: '$bestScore' } } },
        ],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.winner, 7);
  });

  it('supports composed source queries via concat inside evaluateSubset', () => {
    const extraTokens = [makeToken('extra-1', 9)];
    const ctx = {
      ...makeCtx([
        makeToken('t1', 1),
        makeToken('t2', 4),
      ]),
      bindings: { $extra: extraTokens },
    };

    const effect: EffectAST = {
      evaluateSubset: {
        source: {
          query: 'concat',
          sources: [
            { query: 'tokensInZone', zone: sourceZone },
            { query: 'binding', name: '$extra' },
          ],
        },
        subsetSize: 2,
        subsetBind: '$subset',
        compute: [],
        scoreExpr: {
          aggregate: {
            op: 'sum',
            query: { query: 'binding', name: '$subset' },
            bind: '$token',
            valueExpr: { ref: 'tokenProp', token: '$token', prop: 'value' },
          },
        },
        resultBind: '$bestScore',
        in: [{ setVar: { scope: 'global', var: 'winner', value: { ref: 'binding', name: '$bestScore' } } }],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.winner, 13);
  });

  it('exports bestSubsetBind and allows continuation effects to use it', () => {
    const ctx = makeCtx([
      makeToken('t1', 1),
      makeToken('t2', 4),
      makeToken('t3', 3),
    ]);

    const effect: EffectAST = {
      evaluateSubset: {
        source: { query: 'tokensInZone', zone: sourceZone },
        subsetSize: 2,
        subsetBind: '$subset',
        compute: [],
        scoreExpr: {
          aggregate: {
            op: 'sum',
            query: { query: 'binding', name: '$subset' },
            bind: '$token',
            valueExpr: { ref: 'tokenProp', token: '$token', prop: 'value' },
          },
        },
        resultBind: '$bestScore',
        bestSubsetBind: '$bestSubset',
        in: [
          {
            removeByPriority: {
              budget: 2,
              groups: [
                {
                  bind: '$tok',
                  over: { query: 'binding', name: '$bestSubset' },
                  to: sinkZone,
                },
              ],
            },
          },
        ],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.deepEqual(
      (result.state.zones[sinkZone] ?? []).map((token) => token.id).sort(),
      [asTokenId('t2'), asTokenId('t3')],
    );
  });

  it('allows compute-produced bindings to be used in scoreExpr', () => {
    const ctx = makeCtx([
      makeToken('t1', 1),
      makeToken('t2', 4),
      makeToken('t3', 3),
    ]);

    const effect: EffectAST = {
      evaluateSubset: {
        source: { query: 'tokensInZone', zone: sourceZone },
        subsetSize: 2,
        subsetBind: '$subset',
        compute: [
          {
            removeByPriority: {
              budget: 2,
              groups: [
                {
                  bind: '$tok',
                  over: { query: 'binding', name: '$subset' },
                  to: sinkZone,
                  countBind: '$removed',
                },
              ],
            },
          },
        ],
        scoreExpr: { ref: 'binding', name: '$removed' },
        resultBind: '$bestScore',
        in: [
          { setVar: { scope: 'global', var: 'winner', value: { ref: 'binding', name: '$bestScore' } } },
        ],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.winner, 2);
    assert.deepEqual(result.state.zones[sinkZone], []);
  });

  it('uses deterministic first-subset tiebreaking', () => {
    const ctx = makeCtx([
      makeToken('t1', 1),
      makeToken('t2', 1),
      makeToken('t3', 1),
    ]);

    const effect: EffectAST = {
      evaluateSubset: {
        source: { query: 'tokensInZone', zone: sourceZone },
        subsetSize: 2,
        subsetBind: '$subset',
        compute: [],
        scoreExpr: {
          aggregate: {
            op: 'sum',
            query: { query: 'binding', name: '$subset' },
            bind: '$token',
            valueExpr: { ref: 'tokenProp', token: '$token', prop: 'value' },
          },
        },
        resultBind: '$bestScore',
        bestSubsetBind: '$bestSubset',
        in: [
          {
            removeByPriority: {
              budget: 2,
              groups: [
                {
                  bind: '$tok',
                  over: { query: 'binding', name: '$bestSubset' },
                  to: sinkZone,
                },
              ],
            },
          },
        ],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.deepEqual(
      (result.state.zones[sinkZone] ?? []).map((token) => token.id).sort(),
      [asTokenId('t1'), asTokenId('t2')],
    );
  });

  it('supports edge cases K=N and K=0', () => {
    const kEqualsN = makeCtx([makeToken('t1', 2), makeToken('t2', 3)]);
    const fullSetEffect: EffectAST = {
      evaluateSubset: {
        source: { query: 'tokensInZone', zone: sourceZone },
        subsetSize: 2,
        subsetBind: '$subset',
        compute: [],
        scoreExpr: {
          aggregate: {
            op: 'sum',
            query: { query: 'binding', name: '$subset' },
            bind: '$token',
            valueExpr: { ref: 'tokenProp', token: '$token', prop: 'value' },
          },
        },
        resultBind: '$bestScore',
        in: [{ setVar: { scope: 'global', var: 'winner', value: { ref: 'binding', name: '$bestScore' } } }],
      },
    };
    const fullSetResult = applyEffect(fullSetEffect, kEqualsN);
    assert.equal(fullSetResult.state.globalVars.winner, 5);

    const kZero = makeCtx([]);
    const emptySubsetEffect: EffectAST = {
      evaluateSubset: {
        source: { query: 'tokensInZone', zone: sourceZone },
        subsetSize: 0,
        subsetBind: '$subset',
        compute: [],
        scoreExpr: { aggregate: { op: 'count', query: { query: 'binding', name: '$subset' } } },
        resultBind: '$bestScore',
        in: [{ setVar: { scope: 'global', var: 'winner', value: { ref: 'binding', name: '$bestScore' } } }],
      },
    };
    const emptySubsetResult = applyEffect(emptySubsetEffect, kZero);
    assert.equal(emptySubsetResult.state.globalVars.winner, 0);
  });

  it('throws when K > N', () => {
    const ctx = makeCtx([makeToken('t1', 1), makeToken('t2', 2)]);
    const effect: EffectAST = {
      evaluateSubset: {
        source: { query: 'tokensInZone', zone: sourceZone },
        subsetSize: 3,
        subsetBind: '$subset',
        compute: [],
        scoreExpr: 0,
        resultBind: '$bestScore',
        in: [],
      },
    };

    assert.throws(() => applyEffect(effect, ctx), /evaluateSubset requires 0 <= subsetSize <= source item count/);
  });

  it('throws when C(N, K) exceeds the hard cap', () => {
    const ctx = makeCtx([]);
    const effect: EffectAST = {
      evaluateSubset: {
        source: { query: 'intsInRange', min: 1, max: 30 },
        subsetSize: 15,
        subsetBind: '$subset',
        compute: [],
        scoreExpr: 0,
        resultBind: '$bestScore',
        in: [],
      },
    };

    assert.throws(() => applyEffect(effect, ctx), /combination count exceeds safety cap/);
  });

  it('sandboxes compute state mutations per subset', () => {
    const ctx = makeCtx([], { winner: 0, scratch: 0 });
    const effect: EffectAST = {
      evaluateSubset: {
        source: { query: 'intsInRange', min: 1, max: 3 },
        subsetSize: 1,
        subsetBind: '$subset',
        compute: [{ addVar: { scope: 'global', var: 'scratch', delta: 1 } }],
        scoreExpr: { ref: 'gvar', var: 'scratch' },
        resultBind: '$bestScore',
        in: [{ setVar: { scope: 'global', var: 'winner', value: { ref: 'binding', name: '$bestScore' } } }],
      },
    };

    const result = applyEffect(effect, ctx);
    assert.equal(result.state.globalVars.winner, 1);
    assert.equal(result.state.globalVars.scratch, 0);
  });
});
