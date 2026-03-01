import type { Diagnostic } from '../kernel/diagnostics.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

export type SeatIdentityContractMode =
  | 'none'
  | 'piece-catalog-only'
  | 'turn-flow-named'
  | 'turn-flow-index-forbidden';

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

  return {
    contract: {
      selectorSeatIds: pieceCatalogSeatIds,
      referenceSeatIds: pieceCatalogSeatIds,
      mode: 'turn-flow-index-forbidden',
    },
    diagnostics: [
      {
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_SEAT_IDENTITY_INDEX_FORBIDDEN,
        path: 'doc.turnOrder.config.turnFlow.eligibility.seats',
        severity: 'error',
        message: 'Index seat ids are not supported for turnFlow.eligibility.seats.',
        suggestion: 'Use canonical named seat ids consistently across turn flow, selectors, and seat references.',
      },
    ],
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
