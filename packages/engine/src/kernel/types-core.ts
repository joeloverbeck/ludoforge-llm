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
  MoveParamScalar,
  MoveParamValue,
  NumericValueExpr,
  OptionsQuery,
  PlayerSel,
  TokenFilterExpr,
} from './types-ast.js';
import type { ActiveLastingEffect, EventDeckDef } from './types-events.js';
import type {
  OperationFreeTraceEntry,
  OperationCompoundStagesReplacedTraceEntry,
  OperationPartialTraceEntry,
  ActionPipelineDef,
} from './types-operations.js';
import type { VerbalizationDef } from './verbalization-types.js';
import type {
  TurnFlowGrantLifecycleTraceEntry,
  TurnFlowDeferredEventLifecycleTraceEntry,
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
import type { SeatGroupConfig, MarkerWeightConfig, VictoryFormula } from './derived-values.js';
import type { ScopedVarEndpointContract, ScopedVarPayloadContract } from './scoped-var-contract.js';
import type { DecisionKey } from './decision-scope.js';
import type {
  AgentPolicyCandidateIntrinsic,
  AgentPolicyDecisionIntrinsic,
  AgentPolicyOptionIntrinsic,
  AgentPolicyZoneAggSource,
  AgentPolicyZoneFilterOp,
  AgentPolicyZoneScope,
  AgentPolicyZoneTokenAggOp,
  AgentPolicyZoneTokenAggOwner,
} from '../contracts/index.js';
import type { DecisionPointSnapshot } from '../sim/snapshot-types.js';

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
  readonly material?: boolean;
}

export interface BooleanVariableDef {
  readonly name: string;
  readonly type: 'boolean';
  readonly init: boolean;
  readonly material?: boolean;
}

export type VariableDef = IntVariableDef | BooleanVariableDef;

export type VariableValue = number | boolean;

export type AttributeValue = string | number | boolean | readonly string[];

export interface SeatDef {
  readonly id: string;
}

export interface ZoneAdjacency {
  readonly to: ZoneId;
  readonly direction?: 'bidirectional' | 'unidirectional';
  readonly category?: string;
  readonly attributes?: Readonly<Record<string, AttributeValue>>;
}

export interface DeckBehavior {
  readonly type: 'deck';
  readonly drawFrom: 'top' | 'bottom' | 'random';
  readonly reshuffleFrom?: ZoneId;
}

export type ZoneBehavior = DeckBehavior;

export interface ZoneDef {
  readonly id: ZoneId;
  readonly zoneKind?: 'board' | 'aux';
  readonly isInternal?: boolean;
  readonly ownerPlayerIndex?: number;
  readonly owner: 'none' | 'player';
  readonly visibility: 'public' | 'owner' | 'hidden';
  readonly ordering: 'stack' | 'queue' | 'set';
  readonly adjacentTo?: readonly ZoneAdjacency[];
  readonly category?: string;
  readonly attributes?: Readonly<Record<string, AttributeValue>>;
  readonly behavior?: ZoneBehavior;
}

export interface TokenTypeTransition {
  readonly prop: string;
  readonly from: string;
  readonly to: string;
}

export interface TokenTypeZoneEntryMatch {
  readonly zoneKind?: 'board' | 'aux';
  readonly category?: string;
}

export interface TokenTypeZoneEntryRule {
  readonly match: TokenTypeZoneEntryMatch;
  readonly setProps: Readonly<Record<string, number | string | boolean>>;
}

export interface TokenTypeDef {
  readonly id: string;
  readonly seat?: string;
  readonly props: Readonly<Record<string, 'int' | 'string' | 'boolean'>>;
  readonly transitions?: readonly TokenTypeTransition[];
  readonly onZoneEntry?: readonly TokenTypeZoneEntryRule[];
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
  readonly id: string;
  readonly scope: 'turn' | 'phase' | 'game';
  readonly max: number;
}

export interface PhaseDef {
  readonly id: PhaseId;
  readonly onEnter?: readonly EffectAST[];
  readonly onExit?: readonly EffectAST[];
  readonly actionDefaults?: {
    readonly pre?: ConditionAST;
    readonly afterEffects?: readonly EffectAST[];
  };
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
  readonly tags?: readonly string[];
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
      readonly scope?: 'global' | 'perPlayer' | 'zone';
      readonly var?: string;
      readonly player?: PlayerId;
      readonly zone?: ZoneId;
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

export interface DerivedMetricMarkerTotalRuntime {
  readonly kind: 'markerTotal';
  readonly markerId: string;
  readonly markerConfig: MarkerWeightConfig;
  readonly defaultMarkerState?: string;
}

export interface DerivedMetricControlledPopulationRuntime {
  readonly kind: 'controlledPopulation';
  readonly controlFn: 'coin' | 'solo';
  readonly seatGroupConfig: SeatGroupConfig;
}

export interface DerivedMetricTotalEconRuntime {
  readonly kind: 'totalEcon';
  readonly controlFn: 'coin' | 'solo';
  readonly seatGroupConfig: SeatGroupConfig;
  readonly blockedByTokenTypes?: readonly string[];
}

export type DerivedMetricRuntime =
  | DerivedMetricMarkerTotalRuntime
  | DerivedMetricControlledPopulationRuntime
  | DerivedMetricTotalEconRuntime;

export interface DerivedMetricDef {
  readonly id: string;
  readonly computation: DerivedMetricComputation;
  readonly zoneFilter?: DerivedMetricZoneFilter;
  readonly requirements: readonly DerivedMetricRequirement[];
  readonly runtime: DerivedMetricRuntime;
}

export interface VictoryStandingEntry {
  readonly seat: string;
  readonly formula: VictoryFormula;
  readonly threshold: number;
}

export interface VictoryStandingsDef {
  readonly seatGroupConfig: SeatGroupConfig;
  readonly markerConfigs: Readonly<Record<string, MarkerWeightConfig>>;
  readonly markerName: string;
  readonly defaultMarkerState: string;
  readonly entries: readonly VictoryStandingEntry[];
  readonly tieBreakOrder: readonly string[];
}

export type AgentParameterType = 'number' | 'integer' | 'boolean' | 'enum' | 'idOrder';

export type AgentParameterValue = number | boolean | string | readonly string[];
export type AgentPolicyValueType = 'number' | 'boolean' | 'id' | 'idList';
export type AgentPolicyCostClass = 'state' | 'candidate' | 'preview';
export type SurfaceVisibilityClass = 'public' | 'seatVisible' | 'hidden';
export type AgentPolicyLiteral = number | boolean | string | null | readonly string[];
export type AgentPolicyOperator =
  | 'abs'
  | 'add'
  | 'and'
  | 'boolToNumber'
  | 'clamp'
  | 'coalesce'
  | 'div'
  | 'eq'
  | 'gt'
  | 'gte'
  | 'if'
  | 'in'
  | 'lt'
  | 'lte'
  | 'max'
  | 'min'
  | 'mul'
  | 'ne'
  | 'neg'
  | 'not'
  | 'or'
  | 'sub';
export type CompiledAgentPolicyLibraryRefKind = 'stateFeature' | 'candidateFeature' | 'aggregate' | 'previewStateFeature';
export type SurfaceRefFamily =
  | 'globalVar'
  | 'globalMarker'
  | 'perPlayerVar'
  | 'derivedMetric'
  | 'victoryCurrentMargin'
  | 'victoryCurrentRank'
  | 'activeCardIdentity'
  | 'activeCardTag'
  | 'activeCardMetadata'
  | 'activeCardAnnotation';
export type SurfaceSelector =
  | {
      readonly kind: 'role';
      readonly seatToken: string;
    }
  | {
      readonly kind: 'player';
      readonly player: 'self' | 'active';
    };
export interface CompiledSurfaceRefBase {
  readonly family: SurfaceRefFamily;
  readonly id: string;
  readonly selector?: SurfaceSelector;
}
export interface CompiledCurrentSurfaceRef extends CompiledSurfaceRefBase {
  readonly kind: 'currentSurface';
}
export interface CompiledPreviewSurfaceRef extends CompiledSurfaceRefBase {
  readonly kind: 'previewSurface';
}
export type CompiledSurfaceRef =
  | CompiledCurrentSurfaceRef
  | CompiledPreviewSurfaceRef;
export type CompiledAgentPolicyRef =
  | {
      readonly kind: 'library';
      readonly refKind: CompiledAgentPolicyLibraryRefKind;
      readonly id: string;
    }
  | CompiledSurfaceRef
  | {
      readonly kind: 'candidateIntrinsic';
      readonly intrinsic: AgentPolicyCandidateIntrinsic;
    }
  | {
      readonly kind: 'candidateParam';
      readonly id: string;
    }
  | {
      readonly kind: 'decisionIntrinsic';
      readonly intrinsic: AgentPolicyDecisionIntrinsic;
    }
  | {
      readonly kind: 'optionIntrinsic';
      readonly intrinsic: AgentPolicyOptionIntrinsic;
    }
  | {
      readonly kind: 'seatIntrinsic';
      readonly intrinsic: 'self' | 'active';
    }
  | {
      readonly kind: 'turnIntrinsic';
      readonly intrinsic: 'phaseId' | 'stepId' | 'round';
    }
  | {
      readonly kind: 'strategicCondition';
      readonly conditionId: string;
      readonly field: 'satisfied' | 'proximity';
    }
  | {
      readonly kind: 'candidateTag';
      readonly tagName: string;
    }
  | {
      readonly kind: 'candidateTags';
    }
  | {
      readonly kind: 'contextKind';
    };
export type AgentPolicyZoneSource = string | AgentPolicyExpr;
export interface AgentPolicyTokenFilter {
  readonly type?: string;
  readonly props?: Readonly<Record<string, { readonly eq: string | number | boolean }>>;
}

export interface AgentPolicyZoneFilterComparison {
  readonly prop: string;
  readonly op: AgentPolicyZoneFilterOp;
  readonly value: string | number | boolean;
}

export interface AgentPolicyZoneVariableFilterComparison {
  readonly prop: string;
  readonly op: AgentPolicyZoneFilterOp;
  readonly value: number;
}

export interface AgentPolicyZoneFilter {
  readonly category?: string;
  readonly attribute?: AgentPolicyZoneFilterComparison;
  readonly variable?: AgentPolicyZoneVariableFilterComparison;
}

export type AgentPolicyExpr =
  | {
      readonly kind: 'literal';
      readonly value: AgentPolicyLiteral;
    }
  | {
      readonly kind: 'param';
      readonly id: string;
    }
  | {
      readonly kind: 'ref';
      readonly ref: CompiledAgentPolicyRef;
    }
  | {
      readonly kind: 'op';
      readonly op: AgentPolicyOperator;
      readonly args: readonly AgentPolicyExpr[];
    }
  | {
      readonly kind: 'zoneTokenAgg';
      readonly zone: AgentPolicyZoneSource;
      readonly owner: AgentPolicyZoneTokenAggOwner;
      readonly prop: string;
      readonly aggOp: AgentPolicyZoneTokenAggOp;
    }
  | {
      readonly kind: 'globalTokenAgg';
      readonly tokenFilter?: AgentPolicyTokenFilter;
      readonly aggOp: AgentPolicyZoneTokenAggOp;
      readonly prop?: string;
      readonly zoneFilter?: AgentPolicyZoneFilter;
      readonly zoneScope: AgentPolicyZoneScope;
    }
  | {
      readonly kind: 'globalZoneAgg';
      readonly source: AgentPolicyZoneAggSource;
      readonly field: string;
      readonly aggOp: AgentPolicyZoneTokenAggOp;
      readonly zoneFilter?: AgentPolicyZoneFilter;
      readonly zoneScope: AgentPolicyZoneScope;
    }
  | {
      readonly kind: 'adjacentTokenAgg';
      readonly anchorZone: AgentPolicyZoneSource;
      readonly tokenFilter?: AgentPolicyTokenFilter;
      readonly aggOp: AgentPolicyZoneTokenAggOp;
      readonly prop?: string;
    }
  | {
      readonly kind: 'seatAgg';
      readonly over: 'opponents' | 'all' | readonly string[];
      readonly expr: AgentPolicyExpr;
      readonly aggOp: AgentPolicyZoneTokenAggOp;
    }
  | {
      readonly kind: 'zoneProp';
      readonly zone: AgentPolicyZoneSource;
      readonly prop: string;
    };

export interface CompiledSurfacePreviewVisibility {
  readonly visibility: SurfaceVisibilityClass;
  readonly allowWhenHiddenSampling: boolean;
}

export interface CompiledSurfaceVisibility {
  readonly current: SurfaceVisibilityClass;
  readonly preview: CompiledSurfacePreviewVisibility;
}

export interface CompiledCardMetadataEntry {
  readonly deckId: string;
  readonly cardId: string;
  readonly tags: readonly string[];
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface CompiledCardMetadataIndex {
  readonly entries: Readonly<Record<string, CompiledCardMetadataEntry>>;
}

export interface CompiledEventSideAnnotation {
  readonly tokenPlacements: Readonly<Record<string, number>>;
  readonly tokenRemovals: Readonly<Record<string, number>>;
  readonly tokenCreations: Readonly<Record<string, number>>;
  readonly tokenDestructions: Readonly<Record<string, number>>;
  readonly markerModifications: number;
  readonly globalMarkerModifications: number;
  readonly globalVarModifications: number;
  readonly perPlayerVarModifications: number;
  readonly varTransfers: number;
  readonly drawCount: number;
  readonly shuffleCount: number;
  readonly grantsOperation: boolean;
  readonly grantOperationSeats: readonly string[];
  readonly hasEligibilityOverride: boolean;
  readonly hasLastingEffect: boolean;
  readonly hasBranches: boolean;
  readonly hasPhaseControl: boolean;
  readonly hasDecisionPoints: boolean;
  readonly effectNodeCount: number;
}

export interface CompiledEventCardAnnotation {
  readonly cardId: string;
  readonly unshaded?: CompiledEventSideAnnotation;
  readonly shaded?: CompiledEventSideAnnotation;
}

export interface CompiledEventAnnotationIndex {
  readonly entries: Readonly<Record<string, CompiledEventCardAnnotation>>;
}

export interface CompiledSurfaceCatalog {
  readonly globalVars: Readonly<Record<string, CompiledSurfaceVisibility>>;
  readonly globalMarkers: Readonly<Record<string, CompiledSurfaceVisibility>>;
  readonly perPlayerVars: Readonly<Record<string, CompiledSurfaceVisibility>>;
  readonly derivedMetrics: Readonly<Record<string, CompiledSurfaceVisibility>>;
  readonly victory: {
    readonly currentMargin: CompiledSurfaceVisibility;
    readonly currentRank: CompiledSurfaceVisibility;
  };
  readonly activeCardIdentity: CompiledSurfaceVisibility;
  readonly activeCardTag: CompiledSurfaceVisibility;
  readonly activeCardMetadata: CompiledSurfaceVisibility;
  readonly activeCardAnnotation: CompiledSurfaceVisibility;
}

// ---------------------------------------------------------------------------
// Observer catalog (Spec 102 Part E, extended by Spec 106)
// ---------------------------------------------------------------------------

/** Visibility classification for zone tokens and order. */
export type ZoneObserverVisibilityClass = 'public' | 'owner' | 'hidden';

/** Per-zone observer visibility entry. */
export interface CompiledZoneVisibilityEntry {
  readonly tokens: ZoneObserverVisibilityClass;
  readonly order: ZoneObserverVisibilityClass;
}

/**
 * Zone visibility catalog for an observer profile.
 * `entries` is keyed by zone base ID (not qualified ID).
 * `defaultEntry` applies to zones not listed in `entries`.
 */
export interface CompiledZoneVisibilityCatalog {
  readonly entries: Readonly<Record<string, CompiledZoneVisibilityEntry>>;
  readonly defaultEntry?: CompiledZoneVisibilityEntry;
}

export interface CompiledObserverProfile {
  readonly fingerprint: string;
  readonly surfaces: CompiledSurfaceCatalog;
  readonly zones?: CompiledZoneVisibilityCatalog;
}

export interface CompiledObserverCatalog {
  readonly schemaVersion: 1;
  readonly catalogFingerprint: string;
  readonly observers: Readonly<Record<string, CompiledObserverProfile>>;
  readonly defaultObserverName: string;
}

export interface CompiledAgentParameterDef {
  readonly type: AgentParameterType;
  readonly required: boolean;
  readonly tunable: boolean;
  readonly default?: AgentParameterValue;
  readonly min?: number;
  readonly max?: number;
  readonly values?: readonly string[];
  readonly allowedIds?: readonly string[];
}

export interface CompiledAgentCandidateParamDef {
  readonly type: AgentPolicyValueType;
  readonly cardinality?: {
    readonly kind: 'exact';
    readonly n: number;
  };
}

export interface CompiledAgentDependencyRefs {
  readonly parameters: readonly string[];
  readonly stateFeatures: readonly string[];
  readonly candidateFeatures: readonly string[];
  readonly aggregates: readonly string[];
  readonly strategicConditions: readonly string[];
}

export interface CompiledAgentStateFeature {
  readonly type: AgentPolicyValueType;
  readonly costClass: AgentPolicyCostClass;
  readonly expr: AgentPolicyExpr;
  readonly dependencies: CompiledAgentDependencyRefs;
}

export interface CompiledAgentCandidateFeature {
  readonly type: AgentPolicyValueType;
  readonly costClass: AgentPolicyCostClass;
  readonly expr: AgentPolicyExpr;
  readonly dependencies: CompiledAgentDependencyRefs;
}

export interface CompiledAgentAggregate {
  readonly type: AgentPolicyValueType;
  readonly costClass: AgentPolicyCostClass;
  readonly op: string;
  readonly of: AgentPolicyExpr;
  readonly where?: AgentPolicyExpr;
  readonly dependencies: CompiledAgentDependencyRefs;
}

export interface CompiledAgentPruningRule {
  readonly costClass: AgentPolicyCostClass;
  readonly when: AgentPolicyExpr;
  readonly dependencies: CompiledAgentDependencyRefs;
  readonly onEmpty: 'skipRule' | 'error';
}

export interface CompiledAgentConsideration {
  readonly scopes?: readonly ('move' | 'completion')[];
  readonly costClass: AgentPolicyCostClass;
  readonly when?: AgentPolicyExpr;
  readonly weight: AgentPolicyExpr;
  readonly value: AgentPolicyExpr;
  readonly unknownAs?: number;
  readonly clamp?: {
    readonly min?: number;
    readonly max?: number;
  };
  readonly dependencies: CompiledAgentDependencyRefs;
}

export interface CompiledAgentTieBreaker {
  readonly kind: string;
  readonly costClass: AgentPolicyCostClass;
  readonly value?: AgentPolicyExpr;
  readonly order?: readonly string[];
  readonly dependencies: CompiledAgentDependencyRefs;
}

export interface CompiledStrategicCondition {
  readonly target: AgentPolicyExpr;
  readonly proximity?: {
    readonly current: AgentPolicyExpr;
    readonly threshold: number;
  };
}

export interface CompiledAgentLibraryIndex {
  readonly stateFeatures: Readonly<Record<string, CompiledAgentStateFeature>>;
  readonly candidateFeatures: Readonly<Record<string, CompiledAgentCandidateFeature>>;
  readonly candidateAggregates: Readonly<Record<string, CompiledAgentAggregate>>;
  readonly pruningRules: Readonly<Record<string, CompiledAgentPruningRule>>;
  readonly considerations: Readonly<Record<string, CompiledAgentConsideration>>;
  readonly tieBreakers: Readonly<Record<string, CompiledAgentTieBreaker>>;
  readonly strategicConditions: Readonly<Record<string, CompiledStrategicCondition>>;
}

export type AgentPreviewMode = 'exactWorld' | 'tolerateStochastic' | 'disabled';

export interface CompiledAgentPreviewConfig {
  readonly mode: AgentPreviewMode;
  readonly phase1?: boolean;
  readonly phase1CompletionsPerAction?: number;
}

export type AgentSelectionMode = 'argmax' | 'softmaxSample' | 'weightedSample';

export interface CompiledAgentSelectionConfig {
  readonly mode: AgentSelectionMode;
  readonly temperature?: number;
}

export interface CompiledAgentProfile {
  readonly fingerprint: string;
  readonly observerName?: string;
  readonly params: Readonly<Record<string, AgentParameterValue>>;
  readonly use: {
    readonly considerations: readonly string[];
    readonly pruningRules: readonly string[];
    readonly tieBreakers: readonly string[];
  };
  readonly preview: CompiledAgentPreviewConfig;
  readonly selection: CompiledAgentSelectionConfig;
  readonly plan: {
    readonly stateFeatures: readonly string[];
    readonly candidateFeatures: readonly string[];
    readonly candidateAggregates: readonly string[];
    readonly considerations: readonly string[];
  };
}

export interface AgentPolicyCatalog {
  readonly schemaVersion: 2;
  readonly catalogFingerprint: string;
  readonly surfaceVisibility: CompiledSurfaceCatalog;
  readonly parameterDefs: Readonly<Record<string, CompiledAgentParameterDef>>;
  readonly candidateParamDefs: Readonly<Record<string, CompiledAgentCandidateParamDef>>;
  readonly library: CompiledAgentLibraryIndex;
  readonly profiles: Readonly<Record<string, CompiledAgentProfile>>;
  readonly bindingsBySeat: Readonly<Record<string, string>>;
}

export interface CompiledActionTagIndex {
  /** Maps each actionId to its set of tags (as a sorted readonly string array). */
  readonly byAction: Readonly<Record<string, readonly string[]>>;
  /** Maps each tag to the set of actionIds that carry it (as a sorted readonly string array). */
  readonly byTag: Readonly<Record<string, readonly string[]>>;
}

export interface GameDef {
  readonly metadata: {
    readonly id: string;
    readonly name?: string;
    readonly description?: string;
    readonly players: { readonly min: number; readonly max: number };
    readonly maxTriggerDepth?: number;
  };
  readonly constants: Readonly<Record<string, number>>;
  readonly globalVars: readonly VariableDef[];
  readonly perPlayerVars: readonly VariableDef[];
  readonly zones: readonly ZoneDef[];
  readonly seats?: readonly SeatDef[];
  readonly tracks?: readonly NumericTrackDef[];
  readonly spaceMarkers?: readonly SpaceMarkerValueDef[];
  readonly tokenTypes: readonly TokenTypeDef[];
  readonly setup: readonly EffectAST[];
  readonly turnStructure: TurnStructure;
  readonly turnOrder?: TurnOrderStrategy;
  readonly actionPipelines?: readonly ActionPipelineDef[];
  readonly derivedMetrics?: readonly DerivedMetricDef[];
  readonly observers?: CompiledObserverCatalog;
  readonly agents?: AgentPolicyCatalog;
  readonly actions: readonly ActionDef[];
  readonly actionTagIndex?: CompiledActionTagIndex;
  readonly triggers: readonly TriggerDef[];
  readonly terminal: TerminalEvaluationDef;
  readonly eventDecks?: readonly EventDeckDef[];
  readonly cardMetadataIndex?: CompiledCardMetadataIndex;
  readonly cardAnnotationIndex?: CompiledEventAnnotationIndex;
  readonly stackingConstraints?: readonly StackingConstraint[];
  readonly markerLattices?: readonly SpaceMarkerLatticeDef[];
  readonly globalMarkerLattices?: readonly GlobalMarkerLatticeDef[];
  readonly zoneVars?: readonly IntVariableDef[];
  readonly runtimeDataAssets?: readonly RuntimeDataAsset[];
  readonly tableContracts?: readonly RuntimeTableContract[];
  readonly victoryStandings?: VictoryStandingsDef;
  readonly verbalization?: VerbalizationDef;
}

export const KNOWN_DATA_ASSET_KINDS = ['map', 'scenario', 'pieceCatalog', 'seatCatalog'] as const;
export type KnownDataAssetKind = (typeof KNOWN_DATA_ASSET_KINDS)[number];
export type DataAssetKind = string;

export type PieceStatusDimension = 'activity' | 'tunnel';

export type PieceStatusValue = 'underground' | 'active' | 'untunneled' | 'tunneled';

export interface PieceStatusTransition {
  readonly dimension: PieceStatusDimension;
  readonly from: PieceStatusValue;
  readonly to: PieceStatusValue;
}

export interface PieceTypeZoneEntryRule {
  readonly match: TokenTypeZoneEntryMatch;
  readonly set: Readonly<Record<string, string | number | boolean>>;
}

export interface PieceTypeCatalogEntry {
  readonly id: string;
  readonly seat: string;
  readonly statusDimensions: readonly PieceStatusDimension[];
  readonly transitions: readonly PieceStatusTransition[];
  readonly runtimeProps?: Readonly<Record<string, string | number | boolean>>;
  readonly onZoneEntry?: readonly PieceTypeZoneEntryRule[];
}

export interface PieceInventoryEntry {
  readonly pieceTypeId: string;
  readonly seat: string;
  readonly total: number;
}

export interface PieceCatalogPayload {
  readonly pieceTypes: readonly PieceTypeCatalogEntry[];
  readonly inventory: readonly PieceInventoryEntry[];
}

export interface SeatCatalogPayload {
  readonly seats: readonly SeatDef[];
}

export interface ProvisionalAdjacencyDef {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

export interface NumericTrackDef {
  readonly id: string;
  readonly scope: 'global' | 'seat';
  readonly seat?: string;
  readonly min: number;
  readonly max: number;
  readonly initial: number;
}

export interface SpaceMarkerConstraintDef {
  readonly when: ConditionAST;
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
    readonly seats?: readonly string[];
  };
  readonly rule: 'maxCount' | 'prohibit';
  readonly maxCount?: number;
}

export interface MapSpaceInput {
  readonly id: string;
  readonly category?: string;
  readonly attributes?: Readonly<Record<string, AttributeValue>>;
  readonly adjacentTo: ReadonlyArray<{
    readonly to: string;
    readonly direction?: 'bidirectional' | 'unidirectional';
    readonly category?: string;
    readonly attributes?: Readonly<Record<string, AttributeValue>>;
  }>;
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

/** Pre-sorted key arrays derived from GameDef for computeFullHash. */
export interface ZobristSortedKeys {
  readonly zoneIds: readonly string[];
  readonly globalVarNames: readonly string[];
  readonly perPlayerIds: readonly number[];
  readonly perPlayerVarNames: ReadonlyMap<number, readonly string[]>;
  readonly zoneVarZoneIds: readonly string[];
  readonly zoneVarNames: ReadonlyMap<string, readonly string[]>;
  readonly actionIds: readonly string[];
  readonly markerSpaceIds: readonly string[];
  readonly markerIds: ReadonlyMap<string, readonly string[]>;
  readonly globalMarkerIds: readonly string[];
  readonly revealZoneIds: readonly string[];
}

export interface ZobristTable {
  readonly seed: bigint;
  readonly fingerprint: string;
  /** Pre-cached hex string of seed — avoids repeated BigInt→string conversion. */
  readonly seedHex: string;
  /**
   * Lazily-populated cache of zobrist keys keyed by encoded feature string.
   * Mutable for lazy population only — externally pure.
   */
  readonly keyCache: Map<string, bigint>;
  /** Pre-sorted key arrays for computeFullHash — avoids repeated sorting. */
  readonly sortedKeys: ZobristSortedKeys | null;
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
    }
  | {
      readonly kind: 'zoneVar';
      readonly zoneId: string;
      readonly varName: string;
      readonly value: number;
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
  readonly filter?: TokenFilterExpr;
}

/**
 * Canonical shape: globalVars, perPlayerVars, zoneVars, playerCount, zones,
 * nextTokenOrdinal, currentPhase, activePlayer, turnCount, rng, stateHash,
 * _runningHash, actionUsage, turnOrderState, markers, reveals, globalMarkers,
 * activeLastingEffects, interruptPhaseStack.
 * All construction sites must materialize every property.
 */
export interface GameState {
  readonly globalVars: Readonly<Record<string, VariableValue>>;
  readonly perPlayerVars: Readonly<Record<number, Readonly<Record<string, VariableValue>>>>;
  readonly zoneVars: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly playerCount: number;
  readonly zones: Readonly<Record<string, readonly Token[]>>;
  readonly nextTokenOrdinal: number;
  readonly currentPhase: PhaseId;
  readonly activePlayer: PlayerId;
  readonly turnCount: number;
  readonly rng: RngState;
  readonly stateHash: bigint;
  readonly _runningHash: bigint;
  readonly actionUsage: Readonly<Record<string, ActionUsageRecord>>;
  readonly turnOrderState: TurnOrderRuntimeState;
  readonly markers: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly reveals: Readonly<Record<string, readonly RevealGrant[]>> | undefined;
  readonly globalMarkers: Readonly<Record<string, string>> | undefined;
  readonly activeLastingEffects: readonly ActiveLastingEffect[] | undefined;
  readonly interruptPhaseStack: readonly InterruptPhaseFrame[] | undefined;
}

export interface CompoundMovePayload {
  readonly specialActivity: Move;
  readonly timing: 'before' | 'during' | 'after';
  readonly insertAfterStage?: number;
  readonly replaceRemainingStages?: boolean;
}

export interface Move {
  readonly actionId: ActionId;
  readonly params: Readonly<Record<string, MoveParamValue>>;
  readonly freeOperation?: boolean;
  readonly actionClass?: string;
  readonly compound?: CompoundMovePayload;
}

export type TrustedMoveProvenance = 'enumerateLegalMoves' | 'templateCompletion';

export interface TrustedExecutableMove extends Move {
  readonly move: Move;
  readonly sourceStateHash: bigint;
  readonly provenance: TrustedMoveProvenance;
}

/**
 * Canonical shape: move, viability, trustedMove.
 * All construction sites must materialize every property.
 */
export interface ClassifiedMove {
  readonly move: Move;
  readonly viability: import('./apply-move.js').MoveViabilityProbeResult;
  readonly trustedMove: TrustedExecutableMove | undefined;
}

export interface DecisionAuthorityBaseContext {
  readonly source: 'engineRuntime';
  readonly player: PlayerId;
}

export interface DecisionAuthorityStrictContext extends DecisionAuthorityBaseContext {
  readonly ownershipEnforcement: 'strict';
}

export interface DecisionAuthorityProbeContext extends DecisionAuthorityBaseContext {
  readonly ownershipEnforcement: 'probe';
}

export type DecisionAuthorityContext =
  | DecisionAuthorityStrictContext
  | DecisionAuthorityProbeContext;

export interface ChoiceCompleteRequest {
  readonly kind: 'complete';
  readonly complete: true;
  readonly decisionPlayer?: PlayerId;
  readonly decisionId?: string;
  readonly name?: string;
  readonly type?: 'chooseOne' | 'chooseN';
  readonly options?: readonly MoveParamValue[];
  readonly min?: number;
  readonly max?: number;
  readonly reason?: ChoiceIllegalReason;
}

export type ChoiceTargetKind = 'zone' | 'token';

/**
 * Indicates where a decision value should be placed in the move structure.
 * - `'main'` → `move.params[decisionKey]` (default, for the top-level action)
 * - `'compound.specialActivity'` → `move.compound.specialActivity.params[decisionKey]`
 */
export type CompoundDecisionPath = 'main' | 'compound.specialActivity';

export type ChooseNOptionResolution = 'exact' | 'provisional' | 'stochastic' | 'ambiguous';

export interface ChoiceOption {
  readonly value: MoveParamValue;
  readonly legality: 'legal' | 'illegal' | 'unknown';
  readonly illegalReason: ChoiceIllegalReason | null;
  readonly resolution?: ChooseNOptionResolution;
}

interface ChoicePendingRequestBase {
  readonly kind: 'pending';
  readonly complete: false;
  readonly decisionPlayer?: PlayerId;
  readonly decisionKey: DecisionKey;
  readonly name: string;
  readonly options: readonly ChoiceOption[];
  readonly targetKinds: readonly ChoiceTargetKind[];
  readonly reason?: ChoiceIllegalReason;
  /** Where the decision value should be placed in the move structure. Absent or `'main'` → `move.params[decisionKey]`. */
  readonly decisionPath?: CompoundDecisionPath;
}

export interface ChoicePendingChooseOneRequest extends ChoicePendingRequestBase {
  readonly type: 'chooseOne';
}

export interface ChoicePendingChooseNRequest extends ChoicePendingRequestBase {
  readonly type: 'chooseN';
  readonly min?: number;
  readonly max?: number;
  readonly selected: readonly MoveParamScalar[];
  readonly canConfirm: boolean;
}

export type ChoicePendingRequest =
  | ChoicePendingChooseOneRequest
  | ChoicePendingChooseNRequest;

export interface ChoiceStochasticOutcome {
  readonly bindings: Readonly<Record<string, MoveParamScalar>>;
  readonly nextDecision?: ChoicePendingRequest;
}

export interface ChoiceStochasticPendingRequest {
  readonly kind: 'pendingStochastic';
  readonly complete: false;
  readonly source: 'rollRandom';
  readonly alternatives: readonly ChoicePendingRequest[];
  readonly outcomes: readonly ChoiceStochasticOutcome[];
  readonly reason?: ChoiceIllegalReason;
}

export interface ChoiceIllegalRequest {
  readonly kind: 'illegal';
  readonly complete: false;
  readonly decisionPlayer?: PlayerId;
  readonly decisionId?: string;
  readonly name?: string;
  readonly type?: 'chooseOne' | 'chooseN';
  readonly options?: readonly MoveParamValue[];
  readonly min?: number;
  readonly max?: number;
  readonly reason: ChoiceIllegalReason;
}

export type ChoiceRequest =
  | ChoiceCompleteRequest
  | ChoicePendingRequest
  | ChoiceStochasticPendingRequest
  | ChoiceIllegalRequest;

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
  | TurnFlowGrantLifecycleTraceEntry
  | TurnFlowEligibilityTraceEntry
  | TurnFlowDeferredEventLifecycleTraceEntry
  | SimultaneousSubmissionTraceEntry
  | SimultaneousCommitTraceEntry
  | OperationPartialTraceEntry
  | OperationFreeTraceEntry
  | OperationCompoundStagesReplacedTraceEntry;

// ── Runtime Warnings ──────────────────────────────────────

export type RuntimeWarningCode =
  | 'TOKEN_NOT_IN_ZONE'
  | 'BINDING_UNDEFINED'
  | 'EMPTY_ZONE_OPERATION'
  | 'MOVE_ENUM_TEMPLATE_BUDGET_EXCEEDED'
  | 'MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED'
  | 'MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED'
  | 'MOVE_ENUM_DECISION_PROBE_SUBSET_INCOMPLETE'
  | 'MOVE_ENUM_DEFERRED_PREDICATE_BUDGET_EXCEEDED'
  | 'MOVE_ENUM_PROBE_REJECTED'
  | 'MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY';

export interface RuntimeWarning {
  readonly code: RuntimeWarningCode;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly hint?: string;
}

// ── Effect Execution Trace ────────────────────────────────

export interface MacroOrigin {
  readonly macroId: string;
  readonly stem: string;
}

export interface EffectTraceForEach {
  readonly kind: 'forEach';
  readonly bind: string;
  readonly macroOrigin?: MacroOrigin;
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
  readonly itemMacroOrigin?: MacroOrigin;
  readonly accMacroOrigin?: MacroOrigin;
  readonly resultMacroOrigin?: MacroOrigin;
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

export interface EffectTraceReveal {
  readonly kind: 'reveal';
  readonly zone: string;
  readonly observers: 'all' | readonly PlayerId[];
  readonly filter?: TokenFilterExpr;
  readonly provenance: EffectTraceProvenance;
}

export interface EffectTraceConceal {
  readonly kind: 'conceal';
  readonly zone: string;
  readonly from?: 'all' | readonly PlayerId[];
  readonly filter?: TokenFilterExpr;
  readonly grantsRemoved: number;
  readonly provenance: EffectTraceProvenance;
}

export type EffectTraceVarChange = ScopedVarPayloadContract<
  'global',
  'perPlayer',
  'zone',
  'varName',
  'player',
  'zone',
  PlayerId,
  string,
  {
    readonly kind: 'varChange';
    readonly oldValue: VariableValue;
    readonly newValue: VariableValue;
    readonly provenance: EffectTraceProvenance;
  }
>;

export type EffectTraceResourceEndpoint = ScopedVarEndpointContract<
  'global',
  'perPlayer',
  'zone',
  'varName',
  'player',
  'zone',
  PlayerId,
  string
>;

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

export interface EffectTraceShuffle {
  readonly kind: 'shuffle';
  readonly zone: string;
  readonly provenance: EffectTraceProvenance;
}

export type EffectTraceEventContext =
  | 'actionCost'
  | 'actionEffect'
  | 'phaseAfterEffect'
  | 'lifecycleEffect'
  | 'triggerEffect'
  | 'lifecycleEvent';

export interface EffectTraceProvenance {
  readonly phase: string;
  readonly eventContext: EffectTraceEventContext;
  readonly actionId?: string;
  readonly effectPath: string;
}

export type EffectTraceEntryBase =
  | EffectTraceForEach
  | EffectTraceReduce
  | EffectTraceMoveToken
  | EffectTraceSetTokenProp
  | EffectTraceReveal
  | EffectTraceConceal
  | EffectTraceVarChange
  | EffectTraceResourceTransfer
  | EffectTraceCreateToken
  | EffectTraceDestroyToken
  | EffectTraceShuffle
  | EffectTraceLifecycleEvent;

export type EffectTraceEntry = EffectTraceEntryBase & { readonly seq?: number };

// ── Condition / Decision / Selector Trace ─────────────────

export interface ConditionTraceEntry {
  readonly kind: 'conditionEval';
  readonly seq: number;
  readonly condition: ConditionAST;
  readonly result: boolean;
  readonly context: 'actionPre' | 'triggerWhen' | 'triggerMatch' | 'ifBranch' | 'costValidation' | 'playCondition';
  readonly provenance: EffectTraceProvenance;
}

export interface DecisionTraceEntry {
  readonly kind: 'decision';
  readonly seq: number;
  readonly decisionKey: string;
  readonly type: 'chooseOne' | 'chooseN';
  readonly player: PlayerId;
  readonly options: readonly MoveParamValue[];
  readonly selected: readonly MoveParamScalar[];
  readonly min?: number;
  readonly max?: number;
  readonly provenance: EffectTraceProvenance;
}

export interface SelectorTraceEntry {
  readonly kind: 'selectorResolution';
  readonly seq: number;
  readonly selectorType: 'player' | 'zone' | 'token';
  readonly selectorExpr: unknown;
  readonly candidateCount: number;
  readonly resolvedIds: readonly string[];
  readonly provenance: EffectTraceProvenance;
}

// ── Move Context ──────────────────────────────────────────

export interface MoveContext {
  readonly currentCardId?: string;
  readonly previewCardId?: string;
  readonly eventSide?: string;
  readonly turnFlowWindow?: string;
}

export type BuiltinAgentId = 'random' | 'greedy';

export interface BuiltinAgentDescriptor {
  readonly kind: 'builtin';
  readonly builtinId: BuiltinAgentId;
}

export interface PolicyAgentDescriptor {
  readonly kind: 'policy';
  readonly profileId?: string;
}

export type AgentDescriptor = BuiltinAgentDescriptor | PolicyAgentDescriptor;

export interface AgentDecisionFailureSummary {
  readonly code: string;
  readonly message: string;
}

export interface AgentDecisionScoreContribution {
  readonly termId: string;
  readonly contribution: number;
}

export interface PolicyPreviewUnknownRefTrace {
  readonly refId: string;
  readonly reason: 'random' | 'hidden' | 'unresolved' | 'failed';
}

export interface PolicyCandidateDecisionTrace {
  readonly actionId: string;
  readonly stableMoveKey: string;
  readonly score: number;
  readonly prunedBy: readonly string[];
  readonly scoreContributions?: readonly AgentDecisionScoreContribution[];
  readonly previewRefIds?: readonly string[];
  readonly unknownPreviewRefs?: readonly PolicyPreviewUnknownRefTrace[];
  readonly previewOutcome?: 'ready' | 'stochastic' | 'random' | 'hidden' | 'unresolved' | 'failed';
  readonly grantedOperationSimulated?: boolean;
  readonly grantedOperationMove?: {
    readonly actionId: string;
    readonly params: Readonly<Record<string, unknown>>;
  };
  readonly grantedOperationMarginDelta?: number;
  readonly previewFailureReason?: string;
}

export interface PolicyMovePreparationTrace {
  readonly actionId: string;
  readonly stableMoveKey: string;
  readonly initialClassification: 'complete' | 'stochastic' | 'pending' | 'rejected';
  readonly finalClassification: 'complete' | 'stochastic' | 'rejected';
  readonly enteredTrustedMoveIndex: boolean;
  readonly skippedAsDuplicate?: boolean;
  readonly templateCompletionAttempts?: number;
  readonly templateCompletionOutcome?: 'complete' | 'stochastic' | 'failed';
  readonly rejection?: 'structurallyUnsatisfiable' | 'drawDeadEnd' | 'notViable' | 'notDecisionComplete';
  readonly warnings?: readonly RuntimeWarning[];
}

export interface PolicyPruningStepTrace {
  readonly ruleId: string;
  readonly remainingCandidateCount: number;
  readonly skippedBecauseEmpty: boolean;
}

export interface PolicyTieBreakStepTrace {
  readonly tieBreakerId: string;
  readonly candidateCountBefore: number;
  readonly candidateCountAfter: number;
}

export interface PolicyPreviewUsageTrace {
  readonly mode: AgentPreviewMode;
  readonly evaluatedCandidateCount: number;
  readonly refIds: readonly string[];
  readonly unknownRefs: readonly PolicyPreviewUnknownRefTrace[];
  readonly outcomeBreakdown?: PolicyPreviewOutcomeBreakdownTrace;
}

export interface PolicySelectionTrace {
  readonly mode: AgentSelectionMode;
  readonly temperature?: number;
  readonly candidateCount: number;
  readonly samplingProbabilities?: readonly number[];
  readonly selectedIndex: number;
}

export interface PolicyPreviewOutcomeBreakdownTrace {
  readonly ready: number;
  readonly stochastic: number;
  readonly unknownRandom: number;
  readonly unknownHidden: number;
  readonly unknownUnresolved: number;
  readonly unknownFailed: number;
}

export interface PolicyCompletionStatistics {
  readonly totalClassifiedMoves: number;
  readonly completedCount: number;
  readonly stochasticCount: number;
  readonly rejectedNotViable: number;
  readonly templateCompletionAttempts: number;
  readonly templateCompletionSuccesses: number;
  readonly templateCompletionStructuralFailures: number;
  readonly duplicatesRemoved: number;
  readonly completionsByActionId?: Readonly<Record<string, number>>;
}

export interface BuiltinAgentDecisionTrace {
  readonly kind: 'builtin';
  readonly agent: BuiltinAgentDescriptor;
  readonly candidateCount: number;
  readonly selectedIndex?: number;
  readonly selectedStableMoveKey?: string;
}

export interface PolicyAgentDecisionTrace {
  readonly kind: 'policy';
  readonly agent: PolicyAgentDescriptor;
  readonly seatId: string | null;
  readonly requestedProfileId: string | null;
  readonly resolvedProfileId: string | null;
  readonly profileFingerprint: string | null;
  readonly initialCandidateCount: number;
  readonly selectedStableMoveKey: string | null;
  readonly phase1Score?: number | null;
  readonly phase2Score?: number | null;
  readonly phase1ActionRanking?: readonly string[];
  readonly finalScore: number | null;
  readonly pruningSteps: readonly PolicyPruningStepTrace[];
  readonly tieBreakChain: readonly PolicyTieBreakStepTrace[];
  readonly previewUsage: PolicyPreviewUsageTrace;
  readonly selection?: PolicySelectionTrace;
  readonly emergencyFallback: boolean;
  readonly failure: AgentDecisionFailureSummary | null;
  readonly stateFeatures?: Readonly<Record<string, number | string | boolean>>;
  readonly completionStatistics?: PolicyCompletionStatistics;
  readonly movePreparations?: readonly PolicyMovePreparationTrace[];
  readonly candidates?: readonly PolicyCandidateDecisionTrace[];
}

export type AgentDecisionTrace = BuiltinAgentDecisionTrace | PolicyAgentDecisionTrace;

// ── Execution Options & Collector ─────────────────────────

export interface ExecutionOptions {
  readonly trace?: boolean;
  readonly conditionTrace?: boolean;
  readonly decisionTrace?: boolean;
  readonly selectorTrace?: boolean;
  readonly advanceToDecisionPoint?: boolean;
  readonly verifyCompiledEffects?: boolean;
  readonly maxPhaseTransitionsPerMove?: number;
  /** Opt-in performance profiler. Accumulates sub-function timing when provided. */
  readonly profiler?: import('./perf-profiler.js').PerfProfiler;
  /**
   * Opt-in incremental Zobrist hash verification.
   * When `true`, every move verifies `_runningHash === computeFullHash(table, state)`.
   * When `{ interval: N }`, verifies every Nth move (by turnCount).
   * Throws `KernelRuntimeError` with code `HASH_DRIFT` on mismatch.
   */
  readonly verifyIncrementalHash?: boolean | {
    readonly interval: number;
  };
}

export interface ExecutionCollector {
  readonly warnings: RuntimeWarning[];
  readonly trace: EffectTraceEntry[] | null;
  readonly conditionTrace: ConditionTraceEntry[] | null;
  readonly decisionTrace: DecisionTraceEntry[] | null;
  readonly selectorTrace: SelectorTraceEntry[] | null;
  nextSeq: number;
}

export interface ApplyMoveResult {
  readonly state: GameState;
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
  readonly conditionTrace?: readonly ConditionTraceEntry[];
  readonly decisionTrace?: readonly DecisionTraceEntry[];
  readonly selectorTrace?: readonly SelectorTraceEntry[];
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
  readonly conditionTrace?: readonly ConditionTraceEntry[];
  readonly decisionTrace?: readonly DecisionTraceEntry[];
  readonly selectorTrace?: readonly SelectorTraceEntry[];
  readonly moveContext?: MoveContext;
  readonly agentDecision?: AgentDecisionTrace;
  readonly snapshot?: DecisionPointSnapshot;
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

export type SimulationStopReason =
  | 'terminal'
  | 'maxTurns'
  | 'noLegalMoves'
  | 'noPlayableMoveCompletion';

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

export interface TraceMetrics {
  readonly gameLength: number;
  readonly avgBranchingFactor: number;
  readonly actionDiversity: number;
  readonly resourceTension: number;
  readonly interactionProxy: number;
  readonly dominantActionFreq: number;
  readonly dramaMeasure: number;
}

export interface TraceEval {
  readonly seed: number;
  readonly turnCount: number;
  readonly stopReason: SimulationStopReason;
  readonly metrics: TraceMetrics;
  readonly degeneracyFlags: readonly DegeneracyFlag[];
}

export interface EvalReport {
  readonly gameDefId: string;
  readonly runCount: number;
  readonly metrics: Metrics;
  readonly degeneracyFlags: readonly DegeneracyFlag[];
  readonly perSeed: readonly TraceEval[];
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

export interface SerializedGameState extends Omit<
  GameState,
  'rng' | 'stateHash' | '_runningHash' | 'reveals' | 'globalMarkers' | 'activeLastingEffects' | 'interruptPhaseStack'
> {
  readonly reveals?: GameState['reveals'];
  readonly globalMarkers?: GameState['globalMarkers'];
  readonly activeLastingEffects?: GameState['activeLastingEffects'];
  readonly interruptPhaseStack?: GameState['interruptPhaseStack'];
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
    readonly legalMoves: readonly ClassifiedMove[];
    readonly rng: Rng;
    readonly runtime?: import('./gamedef-runtime.js').GameDefRuntime;
    /** Opt-in profiler for agent sub-function timing. */
    readonly profiler?: import('./perf-profiler.js').PerfProfiler;
  }): { readonly move: TrustedExecutableMove; readonly rng: Rng; readonly agentDecision?: AgentDecisionTrace };
}
