import type { ProbeOutcome } from '../probe-types.js';
import { fail, pass, requireSingleMatch, selectedTraceCandidate, type AssertionContext } from './common.js';

export const evaluateSelectedCandidateRankWithinTopK = (context: AssertionContext): ProbeOutcome => {
  const match = requireSingleMatch(context);
  if ('kind' in match) {
    return match;
  }
  const assertion = context.assertion;
  if (assertion.kind !== 'selectedCandidateRankWithinTopK') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  const candidate = selectedTraceCandidate(match);
  if (match.trace === null || candidate === null) {
    return fail(assertion, 'selected candidate trace was unavailable');
  }
  const rank = (match.trace.candidates?.findIndex((entry) => entry.stableMoveKey === candidate.stableMoveKey) ?? -1) + 1;
  return rank > 0 && rank <= assertion.k
    ? pass()
    : fail(assertion, `rank ${String(rank)} exceeded k=${String(assertion.k)}`);
};
