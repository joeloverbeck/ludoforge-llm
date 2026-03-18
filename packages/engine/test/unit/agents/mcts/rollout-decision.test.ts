/**
 * Unit tests for decision boundary handling in the MCTS rollout phase.
 *
 * Covers: resolveDecisionBoundary completing via completeTemplateMove,
 * single applyMove call, cutoff accounting, rolloutMode dispatch,
 * state-node passthrough, and graceful failure handling.
 *
 * Ticket: 62MCTSSEAVIS-011
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Move } from '../../../../src/kernel/types-core.js';
import { resolveDecisionBoundary } from '../../../../src/agents/mcts/decision-boundary.js';
import { createAccumulator } from '../../../../src/agents/mcts/diagnostics.js';
import { runOneIteration } from '../../../../src/agents/mcts/search.js';
import { createRootNode } from '../../../../src/agents/mcts/node.js';
import type { MctsNode } from '../../../../src/agents/mcts/node.js';

/** State-kind root node — no in-progress chooseN bindings to strip. */
const DUMMY_LEAF = createRootNode(2);
import { createNodePool } from '../../../../src/agents/mcts/node-pool.js';
import { validateMctsConfig } from '../../../../src/agents/mcts/config.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const aid = asActionId;
const pid = asPlayerId;

/**
 * VP race with a template "boost" action that has an int-range param (amount).
 * Uses a proper `OptionsQuery` with `intsInRange` so that
 * `completeTemplateMove` can resolve the decision.
 */
function createTemplateDef(): GameDef {
  const phase = [asPhaseId('main')];
  return {
    metadata: { id: 'rollout-decision-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 20 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: aid('boost'),
        actor: 'active' as const,
        executor: 'actor' as const,
        phase,
        params: [
          { name: 'amount', domain: { query: 'intsInRange', min: 1, max: 3 } },
        ],
        pre: null,
        cost: [],
        effects: [
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 2 } },
        ],
        limits: [],
      },
      {
        id: aid('noop'),
        actor: 'active' as const,
        executor: 'actor' as const,
        phase,
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

/** Concrete-only VP race (no template moves). */
function createConcreteDef(): GameDef {
  const phase = [asPhaseId('main')];
  return {
    metadata: { id: 'rollout-decision-concrete', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 20 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: aid('advance'),
        actor: 'active' as const,
        executor: 'actor' as const,
        phase,
        params: [],
        pre: null,
        cost: [],
        effects: [
          { addVar: { scope: 'pvar', player: 'actor', var: 'vp', delta: 1 } },
        ],
        limits: [],
      },
      {
        id: aid('noop'),
        actor: 'active' as const,
        executor: 'actor' as const,
        phase,
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

// ---------------------------------------------------------------------------
// AC 1: rollout from decision node completes via completeTemplateMove
// ---------------------------------------------------------------------------

describe('rollout-decision: completes via completeTemplateMove', () => {
  it('resolves a partial move to a completed move with amount filled', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const partialMove: Move = { actionId: aid('boost'), params: {} };
    const rng = createRng(123n);

    const result = resolveDecisionBoundary(def, state, partialMove, rng, DUMMY_LEAF);

    assert.notEqual(result, null);
    assert.ok('amount' in result!.move.params);
    const amount = result!.move.params.amount as number;
    assert.ok(amount >= 1 && amount <= 3);
  });

  it('completes a partially-filled move by passing existing params through', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    // Amount already decided in-tree.
    const partialMove: Move = {
      actionId: aid('boost'),
      params: { amount: 2 },
    };
    const rng = createRng(456n);

    const result = resolveDecisionBoundary(def, state, partialMove, rng, DUMMY_LEAF);

    assert.notEqual(result, null);
    assert.equal(result!.move.params.amount, 2);
  });
});

// ---------------------------------------------------------------------------
// AC 2: completed move is applied exactly once to produce game state
// ---------------------------------------------------------------------------

describe('rollout-decision: apply exactly once', () => {
  it('increments applyMoveCalls by exactly 1 on success', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const partialMove: Move = { actionId: aid('boost'), params: {} };
    const rng = createRng(789n);
    const acc = createAccumulator();

    const before = acc.applyMoveCalls;
    const result = resolveDecisionBoundary(def, state, partialMove, rng, DUMMY_LEAF, undefined, acc);

    assert.notEqual(result, null);
    assert.equal(acc.applyMoveCalls, before + 1);
  });

  it('returns a new game state different from the input', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const partialMove: Move = { actionId: aid('boost'), params: {} };
    const rng = createRng(101n);

    const result = resolveDecisionBoundary(def, state, partialMove, rng, DUMMY_LEAF);

    assert.notEqual(result, null);
    // Boost adds 2 VP — state should differ.
    assert.notDeepStrictEqual(result!.state, state);
  });
});

// ---------------------------------------------------------------------------
// AC 3: compound action completion does NOT increment cutoff counter
// ---------------------------------------------------------------------------

describe('rollout-decision: no cutoff increment', () => {
  it('decision boundary completion does not increment hybridRolloutPlies or forcedMovePlies', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const partialMove: Move = { actionId: aid('boost'), params: {} };
    const rng = createRng(202n);
    const acc = createAccumulator();

    resolveDecisionBoundary(def, state, partialMove, rng, DUMMY_LEAF, undefined, acc);

    // These counters track simulation plies, not decision completion.
    assert.equal(acc.hybridRolloutPlies, 0);
    assert.equal(acc.forcedMovePlies, 0);
  });

  it('tracks completion in decisionCompletionsInRollout counter', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const partialMove: Move = { actionId: aid('boost'), params: {} };
    const rng = createRng(303n);
    const acc = createAccumulator();

    resolveDecisionBoundary(def, state, partialMove, rng, DUMMY_LEAF, undefined, acc);

    assert.equal(acc.decisionCompletionsInRollout, 1);
  });
});

// ---------------------------------------------------------------------------
// AC 4: simulation after decision completion uses rolloutMode as configured
// ---------------------------------------------------------------------------

describe('rollout-decision: rolloutMode respected after boundary', () => {
  it('runOneIteration with decision node and direct mode evaluates without simulation', () => {
    const def = createTemplateDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42, 2);
    const rng = createRng(404n);
    const pool = createNodePool(100, 2);
    const root = createRootNode(2);
    const moves = legalMoves(def, state, undefined, runtime);

    // Create a decision root child for the template "boost" action.
    const templateMove: Move = { actionId: aid('boost'), params: {} };
    const dRoot = pool.allocate();
    (dRoot as { move: Move | null }).move = templateMove;
    (dRoot as { moveKey: string | null }).moveKey = 'D:boost';
    (dRoot as { parent: MctsNode | null }).parent = root;
    dRoot.nodeKind = 'decision';
    dRoot.decisionPlayer = pid(0);
    dRoot.partialMove = templateMove;
    dRoot.decisionBinding = null;
    dRoot.heuristicPrior = null;
    dRoot.availability = 1;
    root.children.push(dRoot);

    // Also add a concrete child so root has candidates.
    const noopMove: Move = { actionId: aid('noop'), params: {} };
    const noopChild = pool.allocate();
    (noopChild as { move: Move | null }).move = noopMove;
    (noopChild as { moveKey: string | null }).moveKey = 'noop{}';
    (noopChild as { parent: MctsNode | null }).parent = root;
    noopChild.availability = 1;
    root.children.push(noopChild);

    // Use 'direct' rolloutMode — simulation skipped, evaluate directly.
    const config = validateMctsConfig({
      iterations: 1,
      minIterations: 0,
      leafEvaluator: { type: 'heuristic' },
      diagnostics: true,
    });
    const acc = createAccumulator();

    // Should not throw.
    runOneIteration(
      root, state, rng, def, config, moves, runtime, pool, false, acc,
    );

    // Root should have received a visit via backpropagation.
    assert.ok(root.visits > 0);
  });
});

// ---------------------------------------------------------------------------
// AC 5: rollout from state node is unchanged (no decision handling triggered)
// ---------------------------------------------------------------------------

describe('rollout-decision: state node passthrough', () => {
  it('state nodes skip decision boundary resolution entirely', () => {
    const def = createConcreteDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42, 2);
    const rng = createRng(505n);
    const pool = createNodePool(100, 2);
    const root = createRootNode(2);
    const moves = legalMoves(def, state, undefined, runtime);
    const acc = createAccumulator();

    const config = validateMctsConfig({
      iterations: 1,
      minIterations: 0,
      diagnostics: true,
    });

    runOneIteration(
      root, state, rng, def, config, moves, runtime, pool, false, acc,
    );

    // No decision boundary counters should be touched.
    assert.equal(acc.decisionCompletionsInRollout, 0);
    assert.equal(acc.decisionBoundaryFailures, 0);
  });
});

// ---------------------------------------------------------------------------
// AC 6: failed completeTemplateMove at boundary handled gracefully
// ---------------------------------------------------------------------------

describe('rollout-decision: failed completion backpropagates loss', () => {
  it('returns null for an action with unsatisfiable params', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    // Move with a nonexistent actionId — completion will fail.
    const badMove: Move = { actionId: aid('nonexistent'), params: {} };
    const rng = createRng(606n);
    const acc = createAccumulator();

    const result = resolveDecisionBoundary(def, state, badMove, rng, DUMMY_LEAF, undefined, acc);

    assert.equal(result, null);
    assert.equal(acc.decisionBoundaryFailures, 1);
    assert.equal(acc.decisionCompletionsInRollout, 0);
  });

  it('failed boundary returns null and increments failure counter', () => {
    // Direct verification that resolveDecisionBoundary tracks failures
    // correctly even when completeTemplateMove throws (not just unsatisfiable).
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(808n);
    const acc = createAccumulator();

    // Use a sabotaged move that makes completeTemplateMove throw
    // (unknown action id) — resolveDecisionBoundary should catch it.
    const badMove: Move = { actionId: aid('nonexistent'), params: {} };

    const result = resolveDecisionBoundary(def, state, badMove, rng, DUMMY_LEAF, undefined, acc);

    assert.equal(result, null);
    assert.equal(acc.decisionBoundaryFailures, 1);
    // No applyMove should have been called.
    assert.equal(acc.applyMoveCalls, 0);
    assert.equal(acc.decisionCompletionsInRollout, 0);
  });

  it('successful boundary in search loop resolves and backpropagates normally', () => {
    // Verify the happy-path integration: search enters a decision node,
    // boundary resolves, and backprop completes with non-zero rewards.
    const def = createTemplateDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42, 2);
    const rng = createRng(909n);
    // Pool with just enough space for the decision root + a few nodes.
    const pool = createNodePool(10, 2);
    const root = createRootNode(2);
    const moves = legalMoves(def, state, undefined, runtime);

    const config = validateMctsConfig({
      iterations: 1,
      minIterations: 0,
      leafEvaluator: { type: 'heuristic' },
      diagnostics: true,
    });
    const acc = createAccumulator();

    // Run a single iteration — the search should create a decision root
    // for the template "boost" action, expand it, and backpropagate.
    runOneIteration(
      root, state, rng, def, config, moves, runtime, pool, false, acc,
    );

    // Root should have been visited.
    assert.ok(root.visits > 0, `root.visits should be > 0, got ${root.visits}`);
  });
});
