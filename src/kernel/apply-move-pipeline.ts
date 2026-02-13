import { evalCondition } from './eval-condition.js';
import type { EvalContext } from './eval-context.js';
import type { ActionDef, ConditionAST, EffectAST, GameDef, ActionPipelineDef } from './types.js';

export interface OperationExecutionProfile {
  readonly legality: ConditionAST | null;
  readonly costValidation: ConditionAST | null;
  readonly costSpend: readonly EffectAST[];
  readonly resolutionStages: readonly (readonly EffectAST[])[];
  readonly partialMode: 'atomic' | 'partial';
}

export const resolveOperationProfile = (
  def: GameDef,
  action: ActionDef,
  ctx: EvalContext,
): ActionPipelineDef | undefined => {
  const candidates = (def.actionPipelines ?? []).filter((profile) => profile.actionId === action.id);
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
  _action: ActionDef,
  profile: ActionPipelineDef,
): OperationExecutionProfile => ({
  legality: profile.legality,
  costValidation: profile.costValidation,
  costSpend: profile.costEffects,
  resolutionStages: profile.stages.length > 0
    ? profile.stages.map((stage) => stage.effects)
    : [_action.effects],
  partialMode: profile.atomicity,
});
