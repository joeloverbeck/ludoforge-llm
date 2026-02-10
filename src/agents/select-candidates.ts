import { nextInt } from '../kernel/prng.js';
import type { Move, Rng } from '../kernel/types.js';

export const selectCandidatesDeterministically = (
  legalMoves: readonly Move[],
  rng: Rng,
  maxMovesToEvaluate: number | undefined,
): { readonly moves: readonly Move[]; readonly rng: Rng } => {
  if (maxMovesToEvaluate === undefined || maxMovesToEvaluate >= legalMoves.length) {
    return { moves: legalMoves, rng };
  }

  const remainingIndices = legalMoves.map((_, index) => index);
  const selectedMoves: Move[] = [];
  let cursor = rng;

  for (let pick = 0; pick < maxMovesToEvaluate; pick += 1) {
    const [selectedIndex, nextRng] = nextInt(cursor, 0, remainingIndices.length - 1);
    cursor = nextRng;

    const legalMoveIndex = remainingIndices.splice(selectedIndex, 1)[0];
    if (legalMoveIndex === undefined) {
      throw new Error(`Candidate selection produced invalid index ${selectedIndex}`);
    }

    const move = legalMoves[legalMoveIndex];
    if (move === undefined) {
      throw new Error(`Candidate selection chose out-of-range move index ${legalMoveIndex}`);
    }
    selectedMoves.push(move);
  }

  return { moves: selectedMoves, rng: cursor };
};

