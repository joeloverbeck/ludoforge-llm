import type { Diagnostic } from '../kernel/diagnostics.js';
export type SeatIdentityContractMode =
  | 'none'
  | 'seat-catalog';

export interface SeatIdentityContract {
  readonly selectorSeatIds: readonly string[] | undefined;
  readonly referenceSeatIds: readonly string[] | undefined;
  readonly mode: SeatIdentityContractMode;
}

export interface BuildSeatIdentityContractInput {
  readonly seatCatalogSeatIds: readonly string[] | undefined;
}

export interface BuildSeatIdentityContractResult {
  readonly contract: SeatIdentityContract;
  readonly diagnostics: readonly Diagnostic[];
}

export function buildSeatIdentityContract(
  input: BuildSeatIdentityContractInput,
): BuildSeatIdentityContractResult {
  const { seatCatalogSeatIds } = input;
  if (seatCatalogSeatIds !== undefined) {
    return {
      contract: {
        selectorSeatIds: seatCatalogSeatIds,
        referenceSeatIds: seatCatalogSeatIds,
        mode: 'seat-catalog',
      },
      diagnostics: [],
    };
  }

  return {
    contract: {
      selectorSeatIds: undefined,
      referenceSeatIds: undefined,
      mode: 'none',
    },
    diagnostics: [],
  };
}
