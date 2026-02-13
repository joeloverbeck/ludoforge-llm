import { z } from 'zod';
import { BooleanSchema, ConditionASTSchema, EffectASTSchema, IntegerSchema, NumberSchema, StringSchema, ValueExprSchema } from './schemas-ast.js';

export const TurnFlowDurationSchema = z.union([
  z.literal('card'),
  z.literal('nextCard'),
  z.literal('coup'),
  z.literal('campaign'),
]);

export const EventCardEffectNodeSchema = z.record(StringSchema, z.unknown());

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
    selector: z.record(StringSchema, z.unknown()),
    cardinality: EventCardTargetCardinalitySchema,
  })
  .strict();

export const EventCardLastingEffectSchema = z
  .object({
    id: StringSchema.min(1),
    duration: TurnFlowDurationSchema,
    effect: z.record(StringSchema, z.unknown()),
  })
  .strict();

export const EventCardBranchSchema: z.ZodTypeAny = z
  .object({
    id: StringSchema.min(1),
    order: IntegerSchema.min(0).optional(),
    effects: z.array(EventCardEffectNodeSchema).min(1).optional(),
    targets: z.array(EventCardTargetSchema).optional(),
    lastingEffects: z.array(EventCardLastingEffectSchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.effects === undefined && value.targets === undefined && value.lastingEffects === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Branch must declare at least one of effects, targets, or lastingEffects.',
        path: [],
      });
    }
  });

export const EventCardSideSchema = z
  .object({
    effects: z.array(EventCardEffectNodeSchema).min(1).optional(),
    branches: z.array(EventCardBranchSchema).min(1).optional(),
    targets: z.array(EventCardTargetSchema).optional(),
    lastingEffects: z.array(EventCardLastingEffectSchema).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.effects === undefined && value.branches === undefined && value.targets === undefined && value.lastingEffects === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Event side must declare at least one of effects, branches, targets, or lastingEffects.',
        path: [],
      });
    }
  });

export const EventCardSchema = z
  .object({
    id: StringSchema.min(1),
    title: StringSchema.min(1),
    sideMode: z.union([z.literal('single'), z.literal('dual')]),
    order: IntegerSchema.min(0).optional(),
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

export const ActionPipelineSchema = z
  .object({
    id: StringSchema.min(1),
    actionId: StringSchema.min(1),
    applicability: ConditionASTSchema.optional(),
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
    compoundAction: z
      .object({
        operationProfileId: StringSchema.min(1),
        saTiming: z.union([z.literal('before'), z.literal('during'), z.literal('after'), z.null()]),
      })
      .strict()
      .optional(),
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

export const OperationPartialTraceEntrySchema = z
  .object({
    kind: z.literal('operationPartial'),
    actionId: StringSchema.min(1),
    profileId: StringSchema.min(1),
    step: z.literal('costSpendSkipped'),
    reason: z.literal('costValidationFailed'),
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
