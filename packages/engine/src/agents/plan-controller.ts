import type { Decision } from '../kernel/microturn/types.js';
import type { AgentPolicyCatalog, CompiledPlanTemplate, GameDef } from '../kernel/types.js';
import type { PolicyPlanMicroturnTrace, PolicyPlanTrace } from '../kernel/types-plan-trace.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import {
  commitPlanExecutionState,
  planExecutionKey,
  type PlanExecutionState,
  type PlanExecutionStateStore,
} from './plan-execution.js';

export interface PlanControlledDecision {
  readonly decision: Decision;
  readonly planTrace: PolicyPlanTrace;
}

export interface SelectPlanControlledDecisionInput {
  readonly def: GameDef;
  readonly catalog: AgentPolicyCatalog;
  readonly store: PlanExecutionStateStore;
  readonly turnId: string | number;
  readonly seatId: string;
  readonly legalActions: readonly Decision[];
  readonly primitiveDecision?: Decision;
}

export const selectPlanControlledDecision = (
  input: SelectPlanControlledDecisionInput,
): PlanControlledDecision | undefined => {
  const state = input.store.get(planExecutionKey(input.turnId, input.seatId));
  if (state === undefined || state.selectedTemplate === null) {
    return undefined;
  }
  const template = input.catalog.library.planTemplates?.[state.selectedTemplate];
  if (template === undefined) {
    return undefined;
  }
  const step = template.steps[state.nextStepIndex];
  if (step === undefined) {
    return undefined;
  }

  const exact = input.legalActions.find((decision) => decisionMatchesStep(input.def, decision, template, step, state, false));
  if (exact !== undefined) {
    const trace = microturnTraceFor(input.def, exact, step.label, step.role, 'exact');
    commitPlanExecutionState(input.store, advanceState(state));
    return { decision: exact, planTrace: traceForState(state, template, trace) };
  }

  const reselected = input.legalActions.find((decision) =>
    decisionMatchesStep(input.def, decision, template, step, state, true),
  );
  if (reselected !== undefined) {
    const deviation = `${step.role}.reselected`;
    const trace = microturnTraceFor(input.def, reselected, step.label, step.role, 'reselected', deviation);
    commitPlanExecutionState(input.store, advanceState(state, deviation));
    return { decision: reselected, planTrace: traceForState(state, template, trace) };
  }

  const primitive = input.primitiveDecision;
  if (primitive !== undefined && input.legalActions.includes(primitive)) {
    const reason = 'primitiveConsiderationPolicy';
    const trace = microturnTraceFor(input.def, primitive, step.label, step.role, 'fallback', reason, reason);
    commitPlanExecutionState(input.store, advanceState(state, reason, reason));
    return { decision: primitive, planTrace: traceForState(state, template, trace) };
  }

  const fallback = stableFallbackDecision(input.def, input.legalActions);
  const reason = 'stableFrontierTieBreak';
  const trace = microturnTraceFor(input.def, fallback, step.label, step.role, 'fallback', reason, reason);
  commitPlanExecutionState(input.store, advanceState(state, reason, reason));
  return { decision: fallback, planTrace: traceForState(state, template, trace) };
};

const decisionMatchesStep = (
  def: GameDef,
  decision: Decision,
  template: CompiledPlanTemplate,
  step: CompiledPlanTemplate['steps'][number],
  state: PlanExecutionState,
  allowAnySelectedRoleValue: boolean,
): boolean => {
  if (decision.kind !== step.match.decisionKind) {
    return false;
  }
  if (decision.kind === 'actionSelection') {
    const actionId = String(decision.actionId);
    if (step.match.actionTag !== undefined) {
      return (def.actionTagIndex?.byAction[actionId] ?? []).includes(step.match.actionTag);
    }
    return template.root.actionIds.includes(actionId);
  }
  const binding = state.roleBindings[step.role];
  if (binding === undefined) {
    return allowAnySelectedRoleValue;
  }
  switch (decision.kind) {
    case 'chooseOne':
      return String(decision.value) === binding.selectedId;
    case 'chooseNStep':
      return decision.command === 'confirm'
        ? allowAnySelectedRoleValue
        : decision.value !== undefined && String(decision.value) === binding.selectedId;
    default:
      return allowAnySelectedRoleValue;
  }
};

const traceForState = (
  state: PlanExecutionState,
  template: CompiledPlanTemplate,
  microturn: PolicyPlanMicroturnTrace,
): PolicyPlanTrace => {
  const trace: PolicyPlanTrace = {
    status: 'selected',
    activeDoctrines: [],
    rejectedDoctrines: [],
    roleBindings: Object.values(state.roleBindings)
      .sort((left, right) => compareStable(left.role, right.role))
      .map((binding) => ({
        role: binding.role,
        selectedId: binding.selectedId,
        quality: binding.quality,
        rank: binding.rank,
        components: binding.components,
    })),
    alternatives: [],
    posture: {
      status: template.postureHook === undefined ? 'notConfigured' : 'noPreviewDecision',
      mustViolations: [],
      preferContributions: [],
    },
    microturns: [microturn],
  };
  return {
    ...trace,
    ...(state.selectedTemplate === null ? {} : { selectedTemplate: state.selectedTemplate }),
    ...(state.intent === null ? {} : { selectedIntent: state.intent }),
  };
};

const microturnTraceFor = (
  def: GameDef,
  decision: Decision,
  expectedStep: string | null,
  matchedRole: string | null,
  match: PolicyPlanMicroturnTrace['match'],
  deviation?: string,
  fallbackReason?: string,
): PolicyPlanMicroturnTrace => ({
  expectedStep,
  matchedRole,
  selectedLegalOption: frontierDecisionKey(def, decision),
  match,
  ...(deviation === undefined ? {} : { deviation }),
  ...(fallbackReason === undefined ? {} : { fallbackReason }),
});

const advanceState = (
  state: PlanExecutionState,
  deviation?: string,
  fallbackReason?: string,
): PlanExecutionState => ({
  ...state,
  nextStepIndex: state.nextStepIndex + 1,
  deviations: deviation === undefined ? state.deviations : [...state.deviations, deviation],
  fallbackHistory: fallbackReason === undefined ? state.fallbackHistory : [...state.fallbackHistory, fallbackReason],
});

const stableFallbackDecision = (def: GameDef, legalActions: readonly Decision[]): Decision =>
  [...legalActions].sort((left, right) => compareStable(frontierDecisionKey(def, left), frontierDecisionKey(def, right)))[0]!;

const frontierDecisionKey = (def: GameDef, decision: Decision): string => {
  switch (decision.kind) {
    case 'actionSelection':
      return decision.move === undefined ? String(decision.actionId) : toMoveIdentityKey(def, decision.move);
    case 'chooseOne':
      return `${decision.kind}:${decision.decisionKey}:${JSON.stringify(decision.value)}`;
    case 'chooseNStep':
      return `${decision.kind}:${decision.decisionKey}:${decision.command}:${JSON.stringify(decision.value ?? null)}`;
    case 'stochasticResolve':
      return `${decision.kind}:${decision.decisionKey}:${JSON.stringify(decision.value)}`;
    case 'outcomeGrantResolve':
      return `${decision.kind}:${decision.grantId}`;
    case 'turnRetirement':
      return `${decision.kind}:${decision.retiringTurnId}`;
  }
};

const compareStable = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
