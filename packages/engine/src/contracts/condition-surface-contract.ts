const IF_WHEN_SUFFIX = 'if.when' as const;

export const CONDITION_SURFACE_SUFFIX = {
  valueExpr: {
    ifWhen: IF_WHEN_SUFFIX,
  },
  query: {
    spaceFilterCondition: 'spaceFilter.condition',
    via: 'via',
    where: 'where',
    filterCondition: 'filter.condition',
  },
  effect: {
    ifWhen: IF_WHEN_SUFFIX,
    moveAllFilter: 'moveAll.filter',
    grantFreeOperationZoneFilter: 'grantFreeOperation.zoneFilter',
  },
  actionPipeline: {
    applicability: 'applicability',
    legality: 'legality',
    costValidation: 'costValidation',
    targetingFilter: 'targeting.filter',
  },
} as const;

export type ValueExprConditionSurfaceSuffix =
  (typeof CONDITION_SURFACE_SUFFIX.valueExpr)[keyof typeof CONDITION_SURFACE_SUFFIX.valueExpr];
export type QueryConditionSurfaceSuffix = (typeof CONDITION_SURFACE_SUFFIX.query)[keyof typeof CONDITION_SURFACE_SUFFIX.query];
export type EffectConditionSurfaceSuffix =
  (typeof CONDITION_SURFACE_SUFFIX.effect)[keyof typeof CONDITION_SURFACE_SUFFIX.effect];
export type ActionPipelineConditionSurfaceSuffix =
  (typeof CONDITION_SURFACE_SUFFIX.actionPipeline)[keyof typeof CONDITION_SURFACE_SUFFIX.actionPipeline];

// Validator top-level condition surfaces must compose paths only through this contract API.
// Guardrail coverage in unit lint tests enforces this and forbids ad-hoc string/template paths.
const appendConditionSurfacePath = (basePath: string, suffix: string): string =>
  `${basePath}.${suffix}`;

export const appendValueExprConditionSurfacePath = (basePath: string, suffix: ValueExprConditionSurfaceSuffix): string =>
  appendConditionSurfacePath(basePath, suffix);

export const appendQueryConditionSurfacePath = (basePath: string, suffix: QueryConditionSurfaceSuffix): string =>
  appendConditionSurfacePath(basePath, suffix);

export const appendEffectConditionSurfacePath = (basePath: string, suffix: EffectConditionSurfaceSuffix): string =>
  appendConditionSurfacePath(basePath, suffix);

export const appendActionPipelineConditionSurfacePath = (
  basePath: string,
  suffix: ActionPipelineConditionSurfaceSuffix,
): string => appendConditionSurfacePath(basePath, suffix);

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
