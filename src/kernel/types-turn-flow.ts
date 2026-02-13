export type TurnFlowDuration = 'card' | 'nextCard' | 'coup' | 'campaign';

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
  readonly factions: readonly string[];
  readonly overrideWindows: readonly TurnFlowEligibilityOverrideWindowDef[];
}

export interface TurnFlowOptionMatrixRowDef {
  readonly first: 'event' | 'operation' | 'operationPlusSpecialActivity';
  readonly second: readonly TurnFlowActionClass[];
}

export interface TurnFlowPassRewardDef {
  readonly factionClass: string;
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
  readonly winnerActionId: string;
  readonly canceledActionId: string;
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
  readonly optionMatrix: readonly TurnFlowOptionMatrixRowDef[];
  readonly passRewards: readonly TurnFlowPassRewardDef[];
  readonly durationWindows: readonly TurnFlowDuration[];
  readonly monsoon?: TurnFlowMonsoonDef;
  readonly pivotal?: TurnFlowPivotalDef;
}

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
  readonly actedFactions: readonly string[];
  readonly passedFactions: readonly string[];
  readonly nonPassCount: number;
  readonly firstActionClass: 'event' | 'operation' | 'operationPlusSpecialActivity' | null;
}

export interface TurnFlowPendingEligibilityOverride {
  readonly faction: string;
  readonly eligible: boolean;
  readonly windowId: string;
  readonly duration: TurnFlowDuration;
}

export interface CompoundActionState {
  readonly operationProfileId: string;
  readonly saTiming: 'before' | 'during' | 'after' | null;
}

export interface TurnFlowRuntimeState {
  readonly factionOrder: readonly string[];
  readonly eligibility: Readonly<Record<string, boolean>>;
  readonly currentCard: TurnFlowRuntimeCardState;
  readonly pendingEligibilityOverrides?: readonly TurnFlowPendingEligibilityOverride[];
  readonly consecutiveCoupRounds?: number;
  readonly compoundAction?: CompoundActionState;
}

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
  readonly faction: string | null;
  readonly before: {
    readonly firstEligible: string | null;
    readonly secondEligible: string | null;
    readonly actedFactions: readonly string[];
    readonly passedFactions: readonly string[];
    readonly nonPassCount: number;
    readonly firstActionClass: 'event' | 'operation' | 'operationPlusSpecialActivity' | null;
  };
  readonly after: {
    readonly firstEligible: string | null;
    readonly secondEligible: string | null;
    readonly actedFactions: readonly string[];
    readonly passedFactions: readonly string[];
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
