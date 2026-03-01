import type { Diagnostic } from '../kernel/diagnostics.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

export type SeatIdentityContractMode =
  | 'none'
  | 'piece-catalog-only'
  | 'turn-flow-named'
  | 'turn-flow-index-raw'
  | 'turn-flow-index-canonicalized'
  | 'incoherent';

export interface SeatIdentityContract {
  readonly selectorSeatIds: readonly string[] | undefined;
  readonly referenceSeatIds: readonly string[] | undefined;
  readonly mode: SeatIdentityContractMode;
}

export interface BuildSeatIdentityContractInput {
  readonly turnFlowSeatIds: readonly string[] | undefined;
  readonly pieceCatalogSeatIds: readonly string[] | undefined;
}

export interface BuildSeatIdentityContractResult {
  readonly contract: SeatIdentityContract;
  readonly diagnostics: readonly Diagnostic[];
}

export function buildSeatIdentityContract(
  input: BuildSeatIdentityContractInput,
): BuildSeatIdentityContractResult {
  const { turnFlowSeatIds, pieceCatalogSeatIds } = input;

  if (turnFlowSeatIds === undefined) {
    if (pieceCatalogSeatIds === undefined) {
      return {
        contract: {
          selectorSeatIds: undefined,
          referenceSeatIds: undefined,
          mode: 'none',
        },
        diagnostics: [],
      };
    }
    return {
      contract: {
        selectorSeatIds: pieceCatalogSeatIds,
        referenceSeatIds: pieceCatalogSeatIds,
        mode: 'piece-catalog-only',
      },
      diagnostics: [],
    };
  }

  if (!isIndexSeatIdentity(turnFlowSeatIds)) {
    return {
      contract: {
        selectorSeatIds: turnFlowSeatIds,
        referenceSeatIds: turnFlowSeatIds,
        mode: 'turn-flow-named',
      },
      diagnostics: [],
    };
  }

  if (pieceCatalogSeatIds === undefined) {
    return {
      contract: {
        selectorSeatIds: turnFlowSeatIds,
        referenceSeatIds: turnFlowSeatIds,
        mode: 'turn-flow-index-raw',
      },
      diagnostics: [],
    };
  }

  if (pieceCatalogSeatIds.length !== turnFlowSeatIds.length) {
    return {
      contract: {
        selectorSeatIds: turnFlowSeatIds,
        referenceSeatIds: turnFlowSeatIds,
        mode: 'incoherent',
      },
      diagnostics: [
        {
          code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_SEAT_IDENTITY_CONTRACT_INCOHERENT,
          path: 'doc.turnOrder.config.turnFlow.eligibility.seats',
          severity: 'error',
          message:
            `Seat identity contract is incoherent: turnFlow.eligibility.seats declares ${turnFlowSeatIds.length} index seats, ` +
            `but piece catalog declares ${pieceCatalogSeatIds.length} named seats.`,
          suggestion:
            'Use matching seat counts for index-seat turn flow, or use named seat ids consistently across turn flow and piece catalog.',
        },
      ],
    };
  }

  return {
    contract: {
      selectorSeatIds: pieceCatalogSeatIds,
      referenceSeatIds: turnFlowSeatIds,
      mode: 'turn-flow-index-canonicalized',
    },
    diagnostics: [],
  };
}

function isIndexSeatIdentity(seatIds: readonly string[]): boolean {
  for (let index = 0; index < seatIds.length; index += 1) {
    if (seatIds[index] !== String(index)) {
      return false;
    }
  }
  return true;
}
