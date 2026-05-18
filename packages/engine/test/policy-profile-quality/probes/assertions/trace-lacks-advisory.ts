import type { ProbeOutcome } from '../probe-types.js';
import { fail, pass, requireSingleMatch, type AssertionContext } from './common.js';

export const evaluateTraceLacksAdvisory = (context: AssertionContext): ProbeOutcome => {
  const match = requireSingleMatch(context);
  if ('kind' in match) {
    return match;
  }
  const assertion = context.assertion;
  if (assertion.kind !== 'traceLacksAdvisory') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  return match.trace?.advisories?.some((advisory) => advisory.code === assertion.code) === true
    ? fail(assertion, `trace had advisory \`${assertion.code}\`, expected it to be absent`)
    : pass();
};
