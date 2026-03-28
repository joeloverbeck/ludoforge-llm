import {
  createGameDefRuntime,
  findFirstDecisionNode,
  type GameDef,
  type GameDefRuntime,
  type GameState,
} from '../../src/kernel/index.js';
import {
  buildDeterministicFitlStateCorpus,
  compileFitlValidatedGameDef,
} from './compiled-condition-production-helpers.js';

export interface FirstDecisionCoverageSummary {
  readonly compiledActions: number;
  readonly totalActionsWithDecisions: number;
  readonly compiledPipelines: number;
  readonly totalPipelineProfilesWithDecisions: number;
}

export {
  buildDeterministicFitlStateCorpus,
  compileFitlValidatedGameDef,
};

export const summarizeFirstDecisionCoverage = (def: GameDef): FirstDecisionCoverageSummary => {
  const runtime = createGameDefRuntime(def);

  const totalActionsWithDecisions = def.actions.filter((action) => findFirstDecisionNode(action.effects) !== null).length;
  const totalPipelineProfilesWithDecisions = (def.actionPipelines ?? []).filter((pipeline) =>
    pipeline.stages.some((stage) => findFirstDecisionNode(stage.effects) !== null)).length;

  const compiledActions = [...runtime.firstDecisionDomains.byActionId.values()]
    .filter((result) => result.compilable)
    .length;
  const compiledPipelines = [...runtime.firstDecisionDomains.byPipelineProfileId.values()]
    .filter((result) => result.compilable)
    .length;

  return {
    compiledActions,
    totalActionsWithDecisions,
    compiledPipelines,
    totalPipelineProfilesWithDecisions,
  };
};

export const createRuntimeWithDisabledFirstDecisionGuards = (
  runtime: GameDefRuntime,
): GameDefRuntime => ({
  ...runtime,
  firstDecisionDomains: {
    byActionId: new Map(),
    byPipelineProfileId: new Map(),
  },
});

export const buildFitlFirstDecisionParityFixture = (): {
  readonly def: GameDef;
  readonly runtime: GameDefRuntime;
  readonly runtimeWithDisabledGuards: GameDefRuntime;
  readonly stateCorpus: readonly GameState[];
  readonly coverage: FirstDecisionCoverageSummary;
} => {
  const def = compileFitlValidatedGameDef();
  const runtime = createGameDefRuntime(def);
  return {
    def,
    runtime,
    runtimeWithDisabledGuards: createRuntimeWithDisabledFirstDecisionGuards(runtime),
    stateCorpus: buildDeterministicFitlStateCorpus(def),
    coverage: summarizeFirstDecisionCoverage(def),
  };
};
