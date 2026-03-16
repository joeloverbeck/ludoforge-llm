import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createNodePool } from '../../../../src/agents/mcts/node-pool.js';

describe('createNodePool', () => {
  it('reports correct capacity', () => {
    const pool = createNodePool(10, 2);
    assert.equal(pool.capacity, 10);
  });

  it('throws on non-positive capacity', () => {
    assert.throws(() => createNodePool(0, 2), RangeError);
    assert.throws(() => createNodePool(-1, 2), RangeError);
  });

  it('throws on non-positive playerCount', () => {
    assert.throws(() => createNodePool(10, 0), RangeError);
    assert.throws(() => createNodePool(10, -1), RangeError);
  });
});

describe('NodePool.allocate', () => {
  it('returns distinct nodes up to capacity', () => {
    const pool = createNodePool(5, 2);
    const nodes = new Set<object>();
    for (let i = 0; i < 5; i++) {
      nodes.add(pool.allocate());
    }
    assert.equal(nodes.size, 5, 'all 5 nodes should be distinct objects');
  });

  it('returns nodes with zeroed stats', () => {
    const pool = createNodePool(3, 3);
    const node = pool.allocate();
    assert.equal(node.visits, 0);
    assert.equal(node.availability, 0);
    assert.deepEqual(node.totalReward, [0, 0, 0]);
    assert.equal(node.heuristicPrior, null);
    assert.deepEqual(node.children, []);
    assert.equal(node.provenResult, null);
  });

  it('returns nodes with state-node decision defaults', () => {
    const pool = createNodePool(3, 2);
    const node = pool.allocate();
    assert.equal(node.nodeKind, 'state');
    assert.equal(node.decisionPlayer, null);
    assert.equal(node.partialMove, null);
    assert.equal(node.decisionBinding, null);
  });

  it('throws RangeError when capacity exceeded', () => {
    const pool = createNodePool(3, 2);
    pool.allocate();
    pool.allocate();
    pool.allocate();
    assert.throws(() => pool.allocate(), RangeError);
  });
});

describe('NodePool.reset', () => {
  it('allows re-allocation from start after reset', () => {
    const pool = createNodePool(3, 2);
    const first = pool.allocate();
    pool.allocate();
    pool.allocate();

    // Exhaust pool, then reset
    pool.reset();

    // Should be able to allocate again
    const afterReset = pool.allocate();
    assert.equal(afterReset, first, 'should reuse the same pre-allocated node');
  });

  it('resets stats on previously allocated nodes', () => {
    const pool = createNodePool(2, 2);
    const node = pool.allocate();

    // Mutate stats as search would
    node.visits = 100;
    node.availability = 50;
    node.totalReward[0] = 42;
    node.totalReward[1] = 58;
    node.heuristicPrior = [0.5, 0.5];
    node.provenResult = { kind: 'draw' };
    node.children.push(pool.allocate());

    pool.reset();

    const reused = pool.allocate();
    assert.equal(reused, node, 'should be the same object');
    assert.equal(reused.visits, 0);
    assert.equal(reused.availability, 0);
    assert.deepEqual(reused.totalReward, [0, 0]);
    assert.equal(reused.heuristicPrior, null);
    assert.deepEqual(reused.children, []);
    assert.equal(reused.provenResult, null);
  });

  it('resets decision fields back to state-node defaults', () => {
    const pool = createNodePool(2, 2);
    const node = pool.allocate();

    // Simulate decision-node mutation
    node.nodeKind = 'decision';
    node.decisionPlayer = 0 as never;
    node.partialMove = { actionId: 'x' as never, params: {} };
    node.decisionBinding = 'someBinding';

    pool.reset();

    const reused = pool.allocate();
    assert.equal(reused, node);
    assert.equal(reused.nodeKind, 'state');
    assert.equal(reused.decisionPlayer, null);
    assert.equal(reused.partialMove, null);
    assert.equal(reused.decisionBinding, null);
  });

  it('can be called multiple times', () => {
    const pool = createNodePool(2, 2);
    pool.allocate();
    pool.reset();
    pool.allocate();
    pool.reset();
    pool.allocate();
    // Should not throw
    assert.ok(true);
  });
});
