import { z } from 'zod';
import { DegeneracyFlag } from './diagnostics.js';
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
  TokenFilterPredicateSchema,
} from './schemas-ast.js';
import {
  OperationFreeTraceEntrySchema,
  OperationPartialTraceEntrySchema,
  SimultaneousCommitTraceEntrySchema,
  SimultaneousSubmissionTraceEntrySchema,
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
  })
  .strict();

export const BooleanVariableDefSchema = z
  .object({
    name: StringSchema,
    type: z.literal('boolean'),
    init: BooleanSchema,
  })
  .strict();

export const VariableDefSchema = z.discriminatedUnion('type', [IntVariableDefSchema, BooleanVariableDefSchema]);

export const ZoneDefSchema = z
  .object({
    id: StringSchema,
    zoneKind: z.union([z.literal('board'), z.literal('aux')]).optional(),
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
  })
  .strict();

export const TokenTypeTransitionSchema = z
  .object({
    prop: StringSchema,
    from: StringSchema,
    to: StringSchema,
  })
  .strict();

export const TokenTypeDefSchema = z
  .object({
    id: StringSchema,
    seat: StringSchema.optional(),
    props: z.record(StringSchema, z.union([z.literal('int'), z.literal('string'), z.literal('boolean')])),
    transitions: z.array(TokenTypeTransitionSchema).optional(),
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
    filter: z.array(TokenFilterPredicateSchema).optional(),
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
    scope: z.union([z.literal('turn'), z.literal('phase'), z.literal('game')]),
    max: NumberSchema,
  })
  .strict();

export const PhaseDefSchema = z
  .object({
    id: StringSchema,
    onEnter: z.array(EffectASTSchema).optional(),
    onExit: z.array(EffectASTSchema).optional(),
  })
  .strict();

export const TurnStructureSchema = z
  .object({
    phases: z.array(PhaseDefSchema),
    interrupts: z.array(PhaseDefSchema).optional(),
  })
  .strict();

export const ActionDefSchema = z
  .object({
    id: StringSchema,
    actor: PlayerSelSchema,
    executor: ActionExecutorSelSchema,
    phase: z.array(StringSchema).min(1),
    capabilities: z.array(StringSchema.min(1)).optional(),
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
      scope: z.union([z.literal('global'), z.literal('perPlayer')]).optional(),
      var: StringSchema.optional(),
      player: IntegerSchema.optional(),
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

export const DerivedMetricDefSchema = z
  .object({
    id: StringSchema,
    computation: DerivedMetricComputationSchema,
    zoneFilter: DerivedMetricZoneFilterSchema.optional(),
    requirements: z.array(DerivedMetricRequirementSchema).min(1),
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
    turnOrder: TurnOrderSchema.optional(),
    actionPipelines: z.array(ActionPipelineSchema).optional(),
    derivedMetrics: z.array(DerivedMetricDefSchema).optional(),
    actions: z.array(ActionDefSchema),
    triggers: z.array(TriggerDefSchema),
    terminal: TerminalEvaluationDefSchema,
    eventDecks: z.array(EventDeckSchema).optional(),
    stackingConstraints: z.array(StackingConstraintSchema).optional(),
    markerLattices: z.array(SpaceMarkerLatticeSchema).optional(),
    globalMarkerLattices: z.array(GlobalMarkerLatticeSchema).optional(),
    runtimeDataAssets: z.array(RuntimeDataAssetSchema).optional(),
    tableContracts: z.array(RuntimeTableContractSchema).optional(),
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
  z.literal('EMPTY_QUERY_RESULT'),
  z.literal('TOKEN_NOT_IN_ZONE'),
  z.literal('BINDING_UNDEFINED'),
  z.literal('EMPTY_ZONE_OPERATION'),
  z.literal('ZERO_EFFECT_ITERATIONS'),
  z.literal('MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED'),
  z.literal('MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED'),
  z.literal('MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED'),
  z.literal('MOVE_ENUM_DEFERRED_PREDICATE_BUDGET_EXCEEDED'),
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
      z.literal('lifecycleEffect'),
      z.literal('triggerEffect'),
      z.literal('lifecycleEvent'),
    ]),
    actionId: StringSchema.optional(),
    effectPath: StringSchema,
  })
  .strict();

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
      macroOrigin: MacroOriginSchema.optional(),
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
      kind: z.literal('varChange'),
      scope: z.union([z.literal('global'), z.literal('perPlayer')]),
      varName: StringSchema,
      oldValue: z.union([NumberSchema, BooleanSchema]),
      newValue: z.union([NumberSchema, BooleanSchema]),
      player: IntegerSchema.optional(),
      provenance: EffectTraceProvenanceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('resourceTransfer'),
      from: z
        .object({
          scope: z.union([z.literal('global'), z.literal('perPlayer')]),
          varName: StringSchema,
          player: IntegerSchema.optional(),
        })
        .strict(),
      to: z
        .object({
          scope: z.union([z.literal('global'), z.literal('perPlayer')]),
          varName: StringSchema,
          player: IntegerSchema.optional(),
        })
        .strict(),
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
  SimultaneousSubmissionTraceEntrySchema,
  SimultaneousCommitTraceEntrySchema,
  OperationPartialTraceEntrySchema,
  OperationFreeTraceEntrySchema,
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

export const DegeneracyFlagSchema = z.nativeEnum(DegeneracyFlag);


export const EvalReportSchema = z
  .object({
    gameDefId: StringSchema,
    runCount: NumberSchema,
    metrics: MetricsSchema,
    degeneracyFlags: z.array(DegeneracyFlagSchema),
    traces: z.array(GameTraceSchema),
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
    traces: z.array(SerializedGameTraceSchema),
  })
  .strict();
