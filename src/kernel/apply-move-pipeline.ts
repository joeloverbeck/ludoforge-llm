import { evalCondition } from './eval-condition.js';
import type { EvalContext } from './eval-context.js';
import { pipelineApplicabilityEvaluationError } from './runtime-error.js';
import type { ActionDef, ConditionAST, EffectAST, GameDef, ActionPipelineDef } from './types.js';

export interface ExecutionPipeline {
  readonly legality: ConditionAST | null;
  readonly costValidation: ConditionAST | null;
  readonly costSpend: readonly EffectAST[];
  readonly resolutionStages: readonly (readonly EffectAST[])[];
  readonly partialMode: 'atomic' | 'partial';
}

export type ActionPipelineDispatch =
  | { readonly kind: 'noneConfigured' }
  | { readonly kind: 'configuredNoMatch' }
  | { readonly kind: 'matched'; readonly profile: ActionPipelineDef };

export const resolveActionPipelineDispatch = (
  def: GameDef,
  action: ActionDef,
  ctx: EvalContext,
): ActionPipelineDispatch => {
  const applicabilityMatches = (profile: ActionPipelineDef): boolean => {
    if (profile.applicability === undefined) {
      return true;
    }
    try {
      return evalCondition(profile.applicability, ctx);
    } catch (error) {
      throw pipelineApplicabilityEvaluationError(action, profile.id, error);
    }
  };

  const candidates = (def.actionPipelines ?? []).filter((profile) => profile.actionId === action.id);
  if (candidates.length === 0) {
    return { kind: 'noneConfigured' };
  }
  const matched = candidates.find(applicabilityMatches);
  if (matched === undefined) {
    return { kind: 'configuredNoMatch' };
  }
  return { kind: 'matched', profile: matched };
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
