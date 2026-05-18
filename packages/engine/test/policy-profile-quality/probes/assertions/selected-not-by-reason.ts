import type { ProbeOutcome, SelectedByReason } from '../probe-types.js';
import { fail, pass, requireEveryOccurrence, requireSingleMatch, selectedTraceCandidate, type AssertionContext } from './common.js';

export const evaluateSelectedNotByReason = (context: AssertionContext): ProbeOutcome => {
  const assertion = context.assertion;
  if (assertion.kind !== 'selectedNotByReason') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  if (assertion.maxRate !== undefined) {
    const occurrenceError = requireEveryOccurrence(context);
    if (occurrenceError !== null) {
      return occurrenceError;
    }
    const matches = context.matches;
    const count = matches.filter((match) => selectionReason(match) === assertion.reason).length;
    const rate = matches.length === 0 ? 0 : count / matches.length;
    return rate <= assertion.maxRate
      ? pass()
      : fail(assertion, `reason \`${assertion.reason}\` rate ${formatRate(rate)} exceeded maxRate=${formatRate(assertion.maxRate)}`);
  }
  const match = requireSingleMatch(context);
  if ('kind' in match) {
    return match;
  }
  const reason = selectionReason(match);
  return reason === assertion.reason
    ? fail(assertion, `selected candidate used reason \`${assertion.reason}\``)
    : pass();
};

const selectionReason = (match: { readonly trace: NonNullable<AssertionContext['matches'][number]['trace']> | null }): SelectedByReason | null =>
  match.trace?.candidates
    ?.find((candidate) => candidate.stableMoveKey === match.trace?.selectedStableMoveKey)
    ?.selectionReason
    ?? selectedTraceCandidate(match as AssertionContext['matches'][number])?.selectionReason
    ?? null;

const formatRate = (rate: number): string => rate.toFixed(3);
