import { evalCondition } from './eval-condition.js';
import type { EvalContext } from './eval-context.js';
import type { ActionDef, ConditionAST, EffectAST, GameDef, OperationProfileDef } from './types.js';

export interface OperationExecutionProfile {
  readonly legality: ConditionAST | null;
  readonly costValidation: ConditionAST | null;
  readonly costSpend: readonly EffectAST[];
  readonly resolutionStages: readonly (readonly EffectAST[])[];
  readonly partialMode: 'forbid' | 'allow';
}

export const resolveOperationProfile = (
  def: GameDef,
  action: ActionDef,
  ctx: EvalContext,
): OperationProfileDef | undefined => {
  const candidates = (def.operationProfiles ?? []).filter((profile) => profile.actionId === action.id);
  if (candidates.length <= 1) {
    return candidates[0];
  }
  return candidates.find((profile) => {
    if (profile.applicability === undefined) {
      return false;
    }
    try {
      return evalCondition(profile.applicability, ctx);
    } catch {
      return false;
    }
  });
};

export const toOperationExecutionProfile = (
  action: ActionDef,
  profile: OperationProfileDef,
): OperationExecutionProfile => ({
  legality: profile.legality.when ?? null,
  costValidation: profile.cost.validate ?? null,
  costSpend: profile.cost.spend ?? action.cost,
  resolutionStages: profile.resolution.length > 0
    ? profile.resolution.map((stage) => stage.effects)
    : [action.effects],
  partialMode: profile.partialExecution.mode,
});
