/**
 * Unit tests for stripIncompleteChooseNBindings.
 *
 * Validates that intermediate chooseN accumulated arrays are correctly
 * stripped from partial moves at the decision boundary, while finalized
 * (chooseOne and confirmed chooseN) bindings are preserved.
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stripIncompleteChooseNBindings } from '../../../../src/agents/mcts/decision-boundary.js';
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

function makeMove(actionId: string, params: Record<string, unknown> = {}): Move {
  return { actionId: asActionId(actionId), params } as Move;
}

function makeMoveKey(suffix: string): MoveKey {
  return suffix as MoveKey;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stripIncompleteChooseNBindings', () => {
  it('returns move unchanged when leaf is a state node', () => {
    const root = createRootNode(2);
    const move = makeMove('attack', { $target: 'zone1', $spaces: ['z1', 'z2'] });

    const result = stripIncompleteChooseNBindings(move, root);

    assert.deepEqual(result.params, move.params);
  });

  it('returns move unchanged when leaf is a chooseOne decision node', () => {
    const root = createRootNode(2);
    const stateChild = createChildNode(root, makeMove('rally'), makeMoveKey('rally{}'), 2);
    const decisionNode = createDecisionChildNode(
      stateChild, makeMove('rally'), makeMoveKey('rally{$base:yes}'),
      PLAYER, '$base', 2, 'chooseOne',
    );

    const move = makeMove('rally', { $targetSpaces: ['z1'], $base: 'yes' });
    const result = stripIncompleteChooseNBindings(move, decisionNode);

    // chooseOne bindings should NOT be stripped.
    assert.deepEqual(result.params, move.params);
  });

  it('strips in-progress chooseN binding from params', () => {
    const root = createRootNode(2);
    const stateChild = createChildNode(root, makeMove('attack'), makeMoveKey('attack{}'), 2);
    // chooseN decision chain: $nvaLaosPieces with 1 item accumulated
    const decisionNode = createDecisionChildNode(
      stateChild, makeMove('attack'), makeMoveKey('attack{$nvaLaosPieces:[p1]}'),
      PLAYER, '$nvaLaosPieces', 2, 'chooseN',
    );

    const move = makeMove('attack', {
      $targetSpaces: ['z1'],       // finalized (from confirmed chooseN)
      $nvaLaosPieces: ['piece1'],  // intermediate — only 1 of 4 required
    });

    const result = stripIncompleteChooseNBindings(move, decisionNode);

    assert.deepEqual(result.params, { $targetSpaces: ['z1'] });
    assert.equal('$nvaLaosPieces' in result.params, false);
  });

  it('strips binding from deep chooseN chain (depth > 1)', () => {
    const root = createRootNode(2);
    const stateChild = createChildNode(root, makeMove('march'), makeMoveKey('march{}'), 2);
    // Two levels of chooseN for $troops
    const dec1 = createDecisionChildNode(
      stateChild, makeMove('march'), makeMoveKey('march{$troops:[t1]}'),
      PLAYER, '$troops', 2, 'chooseN',
    );
    const dec2 = createDecisionChildNode(
      dec1, makeMove('march'), makeMoveKey('march{$troops:[t1,t2]}'),
      PLAYER, '$troops', 2, 'chooseN',
    );

    const move = makeMove('march', {
      $targetSpaces: ['zone1'],
      $troops: ['troop1', 'troop2'],  // intermediate — 2 accumulated
    });

    const result = stripIncompleteChooseNBindings(move, dec2);

    assert.deepEqual(result.params, { $targetSpaces: ['zone1'] });
  });

  it('does not strip confirmed chooseN bindings from ancestor decisions', () => {
    // Scenario: $targetSpaces was confirmed (via confirm node), then
    // the tree entered a new chooseOne decision for $base.
    // Only the in-progress binding should be stripped.
    const root = createRootNode(2);
    const stateChild = createChildNode(root, makeMove('rally'), makeMoveKey('rally{}'), 2);
    // The $targetSpaces confirm created a state transition, then a new
    // chooseOne decision for $base was entered.
    const chooseOneNode = createDecisionChildNode(
      stateChild, makeMove('rally'), makeMoveKey('rally{$base:yes}'),
      PLAYER, '$base', 2, 'chooseOne',
    );

    const move = makeMove('rally', {
      $targetSpaces: ['z1', 'z2'],  // confirmed — should be preserved
      $base: 'yes',                 // chooseOne — should be preserved
    });

    const result = stripIncompleteChooseNBindings(move, chooseOneNode);

    // Neither should be stripped.
    assert.deepEqual(result.params, move.params);
  });

  it('preserves other params when stripping one chooseN binding', () => {
    const root = createRootNode(2);
    const stateChild = createChildNode(root, makeMove('train'), makeMoveKey('train{}'), 2);
    const decisionNode = createDecisionChildNode(
      stateChild, makeMove('train'), makeMoveKey('train{$spaces:[s1]}'),
      PLAYER, '$spaces', 2, 'chooseN',
    );

    const move = makeMove('train', {
      $faction: 'ARVN',
      $spaces: ['s1'],
      $count: 3,
    });

    const result = stripIncompleteChooseNBindings(move, decisionNode);

    assert.deepEqual(result.params, { $faction: 'ARVN', $count: 3 });
  });
});
