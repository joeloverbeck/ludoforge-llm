export const CONDITION_SURFACE_SUFFIX = {
  valueExprIfWhen: 'if.when',
  querySpaceFilterCondition: 'spaceFilter.condition',
  queryVia: 'via',
  queryWhere: 'where',
  queryFilterCondition: 'filter.condition',
  effectMoveAllFilter: 'moveAll.filter',
  effectIfWhen: 'if.when',
  effectGrantFreeOperationZoneFilter: 'grantFreeOperation.zoneFilter',
  actionPipelineApplicability: 'applicability',
  actionPipelineLegality: 'legality',
  actionPipelineCostValidation: 'costValidation',
  actionPipelineTargetingFilter: 'targeting.filter',
} as const;

export type ConditionSurfaceSuffix = (typeof CONDITION_SURFACE_SUFFIX)[keyof typeof CONDITION_SURFACE_SUFFIX];

export const appendConditionSurfacePath = (basePath: string, suffix: ConditionSurfaceSuffix): string =>
  `${basePath}.${suffix}`;

export const conditionSurfacePathForActionPre = (actionIndex: number): string =>
  `actions[${actionIndex}].pre`;

export const conditionSurfacePathForTriggerMatch = (triggerIndex: number): string =>
  `triggers[${triggerIndex}].match`;

export const conditionSurfacePathForTriggerWhen = (triggerIndex: number): string =>
  `triggers[${triggerIndex}].when`;

export const conditionSurfacePathForTerminalConditionWhen = (terminalConditionIndex: number): string =>
  `terminal.conditions[${terminalConditionIndex}].when`;

export const conditionSurfacePathForTerminalCheckpointWhen = (checkpointIndex: number): string =>
  `terminal.checkpoints[${checkpointIndex}].when`;
