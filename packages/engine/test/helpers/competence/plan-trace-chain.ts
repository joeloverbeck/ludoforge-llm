import * as assert from 'node:assert/strict';

import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import type {
  Decision,
  GameDef,
  PolicyPlanMicroturnTrace,
  PolicyPlanTrace,
  PolicyPlanTraceRoleBindingStatus,
} from '../../../src/kernel/index.js';
import type { CompoundAvailability } from '../../../src/kernel/microturn/compound-availability-probe.js';
import type { CompetenceRunResult } from './live-frontier-runner.js';

export type ExpectedCompoundAvailability =
  | CompoundAvailability['kind']
  | CompoundAvailability;

export interface ExpectedRoleBinding {
  readonly role: string;
  readonly status: PolicyPlanTraceRoleBindingStatus['kind'];
  readonly selectedId?: string;
  readonly reason?: Extract<PolicyPlanTraceRoleBindingStatus, { readonly kind: 'unavailable' }>['reason'];
}

export interface ExpectedMicroturnMatch {
  readonly expectedStep?: string | null;
  readonly matchedRole?: string | null;
  readonly selectedLegalOption?: string;
  readonly match: PolicyPlanMicroturnTrace['match'];
  readonly fallbackReasonKind?: NonNullable<PolicyPlanMicroturnTrace['fallbackReason']>['kind'];
}

export interface PlanTraceChainExpectation {
  readonly activeDoctrine?: string;
  readonly eligibleTemplate?: string;
  readonly selectedRootStableMoveKey?: string;
  readonly compoundAvailability?: ExpectedCompoundAvailability;
  readonly roleBinding?: ExpectedRoleBinding | readonly ExpectedRoleBinding[];
  readonly microturnMatch?: ExpectedMicroturnMatch | readonly ExpectedMicroturnMatch[];
}

export interface AssertPlanTraceChainInput {
  readonly def: GameDef;
  readonly result: Pick<
    CompetenceRunResult,
    'targetFrontier' | 'selectedDecision' | 'planTrace' | 'microturnTraces'
  >;
  readonly expected: PlanTraceChainExpectation;
}

export const assertPlanTraceChain = (input: AssertPlanTraceChainInput): void => {
  const plan = requireSelectedPlanTrace(input.result.planTrace);

  assertActiveDoctrine(plan, input.expected.activeDoctrine);
  assertEligibleTemplate(plan, input.expected.eligibleTemplate);
  assertSelectedRoot(input.def, input.result, plan, input.expected.selectedRootStableMoveKey);
  assertCompoundAvailability(plan, input.expected);
  assertRoleBindings(plan, input.expected.roleBinding);
  assertMicroturnMatches(microturnsFrom(input.result, plan), input.expected.microturnMatch);
};

const requireSelectedPlanTrace = (plan: PolicyPlanTrace | undefined): PolicyPlanTrace => {
  assert.ok(plan, 'expected policy plan trace to be present');
  assert.equal(plan.status, 'selected', `expected selected plan trace, got ${plan.status}`);
  return plan;
};

const assertActiveDoctrine = (plan: PolicyPlanTrace, activeDoctrine: string | undefined): void => {
  if (activeDoctrine === undefined) {
    return;
  }
  assert.ok(
    plan.activeDoctrines.includes(activeDoctrine),
    `expected active doctrine ${activeDoctrine}; got ${format(plan.activeDoctrines)}`,
  );
};

const assertEligibleTemplate = (plan: PolicyPlanTrace, eligibleTemplate: string | undefined): void => {
  if (eligibleTemplate === undefined) {
    return;
  }
  assert.equal(plan.selectedTemplate, eligibleTemplate);
  assert.equal(
    plan.filteredOutTemplates.some((entry) => entry.templateId === eligibleTemplate),
    false,
    `expected template ${eligibleTemplate} to be eligible, but it was filtered out`,
  );
};

const assertSelectedRoot = (
  def: GameDef,
  result: AssertPlanTraceChainInput['result'],
  plan: PolicyPlanTrace,
  selectedRootStableMoveKey: string | undefined,
): void => {
  assert.ok(plan.selectedRootStableMoveKey, 'expected selected plan trace to include selectedRootStableMoveKey');
  if (selectedRootStableMoveKey !== undefined) {
    assert.equal(plan.selectedRootStableMoveKey, selectedRootStableMoveKey);
  }
  const expectedRoot = plan.selectedRootStableMoveKey;
  assert.equal(decisionStableKey(def, result.selectedDecision), expectedRoot);

  const frontierStableKeys = result.targetFrontier.map((decision) => decisionStableKey(def, decision));
  assert.ok(
    frontierStableKeys.includes(expectedRoot),
    `expected selected root ${expectedRoot} in published frontier; got ${format(frontierStableKeys)}`,
  );
};

const assertCompoundAvailability = (
  plan: PolicyPlanTrace,
  expected: PlanTraceChainExpectation,
): void => {
  if (expected.compoundAvailability === undefined) {
    return;
  }

  const selectedRoot = expected.selectedRootStableMoveKey ?? plan.selectedRootStableMoveKey;
  assert.ok(selectedRoot, 'expected selected root before asserting compound availability');
  const selectedAlternative = plan.alternatives.find((alternative) =>
    alternative.rootStableMoveKey === selectedRoot
    && (expected.eligibleTemplate === undefined || alternative.templateId === expected.eligibleTemplate));
  assert.ok(
    selectedAlternative,
    `expected selected alternative ${selectedRoot} in plan alternatives; got ${format(plan.alternatives.map((alternative) => alternative.rootStableMoveKey))}`,
  );
  assert.ok(
    selectedAlternative.compoundAvailability,
    `expected compound availability for selected alternative ${selectedRoot}`,
  );

  if (typeof expected.compoundAvailability === 'string') {
    assert.equal(selectedAlternative.compoundAvailability.kind, expected.compoundAvailability);
    return;
  }
  assert.deepEqual(selectedAlternative.compoundAvailability, expected.compoundAvailability);
};

const assertRoleBindings = (
  plan: PolicyPlanTrace,
  roleBinding: ExpectedRoleBinding | readonly ExpectedRoleBinding[] | undefined,
): void => {
  for (const expected of asReadonlyArray(roleBinding)) {
    const actual = plan.roleBindingStatuses.find((entry) => entry.role === expected.role);
    assert.ok(
      actual,
      `expected role binding status for ${expected.role}; got ${format(plan.roleBindingStatuses.map((entry) => entry.role))}`,
    );
    assert.equal(actual.status.kind, expected.status, `role binding ${expected.role} status mismatch`);
    if (expected.status === 'ready') {
      assert.equal(actual.status.kind, 'ready');
      if (expected.selectedId !== undefined) {
        assert.equal(actual.status.binding.selectedId, expected.selectedId);
      }
      continue;
    }
    assert.equal(actual.status.kind, 'unavailable');
    if (expected.reason !== undefined) {
      assert.equal(actual.status.reason, expected.reason);
    }
  }
};

const assertMicroturnMatches = (
  microturns: readonly PolicyPlanMicroturnTrace[],
  microturnMatch: ExpectedMicroturnMatch | readonly ExpectedMicroturnMatch[] | undefined,
): void => {
  for (const [index, expected] of asReadonlyArray(microturnMatch).entries()) {
    const actual = microturns.find((candidate, candidateIndex) =>
      microturnMatches(candidate, expected) && candidateIndex >= index);
    assert.ok(
      actual,
      `expected microturn match ${format(expected)}; got ${format(microturns)}`,
    );
    assert.equal(actual.match, expected.match);
    if (expected.fallbackReasonKind !== undefined) {
      assert.equal(
        actual.fallbackReason?.kind,
        expected.fallbackReasonKind,
        `microturn fallbackReason.kind mismatch for ${format(expected)}`,
      );
    }
  }
};

const microturnMatches = (
  actual: PolicyPlanMicroturnTrace,
  expected: ExpectedMicroturnMatch,
): boolean =>
  (expected.expectedStep === undefined || actual.expectedStep === expected.expectedStep)
  && (expected.matchedRole === undefined || actual.matchedRole === expected.matchedRole)
  && (expected.selectedLegalOption === undefined || actual.selectedLegalOption === expected.selectedLegalOption);

const microturnsFrom = (
  result: AssertPlanTraceChainInput['result'],
  plan: PolicyPlanTrace,
): readonly PolicyPlanMicroturnTrace[] =>
  result.microturnTraces.length > 0 ? result.microturnTraces : plan.microturns ?? [];

const decisionStableKey = (def: GameDef, decision: Decision): string => {
  if (decision.kind !== 'actionSelection') {
    return `${decision.kind}:${JSON.stringify(decision)}`;
  }
  return decision.move === undefined ? String(decision.actionId) : toMoveIdentityKey(def, decision.move);
};

const asReadonlyArray = <T>(value: T | readonly T[] | undefined): readonly T[] => {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value as readonly T[] : [value as T];
};

const format = (value: unknown): string => JSON.stringify(value);
