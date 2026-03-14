import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectChild } from '../../../../src/agents/mcts/isuct.js';
import { createRootNode, createChildNode } from '../../../../src/agents/mcts/node.js';
import type { MctsNode } from '../../../../src/agents/mcts/node.js';
import type { Move } from '../../../../src/kernel/types-core.js';
import type { MoveKey } from '../../../../src/agents/mcts/move-key.js';
import { asActionId, asPlayerId } from '../../../../src/kernel/branded.js';

const aid = asActionId;
const pid = asPlayerId;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMove(label: string): Move {
  return { actionId: aid(label), params: {} };
}

function makeChild(
  parent: MctsNode,
  label: string,
  overrides: {
    visits?: number;
    availability?: number;
    totalReward?: number[];
  } = {},
): MctsNode {
  const child = createChildNode(
    parent,
    makeMove(label),
    `${label}{}` as MoveKey,
    parent.totalReward.length,
  );
  if (overrides.visits !== undefined) child.visits = overrides.visits;
  if (overrides.availability !== undefined)
    child.availability = overrides.availability;
  if (overrides.totalReward !== undefined)
    child.totalReward = overrides.totalReward;
  return child;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selectChild (ISUCT availability-aware selection)', () => {
  const player0 = pid(0);
  const C = 1.4;

  // AC 1: Single available unvisited child → returns that child.
  it('returns the single unvisited available child', () => {
    const root = createRootNode(2);
    const visited = makeChild(root, 'a', {
      visits: 10,
      availability: 15,
      totalReward: [5, 5],
    });
    const unvisited = makeChild(root, 'b', {
      visits: 0,
      availability: 3,
    });
    const result = selectChild(root, player0, C, [visited, unvisited]);
    assert.equal(result, unvisited);
  });

  // AC 2: Multiple unvisited available children → returns the first one.
  it('returns the first unvisited child when multiple are unvisited', () => {
    const root = createRootNode(2);
    const u1 = makeChild(root, 'a', { visits: 0, availability: 2 });
    const u2 = makeChild(root, 'b', { visits: 0, availability: 5 });
    const result = selectChild(root, player0, C, [u1, u2]);
    assert.equal(result, u1);
  });

  // AC 3: All children visited → returns child with highest ISUCT score.
  it('returns child with highest ISUCT score when all visited', () => {
    const root = createRootNode(2);
    // Child A: mean = 8/10 = 0.8, exploration = C * sqrt(ln(20)/10)
    const a = makeChild(root, 'a', {
      visits: 10,
      availability: 20,
      totalReward: [8, 2],
    });
    // Child B: mean = 2/10 = 0.2, same exploration
    const b = makeChild(root, 'b', {
      visits: 10,
      availability: 20,
      totalReward: [2, 8],
    });
    const result = selectChild(root, player0, C, [a, b]);
    assert.equal(result, a);
  });

  // AC 4: High availability, low visits → exploration term dominates.
  it('prefers under-explored child when availability is high relative to visits', () => {
    const root = createRootNode(2);
    // Child A: well-explored, decent reward
    const a = makeChild(root, 'a', {
      visits: 100,
      availability: 100,
      totalReward: [70, 30],
    });
    // Child B: barely visited, high availability → big exploration bonus
    const b = makeChild(root, 'b', {
      visits: 1,
      availability: 100,
      totalReward: [0.5, 0.5],
    });
    const result = selectChild(root, player0, C, [a, b]);
    assert.equal(result, b);
  });

  // AC 5: High visits, low reward → exploitation term low, avoids weak moves.
  it('avoids heavily visited child with low reward', () => {
    const root = createRootNode(2);
    // Child A: many visits, very low reward → low exploitation
    const a = makeChild(root, 'a', {
      visits: 50,
      availability: 50,
      totalReward: [1, 49],
    });
    // Child B: fewer visits, high reward
    const b = makeChild(root, 'b', {
      visits: 10,
      availability: 50,
      totalReward: [8, 2],
    });
    const result = selectChild(root, player0, C, [a, b]);
    assert.equal(result, b);
  });

  // AC 6: explorationConstant = 0 → pure exploitation (highest mean reward wins).
  it('selects highest mean reward when exploration constant is 0', () => {
    const root = createRootNode(2);
    // Child A: mean = 3/10 = 0.3 for player 0
    const a = makeChild(root, 'a', {
      visits: 10,
      availability: 50,
      totalReward: [3, 7],
    });
    // Child B: mean = 9/10 = 0.9 for player 0
    const b = makeChild(root, 'b', {
      visits: 10,
      availability: 5,
      totalReward: [9, 1],
    });
    const result = selectChild(root, player0, 0, [a, b]);
    assert.equal(result, b);
  });

  // AC 7: Large explorationConstant → exploration dominates.
  it('selects highest exploration term when C is very large', () => {
    const root = createRootNode(2);
    // Child A: high reward but low availability/visits ratio
    const a = makeChild(root, 'a', {
      visits: 50,
      availability: 50,
      totalReward: [45, 5],
    });
    // Child B: low reward but high availability relative to visits
    const b = makeChild(root, 'b', {
      visits: 2,
      availability: 100,
      totalReward: [0.1, 1.9],
    });
    const result = selectChild(root, player0, 1000, [a, b]);
    assert.equal(result, b);
  });

  // AC 8: Empty availableChildren → throws descriptive error.
  it('throws when availableChildren is empty', () => {
    const root = createRootNode(2);
    assert.throws(
      () => selectChild(root, player0, C, []),
      (err: unknown) =>
        err instanceof Error && /available/i.test(err.message),
    );
  });

  // Invariant: selection only considers children in availableChildren list.
  it('ignores children not in the availableChildren list', () => {
    const root = createRootNode(2);
    // Child A is NOT in availableChildren despite being best
    makeChild(root, 'a', {
      visits: 10,
      availability: 20,
      totalReward: [9, 1],
    });
    // Child B IS available but worse reward
    const b = makeChild(root, 'b', {
      visits: 10,
      availability: 20,
      totalReward: [3, 7],
    });
    const result = selectChild(root, player0, C, [b]);
    assert.equal(result, b);
  });

  // Invariant: ties broken by first-found.
  it('breaks ties by returning the first child', () => {
    const root = createRootNode(2);
    const a = makeChild(root, 'a', {
      visits: 10,
      availability: 20,
      totalReward: [5, 5],
    });
    const b = makeChild(root, 'b', {
      visits: 10,
      availability: 20,
      totalReward: [5, 5],
    });
    const result = selectChild(root, player0, C, [a, b]);
    assert.equal(result, a);
  });

  // ---------------------------------------------------------------------------
  // Heuristic backup blending (ticket 63MCTSPERROLLFRESEA-008)
  // ---------------------------------------------------------------------------

  // AC 1: alpha = 0 produces identical results to phase-1 (no behavior change).
  it('alpha=0 produces identical selection to default (no blending)', () => {
    const root = createRootNode(2);
    const a = makeChild(root, 'a', {
      visits: 10,
      availability: 20,
      totalReward: [8, 2],
    });
    a.heuristicPrior = [0.1, 0.9]; // should be ignored
    const b = makeChild(root, 'b', {
      visits: 10,
      availability: 20,
      totalReward: [2, 8],
    });
    b.heuristicPrior = [0.9, 0.1]; // should be ignored
    // With alpha=0, pure MC: a has higher MC mean (0.8 vs 0.2) → a wins.
    const withAlpha0 = selectChild(root, player0, C, [a, b], 0);
    const withDefault = selectChild(root, player0, C, [a, b]);
    assert.equal(withAlpha0, withDefault);
    assert.equal(withAlpha0, a);
  });

  // AC 2: alpha > 0 uses blended mean correctly.
  it('alpha>0 blends heuristic prior into exploitation term', () => {
    const root = createRootNode(2);
    // Child A: MC mean = 3/10 = 0.3, heuristic = 0.3 → blended = 0.3
    const a = makeChild(root, 'a', {
      visits: 10,
      availability: 20,
      totalReward: [3, 7],
    });
    a.heuristicPrior = [0.3, 0.7];
    // Child B: MC mean = 2/10 = 0.2, heuristic = 0.9 → blended(0.5) = 0.5*0.2 + 0.5*0.9 = 0.55
    const b = makeChild(root, 'b', {
      visits: 10,
      availability: 20,
      totalReward: [2, 8],
    });
    b.heuristicPrior = [0.9, 0.1];
    // With alpha=0.5 and C=0 (pure exploitation), b should win (0.55 > 0.3).
    const result = selectChild(root, player0, 0, [a, b], 0.5);
    assert.equal(result, b);
    // With alpha=0 and C=0, a should win (MC mean 0.3 > 0.2).
    const resultNoBlend = selectChild(root, player0, 0, [a, b], 0);
    assert.equal(resultNoBlend, a);
  });

  // AC 3: heuristicPrior = null falls back to pure MC mean.
  it('falls back to pure MC mean when heuristicPrior is null', () => {
    const root = createRootNode(2);
    // Child A: MC mean = 0.8, no heuristic
    const a = makeChild(root, 'a', {
      visits: 10,
      availability: 20,
      totalReward: [8, 2],
    });
    // heuristicPrior stays null (default)
    // Child B: MC mean = 0.2, has heuristic but lower blended
    const b = makeChild(root, 'b', {
      visits: 10,
      availability: 20,
      totalReward: [2, 8],
    });
    b.heuristicPrior = [0.5, 0.5];
    // alpha=0.5: a uses pure MC (0.8), b blended = 0.5*0.2 + 0.5*0.5 = 0.35
    // With C=0, a wins.
    const result = selectChild(root, player0, 0, [a, b], 0.5);
    assert.equal(result, a);
  });
});
