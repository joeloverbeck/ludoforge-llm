import { z } from 'zod';
import { DegeneracyFlag } from './diagnostics.js';

export const OBJECT_STRICTNESS_POLICY = 'strict' as const;

export const NumberSchema = z.number();
export const IntegerSchema = z.number().int();
export const BooleanSchema = z.boolean();
export const StringSchema = z.string();

const PlayerIdSchema = IntegerSchema;

export const PlayerSelSchema = z.union([
  z.literal('actor'),
  z.literal('active'),
  z.literal('all'),
  z.literal('allOther'),
  z.object({ id: PlayerIdSchema }).strict(),
  z.object({ chosen: StringSchema }).strict(),
  z.object({ relative: z.union([z.literal('left'), z.literal('right')]) }).strict(),
]);

export const ZoneSelSchema = StringSchema;
export const TokenSelSchema = StringSchema;

export const ReferenceSchema = z.union([
  z.object({ ref: z.literal('gvar'), var: StringSchema }).strict(),
  z
    .object({
      ref: z.literal('pvar'),
      player: PlayerSelSchema,
      var: StringSchema,
    })
    .strict(),
  z.object({ ref: z.literal('zoneCount'), zone: ZoneSelSchema }).strict(),
  z.object({ ref: z.literal('tokenProp'), token: TokenSelSchema, prop: StringSchema }).strict(),
  z.object({ ref: z.literal('binding'), name: StringSchema }).strict(),
]);

let conditionAstSchemaInternal: z.ZodTypeAny;
let optionsQuerySchemaInternal: z.ZodTypeAny;
let valueExprSchemaInternal: z.ZodTypeAny;
let effectAstSchemaInternal: z.ZodTypeAny;

export const ConditionASTSchema = z.lazy(() => conditionAstSchemaInternal);
export const OptionsQuerySchema = z.lazy(() => optionsQuerySchemaInternal);
export const ValueExprSchema = z.lazy(() => valueExprSchemaInternal);
export const EffectASTSchema = z.lazy(() => effectAstSchemaInternal);

optionsQuerySchemaInternal = z.union([
  z.object({ query: z.literal('tokensInZone'), zone: ZoneSelSchema }).strict(),
  z.object({ query: z.literal('intsInRange'), min: NumberSchema, max: NumberSchema }).strict(),
  z.object({ query: z.literal('enums'), values: z.array(StringSchema) }).strict(),
  z.object({ query: z.literal('players') }).strict(),
  z
    .object({
      query: z.literal('zones'),
      filter: z
        .object({
          owner: PlayerSelSchema.optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z.object({ query: z.literal('adjacentZones'), zone: ZoneSelSchema }).strict(),
  z.object({ query: z.literal('tokensInAdjacentZones'), zone: ZoneSelSchema }).strict(),
  z
    .object({
      query: z.literal('connectedZones'),
      zone: ZoneSelSchema,
      via: ConditionASTSchema.optional(),
      includeStart: BooleanSchema.optional(),
      maxDepth: NumberSchema.optional(),
    })
    .strict(),
]);

valueExprSchemaInternal = z.union([
  NumberSchema,
  BooleanSchema,
  StringSchema,
  ReferenceSchema,
  z
    .object({
      op: z.union([z.literal('+'), z.literal('-'), z.literal('*')]),
      left: ValueExprSchema,
      right: ValueExprSchema,
    })
    .strict(),
  z
    .object({
      aggregate: z
        .object({
          op: z.union([z.literal('sum'), z.literal('count'), z.literal('min'), z.literal('max')]),
          query: OptionsQuerySchema,
          prop: StringSchema.optional(),
        })
        .strict(),
    })
    .strict(),
]);

conditionAstSchemaInternal = z.union([
  z.object({ op: z.literal('and'), args: z.array(ConditionASTSchema) }).strict(),
  z.object({ op: z.literal('or'), args: z.array(ConditionASTSchema) }).strict(),
  z.object({ op: z.literal('not'), arg: ConditionASTSchema }).strict(),
  z
    .object({
      op: z.union([
        z.literal('=='),
        z.literal('!='),
        z.literal('<'),
        z.literal('<='),
        z.literal('>'),
        z.literal('>='),
      ]),
      left: ValueExprSchema,
      right: ValueExprSchema,
    })
    .strict(),
  z.object({ op: z.literal('in'), item: ValueExprSchema, set: ValueExprSchema }).strict(),
  z.object({ op: z.literal('adjacent'), left: ZoneSelSchema, right: ZoneSelSchema }).strict(),
  z
    .object({
      op: z.literal('connected'),
      from: ZoneSelSchema,
      to: ZoneSelSchema,
      via: ConditionASTSchema.optional(),
      maxDepth: NumberSchema.optional(),
    })
    .strict(),
]);

effectAstSchemaInternal = z.union([
  z
    .object({
      setVar: z
        .object({
          scope: z.union([z.literal('global'), z.literal('pvar')]),
          player: PlayerSelSchema.optional(),
          var: StringSchema,
          value: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      addVar: z
        .object({
          scope: z.union([z.literal('global'), z.literal('pvar')]),
          player: PlayerSelSchema.optional(),
          var: StringSchema,
          delta: ValueExprSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      moveToken: z
        .object({
          token: TokenSelSchema,
          from: ZoneSelSchema,
          to: ZoneSelSchema,
          position: z.union([z.literal('top'), z.literal('bottom'), z.literal('random')]).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      moveAll: z
        .object({
          from: ZoneSelSchema,
          to: ZoneSelSchema,
          filter: ConditionASTSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      moveTokenAdjacent: z
        .object({
          token: TokenSelSchema,
          from: ZoneSelSchema,
          direction: StringSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      draw: z
        .object({
          from: ZoneSelSchema,
          to: ZoneSelSchema,
          count: NumberSchema,
        })
        .strict(),
    })
    .strict(),
  z.object({ shuffle: z.object({ zone: ZoneSelSchema }).strict() }).strict(),
  z
    .object({
      createToken: z
        .object({
          type: StringSchema,
          zone: ZoneSelSchema,
          props: z.record(StringSchema, ValueExprSchema).optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ destroyToken: z.object({ token: TokenSelSchema }).strict() }).strict(),
  z
    .object({
      if: z
        .object({
          when: ConditionASTSchema,
          then: z.array(EffectASTSchema),
          else: z.array(EffectASTSchema).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      forEach: z
        .object({
          bind: StringSchema,
          over: OptionsQuerySchema,
          effects: z.array(EffectASTSchema),
          limit: NumberSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      let: z
        .object({
          bind: StringSchema,
          value: ValueExprSchema,
          in: z.array(EffectASTSchema),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      chooseOne: z
        .object({
          bind: StringSchema,
          options: OptionsQuerySchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      chooseN: z.union([
        z
          .object({
            bind: StringSchema,
            options: OptionsQuerySchema,
            n: NumberSchema,
          })
          .strict(),
        z
          .object({
            bind: StringSchema,
            options: OptionsQuerySchema,
            min: NumberSchema.optional(),
            max: NumberSchema,
          })
          .strict(),
      ]),
    })
    .strict(),
]);

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

export const TokenTypeDefSchema = z
  .object({
    id: StringSchema,
    props: z.record(StringSchema, z.union([z.literal('int'), z.literal('string'), z.literal('boolean')])),
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
    activePlayerOrder: z.union([z.literal('roundRobin'), z.literal('fixed')]),
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

export const PieceStatusDimensionSchema = z.union([z.literal('activity'), z.literal('tunnel')]);

export const PieceStatusValueSchema = z.union([
  z.literal('underground'),
  z.literal('active'),
  z.literal('untunneled'),
  z.literal('tunneled'),
]);

export const PieceStatusTransitionSchema = z
  .object({
    dimension: PieceStatusDimensionSchema,
    from: PieceStatusValueSchema,
    to: PieceStatusValueSchema,
  })
  .strict();

export const PieceTypeCatalogEntrySchema = z
  .object({
    id: StringSchema.min(1),
    faction: StringSchema.min(1),
    statusDimensions: z.array(PieceStatusDimensionSchema),
    transitions: z.array(PieceStatusTransitionSchema),
  })
  .strict();

export const PieceInventoryEntrySchema = z
  .object({
    pieceTypeId: StringSchema.min(1),
    faction: StringSchema.min(1),
    total: IntegerSchema.min(0),
  })
  .strict();

export const PieceCatalogPayloadSchema = z
  .object({
    pieceTypes: z.array(PieceTypeCatalogEntrySchema),
    inventory: z.array(PieceInventoryEntrySchema),
  })
  .strict();

export const MapSpaceSchema = z
  .object({
    id: StringSchema.min(1),
    spaceType: StringSchema.min(1),
    population: IntegerSchema.min(0),
    econ: IntegerSchema.min(0),
    terrainTags: z.array(StringSchema.min(1)),
    country: StringSchema.min(1),
    coastal: BooleanSchema,
    adjacentTo: z.array(StringSchema.min(1)),
  })
  .strict();

export const ProvisionalAdjacencySchema = z
  .object({
    from: StringSchema.min(1),
    to: StringSchema.min(1),
    reason: StringSchema.min(1),
  })
  .strict();

export const NumericTrackSchema = z
  .object({
    id: StringSchema.min(1),
    scope: z.union([z.literal('global'), z.literal('faction')]),
    faction: StringSchema.min(1).optional(),
    min: IntegerSchema,
    max: IntegerSchema,
    initial: IntegerSchema,
  })
  .strict();

export const SpaceMarkerConstraintSchema = z
  .object({
    spaceIds: z.array(StringSchema.min(1)).optional(),
    spaceTypes: z.array(StringSchema.min(1)).optional(),
    populationEquals: IntegerSchema.min(0).optional(),
    allowedStates: z.array(StringSchema.min(1)),
  })
  .strict();

export const SpaceMarkerLatticeSchema = z
  .object({
    id: StringSchema.min(1),
    states: z.array(StringSchema.min(1)),
    defaultState: StringSchema.min(1),
    constraints: z.array(SpaceMarkerConstraintSchema).optional(),
  })
  .strict();

export const SpaceMarkerValueSchema = z
  .object({
    spaceId: StringSchema.min(1),
    markerId: StringSchema.min(1),
    state: StringSchema.min(1),
  })
  .strict();

export const MapPayloadSchema = z
  .object({
    spaces: z.array(MapSpaceSchema),
    provisionalAdjacency: z.array(ProvisionalAdjacencySchema).optional(),
    tracks: z.array(NumericTrackSchema).optional(),
    markerLattices: z.array(SpaceMarkerLatticeSchema).optional(),
    spaceMarkers: z.array(SpaceMarkerValueSchema).optional(),
  })
  .strict();

export const DataAssetKindSchema = z.union([
  z.literal('map'),
  z.literal('scenario'),
  z.literal('pieceCatalog'),
]);

export const DataAssetRefSchema = z
  .object({
    id: StringSchema.min(1),
    kind: DataAssetKindSchema,
  })
  .strict();

export const DataAssetEnvelopeSchema = z
  .object({
    id: StringSchema.min(1),
    kind: DataAssetKindSchema,
    payload: z.unknown(),
  })
  .strict();

export const TurnFlowDurationSchema = z.union([
  z.literal('card'),
  z.literal('nextCard'),
  z.literal('coup'),
  z.literal('campaign'),
]);

export const TurnFlowActionClassSchema = z.union([
  z.literal('pass'),
  z.literal('event'),
  z.literal('operation'),
  z.literal('limitedOperation'),
  z.literal('operationPlusSpecialActivity'),
]);

export const TurnFlowCardLifecycleSchema = z
  .object({
    played: StringSchema.min(1),
    lookahead: StringSchema.min(1),
    leader: StringSchema.min(1),
  })
  .strict();

export const TurnFlowEligibilityOverrideWindowSchema = z
  .object({
    id: StringSchema.min(1),
    duration: TurnFlowDurationSchema,
  })
  .strict();

export const TurnFlowEligibilitySchema = z
  .object({
    factions: z.array(StringSchema.min(1)),
    overrideWindows: z.array(TurnFlowEligibilityOverrideWindowSchema),
  })
  .strict();

export const TurnFlowOptionMatrixRowSchema = z
  .object({
    first: z.union([z.literal('event'), z.literal('operation'), z.literal('operationPlusSpecialActivity')]),
    second: z.array(TurnFlowActionClassSchema),
  })
  .strict();

export const TurnFlowPassRewardSchema = z
  .object({
    factionClass: StringSchema.min(1),
    resource: StringSchema.min(1),
    amount: NumberSchema,
  })
  .strict();

export const TurnFlowMonsoonRestrictionSchema = z
  .object({
    actionId: StringSchema.min(1),
    maxParam: z
      .object({
        name: StringSchema.min(1),
        max: NumberSchema,
      })
      .strict()
      .optional(),
    overrideToken: StringSchema.min(1).optional(),
  })
  .strict();

export const TurnFlowMonsoonSchema = z
  .object({
    restrictedActions: z.array(TurnFlowMonsoonRestrictionSchema),
    blockPivotal: BooleanSchema.optional(),
    pivotalOverrideToken: StringSchema.min(1).optional(),
  })
  .strict();

export const TurnFlowInterruptCancellationSchema = z
  .object({
    winnerActionId: StringSchema.min(1),
    canceledActionId: StringSchema.min(1),
  })
  .strict();

export const TurnFlowInterruptResolutionSchema = z
  .object({
    precedence: z.array(StringSchema.min(1)),
    cancellation: z.array(TurnFlowInterruptCancellationSchema).optional(),
  })
  .strict();

export const TurnFlowPivotalSchema = z
  .object({
    actionIds: z.array(StringSchema.min(1)),
    requirePreActionWindow: BooleanSchema.optional(),
    disallowWhenLookaheadIsCoup: BooleanSchema.optional(),
    interrupt: TurnFlowInterruptResolutionSchema.optional(),
  })
  .strict();

export const TurnFlowSchema = z
  .object({
    cardLifecycle: TurnFlowCardLifecycleSchema,
    eligibility: TurnFlowEligibilitySchema,
    optionMatrix: z.array(TurnFlowOptionMatrixRowSchema),
    passRewards: z.array(TurnFlowPassRewardSchema),
    durationWindows: z.array(TurnFlowDurationSchema),
    monsoon: TurnFlowMonsoonSchema.optional(),
    pivotal: TurnFlowPivotalSchema.optional(),
  })
  .strict();

export const OperationProfilePartialExecutionSchema = z
  .object({
    mode: z.union([z.literal('forbid'), z.literal('allow')]),
  })
  .strict();

export const OperationProfileSchema = z
  .object({
    id: StringSchema.min(1),
    actionId: StringSchema.min(1),
    legality: z.record(StringSchema, z.unknown()),
    cost: z.record(StringSchema, z.unknown()),
    targeting: z.record(StringSchema, z.unknown()),
    resolution: z.array(z.record(StringSchema, z.unknown())).min(1),
    partialExecution: OperationProfilePartialExecutionSchema,
    linkedSpecialActivityWindows: z.array(StringSchema.min(1)).optional(),
  })
  .strict();

export const CoupPlanPhaseSchema = z
  .object({
    id: StringSchema.min(1),
    steps: z.array(StringSchema.min(1)).min(1),
  })
  .strict();

export const CoupPlanSchema = z
  .object({
    phases: z.array(CoupPlanPhaseSchema),
    finalRoundOmitPhases: z.array(StringSchema.min(1)).optional(),
    maxConsecutiveRounds: IntegerSchema.min(1).optional(),
  })
  .strict();

export const VictoryTimingSchema = z.union([z.literal('duringCoup'), z.literal('finalCoup')]);

export const VictoryCheckpointSchema = z
  .object({
    id: StringSchema.min(1),
    faction: StringSchema.min(1),
    timing: VictoryTimingSchema,
    when: ConditionASTSchema,
  })
  .strict();

export const VictoryMarginSchema = z
  .object({
    faction: StringSchema.min(1),
    value: ValueExprSchema,
  })
  .strict();

export const VictoryRankingSchema = z
  .object({
    order: z.union([z.literal('desc'), z.literal('asc')]),
  })
  .strict();

export const VictorySchema = z
  .object({
    checkpoints: z.array(VictoryCheckpointSchema),
    margins: z.array(VictoryMarginSchema).optional(),
    ranking: VictoryRankingSchema.optional(),
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
    turnFlow: TurnFlowSchema.optional(),
    operationProfiles: z.array(OperationProfileSchema).optional(),
    coupPlan: CoupPlanSchema.optional(),
    victory: VictorySchema.optional(),
    actions: z.array(ActionDefSchema),
    triggers: z.array(TriggerDefSchema),
    endConditions: z.array(EndConditionSchema),
    scoring: ScoringDefSchema.optional(),
  })
  .strict();

export const ActionUsageRecordSchema = z
  .object({
    turnCount: NumberSchema,
    phaseCount: NumberSchema,
    gameCount: NumberSchema,
  })
  .strict();

export const TurnFlowRuntimeCardStateSchema = z
  .object({
    firstEligible: StringSchema.min(1).nullable(),
    secondEligible: StringSchema.min(1).nullable(),
    actedFactions: z.array(StringSchema.min(1)),
    passedFactions: z.array(StringSchema.min(1)),
    nonPassCount: NumberSchema,
    firstActionClass: z
      .union([z.literal('event'), z.literal('operation'), z.literal('operationPlusSpecialActivity')])
      .nullable(),
  })
  .strict();

export const TurnFlowRuntimeStateSchema = z
  .object({
    factionOrder: z.array(StringSchema.min(1)),
    eligibility: z.record(StringSchema, BooleanSchema),
    currentCard: TurnFlowRuntimeCardStateSchema,
    pendingEligibilityOverrides: z
      .array(
        z
          .object({
            faction: StringSchema.min(1),
            eligible: BooleanSchema,
            windowId: StringSchema.min(1),
            duration: TurnFlowDurationSchema,
          })
          .strict(),
      )
      .optional(),
    consecutiveCoupRounds: IntegerSchema.min(0).optional(),
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
    turnFlow: TurnFlowRuntimeStateSchema.optional(),
  })
  .strict();

export const MoveParamScalarSchema = z.union([NumberSchema, StringSchema, BooleanSchema]);
export const MoveParamValueSchema = z.union([MoveParamScalarSchema, z.array(MoveParamScalarSchema)]);

export const MoveSchema = z
  .object({
    actionId: StringSchema,
    params: z.record(StringSchema, MoveParamValueSchema),
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

export const TurnFlowLifecycleStepSchema = z.union([
  z.literal('initialRevealPlayed'),
  z.literal('initialRevealLookahead'),
  z.literal('promoteLookaheadToPlayed'),
  z.literal('revealLookahead'),
  z.literal('coupToLeader'),
  z.literal('coupHandoff'),
]);

export const TurnFlowLifecycleTraceEntrySchema = z
  .object({
    kind: z.literal('turnFlowLifecycle'),
    step: TurnFlowLifecycleStepSchema,
    slots: z
      .object({
        played: StringSchema.min(1),
        lookahead: StringSchema.min(1),
        leader: StringSchema.min(1),
      })
      .strict(),
    before: z
      .object({
        playedCardId: StringSchema.min(1).nullable(),
        lookaheadCardId: StringSchema.min(1).nullable(),
        leaderCardId: StringSchema.min(1).nullable(),
      })
      .strict(),
    after: z
      .object({
        playedCardId: StringSchema.min(1).nullable(),
        lookaheadCardId: StringSchema.min(1).nullable(),
        leaderCardId: StringSchema.min(1).nullable(),
      })
      .strict(),
  })
  .strict();

export const TurnFlowEligibilityTraceEntrySchema = z
  .object({
    kind: z.literal('turnFlowEligibility'),
    step: z.union([z.literal('candidateScan'), z.literal('passChain'), z.literal('cardEnd'), z.literal('overrideCreate')]),
    faction: StringSchema.min(1).nullable(),
    before: TurnFlowRuntimeCardStateSchema,
    after: TurnFlowRuntimeCardStateSchema,
    eligibilityBefore: z.record(StringSchema, BooleanSchema).optional(),
    eligibilityAfter: z.record(StringSchema, BooleanSchema).optional(),
    rewards: z
      .array(
        z
          .object({
            resource: StringSchema.min(1),
            amount: NumberSchema,
          })
          .strict(),
      )
      .optional(),
    overrides: z
      .array(
        z
          .object({
            faction: StringSchema.min(1),
            eligible: BooleanSchema,
            windowId: StringSchema.min(1),
            duration: TurnFlowDurationSchema,
          })
          .strict(),
      )
      .optional(),
    reason: z.union([z.literal('rightmostPass'), z.literal('twoNonPass')]).optional(),
  })
  .strict();

export const TriggerLogEntrySchema = z.union([
  TriggerFiringSchema,
  TriggerTruncatedSchema,
  TurnFlowLifecycleTraceEntrySchema,
  TurnFlowEligibilityTraceEntrySchema,
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

export const VictoryTerminalRankingEntrySchema = z
  .object({
    faction: StringSchema.min(1),
    margin: NumberSchema,
    rank: IntegerSchema,
    tieBreakKey: StringSchema.min(1),
  })
  .strict();

export const VictoryTerminalMetadataSchema = z
  .object({
    timing: VictoryTimingSchema,
    checkpointId: StringSchema.min(1),
    winnerFaction: StringSchema.min(1),
    ranking: z.array(VictoryTerminalRankingEntrySchema).optional(),
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
