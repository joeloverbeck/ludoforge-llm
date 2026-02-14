import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildAdjacencyGraph, createCollector, asPlayerId, asPhaseId, resolveChooseNCardinality, type EvalContext } from '../../src/kernel/index.js';

const makeEvalContext = (globalVars: Record<string, number | boolean> = {}): EvalContext => ({
  def: {
    metadata: { id: 'choose-n-cardinality-test', players: { min: 1, max: 2 } },
    constants: {},
    globalVars: [{ name: 'cap', type: 'int', init: 0, min: 0, max: 6 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
  },
  adjacencyGraph: buildAdjacencyGraph([]),
  state: {
    globalVars,
    perPlayerVars: {},
    playerCount: 2,
    zones: {},
    nextTokenOrdinal: 0,
    currentPhase: asPhaseId('main'),
    activePlayer: asPlayerId(0),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [1n, 2n] },
    stateHash: 0n,
    actionUsage: {},
    turnOrderState: { type: 'roundRobin' },
    markers: {},
  },
  activePlayer: asPlayerId(0),
  actorPlayer: asPlayerId(0),
  bindings: {},
  collector: createCollector(),
});

describe('resolveChooseNCardinality', () => {
  it('resolves exact n cardinality', () => {
    const chooseN = {
      internalDecisionId: 'decision:$picks',
      bind: '$picks',
      options: { query: 'players' as const },
      n: 2,
    };

    const result = resolveChooseNCardinality(chooseN, makeEvalContext(), (issue) => {
      throw new Error(`unexpected issue: ${issue.code}`);
    });
    assert.deepEqual(result, { minCardinality: 2, maxCardinality: 2 });
  });

  it('resolves expression-valued range cardinality', () => {
    const chooseN = {
      internalDecisionId: 'decision:$picks',
      bind: '$picks',
      options: { query: 'players' as const },
      min: { if: { when: true, then: 1, else: 0 } },
      max: { ref: 'gvar' as const, var: 'cap' },
    };

    const result = resolveChooseNCardinality(chooseN, makeEvalContext({ cap: 3 }), (issue) => {
      throw new Error(`unexpected issue: ${issue.code}`);
    });
    assert.deepEqual(result, { minCardinality: 1, maxCardinality: 3 });
  });

  it('reports typed issue for invalid evaluated max', () => {
    const chooseN = {
      internalDecisionId: 'decision:$picks',
      bind: '$picks',
      options: { query: 'players' as const },
      max: false,
    };

    assert.throws(
      () =>
        resolveChooseNCardinality(chooseN, makeEvalContext(), (issue) => {
          if (issue.code === 'CHOOSE_N_MAX_EVAL_INVALID') {
            throw new Error(issue.code);
          }
          throw new Error(`unexpected issue: ${issue.code}`);
        }),
      /CHOOSE_N_MAX_EVAL_INVALID/,
    );
  });
});
