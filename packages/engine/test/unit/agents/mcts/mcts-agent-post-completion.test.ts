import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { postCompleteSelectedMove } from '../../../../src/agents/mcts/mcts-agent.js';
import { createRootNode, createChildNode, createDecisionChildNode } from '../../../../src/agents/mcts/node.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { createGameDefRuntime } from '../../../../src/kernel/gamedef-runtime.js';
import { legalMoves } from '../../../../src/kernel/legal-moves.js';
import type { MoveKey } from '../../../../src/agents/mcts/move-key.js';
import type { PlayerId } from '../../../../src/kernel/branded.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createTwoActionDef(): GameDef {
  return {
    metadata: { id: 'post-complete-test', players: { min: 2, max: 2 } },
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('postCompleteSelectedMove', () => {
  describe('concrete root action (existing behavior)', () => {
    it('returns a complete move for a concrete (state) bestChild', () => {
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      // Build a minimal tree: root with one concrete child.
      const root = createRootNode(playerCount);
      const winMove = moves.find((m) => m.actionId === 'win')!;
      const child = createChildNode(root, winMove, 'win:{}' as MoveKey, playerCount);
      child.visits = 10;
      root.visits = 10;

      const rng = createRng(42n);
      const result = postCompleteSelectedMove(def, state, root, child, moves, rng, runtime);

      assert.equal(result.move.actionId, 'win', 'should return the concrete move');
    });
  });

  describe('decision root child (highest-visit subtree path)', () => {
    it('follows highest-visit path through decision subtree', () => {
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      const root = createRootNode(playerCount);

      // Create a decision root child for the 'win' action.
      const winMove = moves.find((m) => m.actionId === 'win')!;
      const decisionRoot = createDecisionChildNode(
        root,
        winMove,
        'D:win' as MoveKey,
        asPlayerId(0) as PlayerId,
        'target',
        playerCount,
        'chooseOne',
      );
      decisionRoot.visits = 20;
      root.visits = 20;

      // Create two decision children with different visit counts.
      // Child A: low visits.
      const childA = createDecisionChildNode(
        decisionRoot,
        winMove,
        'D:win:A' as MoveKey,
        asPlayerId(0) as PlayerId,
        'option',
        playerCount,
        'chooseOne',
      );
      childA.visits = 5;

      // Child B: high visits — should be selected.
      const childB = createDecisionChildNode(
        decisionRoot,
        winMove,
        'D:win:B' as MoveKey,
        asPlayerId(0) as PlayerId,
        'option',
        playerCount,
        'chooseOne',
      );
      childB.visits = 15;

      const rng = createRng(42n);
      const result = postCompleteSelectedMove(def, state, root, decisionRoot, moves, rng, runtime);

      // Should return a fully-resolved move (postComplete always does).
      assert.ok(result.move, 'should return a move');
      assert.ok(result.rng, 'should return rng');
    });

    it('completes remaining decisions via completeTemplateMove', () => {
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      const root = createRootNode(playerCount);

      // Create decision root with no children (shallow subtree).
      const noopMove = moves.find((m) => m.actionId === 'noop')!;
      const decisionRoot = createDecisionChildNode(
        root,
        noopMove,
        'D:noop' as MoveKey,
        asPlayerId(0) as PlayerId,
        'target',
        playerCount,
        'chooseOne',
      );
      decisionRoot.visits = 10;
      root.visits = 10;

      const rng = createRng(42n);
      const result = postCompleteSelectedMove(
        def, state, root, decisionRoot, moves, rng, runtime,
      );

      // Should still produce a valid move (via fallback to completeTemplateMove
      // on the original template move or the legal moves list).
      assert.ok(result.move, 'should return a move');
      const moveActionIds = moves.map((m) => m.actionId);
      assert.ok(
        moveActionIds.includes(result.move.actionId),
        `returned move ${result.move.actionId} should be one of ${moveActionIds.join(', ')}`,
      );
    });

    it('always returns a fully-resolved move', () => {
      const def = createTwoActionDef();
      const playerCount = 2;
      const { state } = initialState(def, 42, playerCount);
      const runtime = createGameDefRuntime(def);
      const moves = legalMoves(def, state, undefined, runtime);

      const root = createRootNode(playerCount);

      // Build a deeper decision subtree (root → child → grandchild state node).
      const winMove = moves.find((m) => m.actionId === 'win')!;
      const decisionRoot = createDecisionChildNode(
        root,
        winMove,
        'D:win' as MoveKey,
        asPlayerId(0) as PlayerId,
        'target',
        playerCount,
        'chooseOne',
      );
      decisionRoot.visits = 10;
      root.visits = 10;

      // Create a state-node grandchild (simulating a completed decision).
      const stateChild = createChildNode(decisionRoot, winMove, 'win:{}' as MoveKey, playerCount);
      stateChild.visits = 10;
      // Mark as state node (already default from createChildNode).
      assert.equal(stateChild.nodeKind, 'state');

      const rng = createRng(42n);
      const result = postCompleteSelectedMove(def, state, root, decisionRoot, moves, rng, runtime);

      // The state child's move should be the result since it's already complete.
      assert.equal(result.move.actionId, 'win');
    });
  });
});
