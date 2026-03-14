import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createMastStats,
  updateMastStats,
  mastSelectMove,
} from '../../../../src/agents/mcts/mast.js';
import { createRng } from '../../../../src/kernel/prng.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidates(keys: readonly string[]) {
  return keys.map((moveKey) => ({ moveKey }));
}

// ---------------------------------------------------------------------------
// createMastStats
// ---------------------------------------------------------------------------

describe('createMastStats', () => {
  it('initializes empty entries and totalUpdates = 0', () => {
    const stats = createMastStats();
    assert.equal(stats.entries.size, 0);
    assert.equal(stats.totalUpdates, 0);
  });
});

// ---------------------------------------------------------------------------
// updateMastStats
// ---------------------------------------------------------------------------

describe('updateMastStats', () => {
  it('correctly accumulates per-player rewards across multiple move keys', () => {
    const stats = createMastStats();

    // First update: two move keys with rewards [1, 0]
    updateMastStats(stats, ['a', 'b'], [1, 0]);
    assert.equal(stats.totalUpdates, 1);
    assert.equal(stats.entries.size, 2);

    const entryA1 = stats.entries.get('a')!;
    assert.equal(entryA1.visits, 1);
    assert.deepEqual(entryA1.rewardSums, [1, 0]);

    const entryB1 = stats.entries.get('b')!;
    assert.equal(entryB1.visits, 1);
    assert.deepEqual(entryB1.rewardSums, [1, 0]);

    // Second update: same keys with rewards [0.5, 0.5]
    updateMastStats(stats, ['a', 'b'], [0.5, 0.5]);
    assert.equal(stats.totalUpdates, 2);

    const entryA2 = stats.entries.get('a')!;
    assert.equal(entryA2.visits, 2);
    assert.deepEqual(entryA2.rewardSums, [1.5, 0.5]);

    const entryB2 = stats.entries.get('b')!;
    assert.equal(entryB2.visits, 2);
    assert.deepEqual(entryB2.rewardSums, [1.5, 0.5]);
  });

  it('handles new keys mixed with existing keys', () => {
    const stats = createMastStats();
    updateMastStats(stats, ['x'], [1, 0]);
    updateMastStats(stats, ['x', 'y'], [0, 1]);

    assert.equal(stats.entries.size, 2);
    const x = stats.entries.get('x')!;
    assert.equal(x.visits, 2);
    assert.deepEqual(x.rewardSums, [1, 1]);

    const y = stats.entries.get('y')!;
    assert.equal(y.visits, 1);
    assert.deepEqual(y.rewardSums, [0, 1]);
  });
});

// ---------------------------------------------------------------------------
// mastSelectMove — warm-up fallback
// ---------------------------------------------------------------------------

describe('mastSelectMove', () => {
  it('falls back to random selection when totalUpdates < warmUpThreshold', () => {
    const stats = createMastStats();
    // Add some data but keep totalUpdates below threshold.
    updateMastStats(stats, ['a'], [1, 0]);
    assert.equal(stats.totalUpdates, 1);

    const candidates = makeCandidates(['a', 'b', 'c']);
    // With warmUpThreshold = 10, totalUpdates (1) < threshold → random.
    // Run multiple times and verify we get different indices (probabilistic
    // but with 3 candidates and varied seeds, virtually certain).
    const seen = new Set<string>();
    for (let seed = 0n; seed < 20n; seed += 1n) {
      const rng = createRng(seed);
      const { candidate } = mastSelectMove(stats, candidates, 0, 0.0, 10, rng);
      seen.add(candidate.moveKey);
    }
    // Should see more than one candidate selected (random distribution).
    assert.ok(seen.size > 1, `Expected multiple candidates selected during warm-up, got ${seen.size}`);
  });

  it('selects highest-mean-reward candidate for current player after warm-up', () => {
    const stats = createMastStats();
    // Build up stats: 'a' has mean reward 0.8 for player 0, 'b' has 0.3.
    for (let i = 0; i < 40; i += 1) {
      updateMastStats(stats, ['a'], [0.8, 0.2]);
      updateMastStats(stats, ['b'], [0.3, 0.7]);
    }
    assert.equal(stats.totalUpdates, 80);

    const candidates = makeCandidates(['a', 'b']);
    // epsilon = 0 → always greedy. Player 0 should always pick 'a'.
    const rng = createRng(42n);
    const { candidate } = mastSelectMove(stats, candidates, 0, 0.0, 32, rng);
    assert.equal(candidate.moveKey, 'a');

    // Player 1 should always pick 'b' (higher mean for player 1).
    const rng2 = createRng(42n);
    const { candidate: candidate2 } = mastSelectMove(stats, candidates, 1, 0.0, 32, rng2);
    assert.equal(candidate2.moveKey, 'b');
  });

  it('falls back to random for unseen move keys', () => {
    const stats = createMastStats();
    // Warm up stats on keys that differ from candidates.
    for (let i = 0; i < 40; i += 1) {
      updateMastStats(stats, ['known'], [1, 0]);
    }
    assert.ok(stats.totalUpdates >= 32);

    // Candidates are all unseen keys → random fallback.
    const candidates = makeCandidates(['unknown1', 'unknown2', 'unknown3']);
    const seen = new Set<string>();
    for (let seed = 0n; seed < 20n; seed += 1n) {
      const rng = createRng(seed);
      const { candidate } = mastSelectMove(stats, candidates, 0, 0.0, 32, rng);
      seen.add(candidate.moveKey);
    }
    assert.ok(seen.size > 1, `Expected random selection among unseen keys, got ${seen.size}`);
  });

  it('MAST selection does not depend on kernel modules', () => {
    // This test verifies the structural property: the mast.ts module
    // imports only from prng.ts (for RNG) and types.ts (for Rng type).
    // No applyMove, evaluateState, legalMoves, etc.
    // We verify by checking that mastSelectMove works with plain objects
    // that have only a moveKey field — no Move or GameState needed.
    const stats = createMastStats();
    for (let i = 0; i < 40; i += 1) {
      updateMastStats(stats, ['x'], [1, 0]);
    }

    const candidates = [{ moveKey: 'x' }, { moveKey: 'y' }];
    const rng = createRng(42n);
    // This call succeeds without any kernel objects — pure stats + RNG.
    const { candidate } = mastSelectMove(stats, candidates, 0, 0.0, 32, rng);
    assert.ok(candidate.moveKey === 'x' || candidate.moveKey === 'y');
  });

  it('MAST updates are deterministic (same sequence = same entries)', () => {
    const stats1 = createMastStats();
    const stats2 = createMastStats();

    const updates: Array<{ keys: string[]; rewards: number[] }> = [
      { keys: ['a', 'b'], rewards: [1, 0] },
      { keys: ['b', 'c'], rewards: [0.5, 0.5] },
      { keys: ['a'], rewards: [0, 1] },
    ];

    for (const u of updates) {
      updateMastStats(stats1, u.keys, u.rewards);
      updateMastStats(stats2, u.keys, u.rewards);
    }

    assert.equal(stats1.totalUpdates, stats2.totalUpdates);
    assert.equal(stats1.entries.size, stats2.entries.size);

    for (const [key, entry1] of stats1.entries) {
      const entry2 = stats2.entries.get(key)!;
      assert.equal(entry1.visits, entry2.visits);
      assert.deepEqual(entry1.rewardSums, entry2.rewardSums);
    }
  });

  it('returns the sole candidate without consuming RNG when length === 1', () => {
    const stats = createMastStats();
    const candidates = makeCandidates(['only']);
    const rng = createRng(42n);
    const { candidate, rng: rngAfter } = mastSelectMove(stats, candidates, 0, 0.0, 32, rng);
    assert.equal(candidate.moveKey, 'only');
    // RNG should be unchanged (no nextInt call).
    assert.deepEqual(rngAfter, rng);
  });
});
