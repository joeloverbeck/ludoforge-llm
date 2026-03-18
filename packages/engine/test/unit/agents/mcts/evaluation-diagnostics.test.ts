import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createAccumulator,
  collectDiagnostics,
  recordHeuristicEvalSpread,
} from '../../../../src/agents/mcts/diagnostics.js';
import { evaluateForAllPlayers } from '../../../../src/agents/mcts/evaluate.js';
import type { EvalDiagnosticsOut } from '../../../../src/agents/mcts/evaluate.js';
import { createRootNode } from '../../../../src/agents/mcts/node.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * 2-player game with per-player vp variable.
 * Players start at vp=0; tests mutate the state to create asymmetry.
 */
function createAsymmetricScoreDef(): GameDef {
  return {
    metadata: { id: 'eval-diag-test', players: { min: 2, max: 2 } },
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

/** Create state with asymmetric player scores: p0=8, p1=2. */
function createAsymmetricState(def: GameDef) {
  const playerCount = 2;
  const { state } = initialState(def, 42, playerCount);
  // Immutably set player vars to create score asymmetry.
  const newPerPlayerVars: Record<number, Record<string, number>> = {};
  for (let i = 0; i < playerCount; i++) {
    newPerPlayerVars[i] = { ...state.perPlayerVars[i], vp: i === 0 ? 8 : 2 };
  }
  return { state: { ...state, perPlayerVars: newPerPlayerVars }, playerCount };
}

// ---------------------------------------------------------------------------
// recordHeuristicEvalSpread unit tests
// ---------------------------------------------------------------------------

describe('recordHeuristicEvalSpread', () => {
  it('tracks min/max of raw scores across multiple calls', () => {
    const acc = createAccumulator();

    recordHeuristicEvalSpread(acc, [10, 20], [0.4, 0.6]);
    assert.equal(acc.rawHeuristicScoreMin, 10);
    assert.equal(acc.rawHeuristicScoreMax, 20);
    assert.equal(acc.postSigmoidRewardMin, 0.4);
    assert.equal(acc.postSigmoidRewardMax, 0.6);
    assert.equal(acc.heuristicEvalSamples, 1);

    recordHeuristicEvalSpread(acc, [5, 15], [0.3, 0.55]);
    assert.equal(acc.rawHeuristicScoreMin, 5);
    assert.equal(acc.rawHeuristicScoreMax, 20);
    assert.equal(acc.postSigmoidRewardMin, 0.3);
    assert.equal(acc.postSigmoidRewardMax, 0.6);
    assert.equal(acc.heuristicEvalSamples, 2);
  });

  it('handles single-player (degenerate) case', () => {
    const acc = createAccumulator();
    recordHeuristicEvalSpread(acc, [42], [0.5]);
    assert.equal(acc.rawHeuristicScoreMin, 42);
    assert.equal(acc.rawHeuristicScoreMax, 42);
    assert.equal(acc.heuristicEvalSamples, 1);
  });
});

// ---------------------------------------------------------------------------
// evaluateForAllPlayers diagnosticsOut
// ---------------------------------------------------------------------------

describe('evaluateForAllPlayers diagnosticsOut', () => {
  const def = createAsymmetricScoreDef();
  const { state } = createAsymmetricState(def);
  const runtime = createGameDefRuntime(def);

  it('populates rawScores when diagnosticsOut is provided', () => {
    const diagOut: EvalDiagnosticsOut = {};
    const rewards = evaluateForAllPlayers(def, state, 10_000, runtime, diagOut);

    assert.ok(diagOut.rawScores !== undefined, 'rawScores should be populated');
    assert.equal(diagOut.rawScores!.length, 2);
    assert.equal(rewards.length, 2);
    // Raw scores should differ for asymmetric vp
    assert.notEqual(diagOut.rawScores![0], diagOut.rawScores![1]);
  });

  it('does not populate rawScores when diagnosticsOut is omitted', () => {
    // Just verifying backward compat — no crash, same return
    const rewards = evaluateForAllPlayers(def, state, 10_000, runtime);
    assert.equal(rewards.length, 2);
  });

  it('post-sigmoid rewards are not all crushed to ~0.5 with lower temperature', () => {
    const diagOut: EvalDiagnosticsOut = {};
    const rewards = evaluateForAllPlayers(def, state, 2_000, runtime, diagOut);

    // With asymmetric scores and lower temperature, rewards should spread out
    const spread = Math.abs(rewards[0]! - rewards[1]!);
    assert.ok(
      spread > 0.01,
      `Expected meaningful reward spread, got ${spread}`,
    );
  });

  it('high temperature crushes rewards toward 0.5', () => {
    const rewards = evaluateForAllPlayers(def, state, 100_000, runtime);
    // Very high temp → all rewards near 0.5
    for (const r of rewards) {
      assert.ok(
        Math.abs(r - 0.5) < 0.05,
        `Expected reward near 0.5 with high temp, got ${r}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// collectDiagnostics includes spread fields
// ---------------------------------------------------------------------------

describe('collectDiagnostics raw score spread', () => {
  it('includes spread fields when heuristicEvalSamples > 0', () => {
    const root = createRootNode(2);
    const acc = createAccumulator();

    // Simulate some eval data
    recordHeuristicEvalSpread(acc, [10, 20, 15], [0.45, 0.55, 0.50]);
    recordHeuristicEvalSpread(acc, [5, 25, 12], [0.40, 0.60, 0.48]);

    const diag = collectDiagnostics(root, 10, undefined, acc);
    assert.equal(diag.rawHeuristicScoreMin, 5);
    assert.equal(diag.rawHeuristicScoreMax, 25);
    assert.equal(diag.rawHeuristicScoreSpread, 20);
    assert.equal(diag.postSigmoidRewardMin, 0.40);
    assert.equal(diag.postSigmoidRewardMax, 0.60);
    assert.ok(
      Math.abs(diag.postSigmoidRewardSpread! - 0.20) < 1e-10,
      `Expected 0.20 spread, got ${diag.postSigmoidRewardSpread}`,
    );
  });

  it('omits spread fields when no eval samples recorded', () => {
    const root = createRootNode(2);
    const acc = createAccumulator();

    const diag = collectDiagnostics(root, 0, undefined, acc);
    assert.equal(diag.rawHeuristicScoreMin, undefined);
    assert.equal(diag.rawHeuristicScoreMax, undefined);
    assert.equal(diag.rawHeuristicScoreSpread, undefined);
    assert.equal(diag.postSigmoidRewardMin, undefined);
    assert.equal(diag.postSigmoidRewardMax, undefined);
    assert.equal(diag.postSigmoidRewardSpread, undefined);
  });
});

// ---------------------------------------------------------------------------
// Integration: accumulator + evaluateForAllPlayers + collectDiagnostics
// ---------------------------------------------------------------------------

describe('evaluateForAllPlayers with accumulator integration', () => {
  it('diagnostics include rawHeuristicScoreSpread from real eval calls', () => {
    const def = createAsymmetricScoreDef();
    const { state, playerCount } = createAsymmetricState(def);
    const runtime = createGameDefRuntime(def);
    const acc = createAccumulator();

    // Simulate what the search loop does
    const diagOut: EvalDiagnosticsOut = {};
    const rewards = evaluateForAllPlayers(def, state, 2_000, runtime, diagOut);

    assert.ok(diagOut.rawScores !== undefined);
    recordHeuristicEvalSpread(acc, diagOut.rawScores!, rewards);

    const root = createRootNode(playerCount);
    const diag = collectDiagnostics(root, 1, undefined, acc);

    assert.ok(diag.rawHeuristicScoreSpread !== undefined);
    assert.ok(diag.rawHeuristicScoreSpread! >= 0);
    assert.ok(diag.postSigmoidRewardSpread !== undefined);
    assert.ok(diag.postSigmoidRewardSpread! >= 0);
    // With asymmetric vp (8 vs 2), reward spread should be meaningful
    assert.ok(
      diag.postSigmoidRewardSpread! > 0.001,
      `Expected non-trivial reward spread, got ${diag.postSigmoidRewardSpread}`,
    );
  });
});
