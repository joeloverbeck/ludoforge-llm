/**
 * Convert engine IDs to human-readable display names.
 * - kebab-case: 'train-us' -> 'Train Us'
 * - camelCase: 'activePlayer' -> 'Active Player'
 * - snake_case: 'total_support' -> 'Total Support'
 * - Numeric suffixes with colon: 'hand:0' -> 'Hand 0'
 * - Plain numbers: '0' -> '0' (player IDs, left as-is)
 */
export function formatIdAsDisplayName(id: string): string {
  const lastColonIndex = id.lastIndexOf(':');
  const hasSuffix = lastColonIndex >= 0;
  const base = hasSuffix ? id.slice(0, lastColonIndex) : id;
  const suffix = hasSuffix ? id.slice(lastColonIndex + 1) : '';

  const formattedBase = formatSegment(base);
  const formattedSuffix = formatSegment(suffix);

  if (formattedBase.length === 0) {
    return formattedSuffix;
  }

  if (formattedSuffix.length === 0) {
    return formattedBase;
  }

  return `${formattedBase} ${formattedSuffix}`;
}

function formatSegment(segment: string): string {
  const normalized = segment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[:_-]+/g, ' ')
    .trim();

  if (normalized.length === 0) {
    return '';
  }

  return normalized
    .split(/\s+/)
    .map((word) => {
      if (/^\d+$/.test(word)) {
        return word;
      }

      if (/^[A-Z0-9]+$/.test(word) && /[A-Z]/.test(word)) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
