import type { TurnFlowActionClass } from './types-turn-flow.js';

export type FreeOperationBlockCause =
  | 'notFreeOperationMove'
  | 'nonCardDrivenTurnOrder'
  | 'noActiveSeatGrant'
  | 'sequenceLocked'
  | 'actionClassMismatch'
  | 'actionIdMismatch'
  | 'sequenceContextMismatch'
  | 'zoneFilterMismatch'
  | 'ambiguousOverlap'
  | 'granted';

export interface FreeOperationBlockExplanation {
  readonly cause: FreeOperationBlockCause;
  readonly activeSeat?: string;
  readonly actionClass?: TurnFlowActionClass;
  readonly actionId?: string;
  readonly matchingGrantIds?: readonly string[];
  readonly sequenceLockBlockingGrantIds?: readonly string[];
  readonly sequenceContextMismatchGrantIds?: readonly string[];
  readonly ambiguousGrantIds?: readonly string[];
}
