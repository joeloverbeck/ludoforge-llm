import type { ProbeOutcome } from '../probe-types.js';
import { error, fail, pass, requireEveryOccurrence, type AssertionContext } from './common.js';

export const evaluatePublishedFrontierConstructible = (context: AssertionContext): ProbeOutcome => {
  const assertion = context.assertion;
  if (assertion.kind !== 'publishedFrontierConstructible') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  const occurrenceError = requireEveryOccurrence(context);
  if (occurrenceError !== null) {
    return occurrenceError;
  }

  const missing = context.matches.find((match) => match.publishedFrontierConstructibility === undefined);
  if (missing !== undefined) {
    return error(`match for seed ${String(missing.seed)} did not record published frontier constructibility`);
  }

  const failed = context.matches.find((match) =>
    (match.publishedFrontierConstructibility?.failures.length ?? 0) > 0
  );
  if (failed === undefined) {
    return pass();
  }

  const failure = failed.publishedFrontierConstructibility!.failures[0]!;
  return fail(
    assertion,
    `published decision ${String(failure.index)} (${failure.decisionKind}) for seed ${String(failed.seed)} was not constructible: ${failure.reason}`,
  );
};
