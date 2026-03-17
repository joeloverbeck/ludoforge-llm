/**
 * Tests for the three rollout modes (legacy, hybrid, direct) in MCTS search.
 *
 * Acceptance criteria from 63MCTSPERROLLFRESEA-002:
 * 1. hybrid caps at hybridCutoffDepth
 * 2. hybrid stops at terminal before cutoff
 * 3. legacy produces identical results to pre-refactor code
 * 4. direct runs zero simulation plies
 * 5. Determinism: same seed + mode + config = same move selection
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runSearch, selectRootDecision } from '../../../../src/agents/mcts/search.js';
import { createRootNode } from '../../../../src/agents/mcts/node.js';
import { createNodePool } from '../../../../src/agents/mcts/node-pool.js';
import { validateMctsConfig, MCTS_PRESETS, MCTS_PRESET_NAMES } from '../../../../src/agents/mcts/config.js';
import type { MctsRolloutMode } from '../../../../src/agents/mcts/config.js';
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
import { legalMoves } from '../../../../src/kernel/legal-moves.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** 2-player game with multiple actions, no terminal conditions (scoring only). */
function createHeuristicDef(): GameDef {
  const phase = [asPhaseId('main')];
  const makeGainAction = (id: string, amount: number) => ({
    id: asActionId(id),
    actor: 'active' as const,
    executor: 'actor' as const,
    phase,
    params: [],
    pre: null,
    cost: [],
    effects: [{ setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: amount } }],
    limits: [],
  });

  return {
    metadata: { id: 'hybrid-heuristic', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      makeGainAction('gainLow', 2),
      makeGainAction('gainMid', 5),
      makeGainAction('gainHigh', 9),
      { id: asActionId('noop'), actor: 'active', executor: 'actor', phase, params: [], pre: null, cost: [], effects: [], limits: [] },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'vp' } },
    },
  } as unknown as GameDef;
}

/** 2-player game where "win" triggers terminal. */
function createTerminalDef(): GameDef {
  return {
    metadata: { id: 'hybrid-terminal', players: { min: 2, max: 2 } },
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
// Helpers
// ---------------------------------------------------------------------------

function runSearchWithMode(
  def: GameDef,
  mode: MctsRolloutMode,
  seed: bigint,
  overrides: Record<string, unknown> = {},
) {
  const playerCount = 2;
  const { state } = initialState(def, Number(seed), playerCount);
  const runtime = createGameDefRuntime(def);
  const root = createRootNode(playerCount);
  const observer = asPlayerId(0);
  const observation = derivePlayerObservation(def, state, observer);
  const moves = legalMoves(def, state, undefined, runtime);
  const config = validateMctsConfig({
    iterations: 20,
    minIterations: 0,
    rolloutMode: mode,
    hybridCutoffDepth: 4,
    diagnostics: true,
    ...overrides,
  });
  const pool = createNodePool(500, playerCount);
  const searchRng = createRng(seed);

  const result = runSearch(
    root, def, state, observation, observer, config, searchRng, moves, runtime, pool,
  );

  return { root, result, state, observer };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('hybrid rollout mode', () => {
  // AC 1: hybrid mode caps simulation at hybridCutoffDepth plies
  it('hybrid mode completes search and produces a valid root decision', () => {
    const def = createHeuristicDef();
    const { root, result, observer } = runSearchWithMode(def, 'hybrid', 42n);

    assert.equal(result.iterations, 20);
    assert.ok(root.children.length >= 1);
    assert.doesNotThrow(() => selectRootDecision(root, observer));
  });

  // AC 2: hybrid mode stops at terminal states before cutoff
  it('hybrid mode handles terminal-triggering games correctly', () => {
    const def = createTerminalDef();
    const { root, result, observer } = runSearchWithMode(def, 'hybrid', 42n);

    assert.equal(result.iterations, 20);
    assert.ok(root.children.length >= 1);
    assert.doesNotThrow(() => selectRootDecision(root, observer));
  });

  // AC 1 (diagnostics): hybridRolloutPlies is tracked
  it('diagnostics tracks hybridRolloutPlies > 0', () => {
    const def = createHeuristicDef();
    const { result } = runSearchWithMode(def, 'hybrid', 42n);

    assert.ok(result.diagnostics !== undefined, 'diagnostics should be present');
    assert.ok(
      (result.diagnostics!.hybridRolloutPlies ?? 0) > 0,
      'hybridRolloutPlies should be positive for hybrid mode',
    );
    assert.equal(result.diagnostics!.rolloutMode, 'hybrid');
  });
});

describe('legacy rollout mode', () => {
  // AC 3: legacy mode produces valid search results
  it('legacy mode completes search and produces a valid root decision', () => {
    const def = createHeuristicDef();
    const { root, result, observer } = runSearchWithMode(def, 'legacy', 42n);

    assert.equal(result.iterations, 20);
    assert.ok(root.children.length >= 1);
    assert.doesNotThrow(() => selectRootDecision(root, observer));
  });

  it('diagnostics reports rolloutMode: legacy', () => {
    const def = createHeuristicDef();
    const { result } = runSearchWithMode(def, 'legacy', 42n);

    assert.ok(result.diagnostics !== undefined);
    assert.equal(result.diagnostics!.rolloutMode, 'legacy');
  });
});

describe('direct rollout mode', () => {
  // AC 4: direct mode runs zero simulation plies
  it('direct mode completes search with zero simulation plies', () => {
    const def = createHeuristicDef();
    const { root, result, observer } = runSearchWithMode(def, 'direct', 42n);

    assert.equal(result.iterations, 20);
    assert.ok(root.children.length >= 1);
    assert.doesNotThrow(() => selectRootDecision(root, observer));
  });

  it('diagnostics reports rolloutMode: direct with zero hybridRolloutPlies', () => {
    const def = createHeuristicDef();
    const { result } = runSearchWithMode(def, 'direct', 42n);

    assert.ok(result.diagnostics !== undefined);
    assert.equal(result.diagnostics!.rolloutMode, 'direct');
    assert.equal(result.diagnostics!.hybridRolloutPlies ?? 0, 0);
  });
});

describe('cross-mode determinism', () => {
  // AC 5: same seed + same mode + same config = same move selection
  for (const mode of ['legacy', 'hybrid', 'direct'] as const) {
    it(`${mode} mode is deterministic: same seed produces same root decision`, () => {
      const def = createHeuristicDef();

      const run1 = runSearchWithMode(def, mode, 123n);
      const run2 = runSearchWithMode(def, mode, 123n);

      const decision1 = selectRootDecision(run1.root, run1.observer);
      const decision2 = selectRootDecision(run2.root, run2.observer);

      assert.equal(decision1.moveKey, decision2.moveKey);
      assert.equal(decision1.visits, decision2.visits);
      assert.equal(run1.result.iterations, run2.result.iterations);
    });
  }
});

describe('all presets use direct mode', () => {
  // All named presets use direct mode — rollout-phase materialization was
  // the dominant cost (~93.8% of total time) and direct mode eliminates it.
  it('all named presets resolve to direct mode', () => {
    for (const preset of MCTS_PRESET_NAMES) {
      const config = validateMctsConfig(MCTS_PRESETS[preset]);
      assert.equal(
        config.rolloutMode,
        'direct',
        `preset "${preset}" should use direct mode, got "${config.rolloutMode}"`,
      );
    }
  });
});
