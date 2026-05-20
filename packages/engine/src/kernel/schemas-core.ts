import { z } from 'zod';
import {
  AGENT_POLICY_CANDIDATE_INTRINSICS,
  AGENT_POLICY_MICROTURN_INTRINSICS,
  AGENT_POLICY_MICROTURN_OPTION_INTRINSICS,
  AGENT_POLICY_PREVIEW_OPTION_REF_KINDS, AGENT_POLICY_SEAT_AGG_AVAILABILITY_MODES,
  AGENT_POLICY_STANDING_ROLE_SELECTORS,
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
  FreeOperationTokenInterpretationRuleSchema,
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
  TurnFlowGrantLifecycleTraceEntrySchema,
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
  ActionPipelineStageSchema,
  ActionRestrictionDefSchema,
  TurnOrderSchema,
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

const CardSelectorSchema = z
  .object({
    tags: z.array(StringSchema).optional(),
    cardIds: z.array(StringSchema).optional(),
  })
  .strict();

const CardDrawUnitRatesSchema = z
  .object({
    microturns: IntegerSchema.optional(),
    actions: IntegerSchema.optional(),
    turns: IntegerSchema.optional(),
    rounds: IntegerSchema.optional(),
  })
  .strict();

const ObserverPolicySchema = z
  .object({
    kind: z.literal('topNVisible'),
    visiblePrefix: z
      .object({
        sources: z.array(z.object({
          id: StringSchema,
          take: IntegerSchema.positive(),
        }).strict()),
      })
      .strict(),
  })
  .strict();

const ScheduleKindDefSchema = z.union([
  z.object({
    kind: z.literal('cardDraw'),
    deckId: StringSchema,
    cardSelector: CardSelectorSchema,
    unitRates: CardDrawUnitRatesSchema.optional(),
    observerPolicy: ObserverPolicySchema.optional(),
  }).strict(),
  z.object({ kind: z.literal('turnCount') }).strict(),
  z.object({ kind: z.literal('condition') }).strict(),
]);

const PhaseBoundaryDefSchema = z
  .object({
    id: StringSchema,
    kind: z.union([z.literal('phaseEntry'), z.literal('phaseExit'), z.literal('condition')]),
    phaseId: StringSchema.optional(),
    schedule: ScheduleKindDefSchema.optional(),
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
    globalMarkers: z.record(StringSchema, CompiledSurfaceVisibilitySchema),
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
    z.literal('globalMarker'),
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
    refKind: z.union([
      z.literal('stateFeature'),
      z.literal('candidateFeature'),
      z.literal('aggregate'),
      z.literal('previewStateFeature'),
    ]),
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
    kind: z.literal('selector'),
    selectorId: StringSchema,
    field: z.union([
      z.literal('selected.matches'),
      z.literal('selected.key'),
      z.literal('selected.quality'),
      z.literal('selected.rank'),
      z.literal('current.matches'),
      z.literal('current.quality'),
      z.literal('current.rank'),
      z.literal('impactSatisfied'),
      z.literal('size'),
      z.object({ kind: z.literal('selected.component'), componentId: StringSchema }).strict(),
      z.object({ kind: z.literal('current.component'), componentId: StringSchema }).strict(),
      z.object({ kind: z.literal('candidate.quality'), key: StringSchema }).strict(),
    ]),
  }).strict(),
  z.object({
    kind: z.literal('strategyModule'),
    moduleId: StringSchema,
    field: z.union([
      z.literal('active'),
      z.literal('priority.value'),
      z.literal('contribution'),
      z.object({ kind: z.literal('scoreGroup.value'), scoreGroupId: StringSchema }).strict(),
      z.object({ kind: z.literal('selector.id'), role: StringSchema }).strict(),
    ]),
  }).strict(),
  z.object({
    kind: z.literal('guardrail'),
    guardrailId: StringSchema,
    field: z.union([
      z.literal('fired'),
      z.literal('severity'),
      z.literal('status'),
      z.literal('penalty'),
      z.literal('onUnavailable'),
    ]),
  }).strict(),
  // Spec 166 §4.1: candidate-param refs carry explicit missing-value policy.
  z.object({
    kind: z.literal('candidateParam'),
    id: StringSchema,
    onMissing: z.union([
      z.literal('unavailable'),
      z.object({
        kind: z.literal('constant'),
        value: z.union([IntegerSchema, StringSchema, BooleanSchema]),
      }).strict(),
    ]),
    appliesToActions: z.array(StringSchema).optional(),
  }).strict(),
  z.object({
    kind: z.literal('microturnIntrinsic'),
    intrinsic: z.enum(AGENT_POLICY_MICROTURN_INTRINSICS),
  }).strict(),
  z.object({
    kind: z.literal('microturnOptionIntrinsic'),
    intrinsic: z.enum(AGENT_POLICY_MICROTURN_OPTION_INTRINSICS),
  }).strict(),
  z.object({
    kind: z.literal('previewOptionRef'),
    refKind: z.enum(AGENT_POLICY_PREVIEW_OPTION_REF_KINDS),
    id: StringSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal('lookup'),
    surface: z.union([
      z.literal('policyState'),
      z.literal('previewOptionState'),
    ]),
    collection: z.union([
      z.literal('zones'),
      z.literal('tokens'),
      z.literal('players'),
      z.literal('globals'),
    ]),
    keyType: z.union([
      z.literal('ZoneId'),
      z.literal('TokenId'),
      z.literal('PlayerId'),
      z.literal('string'),
    ]),
    key: z.lazy(() => CompiledPolicyExprSchema),
    path: z.array(StringSchema).min(1),
    onMissing: z.union([
      z.literal('unavailable'),
      z.object({
        kind: z.literal('constant'),
        value: z.union([IntegerSchema, StringSchema, BooleanSchema]),
      }).strict(),
    ]),
    onHidden: z.literal('unavailable'),
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
    kind: z.literal('phaseIntrinsic'),
    name: z.union([z.literal('current.id'), z.literal('next.id')]),
  }).strict(),
  z.object({
    kind: z.literal('scheduleDistance'),
    target: z.union([
      z.object({ kind: z.literal('nextBoundary') }).strict(),
      z.object({ kind: z.literal('boundary'), boundaryId: StringSchema }).strict(),
    ]),
    unit: z.union([
      z.literal('cards'),
      z.literal('microturns'),
      z.literal('actions'),
      z.literal('turns'),
      z.literal('rounds'),
    ]).optional(),
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

const AgentPolicySeatAggOverSchema = z.union([
  z.literal('opponents'),
  z.literal('all'),
  z.array(StringSchema).readonly(),
  z.object({ role: z.enum(AGENT_POLICY_STANDING_ROLE_SELECTORS) }).strict(),
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
      anchorZone: z.union([StringSchema, AgentPolicyExprSchema]),
      tokenFilter: AgentPolicyTokenFilterSchema.optional(),
      aggOp: z.enum(AGENT_POLICY_ZONE_TOKEN_AGG_OPS),
      prop: StringSchema.optional(),
    }).strict(),
    z.object({
      kind: z.literal('seatAgg'),
      over: AgentPolicySeatAggOverSchema,
      expr: AgentPolicyExprSchema, aggOp: z.enum(AGENT_POLICY_ZONE_TOKEN_AGG_OPS),
      availability: z.enum(AGENT_POLICY_SEAT_AGG_AVAILABILITY_MODES).optional(),
    }).strict(),
    z.object({
      kind: z.literal('zoneProp'),
      zone: z.union([StringSchema, AgentPolicyExprSchema]),
      prop: StringSchema,
    }).strict(),
  ]),
);

const CompiledPolicyExprSchema: z.ZodTypeAny = z.lazy(() =>
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
      args: z.array(CompiledPolicyExprSchema),
    }).strict(),
    z.object({
      kind: z.literal('zoneTokenAgg'),
      zone: z.union([StringSchema, CompiledPolicyExprSchema]),
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
      anchorZone: z.union([StringSchema, CompiledPolicyExprSchema]),
      tokenFilter: AgentPolicyTokenFilterSchema.optional(),
      aggOp: z.enum(AGENT_POLICY_ZONE_TOKEN_AGG_OPS),
      prop: StringSchema.optional(),
    }).strict(),
    z.object({
      kind: z.literal('seatAgg'),
      over: AgentPolicySeatAggOverSchema,
      expr: CompiledPolicyExprSchema, aggOp: z.enum(AGENT_POLICY_ZONE_TOKEN_AGG_OPS),
      availability: z.enum(AGENT_POLICY_SEAT_AGG_AVAILABILITY_MODES).optional(),
    }).strict(),
    z.object({
      kind: z.literal('zoneProp'),
      zone: z.union([StringSchema, CompiledPolicyExprSchema]),
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

const SelectorCostClassSchema = z.union([
  z.literal('state'),
  z.literal('candidate'),
  z.literal('microturn'),
  z.literal('preview'),
  z.literal('auditOnly'),
]);
const ModuleCostClassSchema = SelectorCostClassSchema;
const GuardrailCostClassSchema = SelectorCostClassSchema;

const CompiledAgentDependencyRefsSchema = z
  .object({
    parameters: z.array(StringSchema),
    stateFeatures: z.array(StringSchema),
    candidateFeatures: z.array(StringSchema),
    aggregates: z.array(StringSchema),
    selectors: z.array(StringSchema).optional(),
    strategyModules: z.array(StringSchema).optional(),
    guardrails: z.array(StringSchema).optional(),
    strategicConditions: z.array(StringSchema),
  })
  .strict();

const EffectFootprintTargetSetSchema = z.union([z.array(StringSchema), z.literal('unknown')]);
const EffectFootprintSurfaceSchema = z
  .object({
    tokens: EffectFootprintTargetSetSchema,
    zones: EffectFootprintTargetSetSchema,
    variables: EffectFootprintTargetSetSchema,
    scores: EffectFootprintTargetSetSchema,
  })
  .strict();
const EffectFootprintSchema = z
  .object({
    writes: EffectFootprintSurfaceSchema,
    reads: EffectFootprintSurfaceSchema,
    mayTouchTokens: EffectFootprintTargetSetSchema,
    mayTouchZones: EffectFootprintTargetSetSchema,
    mayTouchVariables: EffectFootprintTargetSetSchema,
    mayTouchScores: EffectFootprintTargetSetSchema,
  })
  .strict();

const CompiledAgentStateFeatureSchema = z
  .object({
    type: AgentPolicyValueTypeSchema,
    costClass: AgentPolicyCostClassSchema,
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const CompiledAgentCandidateFeatureSchema = z
  .object({
    type: AgentPolicyValueTypeSchema,
    costClass: AgentPolicyCostClassSchema,
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const CompiledAgentAggregateSchema = z
  .object({
    type: AgentPolicyValueTypeSchema,
    costClass: AgentPolicyCostClassSchema,
    op: StringSchema,
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const AgentPreviewFallbackSchema = z
  .object({
    onUnavailable: z.union([
      z.literal('noContribution'),
      z.object({ kind: z.literal('constant'), value: IntegerSchema }).strict(),
    ]),
  })
  .strict();
const AgentLookupFallbackSchema = z
  .object({
    onUnavailable: z.union([
      z.literal('noContribution'),
      z.object({ kind: z.literal('constant'), value: IntegerSchema }).strict(),
    ]),
  })
  .strict();
const AgentCandidateParamFallbackSchema = AgentLookupFallbackSchema;
const AgentScheduleFallbackSchema = z
  .object({
    onUnavailable: z.union([
      z.literal('noContribution'),
      z.literal('dropConsideration'),
      z.object({ kind: z.literal('constant'), value: IntegerSchema }).strict(),
    ]),
    onPartial: z.object({
      visiblePrefixExhausted: z.union([
        z.literal('useLowerBound'),
        z.literal('noContribution'),
        z.literal('dropConsideration'),
        z.object({ kind: z.literal('constant'), value: IntegerSchema }).strict(),
      ]),
    }).strict().optional(),
  })
  .strict();

const CompiledAgentConsiderationSchema = z
  .object({
    scopes: z.array(z.union([z.literal('move'), z.literal('microturn')])).min(1).optional(),
    costClass: AgentPolicyCostClassSchema,
    unknownAs: NumberSchema.optional(),
    previewFallback: AgentPreviewFallbackSchema.optional(),
    lookupFallback: AgentLookupFallbackSchema.optional(),
    candidateParamFallback: AgentCandidateParamFallbackSchema.optional(),
    scheduleFallback: AgentScheduleFallbackSchema.optional(),
    clamp: z.object({ min: NumberSchema.optional(), max: NumberSchema.optional() }).strict().optional(),
    dependencies: CompiledAgentDependencyRefsSchema,
    readFootprint: EffectFootprintSchema.optional(),
  })
  .strict();

const CompiledPolicyConsiderationSchema = z
  .object({
    scopes: z.array(z.union([z.literal('move'), z.literal('microturn')])).min(1).optional(),
    costClass: AgentPolicyCostClassSchema,
    when: CompiledPolicyExprSchema.optional(),
    weight: CompiledPolicyExprSchema,
    value: CompiledPolicyExprSchema,
    hasPreviewRef: BooleanSchema,
    hasLookupRef: BooleanSchema,
    unknownAs: NumberSchema.optional(),
    previewFallback: AgentPreviewFallbackSchema.optional(),
    lookupFallback: AgentLookupFallbackSchema.optional(),
    candidateParamFallback: AgentCandidateParamFallbackSchema.optional(),
    scheduleFallback: AgentScheduleFallbackSchema.optional(),
    clamp: z.object({ min: NumberSchema.optional(), max: NumberSchema.optional() }).strict().optional(),
    dependencies: CompiledAgentDependencyRefsSchema,
    readFootprint: EffectFootprintSchema.optional(),
  })
  .strict();

const CompiledPolicyStateFeatureSchema = z
  .object({
    type: AgentPolicyValueTypeSchema,
    costClass: AgentPolicyCostClassSchema,
    expr: CompiledPolicyExprSchema,
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const CompiledPolicyCandidateFeatureSchema = z
  .object({
    type: AgentPolicyValueTypeSchema,
    costClass: AgentPolicyCostClassSchema,
    expr: CompiledPolicyExprSchema,
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const CompiledPolicyAggregateSchema = z
  .object({
    type: AgentPolicyValueTypeSchema,
    costClass: AgentPolicyCostClassSchema,
    op: StringSchema,
    of: CompiledPolicyExprSchema,
    where: CompiledPolicyExprSchema.optional(),
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const SelectorCollectionRefSchema = z.union([
  z.object({ kind: z.literal('zones') }).strict(),
  z.object({ kind: z.literal('tokens'), tokenType: StringSchema.optional() }).strict(),
  z.object({ kind: z.literal('cards'), deck: StringSchema.optional() }).strict(),
  z.object({ kind: z.literal('players') }).strict(),
  z.object({ kind: z.literal('authoredFinite'), collectionId: StringSchema }).strict(),
]);

const SelectorSourceSchema = z.union([
  z.object({
    kind: z.literal('collection'),
    collection: SelectorCollectionRefSchema,
    key: z.object({ from: StringSchema }).strict().optional(),
  }).strict(),
  z.object({
    kind: z.literal('product'),
    left: SelectorCollectionRefSchema,
    right: SelectorCollectionRefSchema,
    maxPairs: z.number().int().positive().max(256),
  }).strict(),
  z.object({ kind: z.literal('microturnOptions') }).strict(),
  z.object({ kind: z.literal('candidateParams'), param: StringSchema }).strict(),
]);

const SelectorResultSchema = z.object({
  maxItems: z.number().int().positive().max(32),
  order: z.array(z.enum(['qualityDesc', 'qualityAsc', 'stableKeyAsc', 'stableKeyDesc'])),
  onEmpty: z.enum(['noContribution', 'traceAndNoContribution', 'demote']),
}).strict();

const SelectorQualitySchema = z.object({
  components: z.array(z.object({
    id: StringSchema,
    value: CompiledPolicyExprSchema,
    weight: IntegerSchema,
    previewFallback: AgentPreviewFallbackSchema.optional(),
  }).strict()),
  order: z.enum(['qualityDesc', 'qualityAsc']),
}).strict();

const CompiledPolicySelectorSchema = z.object({
  id: StringSchema,
  scopes: z.array(z.enum(['move', 'microturn'])),
  source: SelectorSourceSchema,
  where: CompiledPolicyExprSchema.optional(),
  quality: SelectorQualitySchema.optional(),
  minImpact: CompiledPolicyExprSchema.optional(),
  result: SelectorResultSchema,
  costClass: SelectorCostClassSchema,
  dependencies: CompiledAgentDependencyRefsSchema,
}).strict();

const CompiledAgentSelectorSchema = z.object({
  scopes: z.array(z.enum(['move', 'microturn'])),
  source: SelectorSourceSchema,
  result: SelectorResultSchema,
  costClass: SelectorCostClassSchema,
  dependencies: CompiledAgentDependencyRefsSchema,
}).strict();

const ModuleAppliesSpecSchema = z.object({
  scopes: z.array(z.enum(['move', 'microturn'])),
  actionTags: z.array(StringSchema).optional(),
  decisionKinds: z.array(StringSchema).optional(),
}).strict();

const ModuleSelectorBindingSchema = z.object({
  role: StringSchema,
  selectorId: StringSchema,
}).strict();

const ModuleFallbackSpecSchema = z.object({
  ifInactive: z.enum(['noContribution', 'traceOnly']),
  ifSelectorEmpty: z.enum(['noContribution', 'demoteAndTrace']),
  selectorEmptyPenalty: IntegerSchema.optional(),
}).strict();

const StrategyModuleSchema = z.object({
  id: StringSchema,
  traceLabel: StringSchema,
  when: CompiledPolicyExprSchema,
  applies: ModuleAppliesSpecSchema,
  priority: z.object({
    tier: z.number().int().min(0).max(100),
    value: CompiledPolicyExprSchema.optional(),
  }).strict(),
  selectors: z.array(ModuleSelectorBindingSchema),
  scoreGroups: z.array(z.object({
    id: StringSchema,
    terms: z.array(z.object({
      id: StringSchema.optional(),
      value: CompiledPolicyExprSchema,
      weight: IntegerSchema,
    }).strict()),
    summary: z.enum(['sum', 'product', 'max']),
  }).strict()),
  guardrailIds: z.array(StringSchema),
  fallback: ModuleFallbackSpecSchema,
  costClass: ModuleCostClassSchema,
  dependencies: CompiledAgentDependencyRefsSchema,
}).strict();

const CompiledAgentStrategyModuleSchema = z.object({
  traceLabel: StringSchema,
  applies: ModuleAppliesSpecSchema,
  selectors: z.array(ModuleSelectorBindingSchema),
  scoreGroups: z.array(z.object({
    id: StringSchema,
    summary: z.enum(['sum', 'product', 'max']),
  }).strict()),
  guardrailIds: z.array(StringSchema),
  fallback: ModuleFallbackSpecSchema,
  costClass: ModuleCostClassSchema,
  dependencies: CompiledAgentDependencyRefsSchema,
}).strict();

const PassFallbackSpecSchema = z.object({
  actionId: StringSchema,
  traceLabel: StringSchema,
}).strict();

const GuardrailSeveritySchema = z.enum(['prune', 'demote', 'warn', 'auditOnly']);
const GuardrailOnUnavailableSchema = z.enum(['warnUnknown', 'noFire', 'fire']);

const GuardrailSchema = z.object({
  id: StringSchema,
  traceLabel: StringSchema,
  scopes: z.array(z.union([z.literal('move'), z.literal('microturn')])).min(1),
  when: CompiledPolicyExprSchema,
  severity: GuardrailSeveritySchema,
  penalty: CompiledPolicyExprSchema.optional(),
  safe: z.literal(true).optional(),
  onAllPruned: PassFallbackSpecSchema.optional(),
  onUnavailable: GuardrailOnUnavailableSchema,
  costClass: GuardrailCostClassSchema,
  dependencies: CompiledAgentDependencyRefsSchema,
}).strict();

const CompiledAgentGuardrailSchema = z.object({
  traceLabel: StringSchema,
  scopes: z.array(z.union([z.literal('move'), z.literal('microturn')])).min(1),
  severity: GuardrailSeveritySchema,
  costClass: GuardrailCostClassSchema,
  dependencies: CompiledAgentDependencyRefsSchema,
  safe: z.literal(true).optional(),
  onUnavailable: GuardrailOnUnavailableSchema,
  onAllPruned: PassFallbackSpecSchema.optional(),
}).strict();

const CompiledPolicyTieBreakerSchema = z
  .object({
    kind: StringSchema,
    costClass: AgentPolicyCostClassSchema,
    value: CompiledPolicyExprSchema.optional(),
    order: z.array(StringSchema).optional(),
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const CompiledPolicyStrategicConditionSchema = z
  .object({
    target: CompiledPolicyExprSchema,
    proximity: z
      .object({
        current: CompiledPolicyExprSchema,
        threshold: NumberSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

const CompiledPolicyCatalogSchema = z
  .object({
    stateFeatures: z.record(StringSchema, CompiledPolicyStateFeatureSchema),
    candidateFeatures: z.record(StringSchema, CompiledPolicyCandidateFeatureSchema),
    candidateAggregates: z.record(StringSchema, CompiledPolicyAggregateSchema),
    selectors: z.record(StringSchema, CompiledPolicySelectorSchema).optional(),
    strategyModules: z.record(StringSchema, StrategyModuleSchema).optional(),
    guardrails: z.record(StringSchema, GuardrailSchema).optional(),
    considerations: z.record(StringSchema, CompiledPolicyConsiderationSchema),
    tieBreakers: z.record(StringSchema, CompiledPolicyTieBreakerSchema),
    strategicConditions: z.record(StringSchema, CompiledPolicyStrategicConditionSchema),
  })
  .strict();

const CompiledAgentTieBreakerSchema = z
  .object({
    kind: StringSchema,
    costClass: AgentPolicyCostClassSchema,
    order: z.array(StringSchema).optional(),
    dependencies: CompiledAgentDependencyRefsSchema,
  })
  .strict();

const CompiledStrategicConditionSchema = z
  .object({
    proximity: z
      .object({
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
    selectors: z.record(StringSchema, CompiledAgentSelectorSchema).optional(),
    strategyModules: z.record(StringSchema, CompiledAgentStrategyModuleSchema).optional(),
    guardrails: z.record(StringSchema, CompiledAgentGuardrailSchema).optional(),
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
        guardrails: z.array(StringSchema).optional(),
        strategyModules: z.array(StringSchema).optional(),
        tieBreakers: z.array(StringSchema),
      })
      .strict(),
    preview: z
      .object({
        mode: z.enum(['exactWorld', 'tolerateStochastic', 'disabled']),
        completion: z.enum(['greedy', 'policyGuided']).optional(),
        fallbackCompletionPolicy: z.enum(['greedy', 'fail']).optional(),
        completionDepthCap: z.number().int().positive().optional(),
        budget: z
          .object({
            strategy: z.literal('balancedCoverage'),
            fullCandidateCap: z.number().int().positive(),
            minPerGroup: IntegerSchema.nonnegative(),
            widenOnUniformProjection: z.boolean().optional(),
            widenCap: IntegerSchema.nonnegative().optional(),
            widenStep: z.number().int().positive().optional(),
          })
          .strict()
          .optional(),
        inner: z
          .object({
            chooseOne: z.boolean(),
            chooseNStep: z.boolean(),
            maxOptions: z.number().int().positive(),
            chooseNBeamWidth: z.number().int().positive(),
            depthCap: z.number().int().positive(),
            strategy: z.enum(['singlePass', 'continuedDeepening']),
            capClass: z.enum(['standard256', 'deep1024']),
            continuedDeepening: z
              .object({
                broad: z.object({ depthCap: z.number().int().positive() }).strict(),
                deep: z
                  .object({
                    depthCap: z.number().int().positive(),
                    trigger: z.array(z.enum(['allRequestedRefsDepthCapped', 'allReadyValuesUniform'])).nonempty(),
                    rootPolicy: z.literal('allRootsWithinCap'),
                  })
                  .strict(),
              })
              .strict()
              .optional(),
          })
          .strict()
          .optional(),
        grantFlowContinuation: z
          .object({
            enabled: z.boolean(),
            postGrantDepthCap: z.number().int().positive(),
            postGrantCapClass: z.literal('postGrant16'),
            freeOperationDepthCap: z.number().int().positive(),
            freeOperationCapClass: z.enum(['grantFlow16', 'grantFlow32']),
          })
          .strict()
          .optional(),
        phase1: z.boolean().optional(),
        phase1CompletionsPerAction: z.number().int().positive().optional(),
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
        selectors: z.array(StringSchema).optional(),
        strategyModules: z.array(StringSchema).optional(),
        guardrails: z.array(StringSchema).optional(),
        considerations: z.array(StringSchema),
      })
      .strict(),
    selector: z.object({ maxCostClass: SelectorCostClassSchema }).strict().optional(),
    strategyModules: z.object({ maxCostClass: ModuleCostClassSchema }).strict().optional(),
    guardrails: z.object({ maxCostClass: GuardrailCostClassSchema }).strict().optional(),
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
    compiled: CompiledPolicyCatalogSchema,
    profiles: z.record(StringSchema, CompiledAgentProfileSchema),
    bindingsBySeat: z.record(StringSchema, StringSchema),
    selectorCaps: z.object({
      maxResultItems: z.number().int().positive(),
      maxProductPairs: z.number().int().positive(),
    }).strict().optional(),
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
    phaseBoundaries: z.array(PhaseBoundaryDefSchema).optional(),
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
    decisionStack: z.array(z.lazy(() => DecisionStackFrameSchema)),
    unavailableActionsPerTurn: z.record(StringSchema, z.array(StringSchema)).optional(),
    nextFrameId: NumberSchema,
    nextTurnId: NumberSchema,
    activeDeciderSeatId: z.union([StringSchema, z.literal('__chance'), z.literal('__kernel')]),
  })
  .strict();

export const MoveParamScalarSchema = z.union([NumberSchema, StringSchema, BooleanSchema]);
export const MoveParamValueSchema = z.union([MoveParamScalarSchema, z.array(MoveParamScalarSchema)]);
export const ActiveDeciderSeatIdSchema = z.union([StringSchema, z.literal('__chance'), z.literal('__kernel')]);

export const ChooseOptionSchema = z
  .object({
    value: MoveParamValueSchema,
    legality: z.union([z.literal('legal'), z.literal('illegal'), z.literal('unknown')]),
    illegalReason: StringSchema.nullable(),
    resolution: z.union([
      z.literal('exact'),
      z.literal('provisional'),
      z.literal('stochastic'),
      z.literal('ambiguous'),
    ]).optional(),
    metadata: z.record(StringSchema, z.unknown()).optional(),
  })
  .strict();

export const StochasticDistributionEntrySchema = z
  .object({
    value: MoveParamValueSchema,
    weight: NumberSchema,
  })
  .strict();

export const StochasticDistributionSchema = z
  .object({
    outcomes: z.array(StochasticDistributionEntrySchema),
  })
  .strict();

export const DecisionScopeSchema = z
  .object({
    iterationPath: StringSchema,
    counters: z.record(StringSchema, NumberSchema),
  })
  .strict();

export const SuspendedChoiceBindingOptionSchema = z
  .object({
    comparable: MoveParamScalarSchema,
    binding: z.unknown(),
  })
  .strict();

export const SuspendedChooseOneLeafSchema = z
  .object({
    kind: z.literal('chooseOne'),
    decisionKey: StringSchema,
    bind: StringSchema,
    decisionScope: DecisionScopeSchema,
    bindingOptions: z.array(SuspendedChoiceBindingOptionSchema),
  })
  .strict();

export const SuspendedChooseNLeafSchema = z
  .object({
    kind: z.literal('chooseN'),
    decisionKey: StringSchema,
    bind: StringSchema,
    decisionScope: DecisionScopeSchema,
    bindingOptions: z.array(SuspendedChoiceBindingOptionSchema),
  })
  .strict();

export const SuspendedDecisionLeafSchema = z.discriminatedUnion('kind', [
  SuspendedChooseOneLeafSchema,
  SuspendedChooseNLeafSchema,
]);

export const SuspendedSequenceResumeFrameSchema = z
  .object({
    kind: z.literal('sequence'),
    effects: z.array(EffectASTSchema),
  })
  .strict();

export const SuspendedForEachResumeFrameSchema = z
  .object({
    kind: z.literal('forEach'),
    bind: StringSchema,
    items: z.array(z.unknown()),
    nextIndex: NumberSchema,
    effects: z.array(EffectASTSchema),
    parentBindings: z.record(StringSchema, z.unknown()),
    parentIterationPath: StringSchema,
  })
  .strict();

export const SuspendedLetResumeFrameSchema = z
  .object({
    kind: z.literal('let'),
    bind: StringSchema,
    parentBindings: z.record(StringSchema, z.unknown()),
  })
  .strict();

export const SuspendedReduceResumeFrameSchema = z
  .object({
    kind: z.literal('reduce'),
    bind: StringSchema,
    parentBindings: z.record(StringSchema, z.unknown()),
  })
  .strict();

export const SuspendedPipelineResumeFrameSchema = z
  .object({
    kind: z.literal('pipeline'),
    actionId: StringSchema,
    profileId: StringSchema,
    atomicity: z.union([z.literal('atomic'), z.literal('partial')]),
    remainingStages: z.array(ActionPipelineStageSchema),
    eventEffects: z.array(EffectASTSchema),
  })
  .strict();

export const SuspendedResumeFrameSchema = z.discriminatedUnion('kind', [
  SuspendedSequenceResumeFrameSchema,
  SuspendedForEachResumeFrameSchema,
  SuspendedLetResumeFrameSchema,
  SuspendedReduceResumeFrameSchema,
  SuspendedPipelineResumeFrameSchema,
]);

export const FreeOperationZoneFilterDiagnosticsSchema = z
  .object({
    source: StringSchema,
    actionId: StringSchema,
    moveParams: z.record(StringSchema, z.unknown()),
  })
  .strict();

export const FreeOperationExecutionOverlaySchema = z
  .object({
    zoneFilter: ConditionASTSchema.optional(),
    bindingCountZoneFilter: ConditionASTSchema.optional(),
    zoneFilterDiagnostics: FreeOperationZoneFilterDiagnosticsSchema.optional(),
    grantContext: z.record(StringSchema, MoveParamValueSchema).optional(),
    capturedSequenceZonesByKey: z.record(StringSchema, z.array(StringSchema)).optional(),
    tokenInterpretations: z.array(FreeOperationTokenInterpretationRuleSchema).optional(),
  })
  .strict();

export const SerializedRngSchema = z
  .object({
    state: z.lazy(() => SerializedRngStateSchema),
  })
  .strict();

export const SerializedSuspendedEffectFrameSnapshotSchema: z.ZodTypeAny = z
  .object({
    state: z.lazy((): z.ZodTypeAny => SerializedGameStateSchema),
    rng: SerializedRngSchema,
    actorPlayer: IntegerSchema,
    bindings: z.record(StringSchema, z.unknown()),
    freeOperationOverlay: FreeOperationExecutionOverlaySchema.optional(),
    leaf: SuspendedDecisionLeafSchema,
    resumeStack: z.array(SuspendedResumeFrameSchema),
  })
  .strict();

export const EffectExecutionFrameSnapshotSchema: z.ZodTypeAny = z
  .object({
    programCounter: NumberSchema,
    boundedIterationCursors: z.record(StringSchema, NumberSchema),
    localBindings: z.record(StringSchema, MoveParamValueSchema),
    pendingTriggerQueue: z.array(StringSchema),
    decisionHistory: z.array(z.lazy(() => CompoundTurnTraceEntrySchema)).optional(),
    suspendedFrame: z.lazy((): z.ZodTypeAny => SerializedSuspendedEffectFrameSnapshotSchema).optional(),
  })
  .strict();

export const ActionSelectionDecisionSchema = z
  .object({
    kind: z.literal('actionSelection'),
    actionId: StringSchema,
    move: z.object({
      actionId: StringSchema,
      params: z.record(StringSchema, MoveParamValueSchema),
      freeOperation: BooleanSchema.optional(),
      actionClass: StringSchema.optional(),
      compound: z.unknown().optional(),
    }).strict().optional(),
  })
  .strict();

export const ChooseOneDecisionSchema = z
  .object({
    kind: z.literal('chooseOne'),
    decisionKey: StringSchema,
    value: MoveParamValueSchema,
  })
  .strict();

export const ChooseNStepDecisionSchema = z
  .object({
    kind: z.literal('chooseNStep'),
    decisionKey: StringSchema,
    command: z.union([z.literal('add'), z.literal('remove'), z.literal('confirm')]),
    value: MoveParamScalarSchema.optional(),
  })
  .strict();

export const StochasticResolveDecisionSchema = z
  .object({
    kind: z.literal('stochasticResolve'),
    decisionKey: StringSchema,
    value: MoveParamValueSchema,
  })
  .strict();

export const OutcomeGrantResolveDecisionSchema = z
  .object({
    kind: z.literal('outcomeGrantResolve'),
    grantId: StringSchema,
  })
  .strict();

export const TurnRetirementDecisionSchema = z
  .object({
    kind: z.literal('turnRetirement'),
    retiringTurnId: NumberSchema,
  })
  .strict();

export const DecisionSchema = z.union([
  ActionSelectionDecisionSchema,
  ChooseOneDecisionSchema,
  ChooseNStepDecisionSchema,
  StochasticResolveDecisionSchema,
  OutcomeGrantResolveDecisionSchema,
  TurnRetirementDecisionSchema,
]);

export const CompoundTurnTraceEntrySchema = z
  .object({
    seatId: ActiveDeciderSeatIdSchema,
    decisionContextKind: z.union([
      z.literal('actionSelection'),
      z.literal('chooseOne'),
      z.literal('chooseNStep'),
      z.literal('stochasticResolve'),
      z.literal('outcomeGrantResolve'),
      z.literal('turnRetirement'),
    ]),
    decisionKey: StringSchema.nullable(),
    decision: DecisionSchema,
    frameId: NumberSchema,
  })
  .strict();

export const ActionSelectionContextSchema = z
  .object({
    kind: z.literal('actionSelection'),
    seatId: StringSchema,
    eligibleActions: z.array(StringSchema),
  })
  .strict();

export const ChooseOneContextSchema = z
  .object({
    kind: z.literal('chooseOne'),
    seatId: StringSchema,
    decisionKey: StringSchema,
    options: z.array(ChooseOptionSchema),
  })
  .strict();

export const ChooseNStepContextSchema = z
  .object({
    kind: z.literal('chooseNStep'),
    seatId: StringSchema,
    decisionKey: StringSchema,
    options: z.array(ChooseOptionSchema),
    selectedSoFar: z.array(MoveParamScalarSchema),
    cardinality: z.object({ min: NumberSchema, max: NumberSchema }).strict(),
    stepCommands: z.array(z.union([z.literal('add'), z.literal('remove'), z.literal('confirm')])),
    templateHint: z.object({
      normalizedDomain: z.array(MoveParamScalarSchema),
      prioritizedTierEntries: z.array(
        z.array(
          z.object({
            value: MoveParamScalarSchema,
            qualifier: z.union([StringSchema, NumberSchema, BooleanSchema]).optional(),
          }).strict(),
        ),
      ).nullable(),
      qualifierMode: z.union([z.literal('none'), z.literal('byQualifier')]),
    }).strict().optional(),
  })
  .strict();

export const StochasticResolveContextSchema = z
  .object({
    kind: z.literal('stochasticResolve'),
    seatId: z.literal('__chance'),
    decisionKey: StringSchema,
    distribution: StochasticDistributionSchema,
  })
  .strict();

export const OutcomeGrantResolveContextSchema = z
  .object({
    kind: z.literal('outcomeGrantResolve'),
    seatId: z.literal('__kernel'),
    grant: z.object({ grantId: StringSchema }).passthrough(),
  })
  .strict();

export const TurnRetirementContextSchema = z
  .object({
    kind: z.literal('turnRetirement'),
    seatId: z.literal('__kernel'),
    retiringTurnId: NumberSchema,
  })
  .strict();

export const DecisionContextSchema = z.union([
  ActionSelectionContextSchema,
  ChooseOneContextSchema,
  ChooseNStepContextSchema,
  StochasticResolveContextSchema,
  OutcomeGrantResolveContextSchema,
  TurnRetirementContextSchema,
]);

export const DecisionStackFrameSchema: z.ZodTypeAny = z
  .object({
    frameId: NumberSchema,
    parentFrameId: NumberSchema.nullable(),
    turnId: NumberSchema,
    context: DecisionContextSchema,
    continuationBindings: z.record(StringSchema, MoveParamValueSchema).optional(),
    effectFrame: EffectExecutionFrameSnapshotSchema,
  })
  .strict();

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
  z.literal('MOVE_ENUM_DECISION_PROBE_SUBSET_INCOMPLETE'),
  z.literal('MOVE_ENUM_DEFERRED_PREDICATE_BUDGET_EXCEEDED'),
  z.literal('MOVE_ENUM_PROBE_REJECTED'),
  z.literal('CLASSIFIER_UNKNOWN_VERDICT_DROPPED'),
  z.literal('CONSTRUCTIBILITY_INVARIANT_VIOLATION'),
  z.literal('MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY'),
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
  TurnFlowGrantLifecycleTraceEntrySchema,
  TurnFlowEligibilityTraceEntrySchema,
  TurnFlowDeferredEventLifecycleTraceEntrySchema,
  SimultaneousSubmissionTraceEntrySchema,
  SimultaneousCommitTraceEntrySchema,
  OperationPartialTraceEntrySchema,
  OperationFreeTraceEntrySchema,
  OperationCompoundStagesReplacedTraceEntrySchema,
]);

export const ConditionTraceEntrySchema = z
  .object({
    kind: z.literal('conditionEval'),
    seq: IntegerSchema,
    condition: ConditionASTSchema,
    result: BooleanSchema,
    context: z.union([
      z.literal('actionPre'),
      z.literal('triggerWhen'),
      z.literal('triggerMatch'),
      z.literal('ifBranch'),
      z.literal('costValidation'),
      z.literal('playCondition'),
    ]),
    provenance: EffectTraceProvenanceSchema,
  })
  .strict();

export const DecisionTraceEntrySchema = z
  .object({
    kind: z.literal('decision'),
    seq: IntegerSchema,
    decisionKey: StringSchema,
    type: z.union([z.literal('chooseOne'), z.literal('chooseN')]),
    player: IntegerSchema,
    options: z.array(z.union([NumberSchema, StringSchema, BooleanSchema, z.array(z.union([NumberSchema, StringSchema, BooleanSchema]))])),
    selected: z.array(z.union([NumberSchema, StringSchema, BooleanSchema])),
    min: IntegerSchema.optional(),
    max: IntegerSchema.optional(),
    provenance: EffectTraceProvenanceSchema,
  })
  .strict();

export const SelectorTraceEntrySchema = z
  .object({
    kind: z.literal('selectorResolution'),
    seq: IntegerSchema,
    selectorType: z.union([z.literal('player'), z.literal('zone'), z.literal('token')]),
    selectorExpr: z.unknown(),
    candidateCount: IntegerSchema,
    resolvedIds: z.array(StringSchema),
    provenance: EffectTraceProvenanceSchema,
  })
  .strict();

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

const PolicyScheduleInputRefTraceSchema = z.union([
  z.object({
    status: z.literal('ready'),
    value: z.union([NumberSchema, StringSchema]),
    observerPolicy: z.literal('topNVisible').optional(),
    visiblePrefixLength: IntegerSchema.nonnegative().optional(),
    visibleSequenceSources: z.array(z.object({
      zoneId: StringSchema,
      availablePublic: IntegerSchema.nonnegative(),
      taken: IntegerSchema.nonnegative(),
    }).strict()).optional(),
  }).strict(),
  z.object({
    status: z.literal('partial'),
    partialKind: z.literal('lowerBound'),
    lowerBound: IntegerSchema.nonnegative(),
    observerPolicy: z.literal('topNVisible'),
    visiblePrefixLength: IntegerSchema.nonnegative(),
    visibleSequenceSources: z.array(z.object({
      zoneId: StringSchema,
      availablePublic: IntegerSchema.nonnegative(),
      taken: IntegerSchema.nonnegative(),
    }).strict()),
    fallbackApplied: z.object({
      kind: z.enum(['useLowerBound', 'noContribution', 'constant', 'dropConsideration']),
      numericValue: NumberSchema.optional(),
    }).strict().optional(),
  }).strict(),
]);

const PolicyPreviewUnknownRefTraceSchema = z
  .object({
    refId: StringSchema,
    reason: z.union([
      z.literal('random'),
      z.literal('hidden'),
      z.literal('unresolved'),
      z.literal('failed'),
      z.literal('depthCap'),
      z.literal('postGrantCap'),
      z.literal('freeOperationCap'),
      z.literal('grantFlowPartial'),
      z.literal('noPreviewDecision'),
      z.literal('gated'),
    ]),
  })
  .strict();

const PolicyLookupUnknownRefTraceSchema = z
  .object({
    refId: StringSchema,
    reason: z.enum(['hidden', 'missing', 'typeMismatch', 'unresolved']),
  })
  .strict();

const PolicyCandidateParamUnknownRefTraceSchema = z
  .object({
    refId: StringSchema,
    reason: z.enum(['missing', 'typeMismatch']),
  })
  .strict();

const PolicyPreviewReadyRefStatsTraceSchema = z
  .object({
    readyCount: IntegerSchema.nonnegative(),
    distinctValueCount: IntegerSchema.nonnegative(),
    min: IntegerSchema.nullable(),
    max: IntegerSchema.nullable(),
    range: IntegerSchema.nullable(),
    allReadyValuesEqual: BooleanSchema,
  })
  .strict();

const SyntheticDecisionTraceEntrySchema = z
  .object({
    depth: IntegerSchema.positive(),
    microturnKind: z.enum(['chooseOne', 'chooseNStep']),
    decisionKey: StringSchema,
    selectedOptionStableKey: StringSchema,
    selectionReason: z.enum(['greedyAlphabetical', 'microturnPolicy', 'fallback']),
    score: NumberSchema,
    scoreContributions: z.array(AgentDecisionScoreContributionSchema),
    completionPolicy: z.enum(['greedy', 'policyGuided', 'fallback']),
  })
  .strict();

const PolicyPreviewGrantFlowSegmentTraceSchema = z
  .object({
    depth: IntegerSchema.nonnegative(),
    kind: z.enum([
      'outcomeGrantResolve',
      'grantOffered',
      'freeOperationActionSelection',
      'selectedFreeOperation',
      'innerChoice',
      'grantConsumed',
      'grantSkipped',
      'grantExpired',
      'deferredEffectsReleased',
    ]),
    decisionKey: StringSchema.optional(),
    actionId: StringSchema.optional(),
    grantId: StringSchema.optional(),
    grantPhase: StringSchema.optional(),
    selectedOptionStableKey: StringSchema.optional(),
  })
  .strict();

const PolicyPreviewDriveTraceSchema = z
  .object({
    kind: z.enum(['completed', 'depthCap', 'postGrantCap', 'freeOperationCap', 'stochastic', 'failed']).optional(),
    depth: IntegerSchema.nonnegative(),
    completionPolicy: z.enum(['greedy', 'policyGuided', 'fallback']),
    syntheticDecisions: z.array(SyntheticDecisionTraceEntrySchema),
    grantFlowSegments: z.array(PolicyPreviewGrantFlowSegmentTraceSchema).optional(),
  })
  .strict();

const PolicyCandidateDecisionTraceSchema = z
  .object({
    actionId: StringSchema,
    stableMoveKey: StringSchema,
    score: NumberSchema,
    prunedBy: z.array(StringSchema),
    scoreContributions: z.array(AgentDecisionScoreContributionSchema),
    previewRefIds: z.array(StringSchema),
    unknownPreviewRefs: z.array(PolicyPreviewUnknownRefTraceSchema),
    unknownLookupRefs: z.array(PolicyLookupUnknownRefTraceSchema),
    unknownCandidateParamRefs: z.array(PolicyCandidateParamUnknownRefTraceSchema),
    previewFallbackFired: z.object({
      termId: StringSchema,
      kind: z.enum(['noContribution', 'constant']),
      value: NumberSchema.optional(),
    }).strict().optional(),
    lookupFallbackFired: z.object({
      termId: StringSchema,
      kind: z.enum(['noContribution', 'constant']),
      value: NumberSchema.optional(),
    }).strict().optional(),
    scheduleFallbackFired: z.object({
      termId: StringSchema,
      kind: z.enum(['useLowerBound', 'noContribution', 'constant', 'dropConsideration']),
      value: NumberSchema.optional(),
      reason: z.literal('partial.lowerBound.visiblePrefixExhausted').optional(),
    }).strict().optional(),
    inputRefs: z.record(StringSchema, PolicyScheduleInputRefTraceSchema).optional(),
    candidateParamFallbackFired: z.record(StringSchema, IntegerSchema.nonnegative()).optional(),
    selectionReason: z.enum([
      'coverage',
      'prior',
      'shallowDelta',
      'widening',
      'cache',
      'gated',
      'beamPruned',
      'scored',
      'tiebreak',
      'tiebreakAfterPreviewNoSignal',
      'fallbackExplicit',
    ]),
    previewOutcome: z.union([
      z.literal('ready'),
      z.literal('stochastic'),
      z.literal('random'),
      z.literal('hidden'),
      z.literal('unresolved'),
      z.literal('failed'),
      z.literal('depthCap'),
      z.literal('postGrantCap'),
      z.literal('freeOperationCap'),
      z.literal('grantFlowPartial'),
      z.literal('noPreviewDecision'),
      z.literal('gated'),
    ]).optional(),
    previewDrive: PolicyPreviewDriveTraceSchema.optional(),
    grantedOperationSimulated: BooleanSchema.optional(),
    grantedOperationMove: z.object({
      actionId: StringSchema,
      params: z.record(z.string(), z.unknown()),
    }).strict().optional(),
    grantedOperationMarginDelta: NumberSchema.optional(),
    previewFailureReason: StringSchema.optional(),
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
    unknownDepthCap: NumberSchema,
    unknownPostGrantCap: NumberSchema,
    unknownFreeOperationCap: NumberSchema,
    unknownGrantFlowPartial: NumberSchema,
    unknownNoPreviewDecision: NumberSchema,
    unknownGated: NumberSchema,
    unknownFailed: NumberSchema,
  })
  .strict();

const PolicyPreviewPhaseCoverageTraceSchema = z
  .object({
    evaluatedRootOptionCount: IntegerSchema.nonnegative(),
    readyRootOptionCount: IntegerSchema.nonnegative(),
    unavailableRootOptionCount: IntegerSchema.nonnegative(),
    triggerFired: z.enum(['allRequestedRefsDepthCapped', 'allReadyValuesUniform']).optional(),
  })
  .strict();

const PolicyPreviewCoverageTraceSchema = z
  .object({
    requestedRefCount: IntegerSchema.nonnegative(),
    evaluatedRootOptionCount: IntegerSchema.nonnegative(),
    readyRootOptionCount: IntegerSchema.nonnegative(),
    unavailableRootOptionCount: IntegerSchema.nonnegative(),
    allRootsUnavailable: BooleanSchema,
    selectedByTieBreakerBecausePreviewUnavailable: BooleanSchema,
    strategy: z.enum(['singlePass', 'continuedDeepening']),
    capClass: z.enum(['standard256', 'deep1024']),
    broad: PolicyPreviewPhaseCoverageTraceSchema.optional(),
    deep: PolicyPreviewPhaseCoverageTraceSchema.optional(),
  })
  .strict();

const PolicyPreviewGrantFlowContinuationTraceSchema = z
  // Spec 179: decision-level aggregate for the opt-in post-grant preview drive.
  .object({
    enabled: z.literal(true),
    postGrantDepthCap: IntegerSchema.positive(),
    postGrantCapClass: z.literal('postGrant16'),
    freeOperationDepthCap: IntegerSchema.positive(),
    freeOperationCapClass: z.enum(['grantFlow16', 'grantFlow32']),
    extraDepthReached: IntegerSchema.nonnegative(),
    exitCounts: z
      .object({
        completed: IntegerSchema.nonnegative(),
        postGrantCap: IntegerSchema.nonnegative(),
        freeOperationCap: IntegerSchema.nonnegative(),
        stochastic: IntegerSchema.nonnegative(),
      })
      .strict(),
  })
  .strict();

const PolicyPreviewSeatMatrixCellTraceSchema = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('ready'), value: NumberSchema }).strict(),
    z.object({ status: z.enum(['stochastic', 'random', 'hidden', 'unresolved', 'failed', 'depthCap', 'postGrantCap', 'freeOperationCap', 'grantFlowPartial', 'noPreviewDecision', 'gated']) }).strict(),
  ]);

const PolicyPreviewSeatMatrixCandidateTraceSchema = z
  .object({
    perSeatRefs: z.record(StringSchema, z.record(StringSchema, PolicyPreviewSeatMatrixCellTraceSchema)),
  })
  .strict();

const PolicyPreviewSeatMatrixTraceSchema = z
  .object({
    byCandidate: z.record(StringSchema, PolicyPreviewSeatMatrixCandidateTraceSchema),
  })
  .strict();

const PolicyPreviewUsageTraceSchema = z
  .object({
    mode: z.enum(['exactWorld', 'tolerateStochastic', 'disabled']),
    evaluatedCandidateCount: NumberSchema,
    completionPolicyFallbackCount: IntegerSchema.nonnegative(),
    refIds: z.array(StringSchema),
    unknownRefs: z.array(PolicyPreviewUnknownRefTraceSchema),
    readyRefStats: z.record(StringSchema, PolicyPreviewReadyRefStatsTraceSchema),
    seatMatrix: PolicyPreviewSeatMatrixTraceSchema.optional(),
    grantFlowContinuation: PolicyPreviewGrantFlowContinuationTraceSchema.optional(),
    utility: z.enum(['none', 'constant', 'lowInformation', 'differentiating']),
    widenedBecauseUniform: BooleanSchema,
    outcomeBreakdown: PolicyPreviewOutcomeBreakdownTraceSchema.optional(),
    coverage: PolicyPreviewCoverageTraceSchema,
  })
  .strict();

const PolicyPreviewSignalUnavailableAdvisoryTraceSchema = z
  .object({
    code: z.literal('POLICY_PREVIEW_SIGNAL_UNAVAILABLE'),
    profileId: StringSchema,
    seatId: StringSchema,
    decisionKind: z.enum(['chooseOne', 'chooseNStep']),
    decisionKey: StringSchema,
    requestedRefs: z.array(StringSchema),
    evaluatedRootOptionCount: IntegerSchema.nonnegative(),
    unavailableRootOptionCount: IntegerSchema.nonnegative(),
    unavailabilityBreakdown: z.object({
      random: IntegerSchema.nonnegative(),
      hidden: IntegerSchema.nonnegative(),
      unresolved: IntegerSchema.nonnegative(),
      failed: IntegerSchema.nonnegative(),
      depthCap: IntegerSchema.nonnegative(),
      postGrantCap: IntegerSchema.nonnegative().optional(),
      noPreviewDecision: IntegerSchema.nonnegative(),
      gated: IntegerSchema.nonnegative(),
      afterDeepPass: IntegerSchema.nonnegative().optional(),
    }).strict(),
    selectedStableMoveKey: StringSchema,
    selectionReason: z.literal('tiebreakAfterPreviewNoSignal'),
  })
  .strict();

const PolicyModuleActiveTraceEntrySchema = z
  .object({
    id: StringSchema,
    traceLabel: StringSchema,
    priorityTier: IntegerSchema,
    activationValue: NumberSchema.nullable(),
    contribution: NumberSchema,
    scoreGroups: z.record(StringSchema, NumberSchema),
  })
  .strict();

const PolicyModuleInactiveTraceEntrySchema = z
  .object({
    id: StringSchema,
    reason: z.enum(['conditionFalse', 'scopeFiltered', 'fallbackInactive']),
  })
  .strict();

const PolicyModuleTraceSchema = z
  .object({
    active: z.array(PolicyModuleActiveTraceEntrySchema),
    inactiveTopReasons: z.array(PolicyModuleInactiveTraceEntrySchema),
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

const AgentDecisionTraceSchema = z
  .object({
    kind: z.literal('policy'),
    agent: z.object({ kind: z.literal('policy'), profileId: StringSchema.optional() }).strict(),
    seatId: StringSchema.nullable(),
    requestedProfileId: StringSchema.nullable(),
    resolvedProfileId: StringSchema.nullable(),
    profileFingerprint: StringSchema.nullable(),
    initialCandidateCount: NumberSchema,
    selectedStableMoveKey: StringSchema.nullable(),
    phase1Score: NumberSchema.nullable().optional(),
    phase2Score: NumberSchema.nullable().optional(),
    phase1ActionRanking: z.array(StringSchema).optional(),
    finalScore: NumberSchema.nullable(),
    previewGatedCount: IntegerSchema.nonnegative().optional(),
    previewGatedTopFlipDetected: BooleanSchema.optional(),
    candidateParamFallbackFiredCount: IntegerSchema.nonnegative().optional(),
    pruningSteps: z.array(PolicyPruningStepTraceSchema),
    tieBreakChain: z.array(PolicyTieBreakStepTraceSchema),
    previewUsage: PolicyPreviewUsageTraceSchema,
    advisories: z.array(PolicyPreviewSignalUnavailableAdvisoryTraceSchema).optional(),
    modules: PolicyModuleTraceSchema.optional(),
    selection: PolicySelectionTraceSchema.optional(),
    emergencyFallback: BooleanSchema,
    failure: AgentDecisionFailureSummarySchema.nullable(),
    stateFeatures: z.record(z.string(), z.union([NumberSchema, StringSchema, BooleanSchema])).optional(),
    candidates: z.array(PolicyCandidateDecisionTraceSchema).optional(),
  })
  .strict();

export const SeatStandingSnapshotSchema = z
  .object({
    seat: StringSchema,
    margin: NumberSchema,
    perPlayerVars: z.record(StringSchema, z.union([NumberSchema, BooleanSchema])).optional(),
    tokenCountOnBoard: NumberSchema.optional(),
  })
  .strict();

export const ZoneSummarySchema = z
  .object({
    zoneId: StringSchema,
    zoneVars: z.record(StringSchema, NumberSchema).optional(),
    tokenCountBySeat: z.record(StringSchema, NumberSchema).optional(),
  })
  .strict();

export const DecisionPointSnapshotSchema = z
  .object({
    turnCount: NumberSchema,
    phaseId: StringSchema,
    activePlayer: IntegerSchema,
    seatStandings: z.array(SeatStandingSnapshotSchema),
  })
  .strict();

export const MicroturnSnapshotSchema = DecisionPointSnapshotSchema.extend({
  decisionContextKind: z.union([
    z.literal('actionSelection'),
    z.literal('chooseOne'),
    z.literal('chooseNStep'),
    z.literal('stochasticResolve'),
    z.literal('outcomeGrantResolve'),
    z.literal('turnRetirement'),
  ]),
  frameId: NumberSchema,
  turnId: NumberSchema,
  compoundTurnTrace: z.array(CompoundTurnTraceEntrySchema),
  globalVars: z.record(StringSchema, z.union([NumberSchema, BooleanSchema])).optional(),
  zoneSummaries: z.array(ZoneSummarySchema).optional(),
}).strict();

export const DecisionLogSchema = z
  .object({
    stateHash: z.bigint(),
    seatId: ActiveDeciderSeatIdSchema,
    playerId: IntegerSchema.optional(),
    decisionContextKind: z.union([
      z.literal('actionSelection'),
      z.literal('chooseOne'),
      z.literal('chooseNStep'),
      z.literal('stochasticResolve'),
      z.literal('outcomeGrantResolve'),
      z.literal('turnRetirement'),
    ]),
    decisionKey: StringSchema.nullable(),
    decision: DecisionSchema,
    turnId: NumberSchema,
    turnRetired: BooleanSchema,
    legalActionCount: NumberSchema,
    deltas: z.array(StateDeltaSchema),
    triggerFirings: z.array(TriggerLogEntrySchema),
    warnings: z.array(RuntimeWarningSchema),
    effectTrace: z.array(EffectTraceEntrySchema).optional(),
    conditionTrace: z.array(ConditionTraceEntrySchema).optional(),
    decisionTrace: z.array(DecisionTraceEntrySchema).optional(),
    selectorTrace: z.array(SelectorTraceEntrySchema).optional(),
    agentDecision: AgentDecisionTraceSchema.optional(),
    snapshot: MicroturnSnapshotSchema.optional(),
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
    decisions: z.array(DecisionLogSchema),
    probeHoleRecoveries: z.array(z.object({
      kind: z.literal('probeHoleRecovery'),
      stateHashBefore: z.bigint(),
      stateHashAfter: z.bigint(),
      seatId: ActiveDeciderSeatIdSchema,
      turnId: NumberSchema,
      blacklistedActionId: StringSchema,
      rolledBackFrames: NumberSchema,
      reason: StringSchema,
    }).strict()),
    recoveredFromProbeHole: NumberSchema,
    compoundTurns: z.array(z.object({
      turnId: NumberSchema,
      seatId: ActiveDeciderSeatIdSchema,
      decisionIndexRange: z.object({
        start: NumberSchema,
        end: NumberSchema,
      }).strict(),
      microturnCount: NumberSchema,
      turnStopReason: z.union([z.literal('retired'), z.literal('terminal'), z.literal('maxTurns'), z.literal('noLegalMoves')]),
    }).strict()),
    finalState: GameStateSchema,
    result: TerminalResultSchema.nullable(),
    turnsCount: NumberSchema,
    stopReason: SimulationStopReasonSchema,
    traceProtocolVersion: z.literal('spec-140'),
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

export const SerializedGameStateSchema: z.ZodTypeAny = z
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
    decisionStack: z.array(z.lazy((): z.ZodTypeAny => DecisionStackFrameSchema)),
    unavailableActionsPerTurn: z.record(StringSchema, z.array(StringSchema)).optional(),
    nextFrameId: NumberSchema,
    nextTurnId: NumberSchema,
    activeDeciderSeatId: ActiveDeciderSeatIdSchema,
  })
  .strict();

export const SerializedDecisionLogSchema = z
  .object({
    stateHash: HexBigIntSchema,
    seatId: ActiveDeciderSeatIdSchema,
    playerId: IntegerSchema.optional(),
    decisionContextKind: z.union([
      z.literal('actionSelection'),
      z.literal('chooseOne'),
      z.literal('chooseNStep'),
      z.literal('stochasticResolve'),
      z.literal('outcomeGrantResolve'),
      z.literal('turnRetirement'),
    ]),
    decisionKey: StringSchema.nullable(),
    decision: DecisionSchema,
    turnId: NumberSchema,
    turnRetired: BooleanSchema,
    legalActionCount: NumberSchema,
    deltas: z.array(StateDeltaSchema),
    triggerFirings: z.array(TriggerLogEntrySchema),
    warnings: z.array(RuntimeWarningSchema),
    effectTrace: z.array(EffectTraceEntrySchema).optional(),
    conditionTrace: z.array(ConditionTraceEntrySchema).optional(),
    decisionTrace: z.array(DecisionTraceEntrySchema).optional(),
    selectorTrace: z.array(SelectorTraceEntrySchema).optional(),
    agentDecision: AgentDecisionTraceSchema.optional(),
    snapshot: MicroturnSnapshotSchema.optional(),
  })
  .strict();

export const SerializedGameTraceSchema = z
  .object({
    gameDefId: StringSchema,
    seed: NumberSchema,
    decisions: z.array(SerializedDecisionLogSchema),
    probeHoleRecoveries: z.array(z.object({
      kind: z.literal('probeHoleRecovery'),
      stateHashBefore: HexBigIntSchema,
      stateHashAfter: HexBigIntSchema,
      seatId: ActiveDeciderSeatIdSchema,
      turnId: NumberSchema,
      blacklistedActionId: StringSchema,
      rolledBackFrames: NumberSchema,
      reason: StringSchema,
    }).strict()),
    recoveredFromProbeHole: NumberSchema,
    compoundTurns: z.array(z.object({
      turnId: NumberSchema,
      seatId: ActiveDeciderSeatIdSchema,
      decisionIndexRange: z.object({
        start: NumberSchema,
        end: NumberSchema,
      }).strict(),
      microturnCount: NumberSchema,
      turnStopReason: z.union([z.literal('retired'), z.literal('terminal'), z.literal('maxTurns'), z.literal('noLegalMoves')]),
    }).strict()),
    finalState: SerializedGameStateSchema,
    result: TerminalResultSchema.nullable(),
    turnsCount: NumberSchema,
    stopReason: SimulationStopReasonSchema,
    traceProtocolVersion: z.literal('spec-140'),
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
