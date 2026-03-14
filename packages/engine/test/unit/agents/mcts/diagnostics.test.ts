import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectDiagnostics } from '../../../../src/agents/mcts/diagnostics.js';
import { createRootNode, createChildNode } from '../../../../src/agents/mcts/node.js';
import { asActionId } from '../../../../src/kernel/branded.js';
import type { Move } from '../../../../src/kernel/types-core.js';
import type { MoveKey } from '../../../../src/agents/mcts/move-key.js';

// ---------------------------------------------------------------------------
// collectDiagnostics
// ---------------------------------------------------------------------------

describe('collectDiagnostics', () => {
  it('returns correct iteration count', () => {
    const root = createRootNode(2);
    const diag = collectDiagnostics(root, 42);
    assert.equal(diag.iterations, 42);
  });

  it('counts root-only tree as 1 node with depth 0', () => {
    const root = createRootNode(2);
    const diag = collectDiagnostics(root, 5);
    assert.equal(diag.nodesAllocated, 1);
    assert.equal(diag.maxTreeDepth, 0);
  });

  it('counts nodes and depth correctly for a multi-level tree', () => {
    const root = createRootNode(2);
    const move: Move = { actionId: asActionId('a'), params: {} };
    const child1 = createChildNode(root, move, 'a{}' as MoveKey, 2);
    const child2 = createChildNode(root, move, 'b{}' as MoveKey, 2);
    createChildNode(child1, move, 'c{}' as MoveKey, 2); // grandchild

    void child2; // Used to add second child to root

    const diag = collectDiagnostics(root, 10);

    // root + child1 + child2 + grandchild = 4
    assert.equal(diag.nodesAllocated, 4);
    // root(0) -> child1(1) -> grandchild(2) => maxDepth = 2
    assert.equal(diag.maxTreeDepth, 2);
  });

  it('returns rootChildVisits keyed by moveKey', () => {
    const root = createRootNode(2);
    const move1: Move = { actionId: asActionId('attack'), params: {} };
    const move2: Move = { actionId: asActionId('defend'), params: {} };
    const child1 = createChildNode(root, move1, 'attack{}' as MoveKey, 2);
    const child2 = createChildNode(root, move2, 'defend{}' as MoveKey, 2);

    child1.visits = 7;
    child2.visits = 3;

    const diag = collectDiagnostics(root, 10);
    assert.deepEqual(diag.rootChildVisits, {
      'attack{}': 7,
      'defend{}': 3,
    });
  });

  it('omits totalTimeMs when startTime is not provided', () => {
    const root = createRootNode(2);
    const diag = collectDiagnostics(root, 5);
    assert.equal('totalTimeMs' in diag, false);
  });

  it('includes totalTimeMs when startTime is provided', () => {
    const root = createRootNode(2);
    const startTime = performance.now() - 100; // ~100ms ago
    const diag = collectDiagnostics(root, 5, startTime);
    assert.equal(typeof diag.totalTimeMs, 'number');
    // performance.now() returns sub-ms floats; allow some timing slack.
    assert.ok(diag.totalTimeMs! >= 90, 'totalTimeMs should be >= 90ms (allowing timing slack)');
  });
});
