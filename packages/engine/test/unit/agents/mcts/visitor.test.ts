import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  MctsSearchEvent,
  MctsSearchStartEvent,
  MctsIterationBatchEvent,
  MctsExpansionEvent,
  MctsDecisionNodeCreatedEvent,
  MctsDecisionCompletedEvent,
  MctsDecisionIllegalEvent,
  MctsMoveDroppedEvent,
  MctsApplyMoveFailureEvent,
  MctsPoolExhaustedEvent,
  MctsSearchCompleteEvent,
  MctsRootCandidatesEvent,
  MctsSearchVisitor,
} from '../../../../src/agents/mcts/visitor.js';

describe('MctsSearchVisitor types', () => {
  it('MctsSearchVisitor with onEvent receives all event types', () => {
    const received: MctsSearchEvent[] = [];
    const visitor: MctsSearchVisitor = {
      onEvent: (event) => received.push(event),
    };

    const events: MctsSearchEvent[] = [
      {
        type: 'searchStart',
        totalIterations: 1000,
        legalMoveCount: 10,
        readyCount: 5,
        pendingCount: 5,
        poolCapacity: 50_000,
      } satisfies MctsSearchStartEvent,
      {
        type: 'iterationBatch',
        fromIteration: 0,
        toIteration: 50,
        rootChildCount: 3,
        elapsedMs: 120,
        nodesAllocated: 200,
        topChildren: [{ actionId: 'attack', visits: 30 }],
      } satisfies MctsIterationBatchEvent,
      {
        type: 'expansion',
        actionId: 'march',
        moveKey: 'march|zone1|zone2',
        childIndex: 2,
        totalChildren: 8,
      } satisfies MctsExpansionEvent,
      {
        type: 'decisionNodeCreated',
        actionId: 'sweep',
        decisionName: 'targetProvince',
        optionCount: 4,
        decisionDepth: 1,
      } satisfies MctsDecisionNodeCreatedEvent,
      {
        type: 'decisionCompleted',
        actionId: 'sweep',
        stepsUsed: 3,
        moveKey: 'sweep|prov1|prov2',
      } satisfies MctsDecisionCompletedEvent,
      {
        type: 'decisionIllegal',
        actionId: 'rally',
        decisionName: 'targetCity',
        reason: 'no eligible cities',
      } satisfies MctsDecisionIllegalEvent,
      {
        type: 'moveDropped',
        actionId: 'ambush',
        reason: 'unsatisfiable',
      } satisfies MctsMoveDroppedEvent,
      {
        type: 'applyMoveFailure',
        actionId: 'train',
        phase: 'expansion',
        error: 'Zone capacity exceeded',
      } satisfies MctsApplyMoveFailureEvent,
      {
        type: 'poolExhausted',
        capacity: 50_000,
        iteration: 999,
      } satisfies MctsPoolExhaustedEvent,
      {
        type: 'searchComplete',
        iterations: 1000,
        stopReason: 'iterations',
        elapsedMs: 2500,
        bestActionId: 'attack',
        bestVisits: 450,
      } satisfies MctsSearchCompleteEvent,
      {
        type: 'rootCandidates',
        ready: [{ actionId: 'pass', moveKey: 'pass' }],
        pending: [{ actionId: 'sweep' }],
      } satisfies MctsRootCandidatesEvent,
    ];

    for (const event of events) {
      visitor.onEvent!(event);
    }

    assert.equal(received.length, 11);
    assert.deepStrictEqual(
      received.map((e) => e.type),
      [
        'searchStart',
        'iterationBatch',
        'expansion',
        'decisionNodeCreated',
        'decisionCompleted',
        'decisionIllegal',
        'moveDropped',
        'applyMoveFailure',
        'poolExhausted',
        'searchComplete',
        'rootCandidates',
      ],
    );
  });

  it('discriminated union supports exhaustive switch', () => {
    // This function must compile — verifies the union is exhaustive.
    function handleEvent(event: MctsSearchEvent): string {
      switch (event.type) {
        case 'searchStart':
          return `start:${event.totalIterations}`;
        case 'iterationBatch':
          return `batch:${event.fromIteration}-${event.toIteration}`;
        case 'expansion':
          return `expand:${event.actionId}`;
        case 'decisionNodeCreated':
          return `decNode:${event.decisionName}`;
        case 'decisionCompleted':
          return `decDone:${event.stepsUsed}`;
        case 'decisionIllegal':
          return `decIllegal:${event.reason}`;
        case 'moveDropped':
          return `dropped:${event.reason}`;
        case 'applyMoveFailure':
          return `fail:${event.phase}`;
        case 'poolExhausted':
          return `poolExhausted:${event.capacity}`;
        case 'searchComplete':
          return `complete:${event.stopReason}`;
        case 'rootCandidates':
          return `candidates:${event.ready.length}`;
      }
      // Exhaustiveness check — if a case is missing, TypeScript flags this.
      const _exhaustive: never = event;
      return _exhaustive;
    }

    const result = handleEvent({
      type: 'searchComplete',
      iterations: 100,
      stopReason: 'confidence',
      elapsedMs: 500,
      bestActionId: 'pass',
      bestVisits: 80,
    });
    assert.equal(result, 'complete:confidence');
  });

  it('visitor with onEvent undefined does not throw', () => {
    const visitor: MctsSearchVisitor = {};
    // onEvent is optional — calling it guarded must not throw
    assert.equal(visitor.onEvent, undefined);
    // Separate reference avoids TS narrowing from the assert above
    const v2: MctsSearchVisitor = {};
    v2.onEvent?.({
      type: 'searchStart',
      totalIterations: 100,
      legalMoveCount: 5,
      readyCount: 3,
      pendingCount: 2,
      poolCapacity: 10_000,
    });
  });

  it('searchComplete stopReason accepts all valid vocabulary', () => {
    const reasons: Array<MctsSearchCompleteEvent['stopReason']> = [
      'confidence',
      'solver',
      'time',
      'iterations',
    ];
    for (const reason of reasons) {
      const event: MctsSearchCompleteEvent = {
        type: 'searchComplete',
        iterations: 100,
        stopReason: reason,
        elapsedMs: 500,
        bestActionId: 'pass',
        bestVisits: 50,
      };
      assert.equal(event.stopReason, reason);
    }
  });

  it('moveDropped reason accepts all valid vocabulary', () => {
    const reasons: Array<MctsMoveDroppedEvent['reason']> = [
      'unsatisfiable',
      'stochasticUnresolved',
      'illegal',
      'classificationError',
    ];
    for (const reason of reasons) {
      const event: MctsMoveDroppedEvent = {
        type: 'moveDropped',
        actionId: 'test',
        reason,
      };
      assert.equal(event.reason, reason);
    }
  });

  it('applyMoveFailure phase accepts all valid vocabulary', () => {
    const phases: Array<MctsApplyMoveFailureEvent['phase']> = [
      'expansion',
      'selection',
      'rollout',
      'forcedSequence',
    ];
    for (const phase of phases) {
      const event: MctsApplyMoveFailureEvent = {
        type: 'applyMoveFailure',
        actionId: 'test',
        phase,
        error: 'test error',
      };
      assert.equal(event.phase, phase);
    }
  });
});
