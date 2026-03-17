import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runOneIteration, runSearch } from '../../../../src/agents/mcts/search.js';
import { simulateToCutoff } from '../../../../src/agents/mcts/rollout.js';
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

/**
 * Single-action game: only "noop" is legal.  Because there is exactly one
 * concrete candidate at every state, forced-sequence compression should
 * compress the entire selection path into zero new nodes.
 *
 * Uses scoring-based terminal (no win conditions) so the game never
 * terminates during short searches.
 */
function createForcedSequenceDef(): GameDef {
  return {
    metadata: { id: 'forced-seq-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
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
    terminal: {
      conditions: [],
      scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'vp' } },
    },
  } as unknown as GameDef;
}

/**
 * Single-action game with terminal detection:
 * - action "trigger_end" sets ended=1 (first invocation triggers win)
 */
function createForcedTerminalDef(): GameDef {
  return {
    metadata: { id: 'forced-terminal', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'ended', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('trigger_end'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [{ setVar: { scope: 'global', var: 'ended', value: 1 } }],
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

/**
 * Two-action game: "win" + "noop" — both concrete, but two candidates
 * means no forced-sequence compression should occur.
 */
function createTwoActionDef(): GameDef {
  return {
    metadata: { id: 'two-action', players: { min: 2, max: 2 } },
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

// ---------------------------------------------------------------------------
// Selection-phase forced-sequence compression
// ---------------------------------------------------------------------------

describe('forced-sequence compression (selection phase)', () => {
  it('does not allocate new nodes when exactly one candidate exists', () => {
    const def = createForcedSequenceDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const rootMoves = legalMoves(def, state, undefined, runtime);
    const root = createRootNode(playerCount);
    const pool = createNodePool(100, playerCount);
    const config = validateMctsConfig({
      iterations: 1,
      minIterations: 0,
      compressForcedSequences: true,
      leafEvaluator: { type: 'heuristic' },
      diagnostics: true,
    });
    const acc = createAccumulator();
    const rng = createRng(42n);

    runOneIteration(root, state, rng, def, config, rootMoves, runtime, pool, false, acc);

    // With forced compression, the single-candidate moves should NOT
    // allocate children — the tree stays at the root.
    assert.equal(root.children.length, 0, 'No children should be allocated for forced moves');
    assert.ok(acc.forcedMovePlies > 0, 'forcedMovePlies should be incremented');
  });

  it('records correct forcedMovePlies count in diagnostics', () => {
    const def = createForcedSequenceDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const rootMoves = legalMoves(def, state, undefined, runtime);
    const root = createRootNode(playerCount);
    const pool = createNodePool(100, playerCount);
    const config = validateMctsConfig({
      iterations: 5,
      minIterations: 0,
      compressForcedSequences: true,
      leafEvaluator: { type: 'heuristic' },
      diagnostics: true,
    });
    const observation = derivePlayerObservation(def, state, asPlayerId(0));

    const result = runSearch(
      root, def, state, observation, asPlayerId(0), config,
      createRng(42n), rootMoves, runtime, pool,
    );

    assert.ok(result.diagnostics !== undefined, 'diagnostics should be present');
    assert.ok(
      (result.diagnostics.forcedMovePlies ?? 0) > 0,
      'forcedMovePlies should be positive in diagnostics',
    );
  });

  it('detects terminal correctly after forced moves', () => {
    const def = createForcedTerminalDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const rootMoves = legalMoves(def, state, undefined, runtime);
    const root = createRootNode(playerCount);
    const pool = createNodePool(100, playerCount);
    const config = validateMctsConfig({
      iterations: 1,
      minIterations: 0,
      compressForcedSequences: true,
      leafEvaluator: { type: 'heuristic' },
      diagnostics: true,
    });
    const acc = createAccumulator();
    const rng = createRng(42n);

    // The single action triggers terminal — compression should detect this
    // and stop, producing valid backpropagation results.
    runOneIteration(root, state, rng, def, config, rootMoves, runtime, pool, false, acc);

    // Should have processed the forced move and incremented the counter.
    assert.ok(acc.forcedMovePlies > 0, 'forcedMovePlies should be incremented');
    // Root should still have visits from backpropagation.
    assert.ok(root.visits > 0, 'root should have visits after backpropagation');
  });

  it('does not compress when compressForcedSequences is false', () => {
    const def = createForcedSequenceDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const rootMoves = legalMoves(def, state, undefined, runtime);
    const root = createRootNode(playerCount);
    const pool = createNodePool(100, playerCount);
    const config = validateMctsConfig({
      iterations: 1,
      minIterations: 0,
      compressForcedSequences: false,
      leafEvaluator: { type: 'heuristic' },
      diagnostics: true,
    });
    const acc = createAccumulator();
    const rng = createRng(42n);

    runOneIteration(root, state, rng, def, config, rootMoves, runtime, pool, false, acc);

    // With compression disabled, normal expansion should occur.
    assert.equal(acc.forcedMovePlies, 0, 'forcedMovePlies should be 0 when compression disabled');
    // A child should be allocated (normal expansion path).
    assert.ok(root.children.length > 0, 'children should be allocated normally');
  });

  it('does not compress when multiple candidates exist', () => {
    const def = createTwoActionDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const rootMoves = legalMoves(def, state, undefined, runtime);
    const root = createRootNode(playerCount);
    const pool = createNodePool(100, playerCount);
    const config = validateMctsConfig({
      iterations: 1,
      minIterations: 0,
      compressForcedSequences: true,
      leafEvaluator: { type: 'heuristic' },
      diagnostics: true,
    });
    const acc = createAccumulator();
    const rng = createRng(42n);

    runOneIteration(root, state, rng, def, config, rootMoves, runtime, pool, false, acc);

    // Two candidates means no forced-sequence compression at root.
    assert.equal(acc.forcedMovePlies, 0, 'no forced compression with multiple candidates');
    assert.ok(root.children.length > 0, 'children should be allocated normally');
  });
});

// ---------------------------------------------------------------------------
// Simulation-phase forced-sequence compression
// ---------------------------------------------------------------------------

describe('forced-sequence compression (simulation phase)', () => {
  it('does not decrement cutoff budget for forced moves in simulateToCutoff', () => {
    const def = createForcedSequenceDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const acc = createAccumulator();
    const rng = createRng(42n);

    const result = simulateToCutoff(
      def, state, rng,
      {
        rolloutPolicy: 'random',
        rolloutEpsilon: 0.15,
        rolloutCandidateSample: 6,
        hybridCutoffDepth: 3,
        templateCompletionsPerVisit: 2,
        mastWarmUpThreshold: 32,
        compressForcedSequences: true,
      },
      runtime,
      acc,
    );

    // With forced-sequence compression, forced moves don't consume depth.
    // The simulation should have proceeded through more plies than the cutoff
    // budget, but depth (returned) reflects only non-forced plies.
    assert.equal(result.depth, 0, 'depth should be 0 — all plies were forced');
    assert.ok(acc.forcedMovePlies > 0, 'forcedMovePlies should be incremented');
    assert.ok(result.traversedMoveKeys.length > 0, 'traversedMoveKeys should record forced moves');
  });

  it('does not compress in simulation when disabled', () => {
    const def = createForcedSequenceDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const acc = createAccumulator();
    const rng = createRng(42n);

    const result = simulateToCutoff(
      def, state, rng,
      {
        rolloutPolicy: 'random',
        rolloutEpsilon: 0.15,
        rolloutCandidateSample: 6,
        hybridCutoffDepth: 3,
        templateCompletionsPerVisit: 2,
        mastWarmUpThreshold: 32,
        compressForcedSequences: false,
      },
      runtime,
      acc,
    );

    assert.equal(acc.forcedMovePlies, 0, 'forcedMovePlies should be 0 when disabled');
    // Depth should consume the cutoff budget normally.
    assert.ok(result.depth > 0, 'depth should be positive — normal simulation');
  });
});
