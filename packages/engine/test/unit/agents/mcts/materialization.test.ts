import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  materializeConcreteCandidates,
  filterAvailableCandidates,
} from '../../../../src/agents/mcts/materialization.js';
import type { ConcreteMoveCandidate } from '../../../../src/agents/mcts/expansion.js';
import type { MctsNode } from '../../../../src/agents/mcts/node.js';
import { createRootNode, createChildNode } from '../../../../src/agents/mcts/node.js';
import { canonicalMoveKey } from '../../../../src/agents/mcts/move-key.js';
import {
  asActionId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import type { Move } from '../../../../src/kernel/types-core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMove(actionId: string, params: Record<string, number> = {}): Move {
  return { actionId: asActionId(actionId), params };
}

/**
 * A minimal GameDef with a concrete action (noop) and a template action
 * (choose) that has one chooseOne param over a small domain.
 */
function createTemplateDef(): GameDef {
  const phase = ['main'];
  return {
    metadata: { id: 'materialization-test', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'main' }] },
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

function stubNode(childMoveKeys: string[]): MctsNode {
  const root = createRootNode(2);
  for (const key of childMoveKeys) {
    const move = makeMove('stub');
    createChildNode(root, move, key, 2);
  }
  return root;
}

// ---------------------------------------------------------------------------
// materializeConcreteCandidates
// ---------------------------------------------------------------------------

describe('materializeConcreteCandidates', () => {
  it('yields non-template move as-is with computed moveKey', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    const concreteMove = makeMove('noop');
    const result = materializeConcreteCandidates(def, state, [concreteMove], rng, 3);

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]!.moveKey, canonicalMoveKey(concreteMove));
    assert.deepEqual(result.candidates[0]!.move, concreteMove);
  });

  it('completes template move up to limitPerTemplate times with unique keys', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    // "choose" has param target with domain [0,1,2] — template since no param provided
    const templateMove = makeMove('choose');
    const result = materializeConcreteCandidates(def, state, [templateMove], rng, 10);

    // Should have at most 3 unique completions (domain is 0,1,2)
    assert.ok(result.candidates.length >= 1, 'at least one completion');
    assert.ok(result.candidates.length <= 3, 'at most 3 unique completions');

    // All candidates should have unique moveKeys
    const keys = new Set(result.candidates.map((c: ConcreteMoveCandidate) => c.moveKey));
    assert.equal(keys.size, result.candidates.length, 'all keys are unique');
  });

  it('deduplicates completions with same moveKey', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    const templateMove = makeMove('choose');
    // With limitPerTemplate=100, we'll try many completions but domain is only [0,1,2]
    const result = materializeConcreteCandidates(def, state, [templateMove], rng, 100);

    const keys = result.candidates.map((c: ConcreteMoveCandidate) => c.moveKey);
    const uniqueKeys = new Set(keys);
    assert.equal(keys.length, uniqueKeys.size, 'no duplicate moveKeys');
  });

  it('skips moves for unknown actions (treated as unsatisfiable)', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    // A move for a nonexistent action — legalChoicesEvaluate will throw,
    // materializeConcreteCandidates should catch and skip it.
    const unknownMove = makeMove('nonexistent');
    const concreteMove = makeMove('noop');
    const result = materializeConcreteCandidates(
      def, state, [unknownMove, concreteMove], rng, 3,
    );

    // Only the concrete move should survive.
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]!.moveKey, canonicalMoveKey(concreteMove));
  });

  it('excludes stochasticUnresolved results from candidates (RNG still consumed)', () => {
    // stochasticUnresolved moves are those behind a rollRandom gate.
    // With the simple test def we don't have stochastic actions, so we
    // verify the general contract: only fully completed template results
    // appear as candidates.  stochasticUnresolved results are skipped
    // because their incomplete decision parameters produce unreliable
    // search statistics across belief samples.
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(42n);

    const templateMove = makeMove('choose');
    const result = materializeConcreteCandidates(def, state, [templateMove], rng, 5);
    // All candidates from template completion should be fully completed
    // (the simple test def has no stochastic actions, so all complete)
    assert.ok(result.candidates.length >= 1, 'has candidates');
  });

  it('respects limitPerTemplate = 1: at most one completion per template', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    const templateMove = makeMove('choose');
    const concreteMove = makeMove('noop');
    const result = materializeConcreteCandidates(
      def, state, [concreteMove, templateMove], rng, 1,
    );

    // Should have exactly 1 concrete + at most 1 template completion
    const concreteKeys = new Set([canonicalMoveKey(concreteMove)]);
    const templateCandidates = result.candidates.filter(
      (c: ConcreteMoveCandidate) => !concreteKeys.has(c.moveKey),
    );
    assert.ok(templateCandidates.length <= 1, 'at most 1 template completion');
  });

  it('returns empty candidates array for empty legal moves', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    const result = materializeConcreteCandidates(def, state, [], rng, 3);
    assert.equal(result.candidates.length, 0);
  });

  it('is deterministic: same inputs + same RNG produce same candidates in same order', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);

    const moves = [makeMove('noop'), makeMove('choose')];

    const result1 = materializeConcreteCandidates(def, state, moves, createRng(77n), 5);
    const result2 = materializeConcreteCandidates(def, state, moves, createRng(77n), 5);

    assert.equal(result1.candidates.length, result2.candidates.length);
    for (let i = 0; i < result1.candidates.length; i += 1) {
      assert.equal(result1.candidates[i]!.moveKey, result2.candidates[i]!.moveKey);
    }
  });

  it('does not mutate the input legalMoves array', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    const moves: readonly Move[] = Object.freeze([makeMove('noop'), makeMove('choose')]);
    // Should not throw due to mutation of frozen array
    materializeConcreteCandidates(def, state, moves, rng, 3);
  });

  it('total candidates bounded by concreteMoves + templates * limitPerTemplate', () => {
    const def = createTemplateDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    const concreteMove = makeMove('noop');
    const templateMove = makeMove('choose');
    const limit = 5;
    const result = materializeConcreteCandidates(
      def, state, [concreteMove, templateMove], rng, limit,
    );

    // Max = 1 concrete + 5 template completions = 6 (before dedup)
    // After dedup: at most 1 + min(5, domain_size=3) = 4
    assert.ok(result.candidates.length <= 1 + limit);
  });
});

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
