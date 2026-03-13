import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  terminalToRewards,
  sigmoid,
  evaluateForAllPlayers,
} from '../../../../src/agents/mcts/evaluate.js';

import type { TerminalResult, GameDef, GameState } from '../../../../src/kernel/types.js';
import type { PlayerId } from '../../../../src/kernel/branded.js';

// ---------------------------------------------------------------------------
// terminalToRewards
// ---------------------------------------------------------------------------

describe('terminalToRewards', () => {
  it('win for player 0 in a 3-player game yields [1, 0, 0]', () => {
    const result: TerminalResult = { type: 'win', player: 0 as PlayerId };
    assert.deepEqual(terminalToRewards(result, 3), [1, 0, 0]);
  });

  it('win for player 2 in a 4-player game yields [0, 0, 1, 0]', () => {
    const result: TerminalResult = { type: 'win', player: 2 as PlayerId };
    assert.deepEqual(terminalToRewards(result, 4), [0, 0, 1, 0]);
  });

  it('draw gives all players 0.5', () => {
    const result: TerminalResult = { type: 'draw' };
    assert.deepEqual(terminalToRewards(result, 3), [0.5, 0.5, 0.5]);
  });

  it('lossAll gives all players 0.0', () => {
    const result: TerminalResult = { type: 'lossAll' };
    assert.deepEqual(terminalToRewards(result, 2), [0, 0]);
  });

  it('score ranking normalizes to [0,1] with tie preservation', () => {
    const result: TerminalResult = {
      type: 'score',
      ranking: [
        { player: 0 as PlayerId, score: 100 },
        { player: 1 as PlayerId, score: 50 },
        { player: 2 as PlayerId, score: 50 },
      ],
    };
    const rewards = terminalToRewards(result, 3);
    assert.equal(rewards.length, 3);
    // Player 0 has highest score → reward 1.0
    assert.equal(rewards[0], 1);
    // Players 1 and 2 have tied scores → same reward
    assert.equal(rewards[1], rewards[2]);
    // All values in [0, 1]
    for (const r of rewards) {
      assert.ok(r >= 0 && r <= 1, `reward ${r} not in [0,1]`);
    }
  });

  it('score ranking with single player returns [1]', () => {
    const result: TerminalResult = {
      type: 'score',
      ranking: [{ player: 0 as PlayerId, score: 42 }],
    };
    assert.deepEqual(terminalToRewards(result, 1), [1]);
  });

  it('score ranking with all equal scores gives all 1.0', () => {
    const result: TerminalResult = {
      type: 'score',
      ranking: [
        { player: 0 as PlayerId, score: 50 },
        { player: 1 as PlayerId, score: 50 },
      ],
    };
    const rewards = terminalToRewards(result, 2);
    assert.deepEqual(rewards, [1, 1]);
  });

  it('output length always equals playerCount', () => {
    const result: TerminalResult = { type: 'draw' };
    for (const n of [1, 2, 4, 6]) {
      assert.equal(terminalToRewards(result, n).length, n);
    }
  });

  it('all reward values are in [0, 1]', () => {
    const results: readonly TerminalResult[] = [
      { type: 'win', player: 0 as PlayerId },
      { type: 'draw' },
      { type: 'lossAll' },
      {
        type: 'score',
        ranking: [
          { player: 0 as PlayerId, score: 100 },
          { player: 1 as PlayerId, score: 0 },
        ],
      },
    ];
    for (const result of results) {
      const rewards = terminalToRewards(result, 2);
      for (const r of rewards) {
        assert.ok(r >= 0 && r <= 1, `reward ${r} out of [0,1] for ${result.type}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// sigmoid
// ---------------------------------------------------------------------------

describe('sigmoid', () => {
  it('sigmoid(0) returns 0.5', () => {
    assert.equal(sigmoid(0), 0.5);
  });

  it('is monotonically increasing', () => {
    const xs = [-10, -5, -1, 0, 1, 5, 10];
    for (let i = 1; i < xs.length; i++) {
      assert.ok(
        sigmoid(xs[i]!) > sigmoid(xs[i - 1]!),
        `sigmoid(${xs[i]}) should be > sigmoid(${xs[i - 1]})`,
      );
    }
  });

  it('output is in (0, 1) for moderate inputs', () => {
    // Note: at ±710 IEEE 754 double overflows exp(), so we test moderate range.
    for (const x of [-500, -10, -1, 0, 1, 10, 500]) {
      const y = sigmoid(x);
      assert.ok(y >= 0, `sigmoid(${x}) should be >= 0`);
      assert.ok(y <= 1, `sigmoid(${x}) should be <= 1`);
    }
  });

  it('approaches 0 for large negative inputs', () => {
    assert.ok(sigmoid(-20) < 0.01);
  });

  it('approaches 1 for large positive inputs', () => {
    assert.ok(sigmoid(20) > 0.99);
  });
});

// ---------------------------------------------------------------------------
// evaluateForAllPlayers
// ---------------------------------------------------------------------------

describe('evaluateForAllPlayers', () => {
  // Minimal stub GameDef and GameState for testing the transform.
  // evaluateState needs: def.terminal, def.perPlayerVars, def.zones,
  // state.perPlayerVars, state.activePlayer, state.playerCount.

  const minimalDef = {
    terminal: { conditions: [], scoring: undefined },
    perPlayerVars: [
      { name: 'score', type: 'int', min: 0, max: 100, initial: 0 },
    ],
    zones: [],
    globalVars: [],
    tokenTypes: [],
    players: { min: 2, max: 2 },
    actions: [],
    turnStructure: { type: 'roundRobin' },
    id: 'test',
    name: 'Test Game',
  } as unknown as GameDef;

  const makeState = (scores: readonly number[]): GameState =>
    ({
      playerCount: scores.length,
      activePlayer: 0 as PlayerId,
      perPlayerVars: Object.fromEntries(
        scores.map((s, i) => [i, { score: s }]),
      ),
      globalVars: {},
      zones: {},
      turnOrder: scores.map((_, i) => i),
      turnIndex: 0,
      phase: 'play',
    }) as unknown as GameState;

  it('returns values in (0, 1) for non-terminal states', () => {
    const state = makeState([30, 70]);
    const rewards = evaluateForAllPlayers(minimalDef, state, 10_000);
    assert.equal(rewards.length, 2);
    for (const r of rewards) {
      assert.ok(r > 0 && r < 1, `reward ${r} not in (0,1)`);
    }
  });

  it('if all raw scores equal, all outputs are 0.5', () => {
    const state = makeState([50, 50]);
    const rewards = evaluateForAllPlayers(minimalDef, state, 10_000);
    for (const r of rewards) {
      assert.ok(
        Math.abs(r - 0.5) < 1e-10,
        `expected 0.5, got ${r}`,
      );
    }
  });

  it('higher raw score produces higher output value', () => {
    const state = makeState([30, 70]);
    const rewards = evaluateForAllPlayers(minimalDef, state, 10_000);
    // Player 1 has higher per-player var score → higher raw eval → higher output
    assert.ok(
      rewards[1]! > rewards[0]!,
      `expected rewards[1] (${rewards[1]}) > rewards[0] (${rewards[0]})`,
    );
  });

  it('larger temperature pushes values closer to 0.5', () => {
    const state = makeState([20, 80]);
    const rewardsLowT = evaluateForAllPlayers(minimalDef, state, 1);
    const rewardsHighT = evaluateForAllPlayers(minimalDef, state, 100_000);

    // With high temperature, spread should be smaller (closer to 0.5)
    const spreadLowT = Math.abs(rewardsLowT[1]! - rewardsLowT[0]!);
    const spreadHighT = Math.abs(rewardsHighT[1]! - rewardsHighT[0]!);
    assert.ok(
      spreadHighT < spreadLowT,
      `high-T spread (${spreadHighT}) should be < low-T spread (${spreadLowT})`,
    );
  });

  it('never returns values outside [0, 1] for finite inputs', () => {
    // With extreme temperature ratios, IEEE 754 sigmoid saturates to 0.0 or 1.0.
    // The invariant is that values stay within [0, 1] (closed interval).
    const state = makeState([0, 100]);
    for (const temp of [0.001, 1, 100, 10_000, 1_000_000]) {
      const rewards = evaluateForAllPlayers(minimalDef, state, temp);
      for (const r of rewards) {
        assert.ok(r >= 0 && r <= 1, `reward ${r} out of [0,1] at temp=${temp}`);
      }
    }
  });

  it('returns strict (0, 1) when temperature is large enough to avoid saturation', () => {
    // evaluateState raw scores scale with OWN_VAR_WEIGHT (10_000), so temperature
    // must be comparable to avoid sigmoid saturation to 0.0 / 1.0.
    const state = makeState([40, 60]);
    for (const temp of [10_000, 100_000]) {
      const rewards = evaluateForAllPlayers(minimalDef, state, temp);
      for (const r of rewards) {
        assert.ok(r > 0 && r < 1, `reward ${r} out of (0,1) at temp=${temp}`);
      }
    }
  });
});
