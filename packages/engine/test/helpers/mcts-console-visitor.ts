/* eslint-disable no-console */
/**
 * Console visitor — logs all MCTS search events with formatting.
 * Useful for local debugging.
 *
 * Test-only — not imported by production source.
 */
import type { MctsSearchEvent, MctsSearchVisitor } from '../../src/agents/index.js';

/**
 * Create a ConsoleVisitor that logs every MctsSearchEvent to console
 * with human-readable formatting.
 */
export function createConsoleVisitor(prefix = '[MCTS]'): MctsSearchVisitor {
  return {
    onEvent(event: MctsSearchEvent): void {
      switch (event.type) {
        case 'searchStart':
          console.log(
            `${prefix} SEARCH START — iterations=${event.totalIterations}, ` +
            `moves=${event.legalMoveCount} (ready=${event.readyCount}, ` +
            `pending=${event.pendingCount}), pool=${event.poolCapacity}`,
          );
          break;
        case 'iterationBatch':
          console.log(
            `${prefix} BATCH ${event.fromIteration}-${event.toIteration} — ` +
            `children=${event.rootChildCount}, nodes=${event.nodesAllocated}, ` +
            `elapsed=${event.elapsedMs}ms`,
          );
          if (event.topChildren.length > 0) {
            console.log(
              `${prefix}   top: ${event.topChildren.map((c) => `${c.actionId}(${c.visits})`).join(', ')}`,
            );
          }
          break;
        case 'expansion':
          console.log(
            `${prefix} EXPAND ${event.actionId} [${event.childIndex}/${event.totalChildren}] ` +
            `key=${String(event.moveKey)}`,
          );
          break;
        case 'decisionNodeCreated':
          console.log(
            `${prefix} DECISION NODE ${event.actionId}.${event.decisionName} — ` +
            `options=${event.optionCount}, depth=${event.decisionDepth}`,
          );
          break;
        case 'decisionCompleted':
          console.log(
            `${prefix} DECISION DONE ${event.actionId} — ` +
            `steps=${event.stepsUsed}, key=${String(event.moveKey)}`,
          );
          break;
        case 'decisionIllegal':
          console.log(
            `${prefix} DECISION ILLEGAL ${event.actionId}.${event.decisionName}: ${event.reason}`,
          );
          break;
        case 'moveDropped':
          console.log(
            `${prefix} MOVE DROPPED ${event.actionId}: ${event.reason}`,
          );
          break;
        case 'applyMoveFailure':
          console.log(
            `${prefix} APPLY FAILURE ${event.actionId} (${event.phase}): ${event.error}`,
          );
          break;
        case 'poolExhausted':
          console.log(
            `${prefix} POOL EXHAUSTED at iteration ${event.iteration} (capacity=${event.capacity})`,
          );
          break;
        case 'searchComplete':
          console.log(
            `${prefix} SEARCH COMPLETE — iterations=${event.iterations}, ` +
            `elapsed=${event.elapsedMs}ms, stop=${event.stopReason}, ` +
            `best=${event.bestActionId}(${event.bestVisits} visits)`,
          );
          break;
        case 'rootCandidates':
          console.log(
            `${prefix} ROOT CANDIDATES — ` +
            `ready=[${event.ready.map((c) => c.actionId).join(', ')}], ` +
            `pending=[${event.pending.map((t) => t.actionId).join(', ')}]`,
          );
          break;
      }
    },
  };
}
