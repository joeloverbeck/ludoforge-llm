import { getActionPipelinesForAction } from './action-pipeline-lookup.js';
import { evalCondition } from './eval-condition.js';
import { unwrapEvalCondition } from './eval-result.js';
import type { ReadContext } from './eval-context.js';
import { pipelineApplicabilityEvaluationError } from './runtime-error.js';
import type { ActionDef, ActionPipelineDef, ActionResolutionStageDef, ConditionAST, EffectAST, GameDef } from './types.js';

export interface ExecutionPipeline {
  readonly profileId: string;
  readonly legality: ConditionAST | null;
  readonly costValidation: ConditionAST | null;
  readonly costSpend: readonly EffectAST[];
  readonly resolutionStages: readonly ActionResolutionStageDef[];
  readonly partialMode: 'atomic' | 'partial';
}

export type ActionPipelineDispatch =
  | { readonly kind: 'noneConfigured' }
  | { readonly kind: 'configuredNoMatch' }
  | { readonly kind: 'matched'; readonly profile: ActionPipelineDef };

export const resolveActionPipelineDispatch = (
  def: GameDef,
  action: ActionDef,
  ctx: ReadContext,
): ActionPipelineDispatch => {
  const applicabilityMatches = (profile: ActionPipelineDef): boolean => {
    if (profile.applicability === undefined) {
      return true;
    }
    try {
      return unwrapEvalCondition(evalCondition(profile.applicability, ctx));
    } catch (error) {
      throw pipelineApplicabilityEvaluationError(action, profile.id, error);
    }
  };

  const candidates = getActionPipelinesForAction(def, action.id);
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
  profileId: profile.id,
  legality: profile.legality,
  costValidation: profile.costValidation,
  costSpend: profile.costEffects,
  resolutionStages: profile.stages.length > 0
    ? profile.stages
    : [{ legality: null, costValidation: null, effects: _action.effects }],
  partialMode: profile.atomicity,
});
