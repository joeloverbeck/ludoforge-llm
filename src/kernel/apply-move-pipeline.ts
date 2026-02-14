import { evalCondition } from './eval-condition.js';
import type { EvalContext } from './eval-context.js';
import type { ActionDef, ConditionAST, EffectAST, GameDef, ActionPipelineDef } from './types.js';

export interface ExecutionPipeline {
  readonly legality: ConditionAST | null;
  readonly costValidation: ConditionAST | null;
  readonly costSpend: readonly EffectAST[];
  readonly resolutionStages: readonly (readonly EffectAST[])[];
  readonly partialMode: 'atomic' | 'partial';
}

export const resolveActionPipeline = (
  def: GameDef,
  action: ActionDef,
  ctx: EvalContext,
): ActionPipelineDef | undefined => {
  const applicabilityMatches = (profile: ActionPipelineDef): boolean => {
    if (profile.applicability === undefined) {
      return true;
    }
    try {
      return evalCondition(profile.applicability, ctx);
    } catch {
      return false;
    }
  };

  const candidates = (def.actionPipelines ?? []).filter((profile) => profile.actionId === action.id);
  if (candidates.length === 0) {
    return undefined;
  }
  if (candidates.length === 1) {
    const onlyCandidate = candidates[0];
    return onlyCandidate !== undefined && applicabilityMatches(onlyCandidate) ? onlyCandidate : undefined;
  }
  return candidates.find(applicabilityMatches);
};

export const toExecutionPipeline = (
  _action: ActionDef,
  profile: ActionPipelineDef,
): ExecutionPipeline => ({
  legality: profile.legality,
  costValidation: profile.costValidation,
  costSpend: profile.costEffects,
  resolutionStages: profile.stages.length > 0
    ? profile.stages.map((stage) => stage.effects)
    : [_action.effects],
  partialMode: profile.atomicity,
});
