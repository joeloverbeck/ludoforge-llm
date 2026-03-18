/**
 * Unit tests for pending-family coverage diagnostics and decision tree depth
 * by family tracking in collectDiagnostics.
 *
 * Tests:
 * - decisionTreeDepthByFamily computed from tree walk
 * - decisionTreeDepthByFamily omitted when no decision nodes present
 * - decisionTreeDepthByFamily picks max depth per family
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectDiagnostics,
  createAccumulator,
} from '../../../../src/agents/mcts/diagnostics.js';
import {
  createRootNode,
  createChildNode,
  createDecisionChildNode,
} from '../../../../src/agents/mcts/node.js';
import { asActionId, asPlayerId } from '../../../../src/kernel/branded.js';
import type { Move } from '../../../../src/kernel/types-core.js';
import type { MoveKey } from '../../../../src/agents/mcts/move-key.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAYER = asPlayerId(0);

function makeMove(actionId: string): Move {
  return { actionId: asActionId(actionId), params: {} };
}

function makeMoveKey(actionId: string, suffix = '{}'): MoveKey {
  return `${actionId}${suffix}` as MoveKey;
}

// ---------------------------------------------------------------------------
// decisionTreeDepthByFamily
// ---------------------------------------------------------------------------

describe('collectDiagnostics — decisionTreeDepthByFamily', () => {
  it('omits field when tree has no decision nodes', () => {
    const root = createRootNode(2);
    createChildNode(root, makeMove('attack'), makeMoveKey('attack'), 2);
    createChildNode(root, makeMove('defend'), makeMoveKey('defend'), 2);

    const acc = createAccumulator();
    const diag = collectDiagnostics(root, 10, undefined, acc);
    assert.equal(diag.decisionTreeDepthByFamily, undefined);
  });

  it('tracks depth 1 for a single decision child', () => {
    const root = createRootNode(2);
    // State child for 'attack' family with a decision subtree.
    const stateChild = createChildNode(root, makeMove('attack'), makeMoveKey('attack'), 2);
    createDecisionChildNode(
      stateChild,
      makeMove('attack'),
      makeMoveKey('attack', '{$target:zone1}'),
      PLAYER,
      '$target',
      2,
      'chooseOne',
    );

    const acc = createAccumulator();
    const diag = collectDiagnostics(root, 10, undefined, acc);
    assert.deepEqual(diag.decisionTreeDepthByFamily, { attack: 1 });
  });

  it('tracks max decision depth across multiple families', () => {
    const root = createRootNode(2);

    // 'rally' family with decision depth 2 (two chained decisions)
    const rallyChild = createChildNode(root, makeMove('rally'), makeMoveKey('rally'), 2);
    const rallyDec1 = createDecisionChildNode(
      rallyChild,
      makeMove('rally'),
      makeMoveKey('rally', '{$spaces:z1}'),
      PLAYER,
      '$spaces',
      2,
      'chooseN',
    );
    createDecisionChildNode(
      rallyDec1,
      makeMove('rally'),
      makeMoveKey('rally', '{$spaces:z1,$base:yes}'),
      PLAYER,
      '$base',
      2,
      'chooseOne',
    );

    // 'attack' family with decision depth 1
    const attackChild = createChildNode(root, makeMove('attack'), makeMoveKey('attack'), 2);
    createDecisionChildNode(
      attackChild,
      makeMove('attack'),
      makeMoveKey('attack', '{$target:z2}'),
      PLAYER,
      '$target',
      2,
      'chooseN',
    );

    // 'pass' family with no decision nodes
    createChildNode(root, makeMove('pass'), makeMoveKey('pass'), 2);

    const acc = createAccumulator();
    const diag = collectDiagnostics(root, 10, undefined, acc);
    assert.deepEqual(diag.decisionTreeDepthByFamily, {
      rally: 2,
      attack: 1,
    });
    // 'pass' should not appear since it has no decision nodes.
  });

  it('picks max depth when same family has multiple root children', () => {
    const root = createRootNode(2);

    // First 'rally' variant — decision depth 1
    const rally1 = createChildNode(root, makeMove('rally'), makeMoveKey('rally', '{v1}'), 2);
    createDecisionChildNode(
      rally1,
      makeMove('rally'),
      makeMoveKey('rally', '{v1,$spaces:z1}'),
      PLAYER,
      '$spaces',
      2,
      'chooseN',
    );

    // Second 'rally' variant — decision depth 3
    const rally2 = createChildNode(root, makeMove('rally'), makeMoveKey('rally', '{v2}'), 2);
    const dec1 = createDecisionChildNode(
      rally2,
      makeMove('rally'),
      makeMoveKey('rally', '{v2,$a:1}'),
      PLAYER,
      '$a',
      2,
      'chooseN',
    );
    const dec2 = createDecisionChildNode(
      dec1,
      makeMove('rally'),
      makeMoveKey('rally', '{v2,$a:1,$b:2}'),
      PLAYER,
      '$b',
      2,
      'chooseN',
    );
    createDecisionChildNode(
      dec2,
      makeMove('rally'),
      makeMoveKey('rally', '{v2,$a:1,$b:2,$c:3}'),
      PLAYER,
      '$c',
      2,
      'chooseOne',
    );

    const acc = createAccumulator();
    const diag = collectDiagnostics(root, 10, undefined, acc);
    assert.deepEqual(diag.decisionTreeDepthByFamily, { rally: 3 });
  });
});

// ---------------------------------------------------------------------------
// pendingFamiliesWithVisits / pendingFamiliesStarved wiring
// ---------------------------------------------------------------------------

describe('collectDiagnostics — pending family accumulator passthrough', () => {
  it('passes pendingFamiliesWithVisits and pendingFamiliesStarved from accumulator', () => {
    const root = createRootNode(2);
    const acc = createAccumulator();
    // Simulate post-search wiring (normally done in search.ts)
    acc.pendingFamiliesTotal = 4;
    acc.pendingFamiliesWithVisits = 3;
    acc.pendingFamiliesStarved = 1;
    acc.pendingFamilyQuotaUsed = 2;

    const diag = collectDiagnostics(root, 10, undefined, acc);
    assert.equal(diag.pendingFamiliesTotal, 4);
    assert.equal(diag.pendingFamiliesWithVisits, 3);
    assert.equal(diag.pendingFamiliesStarved, 1);
    assert.equal(diag.pendingFamilyQuotaUsed, 2);
  });

  it('defaults to zero when no pending families exist', () => {
    const root = createRootNode(2);
    const acc = createAccumulator();

    const diag = collectDiagnostics(root, 10, undefined, acc);
    assert.equal(diag.pendingFamiliesWithVisits, 0);
    assert.equal(diag.pendingFamiliesStarved, 0);
    assert.equal(diag.pendingFamiliesTotal, 0);
  });

  it('pendingFamiliesWithVisits + pendingFamiliesStarved = pendingFamiliesTotal', () => {
    const root = createRootNode(2);
    const acc = createAccumulator();
    acc.pendingFamiliesTotal = 5;
    acc.pendingFamiliesWithVisits = 2;
    acc.pendingFamiliesStarved = 3;

    const diag = collectDiagnostics(root, 10, undefined, acc);
    assert.equal(
      (diag.pendingFamiliesWithVisits ?? 0) + (diag.pendingFamiliesStarved ?? 0),
      diag.pendingFamiliesTotal,
    );
  });
});
