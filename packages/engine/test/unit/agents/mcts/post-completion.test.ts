import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { postCompleteSelectedMove } from '../../../../src/agents/mcts/mcts-agent.js';
import { MctsAgent } from '../../../../src/agents/mcts/mcts-agent.js';
import { createRootNode, createChildNode } from '../../../../src/agents/mcts/node.js';
import { canonicalMoveKey } from '../../../../src/agents/mcts/move-key.js';
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
import type { Move } from '../../../../src/kernel/types-core.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * 2-player game with a concrete action (noop) and a template action (choose)
 * that has one chooseOne param over a small domain.
 */
function createTemplateDef(): GameDef {
  const phase = [asPhaseId('main')];
  return {
    metadata: { id: 'post-completion-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      {
        id: asActionId('noop'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
      {
        id: asActionId('choose'),
        actor: 'active',
        executor: 'actor',
        phase,
        params: [
          {
            name: 'target',
            domain: { query: 'intsInRange', min: 0, max: 2 },
          },
        ],
        pre: null,
        cost: [],
        effects: [
          { setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: 1 } },
        ],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'vp' } },
    },
  } as unknown as GameDef;
}

/**
 * Simple 2-action concrete game (no templates).
 */
function createConcreteOnlyDef(): GameDef {
  const phase = [asPhaseId('main')];
  return {
    metadata: { id: 'concrete-only-test', players: { min: 2, max: 2 } },
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
        phase,
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
        phase,
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

function makeMove(actionId: string, params: Record<string, number> = {}): Move {
  return { actionId: asActionId(actionId), params };
}

// ---------------------------------------------------------------------------
// postCompleteSelectedMove
// ---------------------------------------------------------------------------

describe('postCompleteSelectedMove', () => {
  it('returns concrete move directly via fast-path', () => {
    const def = createConcreteOnlyDef();
    const { state } = initialState(def, 42, 2);
    const runtime = createGameDefRuntime(def);
    const rng = createRng(1n);

    const concreteMove = makeMove('noop');
    const root = createRootNode(2);
    const key = canonicalMoveKey(concreteMove);
    const child = createChildNode(root, concreteMove, key, 2);
    child.visits = 10;

    const result = postCompleteSelectedMove(
      def, state, root, child, [concreteMove], rng, runtime,
    );

    assert.deepStrictEqual(result.move, concreteMove);
    // RNG not consumed for concrete moves.
    assert.equal(result.rng, rng);
  });

  it('completes template move against real state', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const runtime = createGameDefRuntime(def);
    const rng = createRng(1n);

    // Template move with no params filled — needs completion.
    const templateMove = makeMove('choose');
    const root = createRootNode(2);
    const key = canonicalMoveKey(templateMove);
    const child = createChildNode(root, templateMove, key, 2);
    child.visits = 10;

    const result = postCompleteSelectedMove(
      def, state, root, child, [templateMove], rng, runtime,
    );

    // The returned move should have the target param filled.
    assert.ok(
      'target' in result.move.params,
      'returned move should have target param',
    );
    const target = result.move.params.target as number;
    assert.ok(target >= 0 && target <= 2, 'target should be in domain [0,2]');
  });

  it('falls back to sibling when best child is uncompletable', () => {
    const def = createConcreteOnlyDef();
    const { state } = initialState(def, 42, 2);
    const runtime = createGameDefRuntime(def);
    const rng = createRng(1n);
    const moves = legalMoves(def, state, undefined, runtime);

    const root = createRootNode(2);

    // Best child: unknown action (will fail legalChoicesEvaluate + completeTemplateMove).
    const badMove = makeMove('nonexistent');
    const badChild = createChildNode(root, badMove, 'bad-key', 2);
    badChild.visits = 100;

    // Sibling: a valid concrete move with fewer visits.
    const goodMove = moves[0]!;
    const goodChild = createChildNode(root, goodMove, canonicalMoveKey(goodMove), 2);
    goodChild.visits = 50;

    const result = postCompleteSelectedMove(
      def, state, root, badChild, moves, rng, runtime,
    );

    // Should have fallen back to the sibling.
    assert.equal(result.move.actionId, goodMove.actionId);
  });

  it('falls back to legal moves when all children are uncompletable', () => {
    const def = createConcreteOnlyDef();
    const { state } = initialState(def, 42, 2);
    const runtime = createGameDefRuntime(def);
    const rng = createRng(1n);
    const moves = legalMoves(def, state, undefined, runtime);

    const root = createRootNode(2);

    // Only child: unknown action.
    const badMove = makeMove('nonexistent');
    const badChild = createChildNode(root, badMove, 'bad-key', 2);
    badChild.visits = 100;

    const result = postCompleteSelectedMove(
      def, state, root, badChild, moves, rng, runtime,
    );

    // Should have fallen back to one of the original legal moves.
    const legalActionIds = moves.map((m) => m.actionId);
    assert.ok(
      legalActionIds.includes(result.move.actionId),
      `returned move ${result.move.actionId} should be from legal moves`,
    );
  });
});

// ---------------------------------------------------------------------------
// MctsAgent determinism with post-completion
// ---------------------------------------------------------------------------

describe('MctsAgent post-completion determinism', () => {
  it('same seed produces same post-completed move', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);

    const config = { iterations: 20, minIterations: 0 };

    const rng1 = createRng(99n);
    const agent1 = new MctsAgent(config);
    const result1 = agent1.chooseMove({
      def, state, playerId: asPlayerId(0), legalMoves: moves, rng: rng1, runtime,
    });

    const rng2 = createRng(99n);
    const agent2 = new MctsAgent(config);
    const result2 = agent2.chooseMove({
      def, state, playerId: asPlayerId(0), legalMoves: moves, rng: rng2, runtime,
    });

    assert.deepStrictEqual(result1.move, result2.move);
    assert.deepStrictEqual(result1.rng, result2.rng);
  });

  it('returns a completed move (not a template) for games with template actions', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const runtime = createGameDefRuntime(def);
    const moves = legalMoves(def, state, undefined, runtime);

    const agent = new MctsAgent({ iterations: 30, minIterations: 0 });
    const result = agent.chooseMove({
      def, state, playerId: asPlayerId(0), legalMoves: moves, rng: createRng(42n), runtime,
    });

    // If the chosen action is 'choose', it must have the 'target' param filled.
    if (result.move.actionId === asActionId('choose')) {
      assert.ok(
        'target' in result.move.params,
        'template action must have target param after post-completion',
      );
    }
  });
});
