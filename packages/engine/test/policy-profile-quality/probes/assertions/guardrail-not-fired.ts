import type { ProbeOutcome } from '../probe-types.js';
import { fail, pass, requireSingleMatch, type AssertionContext } from './common.js';

export const evaluateGuardrailNotFired = (context: AssertionContext): ProbeOutcome => {
  const assertion = context.assertion;
  if (assertion.kind !== 'guardrailNotFired') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  const match = requireSingleMatch(context);
  if ('kind' in match) {
    return match;
  }
  const fired = match.trace?.guardrails?.fired.some((entry) => entry.id === assertion.guardrail) ?? false;
  return fired
    ? fail(assertion, `guardrail ${assertion.guardrail} fired`)
    : pass();
};
