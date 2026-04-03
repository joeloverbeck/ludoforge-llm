import { z } from 'zod';
import {
  AGENT_POLICY_CANDIDATE_INTRINSICS,
  AGENT_POLICY_DECISION_INTRINSICS,
  AGENT_POLICY_OPTION_INTRINSICS,
  AGENT_POLICY_ZONE_AGG_SOURCES,
  AGENT_POLICY_ZONE_FILTER_OPS,
  AGENT_POLICY_ZONE_SCOPES,
  AGENT_POLICY_ZONE_TOKEN_AGG_OPS,
  AGENT_POLICY_ZONE_TOKEN_AGG_OWNER_KEYWORDS,
} from '../contracts/index.js';
import { DegeneracyFlag } from './diagnostics.js';
import { TRACE_SCOPED_VAR_SCOPES, createScopedVarContractSchema } from './scoped-var-contract.js';
import {
  BooleanSchema,
  ActionExecutorSelSchema,
  ConditionASTSchema,
  EffectASTSchema,
  IntegerSchema,
  MacroOriginSchema,
  NumberSchema,
  NumericValueExprSchema,
  OptionsQuerySchema,
  PlayerSelSchema,
  StringSchema,
  TokenFilterExprSchema,
} from './schemas-ast.js';
import {
  OperationFreeTraceEntrySchema,
  OperationCompoundStagesReplacedTraceEntrySchema,
  OperationPartialTraceEntrySchema,
  SimultaneousCommitTraceEntrySchema,
  SimultaneousSubmissionTraceEntrySchema,
  TurnFlowDeferredEventLifecycleTraceEntrySchema,
  TurnFlowEligibilityTraceEntrySchema,
  TurnFlowLifecycleTraceEntrySchema,
  TurnFlowDurationSchema,
  TurnOrderRuntimeStateSchema,
  VictoryCheckpointSchema,
  VictoryMarginSchema,
  VictoryRankingSchema,
  VictoryTerminalMetadataSchema,
  EventDeckSchema,
  ActionPipelineSchema,
  ActionRestrictionDefSchema,
  TurnOrderSchema
} from './schemas-extensions.js';
import {
  AttributeValueSchema,
  SeatDefSchema,
  NumericTrackSchema,
  GlobalMarkerLatticeSchema,
  SpaceMarkerLatticeSchema,
  SpaceMarkerValueSchema,
  StackingConstraintSchema,
} from './schemas-gamespec.js';

export const IntVariableDefSchema = z
  .object({
    name: StringSchema,
    type: z.literal('int'),
    init: NumberSchema,
    min: NumberSchema,
    max: NumberSchema,
    material: BooleanSchema.optional(),
  })
  .strict();

export const BooleanVariableDefSchema = z
  .object({
    name: StringSchema,
    type: z.literal('boolean'),
    init: BooleanSchema,
    material: BooleanSchema.optional(),
  })
  .strict();

export const VariableDefSchema = z.discriminatedUnion('type', [IntVariableDefSchema, BooleanVariableDefSchema]);

export const DeckBehaviorSchema = z
  .object({
    type: z.literal('deck'),
    drawFrom: z.union([z.literal('top'), z.literal('bottom'), z.literal('random')]),
    reshuffleFrom: StringSchema.optional(),
  })
  .strict();

export const ZoneBehaviorSchema = DeckBehaviorSchema;

export const ZoneDefSchema = z
  .object({
    id: StringSchema,
    zoneKind: z.union([z.literal('board'), z.literal('aux')]).optional(),
    isInternal: BooleanSchema.optional(),
    ownerPlayerIndex: IntegerSchema.nonnegative().optional(),
    owner: z.union([z.literal('none'), z.literal('player')]),
    visibility: z.union([z.literal('public'), z.literal('owner'), z.literal('hidden')]),
    ordering: z.union([z.literal('stack'), z.literal('queue'), z.literal('set')]),
    adjacentTo: z.array(
      z.object({
        to: StringSchema,
        direction: z.union([z.literal('bidirectional'), z.literal('unidirectional')]).optional(),
        category: StringSchema.optional(),
        attributes: z.record(StringSchema, AttributeValueSchema).optional(),
      }).strict(),
    ).optional(),
    category: StringSchema.optional(),
    attributes: z.record(StringSchema, AttributeValueSchema).optional(),
    behavior: ZoneBehaviorSchema.optional(),
  })
  .strict();

export const TokenTypeTransitionSchema = z
  .object({
    prop: StringSchema,
    from: StringSchema,
    to: StringSchema,
  })
  .strict();

export const TokenTypeZoneEntryMatchSchema = z
  .object({
    zoneKind: z.union([z.literal('board'), z.literal('aux')]).optional(),
    category: StringSchema.optional(),
  })
  .strict();

export const TokenTypeZoneEntryRuleSchema = z
  .object({
    match: TokenTypeZoneEntryMatchSchema,
    setProps: z.record(StringSchema, z.union([NumberSchema, StringSchema, BooleanSchema])),
  })
  .strict();

export const TokenTypeDefSchema = z
  .object({
    id: StringSchema,
    seat: StringSchema.optional(),
    props: z.record(StringSchema, z.union([z.literal('int'), z.literal('string'), z.literal('boolean')])),
    transitions: z.array(TokenTypeTransitionSchema).optional(),
    onZoneEntry: z.array(TokenTypeZoneEntryRuleSchema).optional(),
  })
  .strict();

export const TokenSchema = z
  .object({
    id: StringSchema,
    type: StringSchema,
    props: z.record(StringSchema, z.union([NumberSchema, StringSchema, BooleanSchema])),
  })
  .strict();

export const RevealGrantSchema = z
  .object({
    observers: z.union([z.literal('all'), z.array(IntegerSchema)]),
    filter: TokenFilterExprSchema.optional(),
  })
  .strict();

export const ParamDefSchema = z
  .object({
    name: StringSchema,
    domain: OptionsQuerySchema,
  })
  .strict();

export const LimitDefSchema = z
  .object({
    id: StringSchema,
    scope: z.union([z.literal('turn'), z.literal('phase'), z.literal('game')]),
    max: NumberSchema,
  })
  .strict();

export const ActionDefaultsSchema = z
  .object({
    pre: ConditionASTSchema.optional(),
    afterEffects: z.array(EffectASTSchema).optional(),
  })
  .strict();

export const PhaseDefSchema = z
  .object({
    id: StringSchema,
    onEnter: z.array(EffectASTSchema).optional(),
    onExit: z.array(EffectASTSchema).optional(),
    actionDefaults: ActionDefaultsSchema.optional(),
  })
  .strict();

export const TurnStructureSchema = z
  .object({
    phases: z.array(PhaseDefSchema),
    interrupts: z.array(PhaseDefSchema).optional(),
  })
  .strict();

const CompiledActionTagIndexSchema = z
  .object({
    byAction: z.record(StringSchema, z.array(StringSchema)),
    byTag: z.record(StringSchema, z.array(StringSchema)),
  })
  .strict();

export const ActionDefSchema = z
  .object({
    id: StringSchema,
    actor: PlayerSelSchema,
    executor: ActionExecutorSelSchema,
    phase: z.array(StringSchema).min(1),
    capabilities: z.array(StringSchema.min(1)).optional(),
    tags: z.array(StringSchema).optional(),
    params: z.array(ParamDefSchema),
    pre: ConditionASTSchema.nullable(),
    cost: z.array(EffectASTSchema),
    effects: z.array(EffectASTSchema),
    limits: z.array(LimitDefSchema),
  })
  .strict();

export const TriggerEventSchema = z.union([
  z.object({ type: z.literal('phaseEnter'), phase: StringSchema }).strict(),
  z.object({ type: z.literal('phaseExit'), phase: StringSchema }).strict(),
  z.object({ type: z.literal('turnStart') }).strict(),
  z.object({ type: z.literal('turnEnd') }).strict(),
  z.object({ type: z.literal('actionResolved'), action: StringSchema.optional() }).strict(),
  z.object({ type: z.literal('tokenEntered'), zone: StringSchema.optional() }).strict(),
  z
    .object({
      type: z.literal('varChanged'),
      scope: z.union([z.literal('global'), z.literal('perPlayer'), z.literal('zone')]).optional(),
      var: StringSchema.optional(),
      player: IntegerSchema.optional(),
      zone: StringSchema.optional(),
      oldValue: z.union([NumberSchema, BooleanSchema]).optional(),
      newValue: z.union([NumberSchema, BooleanSchema]).optional(),
    })
    .strict(),
]);

export const TriggerDefSchema = z
  .object({
    id: StringSchema,
    event: TriggerEventSchema,
    match: ConditionASTSchema.optional(),
    when: ConditionASTSchema.optional(),
    effects: z.array(EffectASTSchema),
  })
  .strict();

export const TerminalResultDefSchema = z.union([
  z.object({ type: z.literal('win'), player: PlayerSelSchema }).strict(),
  z.object({ type: z.literal('lossAll') }).strict(),
  z.object({ type: z.literal('draw') }).strict(),
  z.object({ type: z.literal('score') }).strict(),
]);

export const EndConditionSchema = z
  .object({
    when: ConditionASTSchema,
    result: TerminalResultDefSchema,
  })
  .strict();

export const ScoringDefSchema = z
  .object({
    method: z.union([z.literal('highest'), z.literal('lowest')]),
    value: NumericValueExprSchema,
  })
  .strict();

export const SurfaceVisibilityClassSchema = z.union([
  z.literal('public'),
  z.literal('seatVisible'),
  z.literal('hidden'),
]);

export const CompiledSurfacePreviewVisibilitySchema = z
  .object({
    visibility: SurfaceVisibilityClassSchema,
    allowWhenHiddenSampling: BooleanSchema,
  })
  .strict();

export const CompiledSurfaceVisibilitySchema = z
  .object({
    current: SurfaceVisibilityClassSchema,
    preview: CompiledSurfacePreviewVisibilitySchema,
  })
  .strict();

export const CompiledSurfaceCatalogSchema = z
  .object({
    globalVars: z.record(StringSchema, CompiledSurfaceVisibilitySchema),
    perPlayerVars: z.record(StringSchema, CompiledSurfaceVisibilitySchema),
    derivedMetrics: z.record(StringSchema, CompiledSurfaceVisibilitySchema),
    victory: z.object({
      currentMargin: CompiledSurfaceVisibilitySchema,
      currentRank: CompiledSurfaceVisibilitySchema,
    }).strict(),
    activeCardIdentity: CompiledSurfaceVisibilitySchema,
    activeCardTag: CompiledSurfaceVisibilitySchema,
    activeCardMetadata: CompiledSurfaceVisibilitySchema,
    activeCardAnnotation: CompiledSurfaceVisibilitySchema,
  })
  .strict();

const ZoneObserverVisibilityClassSchema = z.union([
  z.literal('public'),
  z.literal('owner'),
  z.literal('hidden'),
]);

const CompiledZoneVisibilityEntrySchema = z
  .object({
    tokens: ZoneObserverVisibilityClassSchema,
    order: ZoneObserverVisibilityClassSchema,
  })
  .strict();

const CompiledZoneVisibilityCatalogSchema = z
  .object({
    entries: z.record(StringSchema, CompiledZoneVisibilityEntrySchema),
    defaultEntry: CompiledZoneVisibilityEntrySchema.optional(),
  })
  .strict();

export const CompiledObserverProfileSchema = z
  .object({
    fingerprint: StringSchema,
    surfaces: CompiledSurfaceCatalogSchema,
    zones: CompiledZoneVisibilityCatalogSchema.optional(),
  })
  .strict();

export const CompiledObserverCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    catalogFingerprint: StringSchema,
    observers: z.record(StringSchema, CompiledObserverProfileSchema),
    defaultObserverName: StringSchema,
  })
  .strict();

export const TerminalEvaluationDefSchema = z
  .object({
    conditions: z.array(EndConditionSchema),
    checkpoints: z.array(VictoryCheckpointSchema).optional(),
    margins: z.array(VictoryMarginSchema).optional(),
    ranking: VictoryRankingSchema.optional(),
    scoring: ScoringDefSchema.optional(),
  })
  .strict();

export const RuntimeDataAssetSchema = z
  .object({
    id: StringSchema,
    kind: StringSchema,
    payload: z.unknown(),
  })
  .strict();

export const InternTableSchema = z
  .object({
    zones: z.array(StringSchema),
    actions: z.array(StringSchema),
    tokenTypes: z.array(StringSchema),
    seats: z.array(StringSchema),
    players: z.array(StringSchema),
    phases: z.array(StringSchema),
    globalVars: z.array(StringSchema),
    perPlayerVars: z.array(StringSchema),
    zoneVars: z.array(StringSchema),
  })
  .strict();

export const RuntimeTableFieldContractSchema = z
  .object({
    field: StringSchema,
    type: z.union([z.literal('string'), z.literal('int'), z.literal('boolean')]),
  })
  .strict();

export const RuntimeTableUniqueKeySchema = z.array(StringSchema).min(1);

export const RuntimeTableConstraintSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('monotonic'),
      field: StringSchema,
      direction: z.union([z.literal('asc'), z.literal('desc')]),
      strict: BooleanSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('contiguousInt'),
      field: StringSchema,
      start: IntegerSchema.optional(),
      step: IntegerSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('numericRange'),
      field: StringSchema,
      min: NumberSchema.optional(),
      max: NumberSchema.optional(),
    })
    .strict(),
]);

export const RuntimeTableContractSchema = z
  .object({
    id: StringSchema,
    assetId: StringSchema,
    tablePath: StringSchema,
    fields: z.array(RuntimeTableFieldContractSchema),
    uniqueBy: z.array(RuntimeTableUniqueKeySchema).optional(),
    constraints: z.array(RuntimeTableConstraintSchema).optional(),
  })
  .strict();

export const DerivedMetricComputationSchema = z.union([
  z.literal('markerTotal'),
  z.literal('controlledPopulation'),
  z.literal('totalEcon'),
]);

export const DerivedMetricZoneFilterSchema = z
  .object({
    zoneIds: z.array(StringSchema).optional(),
    zoneKinds: z.array(z.union([z.literal('board'), z.literal('aux')])).optional(),
    category: z.array(StringSchema).optional(),
    attributeEquals: z.record(StringSchema, AttributeValueSchema).optional(),
  })
  .strict();

export const DerivedMetricRequirementSchema = z
  .object({
    key: StringSchema,
    expectedType: z.literal('number'),
  })
  .strict();

export const MarkerWeightConfigSchema = z
  .object({
    activeState: StringSchema,
    passiveState: StringSchema,
  })
  .strict();

export const SeatGroupConfigSchema = z
  .object({
    coinSeats: z.array(StringSchema),
    insurgentSeats: z.array(StringSchema),
    soloSeat: StringSchema,
    seatProp: StringSchema,
  })
  .strict();

export const DerivedMetricMarkerTotalRuntimeSchema = z
  .object({
    kind: z.literal('markerTotal'),
    markerId: StringSchema,
    markerConfig: MarkerWeightConfigSchema,
    defaultMarkerState: StringSchema.optional(),
  })
  .strict();

export const DerivedMetricControlledPopulationRuntimeSchema = z
  .object({
    kind: z.literal('controlledPopulation'),
    controlFn: z.union([z.literal('coin'), z.literal('solo')]),
    seatGroupConfig: SeatGroupConfigSchema,
  })
  .strict();

export const DerivedMetricTotalEconRuntimeSchema = z
  .object({
    kind: z.literal('totalEcon'),
    controlFn: z.union([z.literal('coin'), z.literal('solo')]),
    seatGroupConfig: SeatGroupConfigSchema,
    blockedByTokenTypes: z.array(StringSchema).optional(),
  })
  .strict();

export const DerivedMetricRuntimeSchema = z.discriminatedUnion('kind', [
  DerivedMetricMarkerTotalRuntimeSchema,
  DerivedMetricControlledPopulationRuntimeSchema,
  DerivedMetricTotalEconRuntimeSchema,
]);

export const DerivedMetricDefSchema = z
  .object({
    id: StringSchema,
    computation: DerivedMetricComputationSchema,
    zoneFilter: DerivedMetricZoneFilterSchema.optional(),
    requirements: z.array(DerivedMetricRequirementSchema).min(1),
    runtime: DerivedMetricRuntimeSchema,
  })
  .strict();

export const VictoryFormulaSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('markerTotalPlusZoneCount'),
      markerConfig: MarkerWeightConfigSchema,
      countZone: StringSchema,
      countTokenTypes: z.array(StringSchema).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('markerTotalPlusMapBases'),
      markerConfig: MarkerWeightConfigSchema,
      baseSeat: StringSchema,
      basePieceTypes: z.array(StringSchema),
    })
    .strict(),
  z
    .object({
      type: z.literal('controlledPopulationPlusMapBases'),
      controlFn: z.union([z.literal('coin'), z.literal('solo')]),
      baseSeat: StringSchema,
      basePieceTypes: z.array(StringSchema),
    })
    .strict(),
  z
    .object({
      type: z.literal('controlledPopulationPlusGlobalVar'),
      controlFn: z.union([z.literal('coin'), z.literal('solo')]),
      varName: StringSchema,
    })
    .strict(),
]);

export const VictoryStandingEntrySchema = z
  .object({
    seat: StringSchema,
    formula: VictoryFormulaSchema,
    threshold: NumberSchema,
  })
  .strict();

export const VictoryStandingsDefSchema = z
  .object({
    seatGroupConfig: SeatGroupConfigSchema,
    markerConfigs: z.record(StringSchema, MarkerWeightConfigSchema),
    markerName: StringSchema,
    defaultMarkerState: StringSchema,
    entries: z.array(VictoryStandingEntrySchema).min(1),
    tieBreakOrder: z.array(StringSchema),
  })
  .strict();

const VerbalizationLabelEntrySchema = z
  .object({
    singular: StringSchema,
    plural: StringSchema,
  })
  .strict();

const VerbalizationMacroEntrySchema = z
  .object({
    class: StringSchema,
    summary: StringSchema,
    slots: z.record(StringSchema, StringSchema).optional(),
  })
  .strict();

const VerbalizationStageDescriptionSchema = z
  .object({
    label: StringSchema,
    description: StringSchema.optional(),
  })
  .strict();

const VerbalizationModifierEffectSchema = z
  .object({
    condition: StringSchema,
    effect: StringSchema,
  })
  .strict();

const VerbalizationDefSchema = z
  .object({
    labels: z.record(StringSchema, z.union([StringSchema, VerbalizationLabelEntrySchema])),
    stages: z.record(StringSchema, StringSchema),
    actionSummaries: z.record(StringSchema, StringSchema).optional(),
    macros: z.record(StringSchema, VerbalizationMacroEntrySchema),
    sentencePlans: z.record(StringSchema, z.record(StringSchema, z.record(StringSchema, StringSchema))),
    suppressPatterns: z.array(StringSchema),
    stageDescriptions: z.record(StringSchema, z.record(StringSchema, VerbalizationStageDescriptionSchema)),
    modifierEffects: z.record(StringSchema, z.array(VerbalizationModifierEffectSchema)),
  })
  .strict();

const AgentParameterValueSchema = z.union([
  NumberSchema,
  BooleanSchema,
  StringSchema,
  z.array(StringSchema),
]);

const CompiledAgentParameterDefSchema = z
  .object({
    type: z.union([
      z.literal('number'),
      z.literal('integer'),
      z.literal('boolean'),
      z.literal('enum'),
      z.literal('idOrder'),
    ]),
    required: BooleanSchema,
    tunable: BooleanSchema,
    default: AgentParameterValueSchema.optional(),
    min: NumberSchema.optional(),
    max: NumberSchema.optional(),
    values: z.array(StringSchema).optional(),
    allowedIds: z.array(StringSchema).optional(),
  })
  .strict();

const CompiledAgentCandidateParamDefSchema = z
  .object({
    type: z.union([
      z.literal('number'),
      z.literal('boolean'),
      z.literal('id'),
      z.literal('idList'),
    ]),
    cardinality: z
      .object({
        kind: z.literal('exact'),
        n: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();

const AgentPolicyLiteralSchema = z.union([
  NumberSchema,
  BooleanSchema,
  StringSchema,
  z.null(),
  z.array(StringSchema),
]);

const CompiledSurfaceRefBaseSchema = {
  family: z.union([
    z.literal('globalVar'),
    z.literal('perPlayerVar'),
    z.literal('derivedMetric'),
    z.literal('victoryCurrentMargin'),
    z.literal('victoryCurrentRank'),
  ]),
  id: StringSchema,
  selector: z.union([
    z.object({
      kind: z.literal('role'),
      seatToken: StringSchema,
    }).strict(),
    z.object({
      kind: z.literal('player'),
      player: z.union([z.literal('self'), z.literal('active')]),
    }).strict(),
  ]).optional(),
} as const;

const CompiledAgentPolicyRefSchema = z.union([
  z.object({
    kind: z.literal('library'),
    refKind: z.union([z.literal('stateFeature'), z.literal('candidateFeature'), z.literal('aggregate')]),
    id: StringSchema,
  }).strict(),
  z.object({
    kind: z.literal('currentSurface'),
    ...CompiledSurfaceRefBaseSchema,
  }).strict(),
  z.object({
    kind: z.literal('previewSurface'),
    ...CompiledSurfaceRefBaseSchema,
  }).strict(),
  z.object({
    kind: z.literal('candidateIntrinsic'),
    intrinsic: z.enum(AGENT_POLICY_CANDIDATE_INTRINSICS),
  }).strict(),
  z.object({
    kind: z.literal('candidateParam'),
    id: StringSchema,
  }).strict(),
  z.object({
    kind: z.literal('decisionIntrinsic'),
    intrinsic: z.enum(AGENT_POLICY_DECISION_INTRINSICS),
  }).strict(),
  z.object({
    kind: z.literal('optionIntrinsic'),
    intrinsic: z.enum(AGENT_POLICY_OPTION_INTRINSICS),
  }).strict(),
  z.object({
    kind: z.literal('seatIntrinsic'),
    intrinsic: z.union([z.literal('self'), z.literal('active')]),
  }).strict(),
  z.object({
    kind: z.literal('turnIntrinsic'),
    intrinsic: z.union([z.literal('phaseId'), z.literal('stepId'), z.literal('round')]),
  }).strict(),
  z.object({
    kind: z.literal('strategicCondition'),
    conditionId: StringSchema,
    field: z.union([z.literal('satisfied'), z.literal('proximity')]),
  }).strict(),
  z.object({
    kind: z.literal('candidateTag'),
    tagName: StringSchema,
  }).strict(),
  z.object({
    kind: z.literal('candidateTags'),
  }).strict(),
  z.object({
    kind: z.literal('contextKind'),
  }).strict(),
]);

const AgentPolicyTokenFilterSchema = z.object({
  type: StringSchema.optional(),
  props: z.record(
    StringSchema,
    z.object({
      eq: z.union([StringSchema, NumberSchema, BooleanSchema]),
    }).strict(),
  ).optional(),
}).strict();

const AgentPolicyZoneFilterSchema = z.object({
  category: StringSchema.optional(),
  attribute: z.object({
    prop: StringSchema,
    op: z.enum(AGENT_POLICY_ZONE_FILTER_OPS),
    value: z.union([StringSchema, NumberSchema, BooleanSchema]),
  }).strict().optional(),
  variable: z.object({
    prop: StringSchema,
    op: z.enum(AGENT_POLICY_ZONE_FILTER_OPS),
    value: NumberSchema,
  }).strict().optional(),
}).strict();

const AgentPolicyExprSchema: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal('literal'),
      value: AgentPolicyLiteralSchema,
    }).strict(),
    z.object({
      kind: z.literal('param'),
      id: StringSchema,
    }).strict(),
    z.object({
      kind: z.literal('ref'),
      ref: CompiledAgentPolicyRefSchema,
    }).strict(),
    z.object({
      kind: z.literal('op'),
      op: z.union([
        z.literal('abs'),
        z.literal('add'),
        z.literal('and'),
        z.literal('boolToNumber'),
        z.literal('clamp'),
        z.literal('coalesce'),
        z.literal('div'),
        z.literal('eq'),
        z.literal('gt'),
        z.literal('gte'),
        z.literal('if'),
        z.literal('in'),
        z.literal('lt'),
        z.literal('lte'),
        z.literal('max'),
        z.literal('min'),
        z.literal('mul'),
        z.literal('ne'),
        z.literal('neg'),
        z.literal('not'),
        z.literal('or'),
        z.literal('sub'),
      ]),
      args: z.array(AgentPolicyExprSchema),
    }).strict(),
    z.object({
      kind: z.literal('zoneTokenAgg'),
      zone: z.union([StringSchema, AgentPolicyExprSchema]),
      owner: z.union([
        z.enum(AGENT_POLICY_ZONE_TOKEN_AGG_OWNER_KEYWORDS),
        z.string().regex(/^[0-9]+$/),
      ]),
      prop: StringSchema,
      aggOp: z.enum(AGENT_POLICY_ZONE_TOKEN_AGG_OPS),
    }).strict(),
    z.object({
      kind: z.literal('globalTokenAgg'),
      tokenFilter: AgentPolicyTokenFilterSchema.optional(),
      aggOp: z.enum(AGENT_POLICY_ZONE_TOKEN_AGG_OPS),
      prop: StringSchema.optional(),
      zoneFilter: AgentPolicyZoneFilterSchema.optional(),
      zoneScope: z.enum(AGENT_POLICY_ZONE_SCOPES),
    }).strict(),
    z.object({
      kind: z.literal('globalZoneAgg'),
      source: z.enum(AGENT_POLICY_ZONE_AGG_SOURCES),
      field: StringSchema,
      aggOp: z.enum(AGENT_POLICY_ZONE_TOKEN_AGG_OPS),
      zoneFilter: AgentPolicyZoneFilterSchema.optional(),
      zoneScope: z.enum(AGENT_POLICY_ZONE_SCOPES),
    }).strict(),
    z.object({
      kind: z.literal('adjacentTokenAgg'),
      anchorZone: StringSchema,
      tokenFilter: AgentPolicyTokenFilterSchema.optional(),
      aggOp: z.enum(AGENT_POLICY_ZONE_TOKEN_AGG_OPS),
      prop: StringSchema.optional(),
    }).strict(),
    z.object({
      kind: z.literal('zoneProp'),
      zone: z.union([StringSchema, AgentPolicyExprSchema]),
      prop: StringSchema,
    }).strict(),
  ]),
);

const AgentPolicyValueTypeSchema = z.union([
  z.literal('number'),
  z.literal('boolean'),
  z.literal('id'),
  z.literal('idList'),
]);

const AgentPolicyCostClassSchema = z.union([
  z.literal('state'),
  z.literal('candidate'),
  z.literal('preview'),
]);

const CompiledAgentDependencyRefsSchema = z
  .object({
    parameters: z.array(StringSchema),
    stateFeatures: z.array(StringSchema),
    candidateFeatures: z.array(StringSchema),
    aggregates: z.array(StringSchema),
    strategicConditions: z.array(StringSchema),
  })
  .strict();

const CompiledAgentStateFeatureSchema = z
  .object({
    type: AgentPolicyValueTypeSchema,
    costClass: AgentPolicyCostClassSchema,
    expr: AgentPolicyExprSchema,
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const CompiledAgentCandidateFeatureSchema = z
  .object({
    type: AgentPolicyValueTypeSchema,
    costClass: AgentPolicyCostClassSchema,
    expr: AgentPolicyExprSchema,
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const CompiledAgentAggregateSchema = z
  .object({
    type: AgentPolicyValueTypeSchema,
    costClass: AgentPolicyCostClassSchema,
    op: StringSchema,
    of: AgentPolicyExprSchema,
    where: AgentPolicyExprSchema.optional(),
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const CompiledAgentPruningRuleSchema = z
  .object({
    costClass: AgentPolicyCostClassSchema,
    when: AgentPolicyExprSchema,
    dependencies: CompiledAgentDependencyRefsSchema,
    onEmpty: z.union([z.literal('skipRule'), z.literal('error')]),
  })
  .strict();

const CompiledAgentConsiderationSchema = z
  .object({
    scopes: z.array(z.union([z.literal('move'), z.literal('completion')])).min(1).optional(),
    costClass: AgentPolicyCostClassSchema,
    when: AgentPolicyExprSchema.optional(),
    weight: AgentPolicyExprSchema,
    value: AgentPolicyExprSchema,
    unknownAs: NumberSchema.optional(),
    clamp: z.object({ min: NumberSchema.optional(), max: NumberSchema.optional() }).strict().optional(),
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const CompiledAgentTieBreakerSchema = z
  .object({
    kind: StringSchema,
    costClass: AgentPolicyCostClassSchema,
    value: AgentPolicyExprSchema.optional(),
    order: z.array(StringSchema).optional(),
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const CompiledStrategicConditionSchema = z
  .object({
    target: AgentPolicyExprSchema,
    proximity: z
      .object({
        current: AgentPolicyExprSchema,
        threshold: NumberSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

const CompiledAgentLibraryIndexSchema = z
  .object({
    stateFeatures: z.record(StringSchema, CompiledAgentStateFeatureSchema),
    candidateFeatures: z.record(StringSchema, CompiledAgentCandidateFeatureSchema),
    candidateAggregates: z.record(StringSchema, CompiledAgentAggregateSchema),
    pruningRules: z.record(StringSchema, CompiledAgentPruningRuleSchema),
    considerations: z.record(StringSchema, CompiledAgentConsiderationSchema),
    tieBreakers: z.record(StringSchema, CompiledAgentTieBreakerSchema),
    strategicConditions: z.record(StringSchema, CompiledStrategicConditionSchema),
  })
  .strict();

const CompiledAgentProfileSchema = z
  .object({
    fingerprint: StringSchema,
    observerName: StringSchema.optional(),
    params: z.record(StringSchema, AgentParameterValueSchema),
    use: z
      .object({
        considerations: z.array(StringSchema),
        pruningRules: z.array(StringSchema),
        tieBreakers: z.array(StringSchema),
      })
      .strict(),
    preview: z
      .object({
        mode: z.enum(['exactWorld', 'tolerateStochastic', 'disabled']),
      })
      .strict(),
    selection: z
      .object({
        mode: z.enum(['argmax', 'softmaxSample', 'weightedSample']),
        temperature: z.number().positive().optional(),
      })
      .strict(),
    plan: z
      .object({
        stateFeatures: z.array(StringSchema),
        candidateFeatures: z.array(StringSchema),
        candidateAggregates: z.array(StringSchema),
        considerations: z.array(StringSchema),
      })
      .strict(),
  })
  .strict();

const AgentPolicyCatalogSchema = z
  .object({
    schemaVersion: z.literal(2),
    catalogFingerprint: StringSchema,
    surfaceVisibility: CompiledSurfaceCatalogSchema,
    parameterDefs: z.record(StringSchema, CompiledAgentParameterDefSchema),
    candidateParamDefs: z.record(StringSchema, CompiledAgentCandidateParamDefSchema),
    library: CompiledAgentLibraryIndexSchema,
    profiles: z.record(StringSchema, CompiledAgentProfileSchema),
    bindingsBySeat: z.record(StringSchema, StringSchema),
  })
  .strict();

const CompiledEventSideAnnotationSchema = z
  .object({
    tokenPlacements: z.record(StringSchema, NumberSchema),
    tokenRemovals: z.record(StringSchema, NumberSchema),
    tokenCreations: z.record(StringSchema, NumberSchema),
    tokenDestructions: z.record(StringSchema, NumberSchema),
    markerModifications: NumberSchema,
    globalMarkerModifications: NumberSchema,
    globalVarModifications: NumberSchema,
    perPlayerVarModifications: NumberSchema,
    varTransfers: NumberSchema,
    drawCount: NumberSchema,
    shuffleCount: NumberSchema,
    grantsOperation: BooleanSchema,
    grantOperationSeats: z.array(StringSchema),
    hasEligibilityOverride: BooleanSchema,
    hasLastingEffect: BooleanSchema,
    hasBranches: BooleanSchema,
    hasPhaseControl: BooleanSchema,
    hasDecisionPoints: BooleanSchema,
    effectNodeCount: NumberSchema,
  })
  .strict();

const CompiledEventCardAnnotationSchema = z
  .object({
    cardId: StringSchema,
    unshaded: CompiledEventSideAnnotationSchema.optional(),
    shaded: CompiledEventSideAnnotationSchema.optional(),
  })
  .strict();

const CompiledEventAnnotationIndexSchema = z
  .object({
    entries: z.record(StringSchema, CompiledEventCardAnnotationSchema),
  })
  .strict();

export const GameDefSchema = z
  .object({
    metadata: z
      .object({
        id: StringSchema,
        name: StringSchema.optional(),
        description: StringSchema.optional(),
        players: z.object({ min: NumberSchema, max: NumberSchema }).strict(),
        maxTriggerDepth: NumberSchema.optional(),
      })
      .strict(),
    internTable: InternTableSchema,
    constants: z.record(StringSchema, NumberSchema),
    globalVars: z.array(VariableDefSchema),
    perPlayerVars: z.array(VariableDefSchema),
    zones: z.array(ZoneDefSchema),
    seats: z.array(SeatDefSchema).optional(),
    tracks: z.array(NumericTrackSchema).optional(),
    spaceMarkers: z.array(SpaceMarkerValueSchema).optional(),
    tokenTypes: z.array(TokenTypeDefSchema),
    setup: z.array(EffectASTSchema),
    turnStructure: TurnStructureSchema,
    turnOrder: TurnOrderSchema.optional(),
    actionPipelines: z.array(ActionPipelineSchema).optional(),
    derivedMetrics: z.array(DerivedMetricDefSchema).optional(),
    observers: CompiledObserverCatalogSchema.optional(),
    agents: AgentPolicyCatalogSchema.optional(),
    actions: z.array(ActionDefSchema),
    actionTagIndex: CompiledActionTagIndexSchema.optional(),
    triggers: z.array(TriggerDefSchema),
    terminal: TerminalEvaluationDefSchema,
    eventDecks: z.array(EventDeckSchema).optional(),
    cardAnnotationIndex: CompiledEventAnnotationIndexSchema.optional(),
    stackingConstraints: z.array(StackingConstraintSchema).optional(),
    markerLattices: z.array(SpaceMarkerLatticeSchema).optional(),
    globalMarkerLattices: z.array(GlobalMarkerLatticeSchema).optional(),
    zoneVars: z.array(IntVariableDefSchema).optional(),
    runtimeDataAssets: z.array(RuntimeDataAssetSchema).optional(),
    tableContracts: z.array(RuntimeTableContractSchema).optional(),
    victoryStandings: VictoryStandingsDefSchema.optional(),
    verbalization: VerbalizationDefSchema.optional(),
  })
  .strict();

export const ActionUsageRecordSchema = z
  .object({
    turnCount: NumberSchema,
    phaseCount: NumberSchema,
    gameCount: NumberSchema,
  })
  .strict();

export const ActiveLastingEffectSchema = z
  .object({
    id: StringSchema,
    sourceCardId: StringSchema,
    side: z.union([z.literal('unshaded'), z.literal('shaded')]),
    branchId: StringSchema.optional(),
    duration: TurnFlowDurationSchema,
    setupEffects: z.array(EffectASTSchema),
    teardownEffects: z.array(EffectASTSchema).optional(),
    actionRestrictions: z.array(ActionRestrictionDefSchema).optional(),
    remainingTurnBoundaries: IntegerSchema.min(0).optional(),
    remainingRoundBoundaries: IntegerSchema.min(0).optional(),
    remainingCycleBoundaries: IntegerSchema.min(0).optional(),
  })
  .strict();

export const InterruptPhaseFrameSchema = z
  .object({
    phase: StringSchema,
    resumePhase: StringSchema,
  })
  .strict();

export const RngStateSchema = z
  .object({
    algorithm: z.literal('pcg-dxsm-128'),
    version: z.literal(1),
    state: z.array(z.bigint()).length(2),
  })
  .strict();

export const GameStateSchema = z
  .object({
    globalVars: z.record(StringSchema, z.union([NumberSchema, BooleanSchema])),
    perPlayerVars: z.record(StringSchema, z.record(StringSchema, z.union([NumberSchema, BooleanSchema]))),
    zoneVars: z.record(StringSchema, z.record(StringSchema, NumberSchema)),
    playerCount: NumberSchema,
    zones: z.record(StringSchema, z.array(TokenSchema)),
    nextTokenOrdinal: NumberSchema,
    currentPhase: StringSchema,
    activePlayer: IntegerSchema,
    turnCount: NumberSchema,
    rng: RngStateSchema,
    stateHash: z.bigint(),
    actionUsage: z.record(StringSchema, ActionUsageRecordSchema),
    turnOrderState: TurnOrderRuntimeStateSchema,
    markers: z.record(StringSchema, z.record(StringSchema, StringSchema)),
    reveals: z.record(StringSchema, z.array(RevealGrantSchema)).optional(),
    globalMarkers: z.record(StringSchema, StringSchema).optional(),
    activeLastingEffects: z.array(ActiveLastingEffectSchema).optional(),
    interruptPhaseStack: z.array(InterruptPhaseFrameSchema).optional(),
  })
  .strict();

export const MoveParamScalarSchema = z.union([NumberSchema, StringSchema, BooleanSchema]);
export const MoveParamValueSchema = z.union([MoveParamScalarSchema, z.array(MoveParamScalarSchema)]);

export const CompoundMovePayloadSchema: z.ZodType = z.lazy(() =>
  z
    .object({
      specialActivity: MoveSchema,
      timing: z.union([z.literal('before'), z.literal('during'), z.literal('after')]),
      insertAfterStage: z.number().int().min(0).optional(),
      replaceRemainingStages: z.boolean().optional(),
    })
    .strict(),
);

export const MoveSchema: z.ZodType = z
  .object({
    actionId: StringSchema,
    params: z.record(StringSchema, MoveParamValueSchema),
    freeOperation: BooleanSchema.optional(),
    compound: CompoundMovePayloadSchema.optional(),
  })
  .strict();

export const StateDeltaSchema = z
  .object({
    path: StringSchema,
    before: z.unknown(),
    after: z.unknown(),
  })
  .strict();

export const RuntimeWarningCodeSchema = z.union([
  z.literal('TOKEN_NOT_IN_ZONE'),
  z.literal('BINDING_UNDEFINED'),
  z.literal('EMPTY_ZONE_OPERATION'),
  z.literal('MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED'),
  z.literal('MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED'),
  z.literal('MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED'),
  z.literal('MOVE_ENUM_DEFERRED_PREDICATE_BUDGET_EXCEEDED'),
  z.literal('MOVE_ENUM_PROBE_REJECTED'),
]);

export const RuntimeWarningSchema = z
  .object({
    code: RuntimeWarningCodeSchema,
    message: StringSchema,
    context: z.record(StringSchema, z.unknown()),
    hint: StringSchema.optional(),
  })
  .strict();

export const EffectTraceProvenanceSchema = z
  .object({
    phase: StringSchema,
    eventContext: z.union([
      z.literal('actionCost'),
      z.literal('actionEffect'),
      z.literal('phaseAfterEffect'),
      z.literal('lifecycleEffect'),
      z.literal('triggerEffect'),
      z.literal('lifecycleEvent'),
    ]),
    actionId: StringSchema.optional(),
    effectPath: StringSchema,
  })
  .strict();

export const EffectTraceResourceEndpointSchema = createScopedVarContractSchema({
  scopes: TRACE_SCOPED_VAR_SCOPES,
  fields: {
    var: 'varName',
    player: 'player',
    zone: 'zone',
  },
  schemas: {
    var: StringSchema,
    player: IntegerSchema,
    zone: StringSchema,
  },
});

export const EffectTraceVarChangeSchema = createScopedVarContractSchema({
  scopes: TRACE_SCOPED_VAR_SCOPES,
  fields: {
    var: 'varName',
    player: 'player',
    zone: 'zone',
  },
  schemas: {
    var: StringSchema,
    player: IntegerSchema,
    zone: StringSchema,
  },
  commonShape: {
    kind: z.literal('varChange'),
    oldValue: z.union([NumberSchema, BooleanSchema]),
    newValue: z.union([NumberSchema, BooleanSchema]),
    provenance: EffectTraceProvenanceSchema,
  },
});

export const EffectTraceEntrySchema = z.union([
  z
    .object({
      kind: z.literal('forEach'),
      bind: StringSchema,
      macroOrigin: MacroOriginSchema.optional(),
      matchCount: NumberSchema,
      limit: NumberSchema.optional(),
      iteratedCount: NumberSchema,
      provenance: EffectTraceProvenanceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('reduce'),
      itemBind: StringSchema,
      accBind: StringSchema,
      resultBind: StringSchema,
      itemMacroOrigin: MacroOriginSchema.optional(),
      accMacroOrigin: MacroOriginSchema.optional(),
      resultMacroOrigin: MacroOriginSchema.optional(),
      matchCount: NumberSchema,
      limit: NumberSchema.optional(),
      iteratedCount: NumberSchema,
      provenance: EffectTraceProvenanceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('moveToken'),
      tokenId: StringSchema,
      from: StringSchema,
      to: StringSchema,
      provenance: EffectTraceProvenanceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('setTokenProp'),
      tokenId: StringSchema,
      prop: StringSchema,
      oldValue: z.unknown(),
      newValue: z.unknown(),
      provenance: EffectTraceProvenanceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('reveal'),
      zone: StringSchema,
      observers: z.union([z.literal('all'), z.array(IntegerSchema)]),
      filter: TokenFilterExprSchema.optional(),
      provenance: EffectTraceProvenanceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('conceal'),
      zone: StringSchema,
      from: z.union([z.literal('all'), z.array(IntegerSchema)]).optional(),
      filter: TokenFilterExprSchema.optional(),
      grantsRemoved: IntegerSchema.min(0),
      provenance: EffectTraceProvenanceSchema,
    })
    .strict(),
  EffectTraceVarChangeSchema,
  z
    .object({
      kind: z.literal('resourceTransfer'),
      from: EffectTraceResourceEndpointSchema,
      to: EffectTraceResourceEndpointSchema,
      requestedAmount: IntegerSchema.min(0),
      actualAmount: IntegerSchema.min(0),
      sourceAvailable: IntegerSchema.min(0),
      destinationHeadroom: IntegerSchema.min(0),
      minAmount: IntegerSchema.min(0).optional(),
      maxAmount: IntegerSchema.min(0).optional(),
      provenance: EffectTraceProvenanceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('lifecycleEvent'),
      eventType: z.union([z.literal('phaseEnter'), z.literal('phaseExit'), z.literal('turnStart'), z.literal('turnEnd')]),
      phase: StringSchema.optional(),
      provenance: EffectTraceProvenanceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('createToken'),
      tokenId: StringSchema,
      type: StringSchema,
      zone: StringSchema,
      provenance: EffectTraceProvenanceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('destroyToken'),
      tokenId: StringSchema,
      type: StringSchema,
      zone: StringSchema,
      provenance: EffectTraceProvenanceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('shuffle'),
      zone: StringSchema,
      provenance: EffectTraceProvenanceSchema,
    })
    .strict(),
]);

export const TriggerFiringSchema = z
  .object({
    kind: z.literal('fired'),
    triggerId: StringSchema,
    event: TriggerEventSchema,
    depth: NumberSchema,
  })
  .strict();

export const TriggerTruncatedSchema = z
  .object({
    kind: z.literal('truncated'),
    event: TriggerEventSchema,
    depth: NumberSchema,
  })
  .strict();


export const TriggerLogEntrySchema = z.union([
  TriggerFiringSchema,
  TriggerTruncatedSchema,
  TurnFlowLifecycleTraceEntrySchema,
  TurnFlowEligibilityTraceEntrySchema,
  TurnFlowDeferredEventLifecycleTraceEntrySchema,
  SimultaneousSubmissionTraceEntrySchema,
  SimultaneousCommitTraceEntrySchema,
  OperationPartialTraceEntrySchema,
  OperationFreeTraceEntrySchema,
  OperationCompoundStagesReplacedTraceEntrySchema,
]);

const AgentDecisionFailureSummarySchema = z
  .object({
    code: StringSchema,
    message: StringSchema,
  })
  .strict();

const AgentDecisionScoreContributionSchema = z
  .object({
    termId: StringSchema,
    contribution: NumberSchema,
  })
  .strict();

const PolicyPreviewUnknownRefTraceSchema = z
  .object({
    refId: StringSchema,
    reason: z.union([
      z.literal('random'),
      z.literal('hidden'),
      z.literal('unresolved'),
      z.literal('failed'),
    ]),
  })
  .strict();

const PolicyCandidateDecisionTraceSchema = z
  .object({
    actionId: StringSchema,
    stableMoveKey: StringSchema,
    score: NumberSchema,
    prunedBy: z.array(StringSchema),
    scoreContributions: z.array(AgentDecisionScoreContributionSchema).optional(),
    previewRefIds: z.array(StringSchema).optional(),
    unknownPreviewRefs: z.array(PolicyPreviewUnknownRefTraceSchema).optional(),
    previewOutcome: z.union([
      z.literal('ready'),
      z.literal('stochastic'),
      z.literal('random'),
      z.literal('hidden'),
      z.literal('unresolved'),
      z.literal('failed'),
    ]).optional(),
  })
  .strict();

const PolicyPruningStepTraceSchema = z
  .object({
    ruleId: StringSchema,
    remainingCandidateCount: NumberSchema,
    skippedBecauseEmpty: BooleanSchema,
  })
  .strict();

const PolicyTieBreakStepTraceSchema = z
  .object({
    tieBreakerId: StringSchema,
    candidateCountBefore: NumberSchema,
    candidateCountAfter: NumberSchema,
  })
  .strict();

const PolicyPreviewOutcomeBreakdownTraceSchema = z
  .object({
    ready: NumberSchema,
    stochastic: NumberSchema,
    unknownRandom: NumberSchema,
    unknownHidden: NumberSchema,
    unknownUnresolved: NumberSchema,
    unknownFailed: NumberSchema,
  })
  .strict();

const PolicyCompletionStatisticsSchema = z
  .object({
    totalClassifiedMoves: NumberSchema,
    completedCount: NumberSchema,
    stochasticCount: NumberSchema,
    rejectedNotViable: NumberSchema,
    templateCompletionAttempts: NumberSchema,
    templateCompletionSuccesses: NumberSchema,
    templateCompletionUnsatisfiable: NumberSchema,
  })
  .strict();

const PolicyPreviewUsageTraceSchema = z
  .object({
    mode: z.enum(['exactWorld', 'tolerateStochastic', 'disabled']),
    evaluatedCandidateCount: NumberSchema,
    refIds: z.array(StringSchema),
    unknownRefs: z.array(PolicyPreviewUnknownRefTraceSchema),
    outcomeBreakdown: PolicyPreviewOutcomeBreakdownTraceSchema.optional(),
  })
  .strict();

const PolicySelectionTraceSchema = z
  .object({
    mode: z.enum(['argmax', 'softmaxSample', 'weightedSample']),
    temperature: NumberSchema.optional(),
    candidateCount: NumberSchema,
    samplingProbabilities: z.array(NumberSchema).optional(),
    selectedIndex: NumberSchema,
  })
  .strict();

const AgentDecisionTraceSchema = z.union([
  z
    .object({
      kind: z.literal('builtin'),
      agent: z.object({ kind: z.literal('builtin'), builtinId: z.union([z.literal('random'), z.literal('greedy')]) }).strict(),
      candidateCount: NumberSchema,
      selectedIndex: NumberSchema.optional(),
      selectedStableMoveKey: StringSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('policy'),
      agent: z.object({ kind: z.literal('policy'), profileId: StringSchema.optional() }).strict(),
      seatId: StringSchema.nullable(),
      requestedProfileId: StringSchema.nullable(),
      resolvedProfileId: StringSchema.nullable(),
      profileFingerprint: StringSchema.nullable(),
      initialCandidateCount: NumberSchema,
      selectedStableMoveKey: StringSchema.nullable(),
      finalScore: NumberSchema.nullable(),
      pruningSteps: z.array(PolicyPruningStepTraceSchema),
      tieBreakChain: z.array(PolicyTieBreakStepTraceSchema),
      previewUsage: PolicyPreviewUsageTraceSchema,
      selection: PolicySelectionTraceSchema.optional(),
      emergencyFallback: BooleanSchema,
      failure: AgentDecisionFailureSummarySchema.nullable(),
      completionStatistics: PolicyCompletionStatisticsSchema.optional(),
      candidates: z.array(PolicyCandidateDecisionTraceSchema).optional(),
    })
    .strict(),
]);

export const MoveLogSchema = z
  .object({
    stateHash: z.bigint(),
    player: IntegerSchema,
    move: MoveSchema,
    legalMoveCount: NumberSchema,
    deltas: z.array(StateDeltaSchema),
    triggerFirings: z.array(TriggerLogEntrySchema),
    warnings: z.array(RuntimeWarningSchema),
    effectTrace: z.array(EffectTraceEntrySchema).optional(),
    agentDecision: AgentDecisionTraceSchema.optional(),
  })
  .strict();

export const PlayerScoreSchema = z
  .object({
    player: IntegerSchema,
    score: NumberSchema,
  })
  .strict();

export const TerminalResultSchema = z.union([
  z.object({ type: z.literal('win'), player: IntegerSchema, victory: VictoryTerminalMetadataSchema.optional() }).strict(),
  z.object({ type: z.literal('lossAll') }).strict(),
  z.object({ type: z.literal('draw') }).strict(),
  z.object({ type: z.literal('score'), ranking: z.array(PlayerScoreSchema) }).strict(),
]);

export const SimulationStopReasonSchema = z.union([
  z.literal('terminal'),
  z.literal('maxTurns'),
  z.literal('noLegalMoves'),
]);

export const GameTraceSchema = z
  .object({
    gameDefId: StringSchema,
    seed: NumberSchema,
    moves: z.array(MoveLogSchema),
    finalState: GameStateSchema,
    result: TerminalResultSchema.nullable(),
    turnsCount: NumberSchema,
    stopReason: SimulationStopReasonSchema,
  })
  .strict();

export const MetricsSchema = z
  .object({
    avgGameLength: NumberSchema,
    avgBranchingFactor: NumberSchema,
    actionDiversity: NumberSchema,
    resourceTension: NumberSchema,
    interactionProxy: NumberSchema,
    dominantActionFreq: NumberSchema,
    dramaMeasure: NumberSchema,
  })
  .strict();

export const TraceMetricsSchema = z
  .object({
    gameLength: NumberSchema,
    avgBranchingFactor: NumberSchema,
    actionDiversity: NumberSchema,
    resourceTension: NumberSchema,
    interactionProxy: NumberSchema,
    dominantActionFreq: NumberSchema,
    dramaMeasure: NumberSchema,
  })
  .strict();

export const DegeneracyFlagSchema = z.nativeEnum(DegeneracyFlag);

export const TraceEvalSchema = z
  .object({
    seed: NumberSchema,
    turnCount: NumberSchema,
    stopReason: SimulationStopReasonSchema,
    metrics: TraceMetricsSchema,
    degeneracyFlags: z.array(DegeneracyFlagSchema),
  })
  .strict();

export const EvalReportSchema = z
  .object({
    gameDefId: StringSchema,
    runCount: NumberSchema,
    metrics: MetricsSchema,
    degeneracyFlags: z.array(DegeneracyFlagSchema),
    perSeed: z.array(TraceEvalSchema),
  })
  .strict();

export const HexBigIntSchema = z.string().regex(/^0x[0-9a-f]+$/);

export const SerializedRngStateSchema = z
  .object({
    algorithm: z.literal('pcg-dxsm-128'),
    version: z.literal(1),
    state: z.array(HexBigIntSchema).length(2),
  })
  .strict();

export const SerializedGameStateSchema = z
  .object({
    globalVars: z.record(StringSchema, z.union([NumberSchema, BooleanSchema])),
    perPlayerVars: z.record(StringSchema, z.record(StringSchema, z.union([NumberSchema, BooleanSchema]))),
    zoneVars: z.record(StringSchema, z.record(StringSchema, NumberSchema)),
    playerCount: NumberSchema,
    zones: z.record(StringSchema, z.array(TokenSchema)),
    nextTokenOrdinal: NumberSchema,
    currentPhase: StringSchema,
    activePlayer: IntegerSchema,
    turnCount: NumberSchema,
    rng: SerializedRngStateSchema,
    stateHash: HexBigIntSchema,
    actionUsage: z.record(StringSchema, ActionUsageRecordSchema),
    turnOrderState: TurnOrderRuntimeStateSchema,
    markers: z.record(StringSchema, z.record(StringSchema, StringSchema)),
    reveals: z.record(StringSchema, z.array(RevealGrantSchema)).optional(),
    globalMarkers: z.record(StringSchema, StringSchema).optional(),
    activeLastingEffects: z.array(ActiveLastingEffectSchema).optional(),
    interruptPhaseStack: z.array(InterruptPhaseFrameSchema).optional(),
  })
  .strict();

export const SerializedMoveLogSchema = z
  .object({
    stateHash: HexBigIntSchema,
    player: IntegerSchema,
    move: MoveSchema,
    legalMoveCount: NumberSchema,
    deltas: z.array(StateDeltaSchema),
    triggerFirings: z.array(TriggerLogEntrySchema),
    warnings: z.array(RuntimeWarningSchema),
    effectTrace: z.array(EffectTraceEntrySchema).optional(),
    agentDecision: AgentDecisionTraceSchema.optional(),
  })
  .strict();

export const SerializedGameTraceSchema = z
  .object({
    gameDefId: StringSchema,
    seed: NumberSchema,
    moves: z.array(SerializedMoveLogSchema),
    finalState: SerializedGameStateSchema,
    result: TerminalResultSchema.nullable(),
    turnsCount: NumberSchema,
    stopReason: SimulationStopReasonSchema,
  })
  .strict();

export const SerializedEvalReportSchema = z
  .object({
    gameDefId: StringSchema,
    runCount: NumberSchema,
    metrics: MetricsSchema,
    degeneracyFlags: z.array(DegeneracyFlagSchema),
    perSeed: z.array(TraceEvalSchema),
  })
  .strict();
