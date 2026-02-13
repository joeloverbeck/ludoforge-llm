import { z } from 'zod';
import { DegeneracyFlag } from './diagnostics.js';
import {
  BooleanSchema,
  ConditionASTSchema,
  EffectASTSchema,
  IntegerSchema,
  NumberSchema,
  OptionsQuerySchema,
  PlayerSelSchema,
  StringSchema,
  ValueExprSchema,
} from './schemas-ast.js';
import {
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
import { SpaceMarkerLatticeSchema, StackingConstraintSchema } from './schemas-gamespec.js';

export const VariableDefSchema = z
  .object({
    name: StringSchema,
    type: z.literal('int'),
    init: NumberSchema,
    min: NumberSchema,
    max: NumberSchema,
  })
  .strict();

export const ZoneDefSchema = z
  .object({
    id: StringSchema,
    owner: z.union([z.literal('none'), z.literal('player')]),
    visibility: z.union([z.literal('public'), z.literal('owner'), z.literal('hidden')]),
    ordering: z.union([z.literal('stack'), z.literal('queue'), z.literal('set')]),
    adjacentTo: z.array(StringSchema).optional(),
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
  })
  .strict();

export const ActionDefSchema = z
  .object({
    id: StringSchema,
    actor: PlayerSelSchema,
    phase: StringSchema,
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
    value: ValueExprSchema,
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


export const GameDefSchema = z
  .object({
    metadata: z
      .object({
        id: StringSchema,
        players: z.object({ min: NumberSchema, max: NumberSchema }).strict(),
        maxTriggerDepth: NumberSchema.optional(),
      })
      .strict(),
    constants: z.record(StringSchema, NumberSchema),
    globalVars: z.array(VariableDefSchema),
    perPlayerVars: z.array(VariableDefSchema),
    zones: z.array(ZoneDefSchema),
    tokenTypes: z.array(TokenTypeDefSchema),
    setup: z.array(EffectASTSchema),
    turnStructure: TurnStructureSchema,
    turnOrder: TurnOrderSchema.optional(),
    actionPipelines: z.array(ActionPipelineSchema).optional(),
    actions: z.array(ActionDefSchema),
    triggers: z.array(TriggerDefSchema),
    terminal: TerminalEvaluationDefSchema,
    eventDecks: z.array(EventDeckSchema).optional(),
    stackingConstraints: z.array(StackingConstraintSchema).optional(),
    markerLattices: z.array(SpaceMarkerLatticeSchema).optional(),
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
    remainingCardBoundaries: IntegerSchema.min(0).optional(),
    remainingCoupBoundaries: IntegerSchema.min(0).optional(),
    remainingCampaignBoundaries: IntegerSchema.min(0).optional(),
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
    globalVars: z.record(StringSchema, NumberSchema),
    perPlayerVars: z.record(StringSchema, z.record(StringSchema, NumberSchema)),
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
    activeLastingEffects: z.array(ActiveLastingEffectSchema).optional(),
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
]);

export const MoveLogSchema = z
  .object({
    stateHash: z.bigint(),
    player: IntegerSchema,
    move: MoveSchema,
    legalMoveCount: NumberSchema,
    deltas: z.array(StateDeltaSchema),
    triggerFirings: z.array(TriggerLogEntrySchema),
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
