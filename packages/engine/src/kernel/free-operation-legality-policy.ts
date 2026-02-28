import type { FreeOperationBlockCause } from './free-operation-denial-contract.js';

export type FreeOperationDeniedCauseForLegality = Exclude<
  FreeOperationBlockCause,
  'granted' | 'nonCardDrivenTurnOrder' | 'notFreeOperationMove'
>;

export const toFreeOperationDeniedCauseForLegality = (
  cause: FreeOperationBlockCause,
): FreeOperationDeniedCauseForLegality | null => {
  switch (cause) {
    case 'noActiveSeatGrant':
    case 'sequenceLocked':
    case 'actionClassMismatch':
    case 'actionIdMismatch':
    case 'zoneFilterMismatch':
      return cause;
    case 'granted':
    case 'nonCardDrivenTurnOrder':
    case 'notFreeOperationMove':
      return null;
    default: {
      const unreachable: never = cause;
      return unreachable;
    }
  }
};

export const toFreeOperationChoiceIllegalReason = (
  cause: FreeOperationDeniedCauseForLegality,
): 'freeOperationNoActiveSeatGrant'
  | 'freeOperationSequenceLocked'
  | 'freeOperationActionClassMismatch'
  | 'freeOperationActionIdMismatch'
  | 'freeOperationZoneFilterMismatch' => {
  switch (cause) {
    case 'noActiveSeatGrant':
      return 'freeOperationNoActiveSeatGrant';
    case 'sequenceLocked':
      return 'freeOperationSequenceLocked';
    case 'actionClassMismatch':
      return 'freeOperationActionClassMismatch';
    case 'actionIdMismatch':
      return 'freeOperationActionIdMismatch';
    case 'zoneFilterMismatch':
      return 'freeOperationZoneFilterMismatch';
    default: {
      const unreachable: never = cause;
      return unreachable;
    }
  }
};
