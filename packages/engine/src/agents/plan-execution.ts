import type { ActiveDeciderSeatId, TurnId } from '../kernel/microturn/types.js';
import type { AgentMicroturnDecisionInput } from '../kernel/types.js';

export interface PlanRoleBinding {
  readonly role: string;
  readonly selectedId: string;
  readonly quality: number;
  readonly rank: number;
  readonly components: Readonly<Record<string, number>>;
}

export interface PlanExecutionState {
  readonly selectedTemplate: string | null;
  readonly intent: string | null;
  readonly roleBindings: Readonly<Record<string, PlanRoleBinding>>;
  readonly nextStepIndex: number;
  readonly fallbackHistory: readonly string[];
  readonly deviations: readonly string[];
  readonly turnId: string;
  readonly seatId: string;
}

export type PlanExecutionStateStore = Map<string, PlanExecutionState>;

export const planExecutionKey = (turnId: TurnId | string | number, seatId: ActiveDeciderSeatId | string): string =>
  `${String(turnId)}:${String(seatId)}`;

export const createEmptyPlanExecutionState = (
  turnId: TurnId | string | number,
  seatId: ActiveDeciderSeatId | string,
): PlanExecutionState => ({
  selectedTemplate: null,
  intent: null,
  roleBindings: {},
  nextStepIndex: 0,
  fallbackHistory: [],
  deviations: [],
  turnId: String(turnId),
  seatId: String(seatId),
});

export const beginPlanExecutionTurn = (
  store: PlanExecutionStateStore,
  turnId: TurnId | string | number,
  seatId: ActiveDeciderSeatId | string,
): PlanExecutionState => {
  clearPlanExecutionForSeatOnTurnChange(store, turnId, seatId);
  const key = planExecutionKey(turnId, seatId);
  const existing = store.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = createEmptyPlanExecutionState(turnId, seatId);
  store.set(key, created);
  return created;
};

export const commitPlanExecutionState = (
  store: PlanExecutionStateStore,
  state: PlanExecutionState,
): PlanExecutionState => {
  store.set(planExecutionKey(state.turnId, state.seatId), state);
  return state;
};

export const clearPlanExecutionTurn = (
  store: PlanExecutionStateStore,
  turnId: TurnId | string | number,
  seatId?: ActiveDeciderSeatId | string,
): void => {
  if (seatId !== undefined) {
    store.delete(planExecutionKey(turnId, seatId));
    return;
  }
  const prefix = `${String(turnId)}:`;
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
};

export const clearPlanExecutionForSeatOnTurnChange = (
  store: PlanExecutionStateStore,
  currentTurnId: TurnId | string | number,
  seatId: ActiveDeciderSeatId | string,
): void => {
  const current = String(currentTurnId);
  const suffix = `:${String(seatId)}`;
  for (const [key, state] of [...store.entries()]) {
    if (key.endsWith(suffix) && state.turnId !== current) {
      store.delete(key);
    }
  }
};

export const updatePlanExecutionLifecycle = (
  store: PlanExecutionStateStore,
  input: AgentMicroturnDecisionInput,
): void => {
  if (input.microturn.decisionContext.kind === 'turnRetirement') {
    clearPlanExecutionTurn(store, input.microturn.decisionContext.retiringTurnId);
    return;
  }
  if (input.microturn.seatId === '__chance' || input.microturn.seatId === '__kernel') {
    return;
  }
  if (input.microturn.kind === 'actionSelection') {
    beginPlanExecutionTurn(store, input.microturn.turnId, input.microturn.seatId);
    return;
  }
  clearPlanExecutionForSeatOnTurnChange(store, input.microturn.turnId, input.microturn.seatId);
};

const sortRecord = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));

const canonicalBinding = (binding: PlanRoleBinding): PlanRoleBinding => ({
  role: binding.role,
  selectedId: binding.selectedId,
  quality: binding.quality,
  rank: binding.rank,
  components: sortRecord(binding.components),
});

export const serializePlanExecutionState = (state: PlanExecutionState): string => JSON.stringify({
  selectedTemplate: state.selectedTemplate,
  intent: state.intent,
  roleBindings: sortRecord(
    Object.fromEntries(
      Object.entries(state.roleBindings).map(([role, binding]) => [role, canonicalBinding(binding)]),
    ),
  ),
  nextStepIndex: state.nextStepIndex,
  fallbackHistory: [...state.fallbackHistory],
  deviations: [...state.deviations],
  turnId: state.turnId,
  seatId: state.seatId,
});

export const deserializePlanExecutionState = (serialized: string): PlanExecutionState => {
  const parsed = JSON.parse(serialized) as PlanExecutionState;
  return {
    selectedTemplate: parsed.selectedTemplate,
    intent: parsed.intent,
    roleBindings: sortRecord(
      Object.fromEntries(
        Object.entries(parsed.roleBindings).map(([role, binding]) => [role, canonicalBinding(binding)]),
      ),
    ),
    nextStepIndex: parsed.nextStepIndex,
    fallbackHistory: [...parsed.fallbackHistory],
    deviations: [...parsed.deviations],
    turnId: String(parsed.turnId),
    seatId: String(parsed.seatId),
  };
};
