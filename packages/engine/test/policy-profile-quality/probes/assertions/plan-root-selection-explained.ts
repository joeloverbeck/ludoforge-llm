import type { PolicyPlanTrace } from '../../../../src/kernel/index.js';
import type { ProbeOutcome } from '../probe-types.js';
import { error, fail, pass, requireEveryOccurrence, type AssertionContext } from './common.js';

export const evaluatePlanRootSelectionExplained = (context: AssertionContext): ProbeOutcome => {
  const assertion = context.assertion;
  if (assertion.kind !== 'planRootSelectionExplained') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  const occurrenceError = requireEveryOccurrence(context);
  if (occurrenceError !== null) {
    return occurrenceError;
  }
  if (context.matches.length < assertion.windowMinDecisions) {
    return error(`insufficient decisions: ${String(context.matches.length)} < ${String(assertion.windowMinDecisions)}`);
  }

  const selectedPlanTraces = context.matches
    .map((match) => match.trace?.plan)
    .filter(isSelectedPlanTrace);
  const selectedPlanRate = selectedPlanTraces.length / context.matches.length;
  if (selectedPlanRate < assertion.minPlanSelectedRate) {
    return fail(
      assertion,
      `plan-selected rate ${selectedPlanRate.toFixed(3)} was < minimum ${assertion.minPlanSelectedRate.toFixed(3)}`,
    );
  }

  const alternativeTemplateIds = new Set<string>();
  for (const plan of selectedPlanTraces) {
    if (plan.selectedTemplate !== undefined) {
      alternativeTemplateIds.add(plan.selectedTemplate);
    }
    for (const alternative of plan.alternatives) {
      alternativeTemplateIds.add(alternative.templateId);
    }
    const readyRoles = new Set(
      plan.roleBindingStatuses
        .filter((entry) => entry.status.kind === 'ready')
        .map((entry) => entry.role),
    );
    const missingRole = assertion.requiredReadyRoles.find((role) => !readyRoles.has(role));
    if (missingRole !== undefined) {
      return fail(assertion, `selected plan trace did not expose ready role binding ${missingRole}`);
    }
  }

  return alternativeTemplateIds.size >= assertion.minAlternativeTemplateCount
    ? pass()
    : fail(
      assertion,
      `plan traces exposed ${String(alternativeTemplateIds.size)} template(s), expected at least ${String(assertion.minAlternativeTemplateCount)}`,
    );
};

const isSelectedPlanTrace = (
  plan: PolicyPlanTrace | undefined,
): plan is PolicyPlanTrace & { readonly status: 'selected' } => plan?.status === 'selected';
