import type { MoveKey } from './move-key.js';

/** Discriminated union of all MCTS search events. */
export type MctsSearchEvent =
  | MctsSearchStartEvent
  | MctsIterationBatchEvent
  | MctsExpansionEvent
  | MctsDecisionNodeCreatedEvent
  | MctsDecisionCompletedEvent
  | MctsDecisionIllegalEvent
  | MctsMoveDroppedEvent
  | MctsApplyMoveFailureEvent
  | MctsPoolExhaustedEvent
  | MctsSearchCompleteEvent
  | MctsRootCandidatesEvent;

/**
 * Emitted once at the start of a search.
 * Provides the full context of the search configuration.
 */
export interface MctsSearchStartEvent {
  readonly type: 'searchStart';
  readonly totalIterations: number;
  readonly legalMoveCount: number;
  readonly readyCount: number;
  readonly pendingCount: number;
  readonly poolCapacity: number;
}

/**
 * Emitted periodically as a batch summary of completed iterations.
 * Replaces per-iteration events to avoid hot-loop overhead.
 * Recommended batch size: every 50 iterations or every 250ms, whichever comes first.
 */
export interface MctsIterationBatchEvent {
  readonly type: 'iterationBatch';
  readonly fromIteration: number;
  readonly toIteration: number;
  readonly rootChildCount: number;
  readonly elapsedMs: number;
  readonly nodesAllocated: number;
  readonly topChildren: readonly { readonly actionId: string; readonly visits: number }[];
}

export interface MctsExpansionEvent {
  readonly type: 'expansion';
  readonly actionId: string;
  readonly moveKey: MoveKey;
  readonly childIndex: number;
  readonly totalChildren: number;
}

export interface MctsDecisionNodeCreatedEvent {
  readonly type: 'decisionNodeCreated';
  readonly actionId: string;
  readonly decisionName: string;
  readonly optionCount: number;
  readonly decisionDepth: number;
}

export interface MctsDecisionCompletedEvent {
  readonly type: 'decisionCompleted';
  readonly actionId: string;
  readonly stepsUsed: number;
  readonly moveKey: MoveKey;
}

export interface MctsDecisionIllegalEvent {
  readonly type: 'decisionIllegal';
  readonly actionId: string;
  readonly decisionName: string;
  readonly reason: string;
}

/**
 * Emitted when a move is dropped during classification
 * before it can enter the search tree.
 */
export interface MctsMoveDroppedEvent {
  readonly type: 'moveDropped';
  readonly actionId: string;
  readonly reason: 'unsatisfiable' | 'stochasticUnresolved' | 'illegal' | 'classificationError';
}

export interface MctsApplyMoveFailureEvent {
  readonly type: 'applyMoveFailure';
  readonly actionId: string;
  readonly phase: 'expansion' | 'selection' | 'rollout' | 'forcedSequence';
  readonly error: string;
}

export interface MctsPoolExhaustedEvent {
  readonly type: 'poolExhausted';
  readonly capacity: number;
  readonly iteration: number;
}

export interface MctsSearchCompleteEvent {
  readonly type: 'searchComplete';
  readonly iterations: number;
  readonly stopReason: 'confidence' | 'solver' | 'time' | 'iterations';
  readonly elapsedMs: number;
  readonly bestActionId: string;
  readonly bestVisits: number;
}

export interface MctsRootCandidatesEvent {
  readonly type: 'rootCandidates';
  readonly ready: readonly { readonly actionId: string; readonly moveKey: MoveKey }[];
  readonly pending: readonly { readonly actionId: string }[];
}

/**
 * Callback interface for MCTS search observation.
 *
 * All methods are optional. Implement only the events you care about.
 * All methods must be synchronous and cheap -- the search hot loop
 * does not await them.
 */
export interface MctsSearchVisitor {
  readonly onEvent?: (event: MctsSearchEvent) => void;
}
