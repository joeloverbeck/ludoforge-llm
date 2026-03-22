import type { Move, TrustedExecutableMove, TrustedMoveProvenance } from './types.js';

export function createTrustedExecutableMove(
  move: Move,
  sourceStateHash: bigint,
  provenance: TrustedMoveProvenance,
): TrustedExecutableMove {
  return {
    ...move,
    move,
    sourceStateHash,
    provenance,
  };
}
