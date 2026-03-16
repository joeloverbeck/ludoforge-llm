/**
 * Unit tests for ConsoleVisitor.
 *
 * Verifies all event types are handled without errors.
 */
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createConsoleVisitor } from '../../helpers/mcts-console-visitor.js';
import type { MctsSearchEvent } from '../../../src/agents/index.js';

// ---------------------------------------------------------------------------
// Fixtures: one representative event per type
// ---------------------------------------------------------------------------

const ALL_EVENTS: readonly MctsSearchEvent[] = [
  {
    type: 'searchStart',
    totalIterations: 200,
    legalMoveCount: 10,
    concreteCount: 3,
    templateCount: 7,
    poolCapacity: 1024,
  },
  {
    type: 'iterationBatch',
    fromIteration: 0,
    toIteration: 49,
    rootChildCount: 5,
    elapsedMs: 120,
    nodesAllocated: 80,
    topChildren: [{ actionId: 'train', visits: 20 }],
  },
  {
    type: 'expansion',
    actionId: 'train',
    moveKey: 'train:abc' as never,
    childIndex: 0,
    totalChildren: 5,
  },
  {
    type: 'decisionNodeCreated',
    actionId: 'march',
    decisionName: '$targetSpaces',
    optionCount: 4,
    decisionDepth: 1,
  },
  {
    type: 'decisionCompleted',
    actionId: 'march',
    stepsUsed: 3,
    moveKey: 'march:def' as never,
  },
  {
    type: 'decisionIllegal',
    actionId: 'march',
    decisionName: '$targetSpaces',
    reason: 'no valid targets',
  },
  {
    type: 'templateDropped',
    actionId: 'march',
    reason: 'unsatisfiable',
  },
  {
    type: 'applyMoveFailure',
    actionId: 'train',
    phase: 'expansion',
    error: 'zone full',
  },
  {
    type: 'poolExhausted',
    capacity: 1024,
    iteration: 150,
  },
  {
    type: 'searchComplete',
    iterations: 200,
    stopReason: 'iterations',
    elapsedMs: 500,
    bestActionId: 'train',
    bestVisits: 80,
  },
  {
    type: 'rootCandidates',
    concrete: [{ actionId: 'pass', moveKey: 'pass:0' as never }],
    templates: [{ actionId: 'march' }],
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConsoleVisitor', () => {
  it('handles all event types without errors', () => {
    const visitor = createConsoleVisitor();

    for (const event of ALL_EVENTS) {
      // Should not throw
      assert.doesNotThrow(() => visitor.onEvent!(event));
    }
  });

  it('accepts a custom prefix', () => {
    const visitor = createConsoleVisitor('[TEST]');

    // Should not throw
    assert.doesNotThrow(() => visitor.onEvent!(ALL_EVENTS[0]!));
  });

  it('handles empty topChildren in iterationBatch', () => {
    const visitor = createConsoleVisitor();
    const event: MctsSearchEvent = {
      type: 'iterationBatch',
      fromIteration: 0,
      toIteration: 10,
      rootChildCount: 0,
      elapsedMs: 50,
      nodesAllocated: 0,
      topChildren: [],
    };

    assert.doesNotThrow(() => visitor.onEvent!(event));
  });

  it('handles empty concrete/templates in rootCandidates', () => {
    const visitor = createConsoleVisitor();
    const event: MctsSearchEvent = {
      type: 'rootCandidates',
      concrete: [],
      templates: [],
    };

    assert.doesNotThrow(() => visitor.onEvent!(event));
  });

  it('handles all templateDropped reasons', () => {
    const visitor = createConsoleVisitor();
    const reasons = ['unsatisfiable', 'stochasticUnresolved', 'applyMoveFailed'] as const;

    for (const reason of reasons) {
      const event: MctsSearchEvent = {
        type: 'templateDropped',
        actionId: 'test',
        reason,
      };
      assert.doesNotThrow(() => visitor.onEvent!(event));
    }
  });

  it('handles all applyMoveFailure phases', () => {
    const visitor = createConsoleVisitor();
    const phases = ['expansion', 'selection', 'rollout', 'forcedSequence'] as const;

    for (const phase of phases) {
      const event: MctsSearchEvent = {
        type: 'applyMoveFailure',
        actionId: 'test',
        phase,
        error: 'test error',
      };
      assert.doesNotThrow(() => visitor.onEvent!(event));
    }
  });

  it('handles all searchComplete stopReasons', () => {
    const visitor = createConsoleVisitor();
    const reasons = ['confidence', 'solver', 'time', 'iterations'] as const;

    for (const stopReason of reasons) {
      const event: MctsSearchEvent = {
        type: 'searchComplete',
        iterations: 100,
        stopReason,
        elapsedMs: 200,
        bestActionId: 'pass',
        bestVisits: 50,
      };
      assert.doesNotThrow(() => visitor.onEvent!(event));
    }
  });
});
