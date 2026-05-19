import type { PolicyTurnShapeTrace } from '../../../../src/kernel/index.js';
import type { ProbeOutcome } from '../probe-types.js';
import { error, fail, pass, requireEveryOccurrence, type AssertionContext } from './common.js';

export const evaluateTurnShapeMinimumImpactObserved = (context: AssertionContext): ProbeOutcome => {
  const assertion = context.assertion;
  if (assertion.kind !== 'turnShapeMinimumImpactObservedBoth') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  const occurrenceError = requireEveryOccurrence(context);
  if (occurrenceError !== null) {
    return occurrenceError;
  }
  if (context.matches.length < assertion.windowMinDecisions) {
    return error(`insufficient decisions: ${String(context.matches.length)} < ${String(assertion.windowMinDecisions)}`);
  }

  let observedTrue = false;
  let observedFalse = false;
  let observedReady = false;
  for (const match of context.matches) {
    const entry = turnShapeTraceEntry(match.trace?.turnShape, assertion.evaluatorId);
    if (entry === undefined) {
      continue;
    }
    if (entry.previewStatus === 'ready') {
      observedReady = true;
    }
    if (entry.minimumImpactSatisfied) {
      observedTrue = true;
    } else {
      observedFalse = true;
    }
  }

  if (!observedReady) {
    return fail(assertion, `turn-shape evaluator ${assertion.evaluatorId} was never ready`);
  }
  return observedTrue && observedFalse
    ? pass()
    : fail(
      assertion,
      `turn-shape evaluator ${assertion.evaluatorId} did not observe both true and false minimumImpactSatisfied values`,
    );
};

const turnShapeTraceEntry = (
  turnShape: PolicyTurnShapeTrace | undefined,
  evaluatorId: string,
): PolicyTurnShapeTrace['evaluators'][number] | undefined =>
  turnShape?.evaluators.find((entry) => entry.id === evaluatorId);
