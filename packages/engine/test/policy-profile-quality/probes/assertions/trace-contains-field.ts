import type { ProbeOutcome } from '../probe-types.js';
import { fail, getDottedField, pass, requireSingleMatch, type AssertionContext } from './common.js';

export const evaluateTraceContainsField = (context: AssertionContext): ProbeOutcome => {
  const match = requireSingleMatch(context);
  if ('kind' in match) {
    return match;
  }
  const assertion = context.assertion;
  if (assertion.kind !== 'traceContainsField') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  return getDottedField(match.trace, assertion.field) === undefined
    ? fail(assertion, `trace field \`${assertion.field}\` was absent`)
    : pass();
};
