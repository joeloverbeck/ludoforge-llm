export type TurnFlowDuration = 'turn' | 'nextTurn' | 'round' | 'cycle';

export type TurnFlowActionClass =
  | 'pass'
  | 'event'
  | 'operation'
  | 'limitedOperation'
  | 'operationPlusSpecialActivity';

export interface TurnFlowCardLifecycleDef {
  readonly played: string;
  readonly lookahead: string;
  readonly leader: string;
}

export interface TurnFlowEligibilityOverrideWindowDef {
  readonly id: string;
  readonly duration: TurnFlowDuration;
}

export interface TurnFlowEligibilityDef {
  readonly seats: readonly string[];
  readonly overrideWindows: readonly TurnFlowEligibilityOverrideWindowDef[];
}

export interface TurnFlowOptionMatrixRowDef {
  readonly first: 'event' | 'operation' | 'operationPlusSpecialActivity';
  readonly second: readonly TurnFlowActionClass[];
}

export interface TurnFlowPassRewardDef {
  readonly seat: string;
  readonly resource: string;
  readonly amount: number;
}

export interface TurnFlowMonsoonRestrictionDef {
  readonly actionId: string;
  readonly maxParam?: {
    readonly name: string;
    readonly max: number;
  };
  readonly overrideToken?: string;
}

export interface TurnFlowMonsoonDef {
  readonly restrictedActions: readonly TurnFlowMonsoonRestrictionDef[];
  readonly blockPivotal?: boolean;
  readonly pivotalOverrideToken?: string;
}

export interface TurnFlowInterruptCancellationDef {
  readonly winner: TurnFlowInterruptMoveSelectorDef;
  readonly canceled: TurnFlowInterruptMoveSelectorDef;
}

export interface TurnFlowInterruptMoveSelectorDef {
  readonly actionId?: string;
  readonly actionClass?: TurnFlowActionClass;
  readonly eventCardId?: string;
  readonly eventCardTagsAll?: readonly string[];
  readonly eventCardTagsAny?: readonly string[];
  readonly paramEquals?: Readonly<Record<string, string | number | boolean>>;
}

export interface TurnFlowInterruptResolutionDef {
  readonly precedence: readonly string[];
  readonly cancellation?: readonly TurnFlowInterruptCancellationDef[];
}

export interface TurnFlowPivotalDef {
  readonly actionIds: readonly string[];
  readonly requirePreActionWindow?: boolean;
  readonly disallowWhenLookaheadIsCoup?: boolean;
  readonly interrupt?: TurnFlowInterruptResolutionDef;
}

export interface TurnFlowDef {
  readonly cardLifecycle: TurnFlowCardLifecycleDef;
  readonly eligibility: TurnFlowEligibilityDef;
  readonly actionClassByActionId: Readonly<Record<string, TurnFlowActionClass>>;
  readonly optionMatrix: readonly TurnFlowOptionMatrixRowDef[];
  readonly passRewards: readonly TurnFlowPassRewardDef[];
  readonly freeOperationActionIds?: readonly string[];
  readonly durationWindows: readonly TurnFlowDuration[];
  readonly monsoon?: TurnFlowMonsoonDef;
  readonly pivotal?: TurnFlowPivotalDef;
  readonly cardSeatOrderMetadataKey?: string;
  readonly cardSeatOrderMapping?: Readonly<Record<string, string>>;
}

export interface CardDrivenTurnOrderConfig {
  readonly turnFlow: TurnFlowDef;
  readonly coupPlan?: CoupPlanDef;
}

export type TurnOrderStrategy =
  | { readonly type: 'roundRobin' }
  | { readonly type: 'fixedOrder'; readonly order: readonly string[] }
  | { readonly type: 'cardDriven'; readonly config: CardDrivenTurnOrderConfig }
  | { readonly type: 'simultaneous' };

export interface CoupPlanPhaseDef {
  readonly id: string;
  readonly steps: readonly string[];
}

export interface CoupPlanDef {
  readonly phases: readonly CoupPlanPhaseDef[];
  readonly finalRoundOmitPhases?: readonly string[];
  readonly maxConsecutiveRounds?: number;
}

export interface TurnFlowRuntimeCardState {
  readonly firstEligible: string | null;
  readonly secondEligible: string | null;
  readonly actedSeats: readonly string[];
  readonly passedSeats: readonly string[];
  readonly nonPassCount: number;
  readonly firstActionClass: 'event' | 'operation' | 'operationPlusSpecialActivity' | null;
}

export interface TurnFlowPendingEligibilityOverride {
  readonly seat: string;
  readonly eligible: boolean;
  readonly windowId: string;
  readonly duration: TurnFlowDuration;
}

export interface TurnFlowPendingFreeOperationGrant {
  readonly grantId: string;
  readonly seat: string;
  readonly executeAsSeat?: string;
  readonly operationClass: TurnFlowActionClass;
  readonly actionIds?: readonly string[];
  readonly zoneFilter?: import('./types-ast.js').ConditionAST;
  readonly remainingUses: number;
  readonly sequenceBatchId?: string;
  readonly sequenceIndex?: number;
}

export interface CompoundActionState {
  readonly operationProfileId: string;
  readonly saTiming: 'before' | 'during' | 'after' | null;
}

export interface SimultaneousMoveSubmission {
  readonly actionId: string;
  readonly params: Readonly<Record<string, import('./types-ast.js').MoveParamValue>>;
  readonly freeOperation?: boolean;
  readonly actionClass?: string;
}

export interface SimultaneousSubmissionTraceEntry {
  readonly kind: 'simultaneousSubmission';
  readonly player: number;
  readonly move: SimultaneousMoveSubmission;
  readonly submittedBefore: Readonly<Record<number, boolean>>;
  readonly submittedAfter: Readonly<Record<number, boolean>>;
}

export interface SimultaneousCommitTraceEntry {
  readonly kind: 'simultaneousCommit';
  readonly playersInOrder: readonly string[];
  readonly pendingCount: number;
}

export interface TurnFlowRuntimeState {
  readonly seatOrder: readonly string[];
  readonly eligibility: Readonly<Record<string, boolean>>;
  readonly currentCard: TurnFlowRuntimeCardState;
  readonly pendingEligibilityOverrides?: readonly TurnFlowPendingEligibilityOverride[];
  readonly pendingFreeOperationGrants?: readonly TurnFlowPendingFreeOperationGrant[];
  readonly consecutiveCoupRounds?: number;
  readonly compoundAction?: CompoundActionState;
}

export type TurnOrderRuntimeState =
  | { readonly type: 'roundRobin' }
  | { readonly type: 'fixedOrder'; readonly currentIndex: number }
  | { readonly type: 'cardDriven'; readonly runtime: TurnFlowRuntimeState }
  | {
      readonly type: 'simultaneous';
      readonly submitted: Readonly<Record<number, boolean>>;
      readonly pending: Readonly<Record<number, SimultaneousMoveSubmission>>;
    };

export type TurnFlowLifecycleStep =
  | 'initialRevealPlayed'
  | 'initialRevealLookahead'
  | 'promoteLookaheadToPlayed'
  | 'revealLookahead'
  | 'coupToLeader'
  | 'coupHandoff';

export interface TurnFlowLifecycleTraceEntry {
  readonly kind: 'turnFlowLifecycle';
  readonly step: TurnFlowLifecycleStep;
  readonly slots: {
    readonly played: string;
    readonly lookahead: string;
    readonly leader: string;
  };
  readonly before: {
    readonly playedCardId: string | null;
    readonly lookaheadCardId: string | null;
    readonly leaderCardId: string | null;
  };
  readonly after: {
    readonly playedCardId: string | null;
    readonly lookaheadCardId: string | null;
    readonly leaderCardId: string | null;
  };
}

export interface TurnFlowEligibilityTraceEntry {
  readonly kind: 'turnFlowEligibility';
  readonly step: 'candidateScan' | 'passChain' | 'cardEnd' | 'overrideCreate';
  readonly seat: string | null;
  readonly before: {
    readonly firstEligible: string | null;
    readonly secondEligible: string | null;
    readonly actedSeats: readonly string[];
    readonly passedSeats: readonly string[];
    readonly nonPassCount: number;
    readonly firstActionClass: 'event' | 'operation' | 'operationPlusSpecialActivity' | null;
  };
  readonly after: {
    readonly firstEligible: string | null;
    readonly secondEligible: string | null;
    readonly actedSeats: readonly string[];
    readonly passedSeats: readonly string[];
    readonly nonPassCount: number;
    readonly firstActionClass: 'event' | 'operation' | 'operationPlusSpecialActivity' | null;
  };
  readonly eligibilityBefore?: Readonly<Record<string, boolean>>;
  readonly eligibilityAfter?: Readonly<Record<string, boolean>>;
  readonly rewards?: readonly {
    readonly resource: string;
    readonly amount: number;
  }[];
  readonly overrides?: readonly TurnFlowPendingEligibilityOverride[];
  readonly reason?: 'rightmostPass' | 'twoNonPass';
}
