import type {
  ActionId,
  PhaseId,
  PlayerId,
  TokenId,
  TriggerId,
  ZoneId,
} from './branded.js';
import type { DegeneracyFlag } from './diagnostics.js';

export interface RngState {
  readonly algorithm: 'pcg-dxsm-128';
  readonly version: 1;
  readonly state: readonly bigint[];
}

export interface Rng {
  readonly state: RngState;
}

export type PlayerSel =
  | 'actor'
  | 'active'
  | 'all'
  | 'allOther'
  | { readonly id: PlayerId }
  | { readonly chosen: string }
  | { readonly relative: 'left' | 'right' };

export type ZoneSel = string;
export type TokenSel = string;

export type Reference =
  | { readonly ref: 'gvar'; readonly var: string }
  | { readonly ref: 'pvar'; readonly player: PlayerSel; readonly var: string }
  | { readonly ref: 'zoneCount'; readonly zone: ZoneSel }
  | { readonly ref: 'tokenProp'; readonly token: TokenSel; readonly prop: string }
  | { readonly ref: 'binding'; readonly name: string }
  | { readonly ref: 'markerState'; readonly space: ZoneSel; readonly marker: string }
  | { readonly ref: 'tokenZone'; readonly token: TokenSel }
  | { readonly ref: 'zoneProp'; readonly zone: ZoneSel; readonly prop: string };

export type ValueExpr =
  | number
  | boolean
  | string
  | Reference
  | {
      readonly op: '+' | '-' | '*' | '/';
      readonly left: ValueExpr;
      readonly right: ValueExpr;
    }
  | {
      readonly aggregate: {
        readonly op: 'sum' | 'count' | 'min' | 'max';
        readonly query: OptionsQuery;
        readonly prop?: string;
      };
    };

export type ConditionAST =
  | { readonly op: 'and'; readonly args: readonly ConditionAST[] }
  | { readonly op: 'or'; readonly args: readonly ConditionAST[] }
  | { readonly op: 'not'; readonly arg: ConditionAST }
  | {
      readonly op: '==' | '!=' | '<' | '<=' | '>' | '>=';
      readonly left: ValueExpr;
      readonly right: ValueExpr;
    }
  | { readonly op: 'in'; readonly item: ValueExpr; readonly set: ValueExpr }
  | { readonly op: 'adjacent'; readonly left: ZoneSel; readonly right: ZoneSel }
  | {
      readonly op: 'connected';
      readonly from: ZoneSel;
      readonly to: ZoneSel;
      readonly via?: ConditionAST;
      readonly maxDepth?: number;
    }
  | {
      readonly op: 'zonePropIncludes';
      readonly zone: ZoneSel;
      readonly prop: string;
      readonly value: ValueExpr;
    };

export interface TokenFilterPredicate {
  readonly prop: string;
  readonly op: 'eq' | 'neq' | 'in' | 'notIn';
  readonly value: string | readonly string[];
}

export type OptionsQuery =
  | { readonly query: 'tokensInZone'; readonly zone: ZoneSel; readonly filter?: readonly TokenFilterPredicate[] }
  | { readonly query: 'intsInRange'; readonly min: number; readonly max: number }
  | { readonly query: 'enums'; readonly values: readonly string[] }
  | { readonly query: 'players' }
  | { readonly query: 'zones'; readonly filter?: { readonly owner?: PlayerSel } }
  | { readonly query: 'adjacentZones'; readonly zone: ZoneSel }
  | { readonly query: 'tokensInAdjacentZones'; readonly zone: ZoneSel; readonly filter?: readonly TokenFilterPredicate[] }
  | {
      readonly query: 'connectedZones';
      readonly zone: ZoneSel;
      readonly via?: ConditionAST;
      readonly includeStart?: boolean;
      readonly maxDepth?: number;
    }
  | { readonly query: 'binding'; readonly name: string };

export type EffectAST =
  | {
      readonly setVar: {
        readonly scope: 'global' | 'pvar';
        readonly player?: PlayerSel;
        readonly var: string;
        readonly value: ValueExpr;
      };
    }
  | {
      readonly addVar: {
        readonly scope: 'global' | 'pvar';
        readonly player?: PlayerSel;
        readonly var: string;
        readonly delta: ValueExpr;
      };
    }
  | {
      readonly moveToken: {
        readonly token: TokenSel;
        readonly from: ZoneSel;
        readonly to: ZoneSel;
        readonly position?: 'top' | 'bottom' | 'random';
      };
    }
  | {
      readonly moveAll: {
        readonly from: ZoneSel;
        readonly to: ZoneSel;
        readonly filter?: ConditionAST;
      };
    }
  | {
      readonly moveTokenAdjacent: {
        readonly token: TokenSel;
        readonly from: ZoneSel;
        readonly direction?: string;
      };
    }
  | {
      readonly draw: {
        readonly from: ZoneSel;
        readonly to: ZoneSel;
        readonly count: number;
      };
    }
  | { readonly shuffle: { readonly zone: ZoneSel } }
  | {
      readonly createToken: {
        readonly type: string;
        readonly zone: ZoneSel;
        readonly props?: Readonly<Record<string, ValueExpr>>;
      };
    }
  | { readonly destroyToken: { readonly token: TokenSel } }
  | {
      readonly setTokenProp: {
        readonly token: TokenSel;
        readonly prop: string;
        readonly value: ValueExpr;
      };
    }
  | {
      readonly if: {
        readonly when: ConditionAST;
        readonly then: readonly EffectAST[];
        readonly else?: readonly EffectAST[];
      };
    }
  | {
      readonly forEach: {
        readonly bind: string;
        readonly over: OptionsQuery;
        readonly effects: readonly EffectAST[];
        readonly limit?: number;
      };
    }
  | {
      readonly let: {
        readonly bind: string;
        readonly value: ValueExpr;
        readonly in: readonly EffectAST[];
      };
    }
  | {
      readonly chooseOne: {
        readonly bind: string;
        readonly options: OptionsQuery;
      };
    }
  | {
      readonly chooseN: {
        readonly bind: string;
        readonly options: OptionsQuery;
      } & (
        | {
            readonly n: number;
            readonly min?: never;
            readonly max?: never;
          }
        | {
            readonly min?: number;
            readonly max: number;
            readonly n?: never;
          }
      );
    }
  | {
      readonly rollRandom: {
        readonly bind: string;
        readonly min: ValueExpr;
        readonly max: ValueExpr;
        readonly in: readonly EffectAST[];
      };
    }
  | {
      readonly setMarker: {
        readonly space: ZoneSel;
        readonly marker: string;
        readonly state: ValueExpr;
      };
    }
  | {
      readonly shiftMarker: {
        readonly space: ZoneSel;
        readonly marker: string;
        readonly delta: ValueExpr;
      };
    };

export interface VariableDef {
  readonly name: string;
  readonly type: 'int';
  readonly init: number;
  readonly min: number;
  readonly max: number;
}

export interface ZoneDef {
  readonly id: ZoneId;
  readonly owner: 'none' | 'player';
  readonly visibility: 'public' | 'owner' | 'hidden';
  readonly ordering: 'stack' | 'queue' | 'set';
  readonly adjacentTo?: readonly ZoneId[];
}

export interface TokenTypeTransition {
  readonly prop: string;
  readonly from: string;
  readonly to: string;
}

export interface TokenTypeDef {
  readonly id: string;
  readonly props: Readonly<Record<string, 'int' | 'string' | 'boolean'>>;
  readonly transitions?: readonly TokenTypeTransition[];
}

export interface Token {
  readonly id: TokenId;
  readonly type: string;
  readonly props: Readonly<Record<string, number | string | boolean>>;
}

export interface ParamDef {
  readonly name: string;
  readonly domain: OptionsQuery;
}

export interface LimitDef {
  readonly scope: 'turn' | 'phase' | 'game';
  readonly max: number;
}

export interface PhaseDef {
  readonly id: PhaseId;
  readonly onEnter?: readonly EffectAST[];
  readonly onExit?: readonly EffectAST[];
}

export interface TurnStructure {
  readonly phases: readonly PhaseDef[];
  readonly activePlayerOrder: 'roundRobin' | 'fixed';
}

export interface ActionDef {
  readonly id: ActionId;
  readonly actor: PlayerSel;
  readonly phase: PhaseId;
  readonly params: readonly ParamDef[];
  readonly pre: ConditionAST | null;
  readonly cost: readonly EffectAST[];
  readonly effects: readonly EffectAST[];
  readonly limits: readonly LimitDef[];
}

export type TriggerEvent =
  | { readonly type: 'phaseEnter'; readonly phase: PhaseId }
  | { readonly type: 'phaseExit'; readonly phase: PhaseId }
  | { readonly type: 'turnStart' }
  | { readonly type: 'turnEnd' }
  | { readonly type: 'actionResolved'; readonly action?: ActionId }
  | { readonly type: 'tokenEntered'; readonly zone?: ZoneId };

export interface TriggerDef {
  readonly id: TriggerId;
  readonly event: TriggerEvent;
  readonly match?: ConditionAST;
  readonly when?: ConditionAST;
  readonly effects: readonly EffectAST[];
}

export type TerminalResultDef =
  | { readonly type: 'win'; readonly player: PlayerSel }
  | { readonly type: 'lossAll' }
  | { readonly type: 'draw' }
  | { readonly type: 'score' };

export interface EndCondition {
  readonly when: ConditionAST;
  readonly result: TerminalResultDef;
}

export interface ScoringDef {
  readonly method: 'highest' | 'lowest';
  readonly value: ValueExpr;
}

export interface GameDef {
  readonly metadata: {
    readonly id: string;
    readonly players: { readonly min: number; readonly max: number };
    readonly maxTriggerDepth?: number;
  };
  readonly constants: Readonly<Record<string, number>>;
  readonly globalVars: readonly VariableDef[];
  readonly perPlayerVars: readonly VariableDef[];
  readonly zones: readonly ZoneDef[];
  readonly tokenTypes: readonly TokenTypeDef[];
  readonly setup: readonly EffectAST[];
  readonly turnStructure: TurnStructure;
  readonly turnFlow?: TurnFlowDef;
  readonly operationProfiles?: readonly OperationProfileDef[];
  readonly coupPlan?: CoupPlanDef;
  readonly victory?: VictoryDef;
  readonly actions: readonly ActionDef[];
  readonly triggers: readonly TriggerDef[];
  readonly endConditions: readonly EndCondition[];
  readonly scoring?: ScoringDef;
  readonly eventCards?: readonly EventCardDef[];
  readonly stackingConstraints?: readonly StackingConstraint[];
  readonly markerLattices?: readonly SpaceMarkerLatticeDef[];
}

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

export interface OperationProfilePartialExecutionDef {
  readonly mode: 'forbid' | 'allow';
}

export interface OperationLegalityDef {
  readonly when?: ConditionAST;
}

export interface OperationCostDef {
  readonly validate?: ConditionAST;
  readonly spend?: readonly EffectAST[];
}

export interface OperationTargetingDef {
  readonly select?: 'upToN' | 'allEligible' | 'exactN';
  readonly max?: number;
  readonly filter?: ConditionAST;
  readonly order?: string;
  readonly tieBreak?: string;
}

export interface OperationResolutionStageDef {
  readonly stage?: string;
  readonly effects: readonly EffectAST[];
}

export interface OperationProfileDef {
  readonly id: string;
  readonly actionId: ActionId;
  readonly legality: OperationLegalityDef;
  readonly cost: OperationCostDef;
  readonly targeting: OperationTargetingDef;
  readonly resolution: readonly OperationResolutionStageDef[];
  readonly partialExecution: OperationProfilePartialExecutionDef;
  readonly linkedSpecialActivityWindows?: readonly string[];
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

export type VictoryTiming = 'duringCoup' | 'finalCoup';

export interface VictoryCheckpointDef {
  readonly id: string;
  readonly faction: string;
  readonly timing: VictoryTiming;
  readonly when: ConditionAST;
}

export interface VictoryMarginDef {
  readonly faction: string;
  readonly value: ValueExpr;
}

export interface VictoryRankingDef {
  readonly order: 'desc' | 'asc';
}

export interface VictoryDef {
  readonly checkpoints: readonly VictoryCheckpointDef[];
  readonly margins?: readonly VictoryMarginDef[];
  readonly ranking?: VictoryRankingDef;
}

export interface EventCardTargetCardinalityExact {
  readonly n: number;
}

export interface EventCardTargetCardinalityRange {
  readonly min?: number;
  readonly max: number;
}

export type EventCardTargetCardinality = EventCardTargetCardinalityExact | EventCardTargetCardinalityRange;

export interface EventCardTargetDef {
  readonly id: string;
  readonly selector: Readonly<Record<string, unknown>>;
  readonly cardinality: EventCardTargetCardinality;
}

export interface EventCardLastingEffectDef {
  readonly id: string;
  readonly duration: TurnFlowDuration;
  readonly effect: Readonly<Record<string, unknown>>;
}

export interface EventCardBranchDef {
  readonly id: string;
  readonly order?: number;
  readonly effects?: readonly Readonly<Record<string, unknown>>[];
  readonly targets?: readonly EventCardTargetDef[];
  readonly lastingEffects?: readonly EventCardLastingEffectDef[];
}

export interface EventCardSideDef {
  readonly effects?: readonly Readonly<Record<string, unknown>>[];
  readonly branches?: readonly EventCardBranchDef[];
  readonly targets?: readonly EventCardTargetDef[];
  readonly lastingEffects?: readonly EventCardLastingEffectDef[];
}

export interface EventCardDef {
  readonly id: string;
  readonly title: string;
  readonly sideMode: 'single' | 'dual';
  readonly order?: number;
  readonly unshaded?: EventCardSideDef;
  readonly shaded?: EventCardSideDef;
}

export interface EventCardSetPayload {
  readonly cards: readonly EventCardDef[];
}

export interface ScenarioPiecePlacement {
  readonly spaceId: string;
  readonly pieceTypeId: string;
  readonly faction: string;
  readonly count: number;
  readonly status?: Readonly<Record<string, string>>;
}

export interface ScenarioDeckComposition {
  readonly pileCount: number;
  readonly eventsPerPile: number;
  readonly coupsPerPile: number;
  readonly includedCardIds?: readonly string[];
  readonly excludedCardIds?: readonly string[];
}

export interface ScenarioPayload {
  readonly mapAssetId: string;
  readonly pieceCatalogAssetId: string;
  readonly eventCardSetAssetId?: string;
  readonly scenarioName: string;
  readonly yearRange: string;
  readonly initialPlacements?: readonly ScenarioPiecePlacement[];
  readonly initialTrackValues?: readonly { readonly trackId: string; readonly value: number }[];
  readonly initialMarkers?: readonly { readonly spaceId: string; readonly markerId: string; readonly state: string }[];
  readonly outOfPlay?: readonly { readonly pieceTypeId: string; readonly faction: string; readonly count: number }[];
  readonly deckComposition?: ScenarioDeckComposition;
  readonly startingLeader?: string;
  readonly leaderStack?: readonly string[];
  readonly startingCapabilities?: readonly { readonly capabilityId: string; readonly side: 'unshaded' | 'shaded' }[];
  readonly startingEligibility?: readonly { readonly faction: string; readonly eligible: boolean }[];
  readonly usPolicy?: 'jfk' | 'lbj' | 'nixon';
}

export type DataAssetKind = 'map' | 'scenario' | 'pieceCatalog' | 'eventCardSet';

export type PieceStatusDimension = 'activity' | 'tunnel';

export type PieceStatusValue = 'underground' | 'active' | 'untunneled' | 'tunneled';

export interface PieceStatusTransition {
  readonly dimension: PieceStatusDimension;
  readonly from: PieceStatusValue;
  readonly to: PieceStatusValue;
}

export interface PieceVisualMetadata {
  readonly color: string;
  readonly shape: string;
  readonly activeSymbol?: string;
}

export interface PieceTypeCatalogEntry {
  readonly id: string;
  readonly faction: string;
  readonly statusDimensions: readonly PieceStatusDimension[];
  readonly transitions: readonly PieceStatusTransition[];
  readonly visual?: PieceVisualMetadata;
}

export interface PieceInventoryEntry {
  readonly pieceTypeId: string;
  readonly faction: string;
  readonly total: number;
}

export interface PieceCatalogPayload {
  readonly pieceTypes: readonly PieceTypeCatalogEntry[];
  readonly inventory: readonly PieceInventoryEntry[];
}

export interface MapSpaceDef {
  readonly id: string;
  readonly spaceType: string;
  readonly population: number;
  readonly econ: number;
  readonly terrainTags: readonly string[];
  readonly country: string;
  readonly coastal: boolean;
  readonly adjacentTo: readonly string[];
}

export interface ProvisionalAdjacencyDef {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

export interface NumericTrackDef {
  readonly id: string;
  readonly scope: 'global' | 'faction';
  readonly faction?: string;
  readonly min: number;
  readonly max: number;
  readonly initial: number;
}

export interface SpaceMarkerConstraintDef {
  readonly spaceIds?: readonly string[];
  readonly spaceTypes?: readonly string[];
  readonly populationEquals?: number;
  readonly allowedStates: readonly string[];
}

export interface SpaceMarkerLatticeDef {
  readonly id: string;
  readonly states: readonly string[];
  readonly defaultState: string;
  readonly constraints?: readonly SpaceMarkerConstraintDef[];
}

export interface SpaceMarkerValueDef {
  readonly spaceId: string;
  readonly markerId: string;
  readonly state: string;
}

export interface StackingConstraint {
  readonly id: string;
  readonly description: string;
  readonly spaceFilter: {
    readonly spaceIds?: readonly string[];
    readonly spaceTypes?: readonly string[];
    readonly country?: readonly string[];
    readonly populationEquals?: number;
  };
  readonly pieceFilter: {
    readonly pieceTypeIds?: readonly string[];
    readonly factions?: readonly string[];
  };
  readonly rule: 'maxCount' | 'prohibit';
  readonly maxCount?: number;
}

export interface MapPayload {
  readonly spaces: readonly MapSpaceDef[];
  readonly provisionalAdjacency?: readonly ProvisionalAdjacencyDef[];
  readonly tracks?: readonly NumericTrackDef[];
  readonly markerLattices?: readonly SpaceMarkerLatticeDef[];
  readonly spaceMarkers?: readonly SpaceMarkerValueDef[];
  readonly stackingConstraints?: readonly StackingConstraint[];
}

export interface DataAssetEnvelope<TPayload = unknown> {
  readonly id: string;
  readonly kind: DataAssetKind;
  readonly payload: TPayload;
}

export interface DataAssetRef {
  readonly id: string;
  readonly kind: DataAssetKind;
}

export interface ZobristTable {
  readonly seed: bigint;
  readonly fingerprint: string;
}

export type ZobristFeature =
  | { readonly kind: 'tokenPlacement'; readonly tokenId: TokenId; readonly zoneId: ZoneId; readonly slot: number }
  | { readonly kind: 'globalVar'; readonly varName: string; readonly value: number }
  | {
      readonly kind: 'perPlayerVar';
      readonly playerId: PlayerId;
      readonly varName: string;
      readonly value: number;
    }
  | { readonly kind: 'activePlayer'; readonly playerId: PlayerId }
  | { readonly kind: 'currentPhase'; readonly phaseId: PhaseId }
  | { readonly kind: 'turnCount'; readonly value: number }
  | {
      readonly kind: 'actionUsage';
      readonly actionId: ActionId;
      readonly scope: 'turn' | 'phase' | 'game';
      readonly count: number;
    }
  | {
      readonly kind: 'markerState';
      readonly spaceId: string;
      readonly markerId: string;
      readonly state: string;
    };

export interface ActionUsageRecord {
  readonly turnCount: number;
  readonly phaseCount: number;
  readonly gameCount: number;
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

export interface GameState {
  readonly globalVars: Readonly<Record<string, number>>;
  readonly perPlayerVars: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly playerCount: number;
  readonly zones: Readonly<Record<string, readonly Token[]>>;
  readonly nextTokenOrdinal: number;
  readonly currentPhase: PhaseId;
  readonly activePlayer: PlayerId;
  readonly turnCount: number;
  readonly rng: RngState;
  readonly stateHash: bigint;
  readonly actionUsage: Readonly<Record<string, ActionUsageRecord>>;
  readonly turnFlow?: TurnFlowRuntimeState;
  readonly markers: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export type MoveParamScalar = number | string | boolean | TokenId | ZoneId | PlayerId;
export type MoveParamValue = MoveParamScalar | readonly MoveParamScalar[];

export interface CompoundMovePayload {
  readonly specialActivity: Move;
  readonly timing: 'before' | 'during' | 'after';
  readonly insertAfterStage?: number;
}

export interface Move {
  readonly actionId: ActionId;
  readonly params: Readonly<Record<string, MoveParamValue>>;
  readonly freeOperation?: boolean;
  readonly compound?: CompoundMovePayload;
}

export interface ChoiceRequest {
  readonly complete: boolean;
  readonly name?: string;
  readonly type?: 'chooseOne' | 'chooseN';
  readonly options?: readonly MoveParamValue[];
  readonly min?: number;
  readonly max?: number;
}

export interface StateDelta {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface TriggerFiring {
  readonly kind: 'fired';
  readonly triggerId: TriggerId;
  readonly event: TriggerEvent;
  readonly depth: number;
}

export interface TriggerTruncated {
  readonly kind: 'truncated';
  readonly event: TriggerEvent;
  readonly depth: number;
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

export interface OperationPartialTraceEntry {
  readonly kind: 'operationPartial';
  readonly actionId: ActionId;
  readonly profileId: string;
  readonly step: 'costSpendSkipped';
  readonly reason: 'costValidationFailed';
}

export interface OperationFreeTraceEntry {
  readonly kind: 'operationFree';
  readonly actionId: ActionId;
  readonly step: 'costSpendSkipped';
}

export type TriggerLogEntry =
  | TriggerFiring
  | TriggerTruncated
  | TurnFlowLifecycleTraceEntry
  | TurnFlowEligibilityTraceEntry
  | OperationPartialTraceEntry
  | OperationFreeTraceEntry;

export interface ApplyMoveResult {
  readonly state: GameState;
  readonly triggerFirings: readonly TriggerLogEntry[];
}

export interface MoveLog {
  readonly stateHash: bigint;
  readonly player: PlayerId;
  readonly move: Move;
  readonly legalMoveCount: number;
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerLogEntry[];
}

export interface PlayerScore {
  readonly player: PlayerId;
  readonly score: number;
}

export interface VictoryTerminalRankingEntry {
  readonly faction: string;
  readonly margin: number;
  readonly rank: number;
  readonly tieBreakKey: string;
}

export interface VictoryTerminalMetadata {
  readonly timing: VictoryTiming;
  readonly checkpointId: string;
  readonly winnerFaction: string;
  readonly ranking?: readonly VictoryTerminalRankingEntry[];
}

export type TerminalResult =
  | { readonly type: 'win'; readonly player: PlayerId; readonly victory?: VictoryTerminalMetadata }
  | { readonly type: 'lossAll' }
  | { readonly type: 'draw' }
  | { readonly type: 'score'; readonly ranking: readonly PlayerScore[] };

export type SimulationStopReason = 'terminal' | 'maxTurns' | 'noLegalMoves';

export interface GameTrace {
  readonly gameDefId: string;
  readonly seed: number;
  readonly moves: readonly MoveLog[];
  readonly finalState: GameState;
  readonly result: TerminalResult | null;
  readonly turnsCount: number;
  readonly stopReason: SimulationStopReason;
}

export interface Metrics {
  readonly avgGameLength: number;
  readonly avgBranchingFactor: number;
  readonly actionDiversity: number;
  readonly resourceTension: number;
  readonly interactionProxy: number;
  readonly dominantActionFreq: number;
  readonly dramaMeasure: number;
}

export interface EvalReport {
  readonly gameDefId: string;
  readonly runCount: number;
  readonly metrics: Metrics;
  readonly degeneracyFlags: readonly DegeneracyFlag[];
  readonly traces: readonly GameTrace[];
}

export type HexBigInt = string;

export interface SerializedRngState {
  readonly algorithm: 'pcg-dxsm-128';
  readonly version: 1;
  readonly state: readonly HexBigInt[];
}

export interface SerializedMoveLog extends Omit<MoveLog, 'stateHash'> {
  readonly stateHash: HexBigInt;
}

export interface SerializedGameState extends Omit<GameState, 'rng' | 'stateHash'> {
  readonly rng: SerializedRngState;
  readonly stateHash: HexBigInt;
}

export interface SerializedGameTrace extends Omit<GameTrace, 'moves' | 'finalState'> {
  readonly moves: readonly SerializedMoveLog[];
  readonly finalState: SerializedGameState;
}

export interface BehaviorCharacterization {
  readonly avgGameLength: number;
  readonly avgBranchingFactor: number;
  readonly mechanicCount: number;
}

export interface ParameterDef {
  readonly name: string;
  readonly type: 'int' | 'string' | 'boolean';
  readonly default: number | string | boolean;
  readonly min?: number;
  readonly max?: number;
}

export interface MechanicBundle {
  readonly id: string;
  readonly name: string;
  readonly patch: {
    readonly variables?: readonly VariableDef[];
    readonly zones?: readonly ZoneDef[];
    readonly tokenTypes?: readonly TokenTypeDef[];
    readonly actions?: readonly ActionDef[];
    readonly triggers?: readonly TriggerDef[];
    readonly setup?: readonly EffectAST[];
    readonly constants?: Readonly<Record<string, number>>;
  };
  readonly requires?: readonly string[];
  readonly conflicts?: readonly string[];
  readonly parameters?: readonly ParameterDef[];
  readonly mutationPoints?: readonly string[];
}

export interface Agent {
  chooseMove(input: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly playerId: PlayerId;
    readonly legalMoves: readonly Move[];
    readonly rng: Rng;
  }): { readonly move: Move; readonly rng: Rng };
}
