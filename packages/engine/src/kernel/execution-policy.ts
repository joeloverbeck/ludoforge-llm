import type { ExecutionOptions } from './types.js';
import type { PhaseTransitionBudget } from './effect-context.js';

export interface MoveExecutionPolicy {
  readonly phaseTransitionBudget?: PhaseTransitionBudget;
  readonly verifyCompiledEffects?: boolean;
}

export const toMoveExecutionPolicy = (
  options: Pick<ExecutionOptions, 'verifyCompiledEffects'> | undefined,
  phaseTransitionBudget: PhaseTransitionBudget | undefined,
): MoveExecutionPolicy | undefined =>
  phaseTransitionBudget === undefined && options?.verifyCompiledEffects !== true
    ? undefined
    : {
      ...(phaseTransitionBudget === undefined ? {} : { phaseTransitionBudget }),
      ...(options?.verifyCompiledEffects === true ? { verifyCompiledEffects: true } : {}),
    };
