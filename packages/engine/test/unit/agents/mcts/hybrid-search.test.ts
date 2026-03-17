/**
 * Tests for the leaf evaluator strategies (heuristic, rollout full, rollout hybrid)
 * in MCTS search.
 *
 * Migrated from the old rolloutMode tests (63MCTSPERROLLFRESEA-002)
 * to the new LeafEvaluator discriminated union (64MCTSPEROPT-001).
 */

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runSearch, selectRootDecision } from '../../../../src/agents/mcts/search.js';
import { createRootNode } from '../../../../src/agents/mcts/node.js';
import { createNodePool } from '../../../../src/agents/mcts/node-pool.js';
import { validateMctsConfig, MCTS_PRESETS, MCTS_PRESET_NAMES } from '../../../../src/agents/mcts/config.js';
import type { LeafEvaluator } from '../../../../src/agents/mcts/config.js';
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

function runSearchWithEvaluator(
  def: GameDef,
  leafEvaluator: LeafEvaluator,
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
    leafEvaluator,
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

describe('rollout hybrid leaf evaluator', () => {
  const hybridEvaluator: LeafEvaluator = {
    type: 'rollout',
    maxSimulationDepth: 48,
    policy: 'mast',
    epsilon: 0.15,
    candidateSample: 6,
    mastWarmUpThreshold: 32,
    templateCompletionsPerVisit: 2,
    mode: 'hybrid',
    hybridCutoffDepth: 4,
  };

  it('hybrid rollout completes search and produces a valid root decision', () => {
    const def = createHeuristicDef();
    const { root, result, observer } = runSearchWithEvaluator(def, hybridEvaluator, 42n);

    assert.equal(result.iterations, 20);
    assert.ok(root.children.length >= 1);
    assert.doesNotThrow(() => selectRootDecision(root, observer));
  });

  it('hybrid rollout handles terminal-triggering games correctly', () => {
    const def = createTerminalDef();
    const { root, result, observer } = runSearchWithEvaluator(def, hybridEvaluator, 42n);

    assert.equal(result.iterations, 20);
    assert.ok(root.children.length >= 1);
    assert.doesNotThrow(() => selectRootDecision(root, observer));
  });

  it('diagnostics tracks hybridRolloutPlies > 0', () => {
    const def = createHeuristicDef();
    const { result } = runSearchWithEvaluator(def, hybridEvaluator, 42n);

    assert.ok(result.diagnostics !== undefined, 'diagnostics should be present');
    assert.ok(
      (result.diagnostics!.hybridRolloutPlies ?? 0) > 0,
      'hybridRolloutPlies should be positive for hybrid rollout',
    );
    assert.equal(result.diagnostics!.leafEvaluatorType, 'rollout');
  });
});

describe('rollout full leaf evaluator', () => {
  const fullEvaluator: LeafEvaluator = {
    type: 'rollout',
    maxSimulationDepth: 48,
    policy: 'mast',
    epsilon: 0.15,
    candidateSample: 6,
    mastWarmUpThreshold: 32,
    templateCompletionsPerVisit: 2,
    mode: 'full',
  };

  it('full rollout completes search and produces a valid root decision', () => {
    const def = createHeuristicDef();
    const { root, result, observer } = runSearchWithEvaluator(def, fullEvaluator, 42n);

    assert.equal(result.iterations, 20);
    assert.ok(root.children.length >= 1);
    assert.doesNotThrow(() => selectRootDecision(root, observer));
  });

  it('diagnostics reports leafEvaluatorType: rollout', () => {
    const def = createHeuristicDef();
    const { result } = runSearchWithEvaluator(def, fullEvaluator, 42n);

    assert.ok(result.diagnostics !== undefined);
    assert.equal(result.diagnostics!.leafEvaluatorType, 'rollout');
  });
});

describe('heuristic leaf evaluator (direct)', () => {
  const heuristicEvaluator: LeafEvaluator = { type: 'heuristic' };

  it('heuristic mode completes search with zero simulation plies', () => {
    const def = createHeuristicDef();
    const { root, result, observer } = runSearchWithEvaluator(def, heuristicEvaluator, 42n);

    assert.equal(result.iterations, 20);
    assert.ok(root.children.length >= 1);
    assert.doesNotThrow(() => selectRootDecision(root, observer));
  });

  it('diagnostics reports leafEvaluatorType: heuristic with zero hybridRolloutPlies', () => {
    const def = createHeuristicDef();
    const { result } = runSearchWithEvaluator(def, heuristicEvaluator, 42n);

    assert.ok(result.diagnostics !== undefined);
    assert.equal(result.diagnostics!.leafEvaluatorType, 'heuristic');
    assert.equal(result.diagnostics!.hybridRolloutPlies ?? 0, 0);
  });
});

describe('cross-evaluator determinism', () => {
  const evaluators: readonly { readonly name: string; readonly evaluator: LeafEvaluator }[] = [
    { name: 'full rollout', evaluator: { type: 'rollout', maxSimulationDepth: 48, policy: 'mast', epsilon: 0.15, candidateSample: 6, mastWarmUpThreshold: 32, templateCompletionsPerVisit: 2, mode: 'full' } },
    { name: 'hybrid rollout', evaluator: { type: 'rollout', maxSimulationDepth: 48, policy: 'mast', epsilon: 0.15, candidateSample: 6, mastWarmUpThreshold: 32, templateCompletionsPerVisit: 2, mode: 'hybrid', hybridCutoffDepth: 4 } },
    { name: 'heuristic', evaluator: { type: 'heuristic' } },
  ];

  for (const { name, evaluator } of evaluators) {
    it(`${name} is deterministic: same seed produces same root decision`, () => {
      const def = createHeuristicDef();

      const run1 = runSearchWithEvaluator(def, evaluator, 123n);
      const run2 = runSearchWithEvaluator(def, evaluator, 123n);

      const decision1 = selectRootDecision(run1.root, run1.observer);
      const decision2 = selectRootDecision(run2.root, run2.observer);

      assert.equal(decision1.moveKey, decision2.moveKey);
      assert.equal(decision1.visits, decision2.visits);
      assert.equal(run1.result.iterations, run2.result.iterations);
    });
  }
});

describe('all presets use heuristic evaluator', () => {
  it('all named presets resolve to heuristic evaluator', () => {
    for (const preset of MCTS_PRESET_NAMES) {
      const config = validateMctsConfig(MCTS_PRESETS[preset]);
      const evaluatorType = (config.leafEvaluator ?? { type: 'heuristic' }).type;
      assert.equal(
        evaluatorType,
        'heuristic',
        `preset "${preset}" should use heuristic evaluator, got "${evaluatorType}"`,
      );
    }
  });
});
