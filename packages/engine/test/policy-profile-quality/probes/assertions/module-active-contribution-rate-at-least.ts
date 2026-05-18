import type { PolicyModuleTrace } from '../../../../src/kernel/index.js';
import type { ProbeOutcome } from '../probe-types.js';
import { error, fail, pass, requireEveryOccurrence, type AssertionContext } from './common.js';

export const evaluateModuleActiveContributionRateAtLeast = (context: AssertionContext): ProbeOutcome => {
  const assertion = context.assertion;
  if (assertion.kind !== 'moduleActiveContributionRateAtLeast') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  const occurrenceError = requireEveryOccurrence(context);
  if (occurrenceError !== null) {
    return occurrenceError;
  }
  if (context.matches.length < assertion.windowMinDecisions) {
    return error(`insufficient decisions: ${String(context.matches.length)} < ${String(assertion.windowMinDecisions)}`);
  }

  let activeCount = 0;
  let nonZeroContributionCount = 0;
  for (const match of context.matches) {
    const entry = moduleTraceEntry(match.trace?.modules, assertion.module);
    if (entry === undefined) {
      continue;
    }
    if (entry.traceLabel !== assertion.traceLabel) {
      return fail(
        assertion,
        `module ${assertion.module} traceLabel ${JSON.stringify(entry.traceLabel)} did not match ${JSON.stringify(assertion.traceLabel)}`,
      );
    }
    activeCount += 1;
    if (entry.contribution !== 0) {
      nonZeroContributionCount += 1;
    }
  }

  const activeRate = activeCount / context.matches.length;
  if (activeRate < assertion.minActiveRate) {
    return fail(assertion, `module active rate ${activeRate.toFixed(3)} was < ${assertion.minActiveRate.toFixed(3)}`);
  }
  const nonZeroContributionRate = nonZeroContributionCount / context.matches.length;
  return nonZeroContributionRate >= assertion.minNonZeroContributionRate
    ? pass()
    : fail(
      assertion,
      `module non-zero contribution rate ${nonZeroContributionRate.toFixed(3)} was < ${assertion.minNonZeroContributionRate.toFixed(3)}`,
    );
};

const moduleTraceEntry = (
  modules: PolicyModuleTrace | undefined,
  moduleId: string,
): PolicyModuleTrace['active'][number] | undefined => modules?.active.find((entry) => entry.id === moduleId);
