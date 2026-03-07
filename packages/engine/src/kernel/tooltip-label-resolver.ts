/**
 * Shared label resolution for tooltip modules.
 * Centralizes the three-tier label priority:
 *   1. sentencePlans (pre-authored sentences)
 *   2. verbalization labels (display names with singular/plural)
 *   3. auto-humanize fallback (camelCase split, etc.)
 */

import type { VerbalizationDef, VerbalizationLabelEntry } from './verbalization-types.js';
import { humanizeIdentifier, buildAcronymSet } from './tooltip-humanizer.js';

// ---------------------------------------------------------------------------
// Label context
// ---------------------------------------------------------------------------

export interface LabelContext {
  readonly verbalization: VerbalizationDef | undefined;
  readonly acronyms: ReadonlySet<string>;
}

export const buildLabelContext = (
  verbalization: VerbalizationDef | undefined,
): LabelContext => ({
  verbalization,
  acronyms: buildAcronymSet(verbalization),
});

// ---------------------------------------------------------------------------
// Label resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an identifier to a display label.
 * Priority: verbalization.labels -> auto-humanize.
 * For count-sensitive labels, pass `count` to choose singular/plural.
 */
export const resolveLabel = (
  id: string,
  ctx: LabelContext,
  count?: number,
): string => {
  if (ctx.verbalization !== undefined) {
    const entry = ctx.verbalization.labels[id];
    if (entry !== undefined) {
      if (typeof entry === 'string') return entry;
      const labelEntry = entry as VerbalizationLabelEntry;
      return (count !== undefined && count === 1) ? labelEntry.singular : labelEntry.plural;
    }
  }
  return humanizeIdentifier(id, ctx.acronyms);
};

// ---------------------------------------------------------------------------
// Sentence plan resolution
// ---------------------------------------------------------------------------

/**
 * Check sentencePlans for a pre-authored sentence.
 * sentencePlans is structured as: { [pattern]: { [key]: { [value]: sentence } } }
 */
export const resolveSentencePlan = (
  pattern: string,
  key: string,
  value: string,
  ctx: LabelContext,
): string | undefined => {
  if (ctx.verbalization === undefined) return undefined;
  const patternPlans = ctx.verbalization.sentencePlans[pattern];
  if (patternPlans === undefined) return undefined;
  const keyPlans = patternPlans[key];
  if (keyPlans === undefined) return undefined;
  return keyPlans[value];
};
