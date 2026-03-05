import { rankByEditDistance } from './edit-distance-contract.js';

export interface MissingReferenceSuggestion {
  readonly suggestion: string;
  readonly alternatives?: readonly string[];
}

const MAX_ALTERNATIVE_DISTANCE = 3;

export const findReferenceAlternatives = (
  value: string,
  validValues: readonly string[],
): readonly string[] => {
  if (validValues.length === 0) {
    return [];
  }

  const scored = rankByEditDistance(value, validValues);

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
