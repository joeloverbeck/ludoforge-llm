import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  splitSearchBudget,
  forkWorkerRngs,
  extractRootChildInfos,
  mergeRootResults,
  selectBestMergedChild,
} from '../../../../src/agents/mcts/parallel.js';
import type { WorkerRootChildInfo } from '../../../../src/agents/mcts/parallel.js';
import { createRootNode, createChildNode } from '../../../../src/agents/mcts/node.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { asActionId, asPlayerId } from '../../../../src/kernel/branded.js';
import type { Move } from '../../../../src/kernel/types-core.js';
import type { MoveKey } from '../../../../src/agents/mcts/move-key.js';

// ---------------------------------------------------------------------------
// splitSearchBudget
// ---------------------------------------------------------------------------

describe('splitSearchBudget', () => {
  it('splits 100 iterations across 4 workers evenly', () => {
    const budgets = splitSearchBudget(100, 4);
    assert.deepEqual(budgets, [25, 25, 25, 25]);
  });

  it('distributes remainder from the front', () => {
    const budgets = splitSearchBudget(10, 3);
    // 10 / 3 = 3 remainder 1 → [4, 3, 3]
    assert.deepEqual(budgets, [4, 3, 3]);
  });

  it('distributes remainder 2 across front workers', () => {
    const budgets = splitSearchBudget(11, 3);
    // 11 / 3 = 3 remainder 2 → [4, 4, 3]
    assert.deepEqual(budgets, [4, 4, 3]);
  });

  it('single worker gets full budget', () => {
    const budgets = splitSearchBudget(50, 1);
    assert.deepEqual(budgets, [50]);
  });

  it('sum equals total iterations', () => {
    for (const [total, workers] of [[100, 7], [1, 3], [17, 5], [1000, 13]] as const) {
      const budgets = splitSearchBudget(total, workers);
      const sum = budgets.reduce((a, b) => a + b, 0);
      assert.equal(sum, total, `sum for ${total}/${workers} should equal ${total}`);
    }
  });

  it('throws on non-positive totalIterations', () => {
    assert.throws(() => splitSearchBudget(0, 4), /positive safe integer/);
    assert.throws(() => splitSearchBudget(-1, 4), /positive safe integer/);
  });

  it('throws on non-positive workerCount', () => {
    assert.throws(() => splitSearchBudget(100, 0), /positive safe integer/);
    assert.throws(() => splitSearchBudget(100, -1), /positive safe integer/);
  });
});

// ---------------------------------------------------------------------------
// forkWorkerRngs
// ---------------------------------------------------------------------------

describe('forkWorkerRngs', () => {
  it('produces the requested number of RNGs', () => {
    const rngs = forkWorkerRngs(createRng(42n), 4);
    assert.equal(rngs.length, 4);
  });

  it('produces deterministic RNGs for the same seed', () => {
    const rngs1 = forkWorkerRngs(createRng(42n), 4);
    const rngs2 = forkWorkerRngs(createRng(42n), 4);

    for (let i = 0; i < 4; i += 1) {
      // Compare the internal state by generating a value from each.
      assert.deepEqual(rngs1[i], rngs2[i], `worker ${i} RNG should be identical`);
    }
  });

  it('produces distinct RNGs for each worker', () => {
    const rngs = forkWorkerRngs(createRng(42n), 4);
    // Compare by deep equality — each pair should differ.
    for (let i = 0; i < rngs.length; i += 1) {
      for (let j = i + 1; j < rngs.length; j += 1) {
        assert.notDeepEqual(rngs[i], rngs[j], `worker ${i} and ${j} RNGs should differ`);
      }
    }
  });

  it('throws on non-positive workerCount', () => {
    assert.throws(() => forkWorkerRngs(createRng(42n), 0), /positive safe integer/);
  });
});

// ---------------------------------------------------------------------------
// extractRootChildInfos
// ---------------------------------------------------------------------------

describe('extractRootChildInfos', () => {
  it('extracts child info from a root node', () => {
    const root = createRootNode(2);
    const move: Move = { actionId: asActionId('a'), params: {} };
    // createChildNode auto-pushes to parent.children.
    const child = createChildNode(root, move, 'a|{}' as MoveKey, 2);
    child.visits = 10;
    child.availability = 15;
    child.totalReward[0] = 5.0;
    child.totalReward[1] = 3.0;

    const infos = extractRootChildInfos(root);
    assert.equal(infos.length, 1);
    assert.equal(infos[0]!.moveKey, 'a|{}');
    assert.equal(infos[0]!.visits, 10);
    assert.equal(infos[0]!.availability, 15);
    assert.deepEqual(infos[0]!.totalReward, [5.0, 3.0]);
  });

  it('skips children with null moveKey', () => {
    const root = createRootNode(2);
    // createChildNode auto-pushes to parent.children.
    createChildNode(root, { actionId: asActionId('a'), params: {} }, null as unknown as MoveKey, 2);

    const infos = extractRootChildInfos(root);
    assert.equal(infos.length, 0);
  });
});

// ---------------------------------------------------------------------------
// mergeRootResults
// ---------------------------------------------------------------------------

describe('mergeRootResults', () => {
  it('merges visits and rewards by moveKey', () => {
    const worker1: WorkerRootChildInfo[] = [
      { moveKey: 'a' as MoveKey, visits: 10, availability: 12, totalReward: [5, 3] },
      { moveKey: 'b' as MoveKey, visits: 5, availability: 8, totalReward: [2, 1] },
    ];
    const worker2: WorkerRootChildInfo[] = [
      { moveKey: 'a' as MoveKey, visits: 8, availability: 10, totalReward: [4, 2] },
      { moveKey: 'c' as MoveKey, visits: 3, availability: 5, totalReward: [1, 1] },
    ];

    const merged = mergeRootResults([worker1, worker2], 2);

    assert.equal(merged.totalVisits, 26); // 10+5+8+3
    assert.equal(merged.children.length, 3); // a, b, c

    // Sorted by moveKey.
    assert.equal(merged.children[0]!.moveKey, 'a');
    assert.equal(merged.children[0]!.visits, 18); // 10+8
    assert.equal(merged.children[0]!.availability, 22); // 12+10
    assert.deepEqual(merged.children[0]!.totalReward, [9, 5]); // 5+4, 3+2

    assert.equal(merged.children[1]!.moveKey, 'b');
    assert.equal(merged.children[1]!.visits, 5);

    assert.equal(merged.children[2]!.moveKey, 'c');
    assert.equal(merged.children[2]!.visits, 3);
  });

  it('produces stable output sorted by moveKey', () => {
    const worker1: WorkerRootChildInfo[] = [
      { moveKey: 'z' as MoveKey, visits: 1, availability: 1, totalReward: [1] },
      { moveKey: 'a' as MoveKey, visits: 1, availability: 1, totalReward: [1] },
    ];

    const merged = mergeRootResults([worker1], 1);
    assert.equal(merged.children[0]!.moveKey, 'a');
    assert.equal(merged.children[1]!.moveKey, 'z');
  });

  it('handles empty worker results', () => {
    const merged = mergeRootResults([], 2);
    assert.equal(merged.totalVisits, 0);
    assert.equal(merged.children.length, 0);
  });
});

// ---------------------------------------------------------------------------
// selectBestMergedChild
// ---------------------------------------------------------------------------

describe('selectBestMergedChild', () => {
  it('selects child with highest visits', () => {
    const merged = {
      totalVisits: 20,
      children: [
        { moveKey: 'a' as MoveKey, visits: 5, availability: 5, totalReward: [3, 2] },
        { moveKey: 'b' as MoveKey, visits: 15, availability: 15, totalReward: [7, 8] },
      ],
    };

    const best = selectBestMergedChild(merged, asPlayerId(0));
    assert.equal(best.moveKey, 'b');
  });

  it('tie-breaks by mean reward for the exploring player', () => {
    const merged = {
      totalVisits: 20,
      children: [
        { moveKey: 'a' as MoveKey, visits: 10, availability: 10, totalReward: [8, 2] },
        { moveKey: 'b' as MoveKey, visits: 10, availability: 10, totalReward: [5, 5] },
      ],
    };

    // Player 0: a has mean 0.8, b has mean 0.5 → a wins.
    const best0 = selectBestMergedChild(merged, asPlayerId(0));
    assert.equal(best0.moveKey, 'a');

    // Player 1: a has mean 0.2, b has mean 0.5 → b wins.
    const best1 = selectBestMergedChild(merged, asPlayerId(1));
    assert.equal(best1.moveKey, 'b');
  });

  it('throws on empty children', () => {
    assert.throws(
      () => selectBestMergedChild({ totalVisits: 0, children: [] }, asPlayerId(0)),
      /no children/,
    );
  });
});

// ---------------------------------------------------------------------------
// Determinism: forkWorkerRngs + splitSearchBudget are deterministic
// ---------------------------------------------------------------------------

describe('parallel determinism', () => {
  it('same seed + same workerCount produces identical budget + RNG splits', () => {
    for (const workerCount of [1, 2, 4, 7]) {
      const seed = 12345n;
      const budgets1 = splitSearchBudget(100, workerCount);
      const budgets2 = splitSearchBudget(100, workerCount);
      assert.deepEqual(budgets1, budgets2, `budgets should be identical for ${workerCount} workers`);

      const rngs1 = forkWorkerRngs(createRng(seed), workerCount);
      const rngs2 = forkWorkerRngs(createRng(seed), workerCount);
      assert.deepEqual(rngs1, rngs2, `RNGs should be identical for ${workerCount} workers`);
    }
  });

  it('mergeRootResults is deterministic regardless of input order', () => {
    const w1: WorkerRootChildInfo[] = [
      { moveKey: 'b' as MoveKey, visits: 5, availability: 5, totalReward: [2, 1] },
      { moveKey: 'a' as MoveKey, visits: 10, availability: 10, totalReward: [5, 3] },
    ];
    const w2: WorkerRootChildInfo[] = [
      { moveKey: 'a' as MoveKey, visits: 8, availability: 8, totalReward: [4, 2] },
      { moveKey: 'b' as MoveKey, visits: 3, availability: 3, totalReward: [1, 1] },
    ];

    // Order of workers should not matter for the merged output.
    const merged1 = mergeRootResults([w1, w2], 2);
    const merged2 = mergeRootResults([w2, w1], 2);

    assert.deepEqual(merged1, merged2, 'merge should be commutative');
  });
});

// ---------------------------------------------------------------------------
// Config validation for parallelWorkers
// ---------------------------------------------------------------------------

describe('parallelWorkers config validation', () => {
  // Import validateMctsConfig for config-level testing.
  // We test that the field is accepted and validated.
  it('parallelWorkers is accepted when valid', async () => {
    const { validateMctsConfig } = await import('../../../../src/agents/mcts/config.js');
    const config = validateMctsConfig({ parallelWorkers: 4 });
    assert.equal(config.parallelWorkers, 4);
  });

  it('parallelWorkers defaults to undefined', async () => {
    const { validateMctsConfig } = await import('../../../../src/agents/mcts/config.js');
    const config = validateMctsConfig({});
    assert.equal(config.parallelWorkers, undefined);
  });

  it('parallelWorkers rejects 0', async () => {
    const { validateMctsConfig } = await import('../../../../src/agents/mcts/config.js');
    assert.throws(() => validateMctsConfig({ parallelWorkers: 0 }), /positive safe integer/);
  });

  it('parallelWorkers rejects negative', async () => {
    const { validateMctsConfig } = await import('../../../../src/agents/mcts/config.js');
    assert.throws(() => validateMctsConfig({ parallelWorkers: -1 }), /positive safe integer/);
  });
});
