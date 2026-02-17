import type { PhaseTransitionBudget } from './effect-context.js';

export interface MoveExecutionPolicy {
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
}

export const toMoveExecutionPolicy = (
  phaseTransitionBudget: PhaseTransitionBudget | undefined,
): MoveExecutionPolicy | undefined =>
  phaseTransitionBudget === undefined ? undefined : { phaseTransitionBudget };
