export interface ScoredStringCandidate {
  readonly candidate: string;
  readonly distance: number;
}

export const levenshteinDistance = (left: string, right: string): number => {
  const cols = right.length + 1;
  let previousRow: number[] = Array.from({ length: cols }, (_unused, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const currentRow: number[] = new Array<number>(cols).fill(0);
    currentRow[0] = row;

    for (let col = 1; col <= right.length; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      const insertCost = (currentRow[col - 1] ?? Number.POSITIVE_INFINITY) + 1;
      const deleteCost = (previousRow[col] ?? Number.POSITIVE_INFINITY) + 1;
      const replaceCost = (previousRow[col - 1] ?? Number.POSITIVE_INFINITY) + substitutionCost;
      currentRow[col] = Math.min(insertCost, deleteCost, replaceCost);
    }

    previousRow = currentRow;
  }

  return previousRow[right.length] ?? 0;
};

export const compareByDistanceThenLex = (left: ScoredStringCandidate, right: ScoredStringCandidate): number => {
  if (left.distance !== right.distance) {
    return left.distance - right.distance;
  }
  return left.candidate.localeCompare(right.candidate);
};

export const rankByEditDistance = (value: string, candidates: readonly string[]): readonly ScoredStringCandidate[] =>
  candidates
    .map((candidate) => ({
      candidate,
      distance: levenshteinDistance(value, candidate),
    }))
    .sort(compareByDistanceThenLex);
