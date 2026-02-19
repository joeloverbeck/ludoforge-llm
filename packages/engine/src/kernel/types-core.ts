import type {
  ActionId,
  PhaseId,
  PlayerId,
  TokenId,
  TriggerId,
  ZoneId,
} from './branded.js';
import type { DegeneracyFlag } from './diagnostics.js';
import type { ChoiceIllegalReason } from './legality-reasons.js';
import type {
  ActionExecutorSel,
  ConditionAST,
  EffectAST,
  MoveParamValue,
  NumericValueExpr,
  OptionsQuery,
  PlayerSel,
  TokenFilterPredicate,
} from './types-ast.js';
import type { ActiveLastingEffect, EventDeckDef } from './types-events.js';
import type {
  OperationFreeTraceEntry,
  OperationPartialTraceEntry,
  ActionPipelineDef,
} from './types-operations.js';
import type {
  SimultaneousCommitTraceEntry,
  SimultaneousSubmissionTraceEntry,
  TurnOrderRuntimeState,
  TurnOrderStrategy,
  TurnFlowEligibilityTraceEntry,
  TurnFlowLifecycleTraceEntry,
  TurnFlowDuration,
} from './types-turn-flow.js';
import type {
  VictoryCheckpointDef,
  VictoryMarginDef,
  VictoryRankingDef,
  VictoryTerminalMetadata,
} from './types-victory.js';

export interface RngState {
  readonly algorithm: 'pcg-dxsm-128';
  readonly version: 1;
  readonly state: readonly bigint[];
}

export interface Rng {
  readonly state: RngState;
}

export interface IntVariableDef {
  readonly name: string;
  readonly type: 'int';
  readonly init: number;
  readonly min: number;
  readonly max: number;
}

export interface BooleanVariableDef {
  readonly name: string;
  readonly type: 'boolean';
  readonly init: boolean;
}

export type VariableDef = IntVariableDef | BooleanVariableDef;

export type VariableValue = number | boolean;

export type AttributeValue = string | number | boolean | readonly string[];

export interface FactionDef {
  readonly id: string;
}

export interface ZoneDef {
  readonly id: ZoneId;
  readonly zoneKind?: 'board' | 'aux';
  readonly ownerPlayerIndex?: number;
  readonly owner: 'none' | 'player';
  readonly visibility: 'public' | 'owner' | 'hidden';
  readonly ordering: 'stack' | 'queue' | 'set';
  readonly adjacentTo?: readonly ZoneId[];
  readonly category?: string;
  readonly attributes?: Readonly<Record<string, AttributeValue>>;
}

export interface TokenTypeTransition {
  readonly prop: string;
  readonly from: string;
  readonly to: string;
}

export interface TokenTypeDef {
  readonly id: string;
  readonly faction?: string;
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
  readonly interrupts?: readonly PhaseDef[];
}

export interface ActionDef {
  readonly id: ActionId;
  readonly actor: PlayerSel;
  readonly executor: ActionExecutorSel;
  readonly phase: readonly PhaseId[];
  readonly capabilities?: readonly string[];
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
  | { readonly type: 'tokenEntered'; readonly zone?: ZoneId }
  | {
      readonly type: 'varChanged';
      readonly scope?: 'global' | 'perPlayer';
      readonly var?: string;
      readonly player?: PlayerId;
      readonly oldValue?: VariableValue;
      readonly newValue?: VariableValue;
    };

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
  readonly value: NumericValueExpr;
}

export interface TerminalEvaluationDef {
  readonly conditions: readonly EndCondition[];
  readonly checkpoints?: readonly VictoryCheckpointDef[];
  readonly margins?: readonly VictoryMarginDef[];
  readonly ranking?: VictoryRankingDef;
  readonly scoring?: ScoringDef;
}

export type DerivedMetricComputation = 'markerTotal' | 'controlledPopulation' | 'totalEcon';

export interface DerivedMetricZoneFilter {
  readonly zoneIds?: readonly ZoneId[];
  readonly zoneKinds?: readonly ('board' | 'aux')[];
  readonly category?: readonly string[];
  readonly attributeEquals?: Readonly<Record<string, AttributeValue>>;
}

export interface DerivedMetricRequirement {
  readonly key: string;
  readonly expectedType: 'number';
}

export interface DerivedMetricDef {
  readonly id: string;
  readonly computation: DerivedMetricComputation;
  readonly zoneFilter?: DerivedMetricZoneFilter;
  readonly requirements: readonly DerivedMetricRequirement[];
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
  readonly factions?: readonly FactionDef[];
  readonly tracks?: readonly NumericTrackDef[];
  readonly spaceMarkers?: readonly SpaceMarkerValueDef[];
  readonly tokenTypes: readonly TokenTypeDef[];
  readonly setup: readonly EffectAST[];
  readonly turnStructure: TurnStructure;
  readonly turnOrder?: TurnOrderStrategy;
  readonly actionPipelines?: readonly ActionPipelineDef[];
  readonly derivedMetrics?: readonly DerivedMetricDef[];
  readonly actions: readonly ActionDef[];
  readonly triggers: readonly TriggerDef[];
  readonly terminal: TerminalEvaluationDef;
  readonly eventDecks?: readonly EventDeckDef[];
  readonly stackingConstraints?: readonly StackingConstraint[];
  readonly markerLattices?: readonly SpaceMarkerLatticeDef[];
  readonly globalMarkerLattices?: readonly GlobalMarkerLatticeDef[];
  readonly runtimeDataAssets?: readonly RuntimeDataAsset[];
  readonly tableContracts?: readonly RuntimeTableContract[];
}

export const KNOWN_DATA_ASSET_KINDS = ['map', 'scenario', 'pieceCatalog'] as const;
export type KnownDataAssetKind = (typeof KNOWN_DATA_ASSET_KINDS)[number];
export type DataAssetKind = string;

export type PieceStatusDimension = 'activity' | 'tunnel';

export type PieceStatusValue = 'underground' | 'active' | 'untunneled' | 'tunneled';

export interface PieceStatusTransition {
  readonly dimension: PieceStatusDimension;
  readonly from: PieceStatusValue;
  readonly to: PieceStatusValue;
}

export interface PieceTypeCatalogEntry {
  readonly id: string;
  readonly faction: string;
  readonly statusDimensions: readonly PieceStatusDimension[];
  readonly transitions: readonly PieceStatusTransition[];
  readonly runtimeProps?: Readonly<Record<string, string | number | boolean>>;
}

export interface PieceInventoryEntry {
  readonly pieceTypeId: string;
  readonly faction: string;
  readonly total: number;
}

export interface PieceCatalogPayload {
  readonly pieceTypes: readonly PieceTypeCatalogEntry[];
  readonly inventory: readonly PieceInventoryEntry[];
  readonly factions: readonly FactionDef[];
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
  readonly category?: readonly string[];
  readonly attributeEquals?: Readonly<Record<string, AttributeValue>>;
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

export interface GlobalMarkerLatticeDef {
  readonly id: string;
  readonly states: readonly string[];
  readonly defaultState: string;
}

export interface StackingConstraint {
  readonly id: string;
  readonly description: string;
  readonly spaceFilter: {
    readonly spaceIds?: readonly string[];
    readonly category?: readonly string[];
    readonly attributeEquals?: Readonly<Record<string, AttributeValue>>;
  };
  readonly pieceFilter: {
    readonly pieceTypeIds?: readonly string[];
    readonly factions?: readonly string[];
  };
  readonly rule: 'maxCount' | 'prohibit';
  readonly maxCount?: number;
}

export interface MapSpaceInput {
  readonly id: string;
  readonly category?: string;
  readonly attributes?: Readonly<Record<string, AttributeValue>>;
  readonly adjacentTo: readonly string[];
}

export interface MapPayload {
  readonly spaces: readonly MapSpaceInput[];
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

export interface RuntimeDataAsset<TPayload = unknown> {
  readonly id: string;
  readonly kind: DataAssetKind;
  readonly payload: TPayload;
}

export type RuntimeTableScalarType = 'string' | 'int' | 'boolean';

export interface RuntimeTableFieldContract {
  readonly field: string;
  readonly type: RuntimeTableScalarType;
}

export interface RuntimeTableMonotonicConstraint {
  readonly kind: 'monotonic';
  readonly field: string;
  readonly direction: 'asc' | 'desc';
  readonly strict?: boolean;
}

export interface RuntimeTableContiguousIntConstraint {
  readonly kind: 'contiguousInt';
  readonly field: string;
  readonly start?: number;
  readonly step?: number;
}

export interface RuntimeTableNumericRangeConstraint {
  readonly kind: 'numericRange';
  readonly field: string;
  readonly min?: number;
  readonly max?: number;
}

export type RuntimeTableConstraint =
  | RuntimeTableMonotonicConstraint
  | RuntimeTableContiguousIntConstraint
  | RuntimeTableNumericRangeConstraint;

export interface RuntimeTableContract {
  readonly id: string;
  readonly assetId: string;
  readonly tablePath: string;
  readonly fields: readonly RuntimeTableFieldContract[];
  readonly uniqueBy?: readonly (readonly [string, ...string[]])[];
  readonly constraints?: readonly RuntimeTableConstraint[];
}

export interface DataAssetRef {
  readonly id: string;
  readonly kind: KnownDataAssetKind;
}

export interface ZobristTable {
  readonly seed: bigint;
  readonly fingerprint: string;
}

export type ZobristFeature =
  | { readonly kind: 'tokenPlacement'; readonly tokenId: TokenId; readonly zoneId: ZoneId; readonly slot: number }
  | { readonly kind: 'globalVar'; readonly varName: string; readonly value: VariableValue }
  | {
      readonly kind: 'perPlayerVar';
      readonly playerId: PlayerId;
      readonly varName: string;
      readonly value: VariableValue;
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
    }
  | {
      readonly kind: 'globalMarkerState';
      readonly markerId: string;
      readonly state: string;
    }
  | {
      readonly kind: 'lastingEffect';
      readonly slot: number;
      readonly id: string;
      readonly sourceCardId: string;
      readonly side: 'unshaded' | 'shaded';
      readonly branchId: string;
      readonly duration: TurnFlowDuration;
      readonly remainingTurnBoundaries: number;
      readonly remainingRoundBoundaries: number;
      readonly remainingCycleBoundaries: number;
    }
  | {
      readonly kind: 'interruptPhaseFrame';
      readonly slot: number;
      readonly phase: string;
      readonly resumePhase: string;
    }
  | {
      readonly kind: 'revealGrant';
      readonly zoneId: string;
      readonly slot: number;
      readonly observers: 'all' | readonly PlayerId[];
      readonly filterKey: string;
    };

export interface InterruptPhaseFrame {
  readonly phase: PhaseId;
  readonly resumePhase: PhaseId;
}

export interface ActionUsageRecord {
  readonly turnCount: number;
  readonly phaseCount: number;
  readonly gameCount: number;
}

export interface RevealGrant {
  readonly observers: 'all' | readonly PlayerId[];
  readonly filter?: readonly TokenFilterPredicate[];
}

export interface GameState {
  readonly globalVars: Readonly<Record<string, VariableValue>>;
  readonly perPlayerVars: Readonly<Record<string, Readonly<Record<string, VariableValue>>>>;
  readonly playerCount: number;
  readonly zones: Readonly<Record<string, readonly Token[]>>;
  readonly nextTokenOrdinal: number;
  readonly currentPhase: PhaseId;
  readonly activePlayer: PlayerId;
  readonly turnCount: number;
  readonly rng: RngState;
  readonly stateHash: bigint;
  readonly actionUsage: Readonly<Record<string, ActionUsageRecord>>;
  readonly turnOrderState: TurnOrderRuntimeState;
  readonly markers: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly reveals?: Readonly<Record<string, readonly RevealGrant[]>>;
  readonly globalMarkers?: Readonly<Record<string, string>>;
  readonly activeLastingEffects?: readonly ActiveLastingEffect[];
  readonly interruptPhaseStack?: readonly InterruptPhaseFrame[];
}

export interface CompoundMovePayload {
  readonly specialActivity: Move;
  readonly timing: 'before' | 'during' | 'after';
  readonly insertAfterStage?: number;
}

export interface Move {
  readonly actionId: ActionId;
  readonly params: Readonly<Record<string, MoveParamValue>>;
  readonly freeOperation?: boolean;
  readonly actionClass?: string;
  readonly compound?: CompoundMovePayload;
}

export interface ChoiceCompleteRequest {
  readonly kind: 'complete';
  readonly complete: true;
  readonly decisionId?: string;
  readonly name?: string;
  readonly type?: 'chooseOne' | 'chooseN';
  readonly options?: readonly MoveParamValue[];
  readonly min?: number;
  readonly max?: number;
  readonly reason?: ChoiceIllegalReason;
}

export type ChoiceTargetKind = 'zone' | 'token';

export interface ChoiceOption {
  readonly value: MoveParamValue;
  readonly legality: 'legal' | 'illegal' | 'unknown';
  readonly illegalReason: ChoiceIllegalReason | null;
}

export interface ChoicePendingRequest {
  readonly kind: 'pending';
  readonly complete: false;
  readonly decisionId: string;
  readonly name: string;
  readonly type: 'chooseOne' | 'chooseN';
  readonly options: readonly ChoiceOption[];
  readonly targetKinds: readonly ChoiceTargetKind[];
  readonly min?: number;
  readonly max?: number;
  readonly reason?: ChoiceIllegalReason;
}

export interface ChoiceIllegalRequest {
  readonly kind: 'illegal';
  readonly complete: false;
  readonly decisionId?: string;
  readonly name?: string;
  readonly type?: 'chooseOne' | 'chooseN';
  readonly options?: readonly MoveParamValue[];
  readonly min?: number;
  readonly max?: number;
  readonly reason: ChoiceIllegalReason;
}

export type ChoiceRequest = ChoiceCompleteRequest | ChoicePendingRequest | ChoiceIllegalRequest;

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

export type TriggerLogEntry =
  | TriggerFiring
  | TriggerTruncated
  | TurnFlowLifecycleTraceEntry
  | TurnFlowEligibilityTraceEntry
  | SimultaneousSubmissionTraceEntry
  | SimultaneousCommitTraceEntry
  | OperationPartialTraceEntry
  | OperationFreeTraceEntry;

// ── Runtime Warnings ──────────────────────────────────────

export type RuntimeWarningCode =
  | 'EMPTY_QUERY_RESULT'
  | 'TOKEN_NOT_IN_ZONE'
  | 'BINDING_UNDEFINED'
  | 'EMPTY_ZONE_OPERATION'
  | 'ZERO_EFFECT_ITERATIONS'
  | 'MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED'
  | 'MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED'
  | 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED'
  | 'MOVE_ENUM_DEFERRED_PREDICATE_BUDGET_EXCEEDED';

export interface RuntimeWarning {
  readonly code: RuntimeWarningCode;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly hint?: string;
}

// ── Effect Execution Trace ────────────────────────────────

export interface EffectTraceForEach {
  readonly kind: 'forEach';
  readonly bind: string;
  readonly matchCount: number;
  readonly limit?: number;
  readonly iteratedCount: number;
  readonly provenance: EffectTraceProvenance;
}

export interface EffectTraceReduce {
  readonly kind: 'reduce';
  readonly itemBind: string;
  readonly accBind: string;
  readonly resultBind: string;
  readonly matchCount: number;
  readonly limit?: number;
  readonly iteratedCount: number;
  readonly provenance: EffectTraceProvenance;
}

export interface EffectTraceMoveToken {
  readonly kind: 'moveToken';
  readonly tokenId: string;
  readonly from: string;
  readonly to: string;
  readonly provenance: EffectTraceProvenance;
}

export interface EffectTraceSetTokenProp {
  readonly kind: 'setTokenProp';
  readonly tokenId: string;
  readonly prop: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly provenance: EffectTraceProvenance;
}

export interface EffectTraceVarChange {
  readonly kind: 'varChange';
  readonly scope: 'global' | 'perPlayer';
  readonly varName: string;
  readonly oldValue: VariableValue;
  readonly newValue: VariableValue;
  readonly player?: PlayerId;
  readonly provenance: EffectTraceProvenance;
}

export interface EffectTraceResourceEndpoint {
  readonly scope: 'global' | 'perPlayer';
  readonly varName: string;
  readonly player?: PlayerId;
}

export interface EffectTraceResourceTransfer {
  readonly kind: 'resourceTransfer';
  readonly from: EffectTraceResourceEndpoint;
  readonly to: EffectTraceResourceEndpoint;
  readonly requestedAmount: number;
  readonly actualAmount: number;
  readonly sourceAvailable: number;
  readonly destinationHeadroom: number;
  readonly minAmount?: number;
  readonly maxAmount?: number;
  readonly provenance: EffectTraceProvenance;
}

export interface EffectTraceLifecycleEvent {
  readonly kind: 'lifecycleEvent';
  readonly eventType: 'phaseEnter' | 'phaseExit' | 'turnStart' | 'turnEnd';
  readonly phase?: string;
  readonly provenance: EffectTraceProvenance;
}

export interface EffectTraceCreateToken {
  readonly kind: 'createToken';
  readonly tokenId: string;
  readonly type: string;
  readonly zone: string;
  readonly provenance: EffectTraceProvenance;
}

export interface EffectTraceDestroyToken {
  readonly kind: 'destroyToken';
  readonly tokenId: string;
  readonly type: string;
  readonly zone: string;
  readonly provenance: EffectTraceProvenance;
}

export type EffectTraceEventContext =
  | 'actionCost'
  | 'actionEffect'
  | 'lifecycleEffect'
  | 'triggerEffect'
  | 'lifecycleEvent';

export interface EffectTraceProvenance {
  readonly phase: string;
  readonly eventContext: EffectTraceEventContext;
  readonly actionId?: string;
  readonly effectPath: string;
}

export type EffectTraceEntry =
  | EffectTraceForEach
  | EffectTraceReduce
  | EffectTraceMoveToken
  | EffectTraceSetTokenProp
  | EffectTraceVarChange
  | EffectTraceResourceTransfer
  | EffectTraceCreateToken
  | EffectTraceDestroyToken
  | EffectTraceLifecycleEvent;

// ── Execution Options & Collector ─────────────────────────

export interface ExecutionOptions {
  readonly trace?: boolean;
  readonly advanceToDecisionPoint?: boolean;
  readonly maxPhaseTransitionsPerMove?: number;
}

export interface ExecutionCollector {
  readonly warnings: RuntimeWarning[];
  readonly trace: EffectTraceEntry[] | null;
}

export interface ApplyMoveResult {
  readonly state: GameState;
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
}

export interface MoveLog {
  readonly stateHash: bigint;
  readonly player: PlayerId;
  readonly move: Move;
  readonly legalMoveCount: number;
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
}

export interface PlayerScore {
  readonly player: PlayerId;
  readonly score: number;
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
