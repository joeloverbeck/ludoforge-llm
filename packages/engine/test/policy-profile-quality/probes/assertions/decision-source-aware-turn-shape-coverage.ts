import type { PolicyTurnShapeTrace } from '../../../../src/kernel/index.js';
import type { ProbeOutcome } from '../probe-types.js';
import { error, fail, pass, requireEveryOccurrence, type AssertionContext } from './common.js';

export const evaluateDecisionSourceAwareTurnShapeCoverage = (context: AssertionContext): ProbeOutcome => {
  const assertion = context.assertion;
  if (assertion.kind !== 'decisionSourceAwareTurnShapeCoverage') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  const occurrenceError = requireEveryOccurrence(context);
  if (occurrenceError !== null) {
    return occurrenceError;
  }
  if (context.matches.length < assertion.windowMinDecisions) {
    return error(`insufficient decisions: ${String(context.matches.length)} < ${String(assertion.windowMinDecisions)}`);
  }

  let planRootCount = 0;
  let fallbackTurnShapeCount = 0;
  let observedReady = false;
  let observedTrue = false;
  let observedFalse = false;

  for (const match of context.matches) {
    if (match.trace?.plan?.status === 'selected') {
      planRootCount += 1;
      continue;
    }

    const entry = turnShapeTraceEntry(match.trace?.turnShape, assertion.evaluatorId);
    if (entry === undefined) {
      return fail(assertion, `decision had neither explicit plan-root selection nor turn-shape evaluator ${assertion.evaluatorId}`);
    }
    fallbackTurnShapeCount += 1;
    if (entry.previewStatus === 'ready') {
      observedReady = true;
    }
    if (entry.minimumImpactSatisfied) {
      observedTrue = true;
    } else {
      observedFalse = true;
    }
  }

  if (planRootCount + fallbackTurnShapeCount === 0) {
    return fail(assertion, 'no plan-root or fallback turn-shape decisions observed');
  }
  if (fallbackTurnShapeCount === 0) {
    return pass();
  }
  if (!observedReady) {
    return fail(assertion, `fallback evaluator ${assertion.evaluatorId} was never ready`);
  }
  return observedTrue && observedFalse
    ? pass()
    : fail(assertion, `fallback evaluator ${assertion.evaluatorId} did not observe both true and false minimumImpactSatisfied values`);
};

const turnShapeTraceEntry = (
  turnShape: PolicyTurnShapeTrace | undefined,
  evaluatorId: string,
): PolicyTurnShapeTrace['evaluators'][number] | undefined =>
  turnShape?.evaluators.find((entry) => entry.id === evaluatorId);
