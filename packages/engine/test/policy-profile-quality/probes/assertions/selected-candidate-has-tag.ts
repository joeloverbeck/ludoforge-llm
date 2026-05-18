import type { ProbeOutcome } from '../probe-types.js';
import { fail, pass, requireSingleMatch, type AssertionContext } from './common.js';

export const evaluateSelectedCandidateHasTag = (context: AssertionContext): ProbeOutcome => {
  const match = requireSingleMatch(context);
  if ('kind' in match) {
    return match;
  }
  const assertion = context.assertion;
  if (assertion.kind !== 'selectedCandidateHasTag') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  return match.selectedActionTags.includes(assertion.tag)
    ? pass()
    : fail(assertion, `selected candidate lacked tag \`${assertion.tag}\``);
};
