import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  shouldStopByConfidence,
  runSearch,
} from '../../../../src/agents/mcts/search.js';
import { createRootNode, createChildNode } from '../../../../src/agents/mcts/node.js';
import { createNodePool } from '../../../../src/agents/mcts/node-pool.js';
import { validateMctsConfig } from '../../../../src/agents/mcts/config.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { derivePlayerObservation } from '../../../../src/kernel/observation.js';
import type { MoveKey } from '../../../../src/agents/mcts/move-key.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a 2-player root with given children stats. */
function rootWithChildren(
  children: Array<{ moveKey: string; visits: number; reward0: number; reward1: number }>,
): ReturnType<typeof createRootNode> {
  const root = createRootNode(2);
  for (const c of children) {
    const child = createChildNode(
      root,
      { actionId: asActionId(c.moveKey), params: {} },
      c.moveKey as MoveKey,
      2,
    );
    child.visits = c.visits;
    child.totalReward[0] = c.reward0;
    child.totalReward[1] = c.reward1;
  }
  return root;
}

// ---------------------------------------------------------------------------
// shouldStopByConfidence — unit tests
// ---------------------------------------------------------------------------

describe('shouldStopByConfidence', () => {
  it('returns false when root has fewer than 2 children', () => {
    const root = rootWithChildren([
      { moveKey: 'a', visits: 100, reward0: 80, reward1: 20 },
    ]);
    assert.equal(shouldStopByConfidence(root, 0, 1e-3, 16), false);
  });

  it('returns false when either child has fewer than minVisits', () => {
    const root = rootWithChildren([
      { moveKey: 'a', visits: 100, reward0: 90, reward1: 10 },
      { moveKey: 'b', visits: 10, reward0: 2, reward1: 8 },
    ]);
    // minVisits = 16, runner-up has only 10
    assert.equal(shouldStopByConfidence(root, 0, 1e-3, 16), false);
  });

  it('returns false when visit ratio guard fails (best.visits <= 2 * runnerUp.visits)', () => {
    // Both have 50 visits, clearly separated means but equal visit counts
    const root = rootWithChildren([
      { moveKey: 'a', visits: 50, reward0: 45, reward1: 5 },
      { moveKey: 'b', visits: 50, reward0: 10, reward1: 40 },
    ]);
    assert.equal(shouldStopByConfidence(root, 0, 1e-3, 16), false);
  });

  it('returns false when confidence intervals overlap', () => {
    // Very close means with moderate visits — intervals will overlap
    const root = rootWithChildren([
      { moveKey: 'a', visits: 200, reward0: 102, reward1: 98 },
      { moveKey: 'b', visits: 50, reward0: 25, reward1: 25 },
    ]);
    // mean_a = 0.51, mean_b = 0.50 — very close, intervals overlap
    assert.equal(shouldStopByConfidence(root, 0, 1e-3, 16), false);
  });

  it('returns true when best is statistically separated with visit-ratio dominance', () => {
    // Best: 500 visits, mean = 0.9. Runner-up: 100 visits, mean = 0.2.
    // Hoeffding radius for best: sqrt(ln(1000) / 1000) ≈ 0.083
    // Hoeffding radius for runner-up: sqrt(ln(1000) / 200) ≈ 0.186
    // bestLower = 0.9 - 0.083 = 0.817, runnerUpUpper = 0.2 + 0.186 = 0.386
    // 0.817 > 0.386 ✓, visit ratio 500 > 200 ✓
    const root = rootWithChildren([
      { moveKey: 'a', visits: 500, reward0: 450, reward1: 50 },
      { moveKey: 'b', visits: 100, reward0: 20, reward1: 80 },
    ]);
    assert.equal(shouldStopByConfidence(root, 0, 1e-3, 16), true);
  });

  it('returns false when all children have 0 visits', () => {
    const root = rootWithChildren([
      { moveKey: 'a', visits: 0, reward0: 0, reward1: 0 },
      { moveKey: 'b', visits: 0, reward0: 0, reward1: 0 },
    ]);
    assert.equal(shouldStopByConfidence(root, 0, 1e-3, 16), false);
  });

  it('works with more than 2 children — finds best and runner-up correctly', () => {
    const root = rootWithChildren([
      { moveKey: 'a', visits: 600, reward0: 540, reward1: 60 },
      { moveKey: 'b', visits: 100, reward0: 20, reward1: 80 },
      { moveKey: 'c', visits: 80, reward0: 16, reward1: 64 },
    ]);
    // Best = a (mean 0.9), runner-up = b (mean 0.2), c (mean 0.2) ignored
    assert.equal(shouldStopByConfidence(root, 0, 1e-3, 16), true);
  });

  it('uses the correct player ordinal', () => {
    // For player 1, child b is best
    const root = rootWithChildren([
      { moveKey: 'a', visits: 500, reward0: 450, reward1: 50 },
      { moveKey: 'b', visits: 100, reward0: 20, reward1: 80 },
    ]);
    // Player 1 perspective: best is b (mean 0.8), runner-up is a (mean 0.1)
    // But visit ratio: b has 100, a has 500, so b.visits <= 2 * a.visits → false
    assert.equal(shouldStopByConfidence(root, 1, 1e-3, 16), false);
  });
});

// ---------------------------------------------------------------------------
// Integration: runSearch with confidence stop
// ---------------------------------------------------------------------------

/**
 * Simple 2-player game with "noop" action (non-terminal, endless).
 * Used to verify that confidence stop fires and sets rootStopReason.
 */
function createNoopGameDef(): GameDef {
  return {
    metadata: { id: 'confidence-noop', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'x', type: 'int', init: 0, min: 0, max: 100 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
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
    terminal: { conditions: [] },
  } as unknown as GameDef;
}

/**
 * Two-action game: "good" increments global x, "bad" does nothing.
 * Different evaluation heuristics create reward separation.
 */
function createTwoActionDef(): GameDef {
  return {
    metadata: { id: 'confidence-two', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'x', type: 'int', init: 0, min: 0, max: 100 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('good'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ setVar: { scope: 'global', var: 'x', value: { op: '+', left: { ref: 'gvar', var: 'x' }, right: 1 } } }],
        limits: [],
      },
      {
        id: asActionId('bad'),
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
    terminal: { conditions: [] },
  } as unknown as GameDef;
}

describe('runSearch rootStopReason', () => {
  const playerCount = 2;

  it('rootStopReason is "iterations" when iteration budget is exhausted normally', () => {
    const def = createNoopGameDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42, playerCount);
    const observer = asPlayerId(0);
    const obs = derivePlayerObservation(def, state, observer);
    const pool = createNodePool(1024, playerCount);
    const root = createRootNode(playerCount);
    const rootMoves = legalMoves(def, state, undefined, runtime);

    const config = validateMctsConfig({
      iterations: 20,
      minIterations: 0,
      diagnostics: true,
      rolloutMode: 'direct',
    });

    const result = runSearch(root, def, state, obs, observer, config, createRng(123n), rootMoves, runtime, pool);
    assert.ok(result.diagnostics);
    assert.equal(result.diagnostics!.rootStopReason, 'iterations');
  });

  it('rootStopReason is "time" when wall-clock deadline causes stop', () => {
    const def = createNoopGameDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42, playerCount);
    const observer = asPlayerId(0);
    const obs = derivePlayerObservation(def, state, observer);
    const pool = createNodePool(4096, playerCount);
    const root = createRootNode(playerCount);
    const rootMoves = legalMoves(def, state, undefined, runtime);

    // Very short time limit: 1ms with high iteration budget
    const config = validateMctsConfig({
      iterations: 100_000,
      minIterations: 0,
      timeLimitMs: 1,
      diagnostics: true,
      rolloutMode: 'direct',
    });

    const result = runSearch(root, def, state, obs, observer, config, createRng(123n), rootMoves, runtime, pool);
    assert.ok(result.diagnostics);
    // With 1ms limit and minIterations=0, time stop should fire quickly
    assert.equal(result.diagnostics!.rootStopReason, 'time');
  });

  it('confidence stop does not fire before minIterations', () => {
    const def = createTwoActionDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42, playerCount);
    const observer = asPlayerId(0);
    const obs = derivePlayerObservation(def, state, observer);
    const pool = createNodePool(1024, playerCount);
    const root = createRootNode(playerCount);
    const rootMoves = legalMoves(def, state, undefined, runtime);

    // Set minIterations higher than total iterations to ensure
    // confidence stop cannot fire
    const config = validateMctsConfig({
      iterations: 50,
      minIterations: 50,
      diagnostics: true,
      rolloutMode: 'direct',
    });

    const result = runSearch(root, def, state, obs, observer, config, createRng(123n), rootMoves, runtime, pool);
    assert.ok(result.diagnostics);
    // Must be 'iterations' since minIterations == iterations
    assert.equal(result.diagnostics!.rootStopReason, 'iterations');
  });

  it('determinism: same seed + same config = same iteration count', () => {
    const def = createTwoActionDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42, playerCount);
    const observer = asPlayerId(0);
    const obs = derivePlayerObservation(def, state, observer);

    const config = validateMctsConfig({
      iterations: 500,
      minIterations: 16,
      diagnostics: true,
      rolloutMode: 'direct',
      rootStopConfidenceDelta: 1e-3,
      rootStopMinVisits: 16,
    });

    const results: number[] = [];
    for (let trial = 0; trial < 3; trial++) {
      const pool = createNodePool(4096, playerCount);
      const root = createRootNode(playerCount);
      const rootMoves = legalMoves(def, state, undefined, runtime);
      const result = runSearch(root, def, state, obs, observer, config, createRng(999n), rootMoves, runtime, pool);
      results.push(result.iterations);
    }

    // All three trials must produce the same iteration count.
    assert.equal(results[0], results[1], 'trials 0 and 1 should match');
    assert.equal(results[1], results[2], 'trials 1 and 2 should match');
  });
});
