/**
 * Auto-humanizer for programmatic identifiers.
 * Converts camelCase, kebab-case, and $-prefixed identifiers into
 * title-cased display names with optional acronym recognition.
 */

import type { VerbalizationDef } from './verbalization-types.js';

/**
 * Split a camelCase or kebab-case identifier into words.
 * Handles mixed input: strips leading `$`, splits on `-` and camelCase boundaries.
 */
const splitIdentifier = (id: string): readonly string[] => {
  // Strip leading $
  const stripped = id.startsWith('$') ? id.slice(1) : id;
  if (stripped.length === 0) return [];

  // Split on hyphens first, then split each segment on camelCase boundaries
  return stripped
    .split('-')
    .flatMap((segment) =>
      segment
        // Insert boundary before uppercase letters that follow lowercase
        .replace(/([a-z])([A-Z])/g, '$1\0$2')
        // Insert boundary before uppercase letter followed by lowercase (for runs like "NVATroops")
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1\0$2')
        .split('\0'),
    )
    .filter((w) => w.length > 0);
};

/**
 * Title-case a single word: first letter uppercase, rest lowercase.
 */
const titleCase = (word: string): string =>
  word.length === 0 ? '' : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/**
 * Convert a programmatic identifier into a human-readable display name.
 *
 * @param id - The programmatic identifier (e.g. `usTroops`, `available-us`, `$player`)
 * @param acronyms - Optional set of known acronyms (uppercase). If a word matches, it uses the acronym form.
 * @returns Title-cased display name (e.g. `US Troops`, `Available US`, `Player`)
 */
export const humanizeIdentifier = (
  id: string,
  acronyms?: ReadonlySet<string>,
): string => {
  const words = splitIdentifier(id);
  if (words.length === 0) return '';

  return words
    .map((word) => {
      if (acronyms !== undefined) {
        const upper = word.toUpperCase();
        if (acronyms.has(upper)) return upper;
      }
      return titleCase(word);
    })
    .join(' ');
};

/**
 * Build an acronym set from VerbalizationDef labels.
 * Extracts tokens that are 2+ characters and all uppercase from label values.
 */
export const buildAcronymSet = (
  verbalization: VerbalizationDef | undefined,
): ReadonlySet<string> => {
  if (verbalization === undefined) return new Set();

  const acronyms = new Set<string>();

  for (const value of Object.values(verbalization.labels)) {
    const text = typeof value === 'string' ? value : `${value.singular} ${value.plural}`;
    // Create regex per iteration to avoid stale lastIndex from /g flag
    const allCapsToken = /\b[A-Z]{2,}\b/g;
    let match: RegExpExecArray | null;
    while ((match = allCapsToken.exec(text)) !== null) {
      acronyms.add(match[0]);
    }
  }

  return acronyms;
};
