import type { ProbeOutcome } from '../probe-types.js';
import { error, fail, pass, requireEveryOccurrence, type AssertionContext } from './common.js';

const WARNING_CODE = 'POLICY_PROFILE_QUALITY_GUARDRAIL_FIRES_UNIFORM';

export const evaluateGuardrailFiresUniformAcross = (context: AssertionContext): ProbeOutcome => {
  const assertion = context.assertion;
  if (assertion.kind !== 'guardrailFiresUniformAcross') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  const occurrenceError = requireEveryOccurrence(context);
  if (occurrenceError !== null) {
    return occurrenceError;
  }
  if (context.matches.length < assertion.windowMinDecisions) {
    return error(`insufficient decisions: ${String(context.matches.length)} < ${String(assertion.windowMinDecisions)}`);
  }

  const firedCount = context.matches.filter((match) => (
    match.trace?.guardrails?.fired.some((entry) => entry.id === assertion.guardrail) ?? false
  )).length;
  const fireRate = firedCount / context.matches.length;
  return fireRate >= assertion.threshold
    ? fail(
      assertion,
      `${WARNING_CODE}: guardrail ${assertion.guardrail} fired on ${fireRate.toFixed(3)} of observed decisions`,
    )
    : pass();
};
