import type { ProbeOutcome } from '../probe-types.js';
import { error, fail, pass, requireEveryOccurrence, type AssertionContext } from './common.js';

export const evaluateActionFamilyDistributionBelow = (context: AssertionContext): ProbeOutcome => {
  const assertion = context.assertion;
  if (assertion.kind !== 'actionFamilyDistributionBelow') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  const occurrenceError = requireEveryOccurrence(context);
  if (occurrenceError !== null) {
    return occurrenceError;
  }
  if (context.matches.length < assertion.windowMinDecisions) {
    return error(`insufficient decisions: ${String(context.matches.length)} < ${String(assertion.windowMinDecisions)}`);
  }
  const family = assertion.family;
  const rate = family === 'any'
    ? dominantFamilyRate(context.matches.map((match) => match.selectedActionTags))
    : context.matches.filter((match) => match.selectedActionTags.some((tag) => family.tags.includes(tag))).length / context.matches.length;
  return rate < assertion.threshold
    ? pass()
    : fail(assertion, `action family rate ${rate.toFixed(3)} was >= threshold=${assertion.threshold.toFixed(3)}`);
};

const dominantFamilyRate = (tagSets: readonly (readonly string[])[]): number => {
  const counts = new Map<string, number>();
  for (const tags of tagSets) {
    const key = [...tags].sort().join('|');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dominant = Math.max(0, ...counts.values());
  return tagSets.length === 0 ? 0 : dominant / tagSets.length;
};
