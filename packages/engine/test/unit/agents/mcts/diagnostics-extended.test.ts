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
    metadata: { id: 'diag-ext-test', players: { min: 2, max: 2 } },
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

function runDiagnosticSearch(iterations: number = 30) {
  const def = createTwoActionDef();
  const playerCount = 2;
  const { state } = initialState(def, 42, playerCount);
  const runtime = createGameDefRuntime(def);
  const moves = legalMoves(def, state, undefined, runtime);
  const observation = derivePlayerObservation(def, state, asPlayerId(0));
  const root = createRootNode(playerCount);
  const pool = createNodePool(iterations + 1, playerCount);
  const config = validateMctsConfig({ iterations, minIterations: 0, diagnostics: true });

  return runSearch(
    root, def, state, observation, asPlayerId(0),
    config, createRng(42n), moves, runtime, pool,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('diagnostics-extended', () => {
  describe('Gap 1: Per-kernel-call timing', () => {
    it('reports non-negative timing for all kernel call types', () => {
      const result = runDiagnosticSearch(30);
      const d = result.diagnostics!;

      assert.ok(d.legalMovesTimeMs! >= 0, 'legalMovesTimeMs >= 0');
      assert.ok(d.applyMoveTimeMs! >= 0, 'applyMoveTimeMs >= 0');
      assert.ok(d.terminalTimeMs! >= 0, 'terminalTimeMs >= 0');
      assert.ok(d.materializeTimeMs! >= 0, 'materializeTimeMs >= 0');
      assert.ok(d.evaluateTimeMs! >= 0, 'evaluateTimeMs >= 0');
    });

    it('kernel timing fields are finite numbers', () => {
      const result = runDiagnosticSearch(30);
      const d = result.diagnostics!;

      const fields = [
        'legalMovesTimeMs',
        'applyMoveTimeMs',
        'terminalTimeMs',
        'materializeTimeMs',
        'evaluateTimeMs',
      ] as const;

      for (const field of fields) {
        assert.ok(Number.isFinite(d[field]), `${field} should be finite, got ${d[field]}`);
      }
    });
  });

  describe('Gap 2: State size metrics', () => {
    it('reports state size samples when enough iterations', () => {
      const result = runDiagnosticSearch(30);
      const d = result.diagnostics!;

      // With 30 iterations, sampling every 10th gives at least 3 samples (iter 0, 10, 20).
      assert.ok(d.stateSizeSampleCount! >= 1, 'should have at least 1 state size sample');
      assert.ok(d.avgStateSizeBytes! > 0, 'avgStateSizeBytes should be > 0');
      assert.ok(d.maxStateSizeBytes! > 0, 'maxStateSizeBytes should be > 0');
      assert.ok(d.maxStateSizeBytes! >= d.avgStateSizeBytes!, 'max >= avg');
    });
  });

  describe('Gap 3: Effect chain profiling', () => {
    it('reports trigger firings metrics', () => {
      const result = runDiagnosticSearch(30);
      const d = result.diagnostics!;

      assert.ok(d.totalTriggerFirings! >= 0, 'totalTriggerFirings >= 0');
      assert.ok(d.maxTriggerFiringsPerMove! >= 0, 'maxTriggerFiringsPerMove >= 0');
      assert.ok(d.avgTriggerFiringsPerMove! >= 0, 'avgTriggerFiringsPerMove >= 0');
    });
  });

  describe('Gap 4: Materialization breakdown', () => {
    it('reports template completion counters', () => {
      const result = runDiagnosticSearch(30);
      const d = result.diagnostics!;

      // In this simple game there are no pending moves, so template completion
      // counters should all be 0. But they must be present as numbers.
      assert.equal(typeof d.templateCompletionAttempts, 'number');
      assert.equal(typeof d.templateCompletionSuccesses, 'number');
      assert.equal(typeof d.templateCompletionFailures, 'number');
      assert.ok(
        d.templateCompletionAttempts! >= d.templateCompletionSuccesses! + d.templateCompletionFailures!,
        'attempts >= successes + failures',
      );
    });
  });

  describe('Gap 5: Memory pressure', () => {
    it('reports heap usage in Node.js environment', () => {
      const result = runDiagnosticSearch(30);
      const d = result.diagnostics!;

      assert.ok(d.heapUsedAtStartBytes! > 0, 'heapUsedAtStartBytes > 0');
      assert.ok(d.heapUsedAtEndBytes! > 0, 'heapUsedAtEndBytes > 0');
      assert.equal(typeof d.heapGrowthBytes, 'number', 'heapGrowthBytes should be a number');
    });
  });

  describe('Gap 6: Branching factor per depth', () => {
    it('reports branching factor statistics', () => {
      const result = runDiagnosticSearch(30);
      const d = result.diagnostics!;

      // The simple game has 2 actions so branching should be measured.
      if (d.avgBranchingFactor !== undefined) {
        assert.ok(d.avgBranchingFactor >= 0, 'avgBranchingFactor >= 0');
        assert.ok(d.maxBranchingFactor! >= d.avgBranchingFactor, 'max >= avg');
        assert.equal(typeof d.branchingFactorByDepth, 'object', 'branchingFactorByDepth is an object');
      }
    });
  });

  describe('Gap 7: Per-iteration timing', () => {
    it('reports iteration timing percentiles', () => {
      const result = runDiagnosticSearch(30);
      const d = result.diagnostics!;

      assert.ok(d.iterationTimeP50Ms! >= 0, 'p50 >= 0');
      assert.ok(d.iterationTimeP95Ms! >= 0, 'p95 >= 0');
      assert.ok(d.iterationTimeMaxMs! >= 0, 'max >= 0');
      assert.ok(d.iterationTimeStddevMs! >= 0, 'stddev >= 0');
      assert.ok(d.iterationTimeP50Ms! <= d.iterationTimeP95Ms!, 'p50 <= p95');
      assert.ok(d.iterationTimeP95Ms! <= d.iterationTimeMaxMs!, 'p95 <= max');
    });
  });

  describe('createAccumulator zeroes new fields', () => {
    it('all new accumulator fields start at zero or empty', () => {
      const acc = createAccumulator();

      assert.equal(acc.legalMovesTimeMs, 0);
      assert.equal(acc.applyMoveTimeMs, 0);
      assert.equal(acc.terminalTimeMs, 0);
      assert.equal(acc.materializeTimeMs, 0);
      assert.equal(acc.evaluateTimeMs, 0);

      assert.deepEqual(acc.stateSizeSamples, []);

      assert.equal(acc.totalTriggerFirings, 0);
      assert.equal(acc.maxTriggerFiringsPerMove, 0);

      assert.equal(acc.templateCompletionAttempts, 0);
      assert.equal(acc.templateCompletionSuccesses, 0);
      assert.equal(acc.templateCompletionFailures, 0);

      assert.equal(acc.heapUsedAtStartBytes, 0);
      assert.equal(acc.heapUsedAtEndBytes, 0);

      assert.deepEqual(acc.branchingFactorSamples, []);
      assert.deepEqual(acc.iterationTimeSamples, []);
    });
  });

  describe('determinism', () => {
    it('same seed produces identical results with and without diagnostics', () => {
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
