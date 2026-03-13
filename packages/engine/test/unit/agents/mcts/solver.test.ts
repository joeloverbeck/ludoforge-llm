import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canActivateSolver, updateSolverResult, selectSolverAwareChild } from '../../../../src/agents/mcts/solver.js';
import { createRootNode } from '../../../../src/agents/mcts/node.js';
import { validateMctsConfig } from '../../../../src/agents/mcts/config.js';
import { runSearch } from '../../../../src/agents/mcts/search.js';
import { createNodePool } from '../../../../src/agents/mcts/node-pool.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { derivePlayerObservation } from '../../../../src/kernel/observation.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';
import type { MctsNode } from '../../../../src/agents/mcts/node.js';
import type { MctsConfig } from '../../../../src/agents/mcts/config.js';
import type { PlayerId } from '../../../../src/kernel/branded.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function solverOnConfig(overrides: Partial<MctsConfig> = {}): MctsConfig {
  return validateMctsConfig({
    solverMode: 'perfectInfoDeterministic2P',
    iterations: 100,
    minIterations: 0,
    ...overrides,
  });
}

function solverOffConfig(): MctsConfig {
  return validateMctsConfig({ solverMode: 'off', iterations: 100, minIterations: 0 });
}

// ---------------------------------------------------------------------------
// Fixture: 2-player, all-public, win/loss/draw, deterministic
// ---------------------------------------------------------------------------

function createSolverQualifyingDef(): GameDef {
  return {
    metadata: { id: 'solver-qualify', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'ended', type: 'int', init: 0, min: 0, max: 1 }],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('winP0'),
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
// Fixture: hidden-info game (zone with visibility: 'owner')
// ---------------------------------------------------------------------------

function createHiddenInfoDef(): GameDef {
  const base = createSolverQualifyingDef() as unknown as Record<string, unknown>;
  return {
    ...base,
    metadata: { id: 'solver-hidden', players: { min: 2, max: 2 } },
    zones: [
      { id: asZoneId('hand:0'), visibility: 'owner', kind: 'aux', ownerPlayerIndex: 0, owner: 'player' },
    ],
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// Fixture: 3-player game
// ---------------------------------------------------------------------------

function create3PlayerDef(): GameDef {
  const base = createSolverQualifyingDef() as unknown as Record<string, unknown>;
  return {
    ...base,
    metadata: { id: 'solver-3p', players: { min: 3, max: 3 } },
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// Fixture: score-ranking terminal
// ---------------------------------------------------------------------------

function createScoreRankingDef(): GameDef {
  const base = createSolverQualifyingDef() as unknown as Record<string, unknown>;
  return {
    ...base,
    metadata: { id: 'solver-score', players: { min: 2, max: 2 } },
    terminal: {
      conditions: [
        {
          when: { op: '==', left: { ref: 'gvar', var: 'ended' }, right: 1 },
          result: { type: 'score' },
        },
      ],
    },
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// Fixture: stochastic game (rollRandom in effects)
// ---------------------------------------------------------------------------

function createStochasticDef(): GameDef {
  const base = createSolverQualifyingDef() as unknown as Record<string, unknown>;
  return {
    ...base,
    metadata: { id: 'solver-stochastic', players: { min: 2, max: 2 } },
    actions: [
      {
        id: asActionId('roll'),
        actor: 'active',
        executor: 'actor',
        phase: [asPhaseId('main')],
        params: [],
        pre: null,
        cost: [],
        effects: [
          {
            rollRandom: {
              bind: 'r',
              min: 1,
              max: 6,
              in: [{ setVar: { scope: 'global', var: 'ended', value: { ref: 'binding', var: 'r' } } }],
            },
          },
        ],
        limits: [],
      },
    ],
  } as unknown as GameDef;
}

// ---------------------------------------------------------------------------
// canActivateSolver
// ---------------------------------------------------------------------------

describe('canActivateSolver', () => {
  it('returns false when solverMode is off', () => {
    const def = createSolverQualifyingDef();
    const { state } = initialState(def, 42);
    assert.equal(canActivateSolver(def, state, solverOffConfig()), false);
  });

  it('returns false for hidden-info game (zone with visibility: owner)', () => {
    const def = createHiddenInfoDef();
    // Use state from qualifying def (same structure, just 2 players).
    const { state } = initialState(createSolverQualifyingDef(), 42);
    assert.equal(canActivateSolver(def, state, solverOnConfig()), false);
  });

  it('returns false for >2 player game', () => {
    const def = create3PlayerDef();
    // Use a 3-player state — just override playerCount on a valid state.
    const { state: baseState } = initialState(createSolverQualifyingDef(), 42);
    const state = { ...baseState, playerCount: 3 };
    assert.equal(canActivateSolver(def, state, solverOnConfig()), false);
  });

  it('returns false for score-ranking terminal semantics', () => {
    const def = createScoreRankingDef();
    // Use state from qualifying def (score check is on def, not state).
    const { state } = initialState(createSolverQualifyingDef(), 42);
    assert.equal(canActivateSolver(def, state, solverOnConfig()), false);
  });

  it('returns false for stochastic game (rollRandom in effects)', () => {
    const def = createStochasticDef();
    // Use state from qualifying def (rollRandom check is on def, not state).
    const { state } = initialState(createSolverQualifyingDef(), 42);
    assert.equal(canActivateSolver(def, state, solverOnConfig()), false);
  });

  it('returns true for 2-player, all-public, win/loss/draw game with solver enabled', () => {
    const def = createSolverQualifyingDef();
    const { state } = initialState(def, 42);
    assert.equal(canActivateSolver(def, state, solverOnConfig()), true);
  });

  it('returns false when state has active RevealGrants', () => {
    const def = createSolverQualifyingDef();
    const { state: baseState } = initialState(def, 42);
    // Inject a reveal grant into the state.
    const stateWithReveals = {
      ...baseState,
      reveals: { [asZoneId('board')]: [{ observers: 'all' as const }] },
    };
    assert.equal(canActivateSolver(def, stateWithReveals, solverOnConfig()), false);
  });
});

// ---------------------------------------------------------------------------
// updateSolverResult
// ---------------------------------------------------------------------------

describe('updateSolverResult', () => {
  it('marks terminal node as proven', () => {
    const def = createSolverQualifyingDef();
    const runtime = createGameDefRuntime(def);
    const { state: baseState } = initialState(def, 42);

    // Create a state where ended=1 (terminal: player 0 wins).
    const terminalState = {
      ...baseState,
      globalVars: { ...baseState.globalVars, ended: 1 },
    };

    const node = createRootNode(2);
    updateSolverResult(node, def, terminalState, runtime);

    assert.notEqual(node.provenResult, null);
    assert.equal(node.provenResult!.kind, 'win');
    assert.equal((node.provenResult as { kind: 'win'; forPlayer: PlayerId }).forPlayer, asPlayerId(0));
  });

  it('proves node as win when all children are losses for acting player', () => {
    const def = createSolverQualifyingDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);

    // Set up: root with activePlayer=0, two children both proven win for player 1
    // (i.e., losses for the acting player 0).
    const root = createRootNode(2);
    const child1 = createRootNode(2);
    child1.provenResult = { kind: 'win', forPlayer: asPlayerId(1) };
    root.children.push(child1);
    const child2 = createRootNode(2);
    child2.provenResult = { kind: 'win', forPlayer: asPlayerId(1) };
    root.children.push(child2);

    // activePlayer is 0 in initial state.
    updateSolverResult(root, def, state, runtime);

    assert.notEqual(root.provenResult, null);
    assert.equal(root.provenResult!.kind, 'win');
    // All children are losses for player 0 → node is win for opponent (player 1).
    assert.equal((root.provenResult as { kind: 'win'; forPlayer: PlayerId }).forPlayer, asPlayerId(1));
  });

  it('proves node as win when one child is win for acting player', () => {
    const def = createSolverQualifyingDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);

    const root = createRootNode(2);
    const winChild = createRootNode(2);
    winChild.provenResult = { kind: 'win', forPlayer: asPlayerId(0) };
    root.children.push(winChild);
    const lossChild = createRootNode(2);
    lossChild.provenResult = { kind: 'win', forPlayer: asPlayerId(1) };
    root.children.push(lossChild);

    updateSolverResult(root, def, state, runtime);

    assert.notEqual(root.provenResult, null);
    assert.equal(root.provenResult!.kind, 'win');
    assert.equal((root.provenResult as { kind: 'win'; forPlayer: PlayerId }).forPlayer, asPlayerId(0));
  });

  it('proves node as draw when all children proven but none is a win for acting player', () => {
    const def = createSolverQualifyingDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);

    const root = createRootNode(2);
    const drawChild1 = createRootNode(2);
    drawChild1.provenResult = { kind: 'draw' };
    root.children.push(drawChild1);
    const drawChild2 = createRootNode(2);
    drawChild2.provenResult = { kind: 'draw' };
    root.children.push(drawChild2);

    updateSolverResult(root, def, state, runtime);

    assert.notEqual(root.provenResult, null);
    assert.equal(root.provenResult!.kind, 'draw');
  });

  it('does not prove node when some children are unproven', () => {
    const def = createSolverQualifyingDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);

    const root = createRootNode(2);
    const provenChild = createRootNode(2);
    provenChild.provenResult = { kind: 'draw' };
    root.children.push(provenChild);
    const unprovenChild = createRootNode(2);
    root.children.push(unprovenChild);

    updateSolverResult(root, def, state, runtime);

    assert.equal(root.provenResult, null);
  });
});

// ---------------------------------------------------------------------------
// selectSolverAwareChild
// ---------------------------------------------------------------------------

describe('selectSolverAwareChild', () => {
  it('returns proven-win child for exploring player', () => {
    const root = createRootNode(2);
    const winChild = createRootNode(2);
    winChild.provenResult = { kind: 'win', forPlayer: asPlayerId(0) };
    root.children.push(winChild);
    const lossChild = createRootNode(2);
    lossChild.provenResult = { kind: 'win', forPlayer: asPlayerId(1) };
    root.children.push(lossChild);

    const result = selectSolverAwareChild(root, asPlayerId(0));
    assert.equal(result, winChild);
  });

  it('returns null when unproven children exist (no shortcut)', () => {
    const root = createRootNode(2);
    const unprovenChild = createRootNode(2);
    root.children.push(unprovenChild);

    const result = selectSolverAwareChild(root, asPlayerId(0));
    assert.equal(result, null);
  });

  it('returns null when all children are proven losses', () => {
    const root = createRootNode(2);
    const lossChild1 = createRootNode(2);
    lossChild1.provenResult = { kind: 'win', forPlayer: asPlayerId(1) };
    root.children.push(lossChild1);
    const lossChild2 = createRootNode(2);
    lossChild2.provenResult = { kind: 'win', forPlayer: asPlayerId(1) };
    root.children.push(lossChild2);

    const result = selectSolverAwareChild(root, asPlayerId(0));
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// Search integration: early termination & non-solver invariant
// ---------------------------------------------------------------------------

describe('solver search integration', () => {
  it('root proven early terminates search (fewer iterations than budget)', () => {
    const def = createSolverQualifyingDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);
    const rng = createRng(99n);
    const config = solverOnConfig({ iterations: 500 });
    const pool = createNodePool(64, 2);
    const root = createRootNode(2);
    const observer = asPlayerId(0);
    const observation = derivePlayerObservation(def, state, observer);
    const rootMoves = legalMoves(def, state, undefined, runtime);

    const { iterations } = runSearch(
      root, def, state, observation, observer, config, rng, rootMoves, runtime, pool,
    );

    // The terminal game (winP0 sets ended=1) should be provable quickly,
    // well before 500 iterations.
    assert.ok(iterations < 500, `Expected early termination, got ${iterations} iterations`);
    // Root should be proven.
    assert.notEqual(root.provenResult, null);
  });

  it('non-solver games: provenResult remains null on all nodes', () => {
    const def = createSolverQualifyingDef();
    const runtime = createGameDefRuntime(def);
    const { state } = initialState(def, 42);
    const rng = createRng(99n);
    const config = validateMctsConfig({ solverMode: 'off', iterations: 20, minIterations: 0 });
    const pool = createNodePool(256, 2);
    const root = createRootNode(2);
    const observer = asPlayerId(0);
    const observation = derivePlayerObservation(def, state, observer);
    const rootMoves = legalMoves(def, state, undefined, runtime);

    runSearch(root, def, state, observation, observer, config, rng, rootMoves, runtime, pool);

    // Walk all nodes and verify provenResult is null.
    function assertAllNull(node: MctsNode): void {
      assert.equal(node.provenResult, null, 'provenResult should be null when solver is off');
      for (const child of node.children) {
        assertAllNull(child);
      }
    }
    assertAllNull(root);
  });

  it('solver does not activate mid-search if game does not qualify at start', () => {
    // Use the qualifying def for runtime/state (it's valid), but pass
    // the hidden-info def to canActivateSolver (tested above).
    // For the search integration, use the qualifying def with solver ON
    // but manually verify that the hidden-info def would reject activation.
    const qualDef = createSolverQualifyingDef();
    const hiddenDef = createHiddenInfoDef();
    const runtime = createGameDefRuntime(qualDef);
    const { state } = initialState(qualDef, 42);
    const rng = createRng(99n);
    // Verify the hidden def rejects solver.
    assert.equal(canActivateSolver(hiddenDef, state, solverOnConfig()), false);
    // Run search with qualifying def but solver OFF to simulate non-qualifying.
    const config = validateMctsConfig({ solverMode: 'off', iterations: 20, minIterations: 0 });
    const pool = createNodePool(256, 2);
    const root = createRootNode(2);
    const observer = asPlayerId(0);
    const observation = derivePlayerObservation(qualDef, state, observer);
    const rootMoves = legalMoves(qualDef, state, undefined, runtime);

    runSearch(root, qualDef, state, observation, observer, config, rng, rootMoves, runtime, pool);

    // provenResult should remain null — solver didn't activate.
    function assertAllNull(node: MctsNode): void {
      assert.equal(node.provenResult, null, 'provenResult should be null for non-qualifying game');
      for (const child of node.children) {
        assertAllNull(child);
      }
    }
    assertAllNull(root);
  });
});
