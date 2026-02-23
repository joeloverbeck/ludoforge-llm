import { z } from 'zod';
import {
  BooleanSchema,
  ConditionASTSchema,
  EffectASTSchema,
  IntegerSchema,
  NumberSchema,
  OptionsQuerySchema,
  StringSchema,
  ValueExprSchema,
} from './schemas-ast.js';
import {
  TURN_FLOW_INTERRUPT_SELECTOR_EMPTY_MESSAGE,
  hasTurnFlowInterruptSelectorMatchField,
} from './turn-flow-interrupt-selector-contract.js';
import {
  TURN_FLOW_ACTION_CLASS_VALUES,
  TURN_FLOW_DURATION_VALUES,
} from './turn-flow-contract.js';

export const TurnFlowDurationSchema = z.enum(TURN_FLOW_DURATION_VALUES);

export const EventCardTargetCardinalitySchema = z.union([
  z
    .object({
      n: IntegerSchema.min(0),
    })
    .strict(),
  z
    .object({
      min: IntegerSchema.min(0).optional(),
      max: IntegerSchema.min(0),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.min !== undefined && value.min > value.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Target cardinality min must be <= max.',
          path: ['min'],
        });
      }
    }),
]);

export const EventCardTargetSchema = z
  .object({
    id: StringSchema.min(1),
    selector: OptionsQuerySchema,
    cardinality: EventCardTargetCardinalitySchema,
  })
  .strict();

export const EventCardLastingEffectSchema = z
  .object({
    id: StringSchema.min(1),
    duration: TurnFlowDurationSchema,
    setupEffects: z.array(EffectASTSchema).min(1),
    teardownEffects: z.array(EffectASTSchema).min(1).optional(),
  })
  .strict();

export const EventCardFreeOperationGrantSchema = z
  .object({
    sequence: z
      .object({
        chain: StringSchema.min(1),
        step: IntegerSchema.min(0),
      })
      .strict(),
    id: StringSchema.min(1).optional(),
    seat: StringSchema.min(1),
    executeAsSeat: StringSchema.min(1).optional(),
    operationClass: z.enum(TURN_FLOW_ACTION_CLASS_VALUES),
    actionIds: z.array(StringSchema.min(1)).min(1).optional(),
    zoneFilter: ConditionASTSchema.optional(),
    uses: IntegerSchema.min(1).optional(),
  })
  .strict();

export const EventCardEligibilityOverrideTargetSchema = z.union([
  z
    .object({
      kind: z.literal('active'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('seat'),
      seat: StringSchema.min(1),
    })
    .strict(),
]);

export const EventCardEligibilityOverrideSchema = z
  .object({
    target: EventCardEligibilityOverrideTargetSchema,
    eligible: BooleanSchema,
    windowId: StringSchema.min(1),
  })
  .strict();

export const EventCardBranchSchema: z.ZodTypeAny = z
  .object({
    id: StringSchema.min(1),
    order: IntegerSchema.min(0).optional(),
    freeOperationGrants: z.array(EventCardFreeOperationGrantSchema).min(1).optional(),
    eligibilityOverrides: z.array(EventCardEligibilityOverrideSchema).min(1).optional(),
    effects: z.array(EffectASTSchema).min(1).optional(),
    targets: z.array(EventCardTargetSchema).optional(),
    lastingEffects: z.array(EventCardLastingEffectSchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.freeOperationGrants === undefined &&
      value.eligibilityOverrides === undefined &&
      value.effects === undefined &&
      value.targets === undefined &&
      value.lastingEffects === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Branch must declare at least one of freeOperationGrants, eligibilityOverrides, effects, targets, or lastingEffects.',
        path: [],
      });
    }
  });

export const EventCardSideSchema = z
  .object({
    text: StringSchema.optional(),
    freeOperationGrants: z.array(EventCardFreeOperationGrantSchema).min(1).optional(),
    eligibilityOverrides: z.array(EventCardEligibilityOverrideSchema).min(1).optional(),
    effects: z.array(EffectASTSchema).min(1).optional(),
    branches: z.array(EventCardBranchSchema).min(1).optional(),
    targets: z.array(EventCardTargetSchema).optional(),
    lastingEffects: z.array(EventCardLastingEffectSchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.text === undefined &&
      value.freeOperationGrants === undefined &&
      value.eligibilityOverrides === undefined &&
      value.effects === undefined &&
      value.branches === undefined &&
      value.targets === undefined &&
      value.lastingEffects === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Event side must declare at least one of text, freeOperationGrants, eligibilityOverrides, effects, branches, targets, or lastingEffects.',
        path: [],
      });
    }
  });

export const EventCardMetadataSchema = z.record(
  StringSchema,
  z.union([StringSchema, NumberSchema, z.boolean(), z.array(StringSchema)]),
);

export const EventCardSchema = z
  .object({
    id: StringSchema.min(1),
    title: StringSchema.min(1),
    sideMode: z.union([z.literal('single'), z.literal('dual')]),
    order: IntegerSchema.min(0).optional(),
    tags: z.array(StringSchema.min(1)).optional(),
    metadata: EventCardMetadataSchema.optional(),
    playCondition: ConditionASTSchema.optional(),
    unshaded: EventCardSideSchema.optional(),
    shaded: EventCardSideSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.sideMode === 'dual') {
      if (value.unshaded === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Dual-use cards must declare an unshaded side payload.',
          path: ['unshaded'],
        });
      }
      if (value.shaded === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Dual-use cards must declare a shaded side payload.',
          path: ['shaded'],
        });
      }
      return;
    }

    if (value.unshaded === undefined && value.shaded === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Single-side cards must declare at least one side payload.',
        path: [],
      });
    }
  });

export const EventDeckSchema = z
  .object({
    id: StringSchema.min(1),
    drawZone: StringSchema.min(1),
    discardZone: StringSchema.min(1),
    shuffleOnSetup: BooleanSchema.optional(),
    cards: z.array(EventCardSchema),
  })
  .strict();

export const TurnFlowActionClassSchema = z.enum(TURN_FLOW_ACTION_CLASS_VALUES);

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
    seats: z.array(StringSchema.min(1)),
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
    seat: StringSchema.min(1),
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

const TurnFlowInterruptMoveSelectorSchema = z
  .object({
    actionId: StringSchema.min(1).optional(),
    actionClass: TurnFlowActionClassSchema.optional(),
    eventCardId: StringSchema.min(1).optional(),
    eventCardTagsAll: z.array(StringSchema.min(1)).optional(),
    eventCardTagsAny: z.array(StringSchema.min(1)).optional(),
    paramEquals: z.record(z.string(), z.union([StringSchema, NumberSchema, BooleanSchema])).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!hasTurnFlowInterruptSelectorMatchField(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: TURN_FLOW_INTERRUPT_SELECTOR_EMPTY_MESSAGE,
      });
    }
  });

export const TurnFlowInterruptCancellationSchema = z
  .object({
    winner: TurnFlowInterruptMoveSelectorSchema,
    canceled: TurnFlowInterruptMoveSelectorSchema,
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
    actionClassByActionId: z.record(StringSchema.min(1), TurnFlowActionClassSchema),
    optionMatrix: z.array(TurnFlowOptionMatrixRowSchema),
    passRewards: z.array(TurnFlowPassRewardSchema),
    freeOperationActionIds: z.array(StringSchema.min(1)).optional(),
    durationWindows: z.array(TurnFlowDurationSchema),
    monsoon: TurnFlowMonsoonSchema.optional(),
    pivotal: TurnFlowPivotalSchema.optional(),
  })
  .strict();

export const ActionPipelineTargetingSchema = z
  .object({
    select: z.union([z.literal('upToN'), z.literal('allEligible'), z.literal('exactN')]).optional(),
    max: z.number().int().min(1).optional(),
    filter: ConditionASTSchema.optional(),
    order: StringSchema.optional(),
    tieBreak: StringSchema.optional(),
  })
  .strict();

export const ActionPipelineStageSchema = z
  .object({
    stage: StringSchema.optional(),
    effects: z.array(EffectASTSchema),
  })
  .strict();

export const ActionPipelineCompoundParamConstraintSchema = z
  .object({
    relation: z.union([z.literal('disjoint'), z.literal('subset')]),
    operationParam: StringSchema.min(1),
    specialActivityParam: StringSchema.min(1),
  })
  .strict();

export const ActionPipelineSchema = z
  .object({
    id: StringSchema.min(1),
    actionId: StringSchema.min(1),
    applicability: ConditionASTSchema.optional(),
    accompanyingOps: z.union([z.literal('any'), z.array(StringSchema.min(1))]).optional(),
    compoundParamConstraints: z.array(ActionPipelineCompoundParamConstraintSchema).optional(),
    legality: ConditionASTSchema.nullable(),
    costValidation: ConditionASTSchema.nullable(),
    costEffects: z.array(EffectASTSchema),
    targeting: ActionPipelineTargetingSchema,
    stages: z.array(ActionPipelineStageSchema).min(1),
    atomicity: z.union([z.literal('atomic'), z.literal('partial')]),
    linkedWindows: z.array(StringSchema.min(1)).optional(),
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
    phases: z.array(CoupPlanPhaseSchema).min(1),
    finalRoundOmitPhases: z.array(StringSchema.min(1)).optional(),
    maxConsecutiveRounds: IntegerSchema.min(1).optional(),
  })
  .strict();

export const TurnOrderSchema = z.union([
  z.object({ type: z.literal('roundRobin') }).strict(),
  z.object({ type: z.literal('fixedOrder'), order: z.array(StringSchema.min(1)).min(1) }).strict(),
  z
    .object({
      type: z.literal('cardDriven'),
      config: z
        .object({
          turnFlow: TurnFlowSchema,
          coupPlan: CoupPlanSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal('simultaneous') }).strict(),
]);

export const VictoryTimingSchema = z.union([z.literal('duringCoup'), z.literal('finalCoup')]);

export const VictoryCheckpointSchema = z
  .object({
    id: StringSchema.min(1),
    seat: StringSchema.min(1),
    timing: VictoryTimingSchema,
    when: ConditionASTSchema,
  })
  .strict();

export const VictoryMarginSchema = z
  .object({
    seat: StringSchema.min(1),
    value: ValueExprSchema,
  })
  .strict();

export const VictoryRankingSchema = z
  .object({
    order: z.union([z.literal('desc'), z.literal('asc')]),
    tieBreakOrder: z.array(StringSchema.min(1)).optional(),
  })
  .strict();

export const VictorySchema = z
  .object({
    checkpoints: z.array(VictoryCheckpointSchema),
    margins: z.array(VictoryMarginSchema).optional(),
    ranking: VictoryRankingSchema.optional(),
  })
  .strict();

export const TurnFlowRuntimeCardStateSchema = z
  .object({
    firstEligible: StringSchema.min(1).nullable(),
    secondEligible: StringSchema.min(1).nullable(),
    actedSeats: z.array(StringSchema.min(1)),
    passedSeats: z.array(StringSchema.min(1)),
    nonPassCount: NumberSchema,
    firstActionClass: z
      .union([z.literal('event'), z.literal('operation'), z.literal('operationPlusSpecialActivity')])
      .nullable(),
  })
  .strict();

export const TurnFlowRuntimeStateSchema = z
  .object({
    seatOrder: z.array(StringSchema.min(1)),
    eligibility: z.record(StringSchema, BooleanSchema),
    currentCard: TurnFlowRuntimeCardStateSchema,
    pendingEligibilityOverrides: z
      .array(
        z
          .object({
            seat: StringSchema.min(1),
            eligible: BooleanSchema,
            windowId: StringSchema.min(1),
            duration: TurnFlowDurationSchema,
          })
          .strict(),
      )
      .optional(),
    pendingFreeOperationGrants: z
      .array(
        z
          .object({
            grantId: StringSchema.min(1),
            seat: StringSchema.min(1),
            executeAsSeat: StringSchema.min(1).optional(),
            operationClass: TurnFlowActionClassSchema,
            actionIds: z.array(StringSchema.min(1)).min(1).optional(),
            zoneFilter: ConditionASTSchema.optional(),
            remainingUses: IntegerSchema.min(1),
            sequenceBatchId: StringSchema.min(1).optional(),
            sequenceIndex: IntegerSchema.min(0).optional(),
          })
          .strict(),
      )
      .optional(),
    consecutiveCoupRounds: IntegerSchema.min(0).optional(),
    compoundAction: z
      .object({
        operationProfileId: StringSchema.min(1),
        saTiming: z.union([z.literal('before'), z.literal('during'), z.literal('after'), z.null()]),
      })
      .strict()
      .optional(),
  })
  .strict();

export const TurnOrderRuntimeStateSchema = z.union([
  z.object({ type: z.literal('roundRobin') }).strict(),
  z.object({ type: z.literal('fixedOrder'), currentIndex: IntegerSchema.min(0) }).strict(),
  z.object({ type: z.literal('cardDriven'), runtime: TurnFlowRuntimeStateSchema }).strict(),
  z
    .object({
      type: z.literal('simultaneous'),
      submitted: z.record(StringSchema, BooleanSchema),
      pending: z.record(
        StringSchema,
        z
          .object({
            actionId: StringSchema.min(1),
            params: z.record(StringSchema, z.union([NumberSchema, StringSchema, BooleanSchema, z.array(z.union([NumberSchema, StringSchema, BooleanSchema]))])),
            freeOperation: BooleanSchema.optional(),
            actionClass: StringSchema.optional(),
          })
          .strict(),
      ),
    })
    .strict(),
]);

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
    seat: StringSchema.min(1).nullable(),
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
            seat: StringSchema.min(1),
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

export const OperationPartialTraceEntrySchema = z
  .object({
    kind: z.literal('operationPartial'),
    actionId: StringSchema.min(1),
    profileId: StringSchema.min(1),
    step: z.literal('costSpendSkipped'),
    reason: z.literal('costValidationFailed'),
  })
  .strict();

export const OperationFreeTraceEntrySchema = z
  .object({
    kind: z.literal('operationFree'),
    actionId: StringSchema.min(1),
    step: z.literal('costSpendSkipped'),
  })
  .strict();

export const SimultaneousSubmissionTraceEntrySchema = z
  .object({
    kind: z.literal('simultaneousSubmission'),
    player: NumberSchema,
    move: z
      .object({
        actionId: StringSchema.min(1),
        params: z.record(StringSchema, z.union([NumberSchema, StringSchema, BooleanSchema, z.array(z.union([NumberSchema, StringSchema, BooleanSchema]))])),
        freeOperation: BooleanSchema.optional(),
        actionClass: StringSchema.optional(),
      })
      .strict(),
    submittedBefore: z.record(StringSchema, BooleanSchema),
    submittedAfter: z.record(StringSchema, BooleanSchema),
  })
  .strict();

export const SimultaneousCommitTraceEntrySchema = z
  .object({
    kind: z.literal('simultaneousCommit'),
    playersInOrder: z.array(StringSchema.min(1)),
    pendingCount: IntegerSchema.min(0),
  })
  .strict();

export const VictoryTerminalRankingEntrySchema = z
  .object({
    seat: StringSchema.min(1),
    margin: NumberSchema,
    rank: IntegerSchema,
    tieBreakKey: StringSchema.min(1),
  })
  .strict();

export const VictoryTerminalMetadataSchema = z
  .object({
    timing: VictoryTimingSchema,
    checkpointId: StringSchema.min(1),
    winnerSeat: StringSchema.min(1),
    ranking: z.array(VictoryTerminalRankingEntrySchema).optional(),
  })
  .strict();
