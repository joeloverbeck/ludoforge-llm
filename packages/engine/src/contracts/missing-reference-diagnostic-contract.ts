export interface MissingReferenceSuggestion {
  readonly suggestion: string;
  readonly alternatives?: readonly string[];
}

const MAX_ALTERNATIVE_DISTANCE = 3;

const levenshteinDistance = (left: string, right: string): number => {
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

export const findReferenceAlternatives = (
  value: string,
  validValues: readonly string[],
): readonly string[] => {
  if (validValues.length === 0) {
    return [];
  }

  const scored = validValues
    .map((candidate) => ({
      candidate,
      distance: levenshteinDistance(value, candidate),
    }))
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      return left.candidate.localeCompare(right.candidate);
    });

  const bestDistance = scored[0]?.distance;
  if (bestDistance === undefined || bestDistance > MAX_ALTERNATIVE_DISTANCE) {
    return [];
  }

  return scored.filter((entry) => entry.distance === bestDistance).map((entry) => entry.candidate);
};

export const buildMissingReferenceSuggestion = (
  value: string,
  validValues: readonly string[],
  fallbackSuggestion: string,
): MissingReferenceSuggestion => {
  const alternatives = findReferenceAlternatives(value, validValues);
  if (alternatives.length > 0) {
    return {
      suggestion: `Did you mean "${alternatives[0]}"?`,
      alternatives,
    };
  }
  return { suggestion: fallbackSuggestion };
};

