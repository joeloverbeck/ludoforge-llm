export type FreeOperationActionClass =
  | 'pass'
  | 'event'
  | 'operation'
  | 'limitedOperation'
  | 'operationPlusSpecialActivity';

export type FreeOperationBlockCause =
  | 'notFreeOperationMove'
  | 'nonCardDrivenTurnOrder'
  | 'noActiveSeatGrant'
  | 'sequenceLocked'
  | 'actionClassMismatch'
  | 'actionIdMismatch'
  | 'zoneFilterMismatch'
  | 'granted';

export interface FreeOperationBlockExplanation {
  readonly cause: FreeOperationBlockCause;
  readonly activeSeat?: string;
  readonly actionClass?: FreeOperationActionClass;
  readonly actionId?: string;
  readonly matchingGrantIds?: readonly string[];
  readonly sequenceLockBlockingGrantIds?: readonly string[];
}
