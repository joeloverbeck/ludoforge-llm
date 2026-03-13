import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { backpropagate, runOneIteration, runSearch, selectRootDecision } from '../../../../src/agents/mcts/search.js';
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
import type { Move } from '../../../../src/kernel/types-core.js';
import type { MoveKey } from '../../../../src/agents/mcts/move-key.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Simple 2-player perfect-info game:
 * - globalVar "ended" 0..1
 * - perPlayerVar "vp" 0..10
 * - action "win": sets ended=1 (triggers terminal: player 0 wins)
 * - action "noop": does nothing
 */
function createTerminalDef(): GameDef {
  return {
    metadata: { id: 'search-terminal', players: { min: 2, max: 2 } },
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

/**
 * Single-action game: only "noop" is legal.  Terminal never triggers.
 */
function createSingleActionDef(): GameDef {
  return {
    metadata: { id: 'search-single', players: { min: 2, max: 2 } },
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

// ---------------------------------------------------------------------------
// backpropagate
// ---------------------------------------------------------------------------

describe('backpropagate', () => {
  it('increments visits and accumulates rewards up the full parent chain', () => {
    const root = createRootNode(2);
    const move: Move = { actionId: asActionId('a'), params: {} };
    const child = createChildNode(root, move, 'a{}' as MoveKey, 2);
    const grandchild = createChildNode(child, move, 'a{}' as MoveKey, 2);

    backpropagate(grandchild, [0.8, 0.2]);

    assert.equal(grandchild.visits, 1);
    assert.equal(child.visits, 1);
    assert.equal(root.visits, 1);

    assert.ok(Math.abs(grandchild.totalReward[0]! - 0.8) < 1e-10);
    assert.ok(Math.abs(grandchild.totalReward[1]! - 0.2) < 1e-10);
    assert.ok(Math.abs(child.totalReward[0]! - 0.8) < 1e-10);
    assert.ok(Math.abs(child.totalReward[1]! - 0.2) < 1e-10);
    assert.ok(Math.abs(root.totalReward[0]! - 0.8) < 1e-10);
    assert.ok(Math.abs(root.totalReward[1]! - 0.2) < 1e-10);
  });

  it('on root-only path: root visits = 1, root rewards = input rewards', () => {
    const root = createRootNode(3);

    backpropagate(root, [1.0, 0.5, 0.0]);

    assert.equal(root.visits, 1);
    assert.ok(Math.abs(root.totalReward[0]! - 1.0) < 1e-10);
    assert.ok(Math.abs(root.totalReward[1]! - 0.5) < 1e-10);
    assert.ok(Math.abs(root.totalReward[2]! - 0.0) < 1e-10);
  });

  it('accumulates across multiple backpropagations', () => {
    const root = createRootNode(2);
    const move: Move = { actionId: asActionId('x'), params: {} };
    const child = createChildNode(root, move, 'x{}' as MoveKey, 2);

    backpropagate(child, [1.0, 0.0]);
    backpropagate(child, [0.0, 1.0]);
    backpropagate(child, [0.5, 0.5]);

    assert.equal(child.visits, 3);
    assert.equal(root.visits, 3);
    assert.ok(Math.abs(child.totalReward[0]! - 1.5) < 1e-10);
    assert.ok(Math.abs(child.totalReward[1]! - 1.5) < 1e-10);
    assert.ok(Math.abs(root.totalReward[0]! - 1.5) < 1e-10);
    assert.ok(Math.abs(root.totalReward[1]! - 1.5) < 1e-10);
  });
});

// ---------------------------------------------------------------------------
// runOneIteration
// ---------------------------------------------------------------------------

describe('runOneIteration', () => {
  it('on a simple 2-player fixture: allocates at least one child and performs backprop', () => {
    const def = createTerminalDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const root = createRootNode(playerCount);
    const moves = legalMoves(def, state, undefined, runtime);
    const config = validateMctsConfig({ iterations: 1, minIterations: 0 });
    const pool = createNodePool(100, playerCount);

    const rng = createRng(123n);
    runOneIteration(root, state, rng, def, config, moves, runtime, pool);

    // Root should have at least one child after expansion.
    assert.ok(root.children.length >= 1, 'expected at least one child');
    // Root should have been backpropagated (visits >= 1).
    assert.ok(root.visits >= 1, 'expected root visits >= 1');
  });
});

// ---------------------------------------------------------------------------
// runSearch
// ---------------------------------------------------------------------------

describe('runSearch', () => {
  it('with iterations: 10 on a trivial fixture returns after exactly 10 iterations', () => {
    const def = createTerminalDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const root = createRootNode(playerCount);
    const observer = asPlayerId(0);
    const observation = derivePlayerObservation(def, state, observer);
    const moves = legalMoves(def, state, undefined, runtime);
    const config = validateMctsConfig({ iterations: 10, minIterations: 0 });
    const pool = createNodePool(200, playerCount);
    const searchRng = createRng(42n);

    const result = runSearch(
      root, def, state, observation, observer, config, searchRng, moves, runtime, pool,
    );

    assert.equal(result.iterations, 10);
    // Invariant: total root visits after N iterations = N.
    assert.equal(root.visits, 10);
  });

  it('with iterations: 1 on single legal move still runs one iteration', () => {
    const def = createSingleActionDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const root = createRootNode(playerCount);
    const observer = asPlayerId(0);
    const observation = derivePlayerObservation(def, state, observer);
    const moves = legalMoves(def, state, undefined, runtime);
    const config = validateMctsConfig({ iterations: 1, minIterations: 0 });
    const pool = createNodePool(50, playerCount);
    const searchRng = createRng(99n);

    const result = runSearch(
      root, def, state, observation, observer, config, searchRng, moves, runtime, pool,
    );

    assert.equal(result.iterations, 1);
    assert.equal(root.visits, 1);
  });

  it('never mutates input GameState', () => {
    const def = createTerminalDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const stateBefore = JSON.stringify(state, (_k, v) =>
      typeof v === 'bigint' ? `__bigint__${v.toString()}` : v,
    );
    const runtime = createGameDefRuntime(def);
    const root = createRootNode(playerCount);
    const observer = asPlayerId(0);
    const observation = derivePlayerObservation(def, state, observer);
    const moves = legalMoves(def, state, undefined, runtime);
    const config = validateMctsConfig({ iterations: 5, minIterations: 0 });
    const pool = createNodePool(100, playerCount);
    const searchRng = createRng(42n);

    runSearch(root, def, state, observation, observer, config, searchRng, moves, runtime, pool);

    const stateAfter = JSON.stringify(state, (_k, v) =>
      typeof v === 'bigint' ? `__bigint__${v.toString()}` : v,
    );
    assert.equal(stateAfter, stateBefore, 'input state was mutated');
  });

  it('sum of child visits <= root visits', () => {
    const def = createTerminalDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const root = createRootNode(playerCount);
    const observer = asPlayerId(0);
    const observation = derivePlayerObservation(def, state, observer);
    const moves = legalMoves(def, state, undefined, runtime);
    const config = validateMctsConfig({ iterations: 20, minIterations: 0 });
    const pool = createNodePool(200, playerCount);
    const searchRng = createRng(42n);

    runSearch(root, def, state, observation, observer, config, searchRng, moves, runtime, pool);

    const childVisitSum = root.children.reduce((sum, c) => sum + c.visits, 0);
    assert.ok(
      childVisitSum <= root.visits,
      `child visits (${childVisitSum}) should be <= root visits (${root.visits})`,
    );
  });
});

// ---------------------------------------------------------------------------
// selectRootDecision
// ---------------------------------------------------------------------------

describe('selectRootDecision', () => {
  it('picks highest-visited child', () => {
    const root = createRootNode(2);
    const move1: Move = { actionId: asActionId('a'), params: {} };
    const move2: Move = { actionId: asActionId('b'), params: {} };
    const child1 = createChildNode(root, move1, 'a{}' as MoveKey, 2);
    const child2 = createChildNode(root, move2, 'b{}' as MoveKey, 2);

    child1.visits = 10;
    child1.totalReward[0] = 5;
    child2.visits = 20;
    child2.totalReward[0] = 8;

    const best = selectRootDecision(root, asPlayerId(0));
    assert.equal(best, child2);
  });

  it('tiebreaks by mean reward', () => {
    const root = createRootNode(2);
    const move1: Move = { actionId: asActionId('a'), params: {} };
    const move2: Move = { actionId: asActionId('b'), params: {} };
    const child1 = createChildNode(root, move1, 'a{}' as MoveKey, 2);
    const child2 = createChildNode(root, move2, 'b{}' as MoveKey, 2);

    // Same visits, different mean rewards.
    child1.visits = 10;
    child1.totalReward[0] = 3; // mean = 0.3
    child2.visits = 10;
    child2.totalReward[0] = 7; // mean = 0.7

    const best = selectRootDecision(root, asPlayerId(0));
    assert.equal(best, child2);
  });

  it('throws if root has no children', () => {
    const root = createRootNode(2);
    assert.throws(() => selectRootDecision(root, asPlayerId(0)), /no children/);
  });
});

// ---------------------------------------------------------------------------
// Availability accounting
// ---------------------------------------------------------------------------

describe('availability accounting', () => {
  it('children accumulate availability counts across iterations', () => {
    const def = createTerminalDef();
    const playerCount = 2;
    const { state } = initialState(def, 42, playerCount);
    const runtime = createGameDefRuntime(def);
    const root = createRootNode(playerCount);
    const observer = asPlayerId(0);
    const observation = derivePlayerObservation(def, state, observer);
    const moves = legalMoves(def, state, undefined, runtime);
    const config = validateMctsConfig({ iterations: 10, minIterations: 0 });
    const pool = createNodePool(200, playerCount);
    const searchRng = createRng(42n);

    runSearch(root, def, state, observation, observer, config, searchRng, moves, runtime, pool);

    // In a perfect-info game where all moves are always legal, availability
    // should equal the number of iterations where the child existed.
    // At minimum, any child that exists should have availability >= 1.
    for (const child of root.children) {
      assert.ok(
        child.availability >= 1,
        `child availability (${child.availability}) should be >= 1`,
      );
    }
  });
});
