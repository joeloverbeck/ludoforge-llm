import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runSearch } from '../../../../src/agents/mcts/search.js';
import { createRootNode } from '../../../../src/agents/mcts/node.js';
import { createNodePool } from '../../../../src/agents/mcts/node-pool.js';
import { validateMctsConfig } from '../../../../src/agents/mcts/config.js';
import { createAccumulator } from '../../../../src/agents/mcts/diagnostics.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';
import { derivePlayerObservation } from '../../../../src/kernel/observation.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createTwoActionDef(): GameDef {
  return {
    metadata: { id: 'diag-counters-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'ended', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('win'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ setVar: { scope: 'global', var: 'ended', value: 1 } }],
        limits: [],
      },
      {
        id: asActionId('noop'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [
        {
          when: { op: '==', left: { ref: 'gvar', var: 'ended' }, right: 1 },
          result: { type: 'win', player: { id: asPlayerId(0) } },
        },
      ],
    },
  } as unknown as GameDef;
}

function runDiagnosticSearch(diagnostics: boolean, iterations: number = 20) {
  const def = createTwoActionDef();
  const playerCount = 2;
  const { state } = initialState(def, 42, playerCount);
  const runtime = createGameDefRuntime(def);
  const moves = legalMoves(def, state, undefined, runtime);
  const observation = derivePlayerObservation(def, state, asPlayerId(0));
  const root = createRootNode(playerCount);
  const pool = createNodePool(iterations + 1, playerCount);
  const config = validateMctsConfig({ iterations, minIterations: 0, diagnostics });

  return runSearch(
    root, def, state, observation, asPlayerId(0),
    config, createRng(42n), moves, runtime, pool,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('diagnostics-counters', () => {
  describe('kernel-call counters', () => {
    it('reports positive kernel-call counters after multi-iteration search', () => {
      const result = runDiagnosticSearch(true, 30);
      const d = result.diagnostics!;

      assert.ok(d.legalMovesCalls! > 0, 'legalMovesCalls should be > 0');
      assert.ok(d.applyMoveCalls! > 0, 'applyMoveCalls should be > 0');
      assert.ok(d.terminalCalls! > 0, 'terminalCalls should be > 0');
      assert.ok(d.materializeCalls! > 0, 'materializeCalls should be > 0');

      // evaluateStateCalls may be 0 if all rollouts end in terminal states,
      // but it should be a non-negative integer.
      assert.equal(typeof d.evaluateStateCalls, 'number');
      assert.ok(d.evaluateStateCalls! >= 0, 'evaluateStateCalls should be >= 0');
    });

    it('kernel-call counters are integers', () => {
      const result = runDiagnosticSearch(true, 30);
      const d = result.diagnostics!;

      const counterFields = [
        'legalMovesCalls',
        'materializeCalls',
        'applyMoveCalls',
        'terminalCalls',
        'evaluateStateCalls',
      ] as const;

      for (const field of counterFields) {
        assert.ok(
          Number.isInteger(d[field]),
          `${field} (${d[field]}) should be an integer`,
        );
      }
    });
  });

  describe('diagnostics disabled', () => {
    it('returns no diagnostic fields when config.diagnostics is false', () => {
      const result = runDiagnosticSearch(false);
      assert.equal(result.diagnostics, undefined, 'diagnostics should be undefined');
    });

    it('returns no diagnostic fields when config.diagnostics is undefined', () => {
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);
      const observation = derivePlayerObservation(def, state, asPlayerId(0));
      const root = createRootNode(playerCount);
      const pool = createNodePool(21, playerCount);
      // diagnostics not set at all
      const config = validateMctsConfig({ iterations: 20, minIterations: 0 });

      const result = runSearch(
        root, def, state, observation, asPlayerId(0),
        config, createRng(42n), moves, runtime, pool,
      );

      assert.equal(result.diagnostics, undefined, 'diagnostics should be undefined');
    });
  });

  describe('derived averages', () => {
    it('computes avgSelectionDepth as average of accumulated depths', () => {
      const result = runDiagnosticSearch(true, 30);
      const d = result.diagnostics!;

      assert.equal(typeof d.avgSelectionDepth, 'number');
      assert.ok(d.avgSelectionDepth! >= 0, 'avgSelectionDepth should be >= 0');
    });

    it('computes avgLeafRewardSpan as average of accumulated spans', () => {
      const result = runDiagnosticSearch(true, 30);
      const d = result.diagnostics!;

      assert.equal(typeof d.avgLeafRewardSpan, 'number');
      assert.ok(d.avgLeafRewardSpan! >= 0, 'avgLeafRewardSpan should be >= 0');
    });
  });

  describe('cache counters', () => {
    it('reports zero cache counters (not yet wired)', () => {
      const result = runDiagnosticSearch(true);
      const d = result.diagnostics!;

      assert.equal(d.stateCacheLookups, 0);
      assert.equal(d.stateCacheHits, 0);
      assert.equal(d.terminalCacheHits, 0);
      assert.equal(d.legalMovesCacheHits, 0);
      assert.equal(d.rewardCacheHits, 0);
    });
  });

  describe('createAccumulator', () => {
    it('returns a zeroed accumulator with empty arrays', () => {
      const acc = createAccumulator();

      assert.equal(acc.selectionTimeMs, 0);
      assert.equal(acc.expansionTimeMs, 0);
      assert.equal(acc.simulationTimeMs, 0);
      assert.equal(acc.evaluationTimeMs, 0);
      assert.equal(acc.backpropTimeMs, 0);
      assert.equal(acc.beliefSamplingTimeMs, 0);

      assert.equal(acc.legalMovesCalls, 0);
      assert.equal(acc.materializeCalls, 0);
      assert.equal(acc.applyMoveCalls, 0);
      assert.equal(acc.terminalCalls, 0);
      assert.equal(acc.evaluateStateCalls, 0);

      assert.deepEqual(acc.leafRewardSpans, []);
      assert.deepEqual(acc.selectionDepths, []);
    });

    it('each call returns an independent accumulator', () => {
      const a = createAccumulator();
      const b = createAccumulator();
      a.legalMovesCalls = 99;
      assert.equal(b.legalMovesCalls, 0, 'accumulators should be independent');
    });
  });

  describe('determinism', () => {
    it('diagnostics collection does not alter search results', () => {
      // Run the same search twice: once with diagnostics, once without.
      // The iteration count and returned RNG should be identical.
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);
      const observation = derivePlayerObservation(def, state, asPlayerId(0));
      const iterations = 25;

      const root1 = createRootNode(playerCount);
      const pool1 = createNodePool(iterations + 1, playerCount);
      const config1 = validateMctsConfig({ iterations, minIterations: 0, diagnostics: true });
      const r1 = runSearch(
        root1, def, state, observation, asPlayerId(0),
        config1, createRng(42n), moves, runtime, pool1,
      );

      const root2 = createRootNode(playerCount);
      const pool2 = createNodePool(iterations + 1, playerCount);
      const config2 = validateMctsConfig({ iterations, minIterations: 0, diagnostics: false });
      const r2 = runSearch(
        root2, def, state, observation, asPlayerId(0),
        config2, createRng(42n), moves, runtime, pool2,
      );

      assert.equal(r1.iterations, r2.iterations, 'iteration counts should match');
      assert.deepStrictEqual(r1.rng, r2.rng, 'RNG states should match');
    });
  });
});
