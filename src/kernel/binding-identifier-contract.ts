const DEFAULT_ALTERNATIVE_LIMIT = 5;

export const isCanonicalSelectorBindingIdentifier = (value: string): boolean => /^\$.+/.test(value);

export const hasBindingIdentifier = (name: string, scope: ReadonlySet<string> | readonly string[]): boolean => {
  for (const candidate of scope) {
    if (candidate === name) {
      return true;
    }
  }
  return false;
};

export const rankBindingIdentifierAlternatives = (
  name: string,
  inScope: readonly string[],
  limit = DEFAULT_ALTERNATIVE_LIMIT,
): readonly string[] =>
  [...new Set(inScope)]
    .sort((left, right) => {
      const leftDistance = levenshteinDistance(name, left);
      const rightDistance = levenshteinDistance(name, right);
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return left.localeCompare(right);
    })
    .slice(0, limit);

function levenshteinDistance(left: string, right: string): number {
  const width = right.length + 1;
  const dp = new Array<number>((left.length + 1) * width);
  for (let row = 0; row <= left.length; row += 1) {
    dp[row * width] = row;
  }
  for (let col = 0; col <= right.length; col += 1) {
    dp[col] = col;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let col = 1; col <= right.length; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      const offset = row * width + col;
      const insertion = (dp[offset - 1] ?? Number.MAX_SAFE_INTEGER) + 1;
      const deletion = (dp[offset - width] ?? Number.MAX_SAFE_INTEGER) + 1;
      const substitution = (dp[offset - width - 1] ?? Number.MAX_SAFE_INTEGER) + substitutionCost;
      dp[offset] = Math.min(insertion, deletion, substitution);
    }
  }

  return dp[left.length * width + right.length] ?? Number.MAX_SAFE_INTEGER;
}
