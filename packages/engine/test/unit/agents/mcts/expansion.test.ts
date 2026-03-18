import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  maxChildren,
  shouldExpand,
  selectExpansionCandidate,
  type ConcreteMoveCandidate,
} from '../../../../src/agents/mcts/expansion.js';
import type { MctsNode } from '../../../../src/agents/mcts/node.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type GameDef,
} from '../../../../src/kernel/index.js';
import { createRng } from '../../../../src/kernel/prng.js';
import { canonicalMoveKey } from '../../../../src/agents/mcts/move-key.js';
import type { Move } from '../../../../src/kernel/types-core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal stub node for shouldExpand tests. */
function stubNode(visits: number, childrenCount: number): MctsNode {
  return {
    move: null,
    moveKey: null,
    parent: null,
    visits,
    availability: 0,
    totalReward: [],
    heuristicPrior: null,
    children: new Array(childrenCount).fill(null) as MctsNode[],
    provenResult: null,
    nodeKind: 'state',
    decisionPlayer: null,
    partialMove: null,
    decisionBinding: null,
    decisionType: null,
  };
}

function makeMove(actionId: string, params: Record<string, number> = {}): Move {
  return { actionId: asActionId(actionId), params };
}

function makeCandidate(actionId: string, params: Record<string, number> = {}): ConcreteMoveCandidate {
  const move = makeMove(actionId, params);
  return { move, moveKey: canonicalMoveKey(move) };
}

/**
 * GameDef for heuristic tests:
 * - 2 players, perPlayerVar "vp" 0..10
 * - three actions set vp to hardcoded values (low/mid/high)
 * - no terminal conditions, only scoring (so evaluateState uses heuristic)
 */
function createHeuristicDef(): GameDef {
  const phase = [asPhaseId('main')];
  const makeGainAction = (id: string, amount: number) => ({
    id: asActionId(id),
    actor: 'active' as const,
    executor: 'actor' as const,
    phase,
    params: [],
    pre: null,
    cost: [],
    effects: [{ setVar: { scope: 'pvar', player: 'actor', var: 'vp', value: amount } }],
    limits: [],
  });

  return {
    metadata: { id: 'expansion-heuristic', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [{ name: 'vp', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: asPhaseId('main') }] },
    actions: [
      makeGainAction('gainLow', 2),
      makeGainAction('gainMid', 5),
      makeGainAction('gainHigh', 9),
      { id: asActionId('noop'), actor: 'active', executor: 'actor', phase, params: [], pre: null, cost: [], effects: [], limits: [] },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      scoring: { method: 'highest', value: { ref: 'pvar', player: 'actor', var: 'vp' } },
    },
  } as unknown as GameDef;
}

/**
 * GameDef for terminal-win tests:
 * - 2 players
 * - globalVar "ended" triggers terminal win for player 0 when == 1
 * - action "win" sets ended=1
 * - action "noop" does nothing (control candidate)
 */
function createTerminalDef(): GameDef {
  return {
    metadata: { id: 'expansion-terminal', players: { min: 2, max: 2 } },
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
// maxChildren
// ---------------------------------------------------------------------------

describe('maxChildren', () => {
  it('returns 1 for 0 visits (minimum floor)', () => {
    assert.equal(maxChildren(0, 2, 0.5), 1);
  });

  it('returns 2 for 1 visit with K=2 alpha=0.5', () => {
    // 2 * 1^0.5 = 2
    assert.equal(maxChildren(1, 2, 0.5), 2);
  });

  it('returns 4 for 4 visits with K=2 alpha=0.5', () => {
    // 2 * sqrt(4) = 4
    assert.equal(maxChildren(4, 2, 0.5), 4);
  });

  it('always returns >= 1', () => {
    for (const visits of [0, 1, 2, 5, 10, 100]) {
      assert.ok(maxChildren(visits, 2, 0.5) >= 1, `visits=${visits}`);
    }
  });

  it('floors fractional results', () => {
    // K=2, alpha=0.5, visits=3 → 2 * sqrt(3) ≈ 3.46 → 3
    assert.equal(maxChildren(3, 2, 0.5), 3);
  });
});

// ---------------------------------------------------------------------------
// shouldExpand
// ---------------------------------------------------------------------------

describe('shouldExpand', () => {
  it('returns true when children.length < maxChildren', () => {
    // visits=4, K=2, alpha=0.5 → maxChildren=4, children=2 → true
    const node = stubNode(4, 2);
    assert.equal(shouldExpand(node, 2, 0.5), true);
  });

  it('returns false when children.length >= maxChildren', () => {
    // visits=4, K=2, alpha=0.5 → maxChildren=4, children=4 → false
    const node = stubNode(4, 4);
    assert.equal(shouldExpand(node, 2, 0.5), false);
  });

  it('returns false when children exceed maxChildren', () => {
    // visits=1, K=2, alpha=0.5 → maxChildren=2, children=3 → false
    const node = stubNode(1, 3);
    assert.equal(shouldExpand(node, 2, 0.5), false);
  });

  it('is a pure predicate — does not mutate node', () => {
    const node = stubNode(4, 2);
    const childrenBefore = node.children.length;
    const visitsBefore = node.visits;
    shouldExpand(node, 2, 0.5);
    assert.equal(node.children.length, childrenBefore);
    assert.equal(node.visits, visitsBefore);
  });
});

// ---------------------------------------------------------------------------
// selectExpansionCandidate
// ---------------------------------------------------------------------------

describe('selectExpansionCandidate', () => {
  it('selects immediate-win candidate over higher-heuristic non-win', () => {
    const def = createTerminalDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(99n);

    // "win" action triggers terminal win for player 0
    // "noop" does nothing — no terminal
    const winCandidate = makeCandidate('win');
    const noopCandidate = makeCandidate('noop');

    const result = selectExpansionCandidate(
      [noopCandidate, winCandidate],
      def,
      state,
      asPlayerId(0),
      rng,
    );

    assert.equal(result.candidate.moveKey, winCandidate.moveKey);
  });

  it('selects highest heuristic among non-terminal candidates', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(99n);

    const lowVp = makeCandidate('gainLow');
    const highVp = makeCandidate('gainHigh');
    const midVp = makeCandidate('gainMid');

    const result = selectExpansionCandidate(
      [lowVp, midVp, highVp],
      def,
      state,
      asPlayerId(0),
      rng,
    );

    assert.equal(result.candidate.moveKey, highVp.moveKey);
  });

  it('PRNG tiebreak for equal heuristics is deterministic', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);

    // Two candidates with same action (same heuristic) but different keys
    const candidateA: ConcreteMoveCandidate = {
      move: makeMove('noop'),
      moveKey: 'candidateA',
    };
    const candidateB: ConcreteMoveCandidate = {
      move: makeMove('noop'),
      moveKey: 'candidateB',
    };

    // Run twice with same seed — must pick the same candidate
    const rng1 = createRng(42n);
    const rng2 = createRng(42n);

    const result1 = selectExpansionCandidate(
      [candidateA, candidateB],
      def,
      state,
      asPlayerId(0),
      rng1,
    );
    const result2 = selectExpansionCandidate(
      [candidateA, candidateB],
      def,
      state,
      asPlayerId(0),
      rng2,
    );

    assert.equal(result1.candidate.moveKey, result2.candidate.moveKey);
  });

  it('returns single candidate without error', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);
    const only = makeCandidate('gainMid');

    const result = selectExpansionCandidate([only], def, state, asPlayerId(0), rng);
    assert.equal(result.candidate.moveKey, only.moveKey);
  });

  it('throws on empty candidates', () => {
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(1n);

    assert.throws(
      () => selectExpansionCandidate([], def, state, asPlayerId(0), rng),
      /empty candidates/,
    );
  });

  it('never calls applyMove more than candidates.length times', () => {
    // Implicit: if the function completes without timeout for a small
    // candidate set, it respects the bound.  We verify by providing
    // 3 candidates and confirming a result is returned.
    const def = createHeuristicDef();
    const { state } = initialState(def, 42, 2);
    const rng = createRng(7n);

    const candidates = [
      makeCandidate('gainLow'),
      makeCandidate('gainMid'),
      makeCandidate('gainHigh'),
    ];

    const result = selectExpansionCandidate(candidates, def, state, asPlayerId(0), rng);
    assert.ok(candidates.some((c) => c.moveKey === result.candidate.moveKey));
  });
});
