import type { ProbeOutcome } from '../probe-types.js';
import { fail, pass, requireSingleMatch, type AssertionContext } from './common.js';

export const evaluateSelectedCandidateLacksTag = (context: AssertionContext): ProbeOutcome => {
  const match = requireSingleMatch(context);
  if ('kind' in match) {
    return match;
  }
  const assertion = context.assertion;
  if (assertion.kind !== 'selectedCandidateLacksTag') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  return match.selectedActionTags.includes(assertion.tag)
    ? fail(assertion, `selected candidate had tag \`${assertion.tag}\`, expected to lack it`)
    : pass();
};
