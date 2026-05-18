import type { ProbeOutcome } from '../probe-types.js';
import { fail, pass, requireSingleMatch, type AssertionContext } from './common.js';

export const evaluateTraceHasAdvisory = (context: AssertionContext): ProbeOutcome => {
  const match = requireSingleMatch(context);
  if ('kind' in match) {
    return match;
  }
  const assertion = context.assertion;
  if (assertion.kind !== 'traceHasAdvisory') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  return match.trace?.advisories?.some((advisory) => advisory.code === assertion.code) === true
    ? pass()
    : fail(assertion, `trace lacked advisory \`${assertion.code}\``);
};
