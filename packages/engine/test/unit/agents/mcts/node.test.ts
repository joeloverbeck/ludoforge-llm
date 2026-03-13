import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRootNode, createChildNode } from '../../../../src/agents/mcts/node.js';
import type { Move } from '../../../../src/kernel/types-core.js';
import type { MoveKey } from '../../../../src/agents/mcts/move-key.js';
import { asActionId } from '../../../../src/kernel/branded.js';

const aid = asActionId;

describe('createRootNode', () => {
  it('returns node with move: null', () => {
    const root = createRootNode(4);
    assert.equal(root.move, null);
  });

  it('returns node with moveKey: null', () => {
    const root = createRootNode(4);
    assert.equal(root.moveKey, null);
  });

  it('returns node with parent: null', () => {
    const root = createRootNode(4);
    assert.equal(root.parent, null);
  });

  it('returns node with visits: 0', () => {
    const root = createRootNode(4);
    assert.equal(root.visits, 0);
  });

  it('returns node with availability: 0', () => {
    const root = createRootNode(4);
    assert.equal(root.availability, 0);
  });

  it('returns totalReward array of length playerCount filled with 0', () => {
    const root = createRootNode(3);
    assert.deepEqual(root.totalReward, [0, 0, 0]);
  });

  it('returns heuristicPrior: null', () => {
    const root = createRootNode(2);
    assert.equal(root.heuristicPrior, null);
  });

  it('returns empty children array', () => {
    const root = createRootNode(2);
    assert.deepEqual(root.children, []);
  });

  it('returns provenResult: null', () => {
    const root = createRootNode(2);
    assert.equal(root.provenResult, null);
  });

  it('handles single-player games', () => {
    const root = createRootNode(1);
    assert.deepEqual(root.totalReward, [0]);
  });
});

describe('createChildNode', () => {
  const move: Move = { actionId: aid('attack'), params: { target: 'zone1' } };
  const moveKey: MoveKey = 'attack{target:zone1}';

  it('links parent correctly', () => {
    const root = createRootNode(2);
    const child = createChildNode(root, move, moveKey, 2);
    assert.equal(child.parent, root);
  });

  it('adds child to parent children array', () => {
    const root = createRootNode(2);
    const child = createChildNode(root, move, moveKey, 2);
    assert.equal(root.children.length, 1);
    assert.equal(root.children[0], child);
  });

  it('stores move and moveKey', () => {
    const root = createRootNode(2);
    const child = createChildNode(root, move, moveKey, 2);
    assert.equal(child.move, move);
    assert.equal(child.moveKey, moveKey);
  });

  it('initializes fresh stats (visits: 0, availability: 0)', () => {
    const root = createRootNode(2);
    const child = createChildNode(root, move, moveKey, 2);
    assert.equal(child.visits, 0);
    assert.equal(child.availability, 0);
  });

  it('initializes totalReward to zeros with correct length', () => {
    const root = createRootNode(4);
    const child = createChildNode(root, move, moveKey, 4);
    assert.deepEqual(child.totalReward, [0, 0, 0, 0]);
  });

  it('initializes heuristicPrior to null', () => {
    const root = createRootNode(2);
    const child = createChildNode(root, move, moveKey, 2);
    assert.equal(child.heuristicPrior, null);
  });

  it('initializes empty children', () => {
    const root = createRootNode(2);
    const child = createChildNode(root, move, moveKey, 2);
    assert.deepEqual(child.children, []);
  });

  it('supports multiple children on same parent', () => {
    const root = createRootNode(2);
    const move2: Move = { actionId: aid('defend'), params: {} };
    const child1 = createChildNode(root, move, moveKey, 2);
    const child2 = createChildNode(root, move2, 'defend{}', 2);
    assert.equal(root.children.length, 2);
    assert.equal(root.children[0], child1);
    assert.equal(root.children[1], child2);
  });
});
