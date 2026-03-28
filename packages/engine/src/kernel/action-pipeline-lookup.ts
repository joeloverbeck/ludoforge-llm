import type { ActionId } from './branded.js';
import type { ActionPipelineDef, GameDef } from './types.js';

export interface ActionPipelineLookup {
  readonly byActionId: ReadonlyMap<ActionId, readonly ActionPipelineDef[]>;
}

const EMPTY_ACTION_PIPELINE_LOOKUP: ActionPipelineLookup = {
  byActionId: new Map(),
};

const actionPipelineLookupCache = new WeakMap<readonly ActionPipelineDef[], ActionPipelineLookup>();

const buildActionPipelineLookup = (def: GameDef): ActionPipelineLookup => {
  const pipelines = def.actionPipelines;
  if (pipelines === undefined || pipelines.length === 0) {
    return EMPTY_ACTION_PIPELINE_LOOKUP;
  }

  const byActionId = new Map<ActionId, ActionPipelineDef[]>();
  for (const pipeline of pipelines) {
    let profiles = byActionId.get(pipeline.actionId);
    if (profiles === undefined) {
      profiles = [];
      byActionId.set(pipeline.actionId, profiles);
    }
    profiles.push(pipeline);
  }

  return { byActionId };
};

export const getActionPipelineLookup = (def: GameDef): ActionPipelineLookup => {
  const pipelines = def.actionPipelines;
  if (pipelines === undefined || pipelines.length === 0) {
    return EMPTY_ACTION_PIPELINE_LOOKUP;
  }

  let cached = actionPipelineLookupCache.get(pipelines);
  if (cached === undefined) {
    cached = buildActionPipelineLookup(def);
    actionPipelineLookupCache.set(pipelines, cached);
  }
  return cached;
};

export const getActionPipelinesForAction = (
  def: GameDef,
  actionId: ActionId,
): readonly ActionPipelineDef[] => getActionPipelineLookup(def).byActionId.get(actionId) ?? [];

export const hasActionPipeline = (def: GameDef, actionId: ActionId): boolean =>
  getActionPipelinesForAction(def, actionId).length > 0;
