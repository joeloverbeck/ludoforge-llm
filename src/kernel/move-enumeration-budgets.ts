export interface MoveEnumerationBudgets {
  readonly maxTemplates: number;
  readonly maxParamExpansions: number;
  readonly maxDecisionProbeSteps: number;
  readonly maxDeferredPredicates: number;
}

export const DEFAULT_MOVE_ENUMERATION_BUDGETS: MoveEnumerationBudgets = {
  maxTemplates: 10_000,
  maxParamExpansions: 100_000,
  maxDecisionProbeSteps: 128,
  maxDeferredPredicates: 1_024,
};

const asBudget = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;

export const resolveMoveEnumerationBudgets = (
  override?: Partial<MoveEnumerationBudgets>,
): MoveEnumerationBudgets => ({
  maxTemplates: asBudget(override?.maxTemplates, DEFAULT_MOVE_ENUMERATION_BUDGETS.maxTemplates),
  maxParamExpansions: asBudget(override?.maxParamExpansions, DEFAULT_MOVE_ENUMERATION_BUDGETS.maxParamExpansions),
  maxDecisionProbeSteps: asBudget(override?.maxDecisionProbeSteps, DEFAULT_MOVE_ENUMERATION_BUDGETS.maxDecisionProbeSteps),
  maxDeferredPredicates: asBudget(override?.maxDeferredPredicates, DEFAULT_MOVE_ENUMERATION_BUDGETS.maxDeferredPredicates),
});
