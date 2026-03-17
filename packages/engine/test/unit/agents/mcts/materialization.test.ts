import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  filterAvailableCandidates,
} from '../../../../src/agents/mcts/materialization.js';
import type { ConcreteMoveCandidate } from '../../../../src/agents/mcts/expansion.js';
import type { MctsNode } from '../../../../src/agents/mcts/node.js';
import { createRootNode, createChildNode } from '../../../../src/agents/mcts/node.js';
import { canonicalMoveKey } from '../../../../src/agents/mcts/move-key.js';
import {
  asActionId,
} from '../../../../src/kernel/index.js';
import type { Move } from '../../../../src/kernel/types-core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMove(actionId: string, params: Record<string, number> = {}): Move {
  return { actionId: asActionId(actionId), params };
}

function stubNode(childMoveKeys: string[]): MctsNode {
  const root = createRootNode(2);
  for (const key of childMoveKeys) {
    const move = makeMove('stub');
    createChildNode(root, move, key, 2);
  }
  return root;
}

// ---------------------------------------------------------------------------
// filterAvailableCandidates
// ---------------------------------------------------------------------------

describe('filterAvailableCandidates', () => {
  it('excludes candidates already in node children by moveKey', () => {
    const moveA = makeMove('a');
    const moveB = makeMove('b');
    const keyA = canonicalMoveKey(moveA);
    const keyB = canonicalMoveKey(moveB);

    const node = stubNode([keyA]);

    const candidates: readonly ConcreteMoveCandidate[] = [
      { move: moveA, moveKey: keyA },
      { move: moveB, moveKey: keyB },
    ];

    const filtered = filterAvailableCandidates(node, candidates);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.moveKey, keyB);
  });

  it('returns all candidates when node has no children', () => {
    const node = createRootNode(2);
    const candidates: readonly ConcreteMoveCandidate[] = [
      { move: makeMove('a'), moveKey: 'keyA' },
      { move: makeMove('b'), moveKey: 'keyB' },
    ];

    const filtered = filterAvailableCandidates(node, candidates);
    assert.equal(filtered.length, 2);
  });

  it('returns empty array when all candidates are already children', () => {
    const node = stubNode(['keyA', 'keyB']);
    const candidates: readonly ConcreteMoveCandidate[] = [
      { move: makeMove('a'), moveKey: 'keyA' },
      { move: makeMove('b'), moveKey: 'keyB' },
    ];

    const filtered = filterAvailableCandidates(node, candidates);
    assert.equal(filtered.length, 0);
  });

  it('does not mutate the input candidates array', () => {
    const node = stubNode(['keyA']);
    const candidates: readonly ConcreteMoveCandidate[] = Object.freeze([
      { move: makeMove('a'), moveKey: 'keyA' },
      { move: makeMove('b'), moveKey: 'keyB' },
    ]);

    // Should not throw
    filterAvailableCandidates(node, candidates);
  });
});
