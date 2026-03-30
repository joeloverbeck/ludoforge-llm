import type {
  AttributeValue,
  ConditionAST,
  EventDeckDef,
  ValueExpr,
} from '../kernel/types.js';
import type { VictoryStandingsDef } from '../kernel/types-core.js';
import type { VerbalizationLabelEntry, VerbalizationMacroEntry, VerbalizationStageDescription, VerbalizationModifierEffect, VerbalizationModifierClassification } from '../kernel/verbalization-types.js';
import type { TurnFlowActionClass, TurnFlowWindowUsage } from '../contracts/index.js';

export interface GameSpecMetadata {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly maxTriggerDepth?: number;
  readonly defaultScenarioAssetId?: string;
  readonly namedSets?: Readonly<Record<string, readonly string[]>>;
}

export interface GameSpecExpansionOrigin {
  readonly pass: string;
  readonly template?: string;
}

export interface GameSpecVarDef {
  readonly name: string;
  readonly type: string;
  readonly init: unknown;
  readonly min?: unknown;
  readonly max?: unknown;
  readonly material?: unknown;
  readonly _origin?: GameSpecExpansionOrigin;
}

export interface GameSpecGlobalMarkerLatticeDef {
  readonly id: string;
  readonly states: readonly string[];
  readonly defaultState: string;
  readonly _origin?: GameSpecExpansionOrigin;
}

export interface GameSpecBatchGlobalMarkerLattice {
  readonly batch: {
    readonly ids: readonly string[];
    readonly states: readonly string[];
    readonly defaultState: string;
  };
}

export interface GameSpecBatchVarDef {
  readonly batch: {
    readonly names: readonly string[];
    readonly type: 'int' | 'boolean';
    readonly init: unknown;
    readonly min?: unknown;
    readonly max?: unknown;
    readonly material?: unknown;
  };
}

export interface GameSpecZoneBehavior {
  readonly type: string;
  readonly drawFrom?: string;
  readonly reshuffleFrom?: string;
}

export interface GameSpecZoneDef {
  readonly id: string;
  readonly zoneKind?: 'board' | 'aux';
  readonly isInternal?: boolean;
  readonly owner: string;
  readonly visibility: string;
  readonly ordering: string;
  readonly adjacentTo?: ReadonlyArray<{
    readonly to: string;
    readonly direction?: 'bidirectional' | 'unidirectional';
    readonly category?: string;
    readonly attributes?: Readonly<Record<string, AttributeValue>>;
  }>;
  readonly category?: string;
  readonly attributes?: Readonly<Record<string, AttributeValue>>;
  readonly behavior?: GameSpecZoneBehavior;
  readonly _origin?: GameSpecExpansionOrigin;
}

export interface GameSpecZoneTemplateDef {
  readonly template: {
    readonly idPattern: string;
    readonly perSeat: true;
    readonly owner: string;
    readonly visibility: string;
    readonly ordering: string;
    readonly zoneKind?: 'board' | 'aux';
    readonly isInternal?: boolean;
    readonly category?: string;
    readonly attributes?: Readonly<Record<string, AttributeValue>>;
    readonly behavior?: GameSpecZoneBehavior;
  };
}

export interface GameSpecTokenTypeZoneEntryRule {
  readonly match: { readonly zoneKind?: 'board' | 'aux'; readonly category?: string };
  readonly set: Readonly<Record<string, string | number | boolean>>;
}

export interface GameSpecTokenTypeDef {
  readonly id: string;
  readonly props: Readonly<Record<string, string>>;
  readonly seat?: string;
  readonly onZoneEntry?: readonly GameSpecTokenTypeZoneEntryRule[];
}

export interface GameSpecTurnStructure {
  readonly phases: readonly (GameSpecPhaseDef | GameSpecPhaseFromTemplate)[];
  readonly interrupts?: readonly (GameSpecPhaseDef | GameSpecPhaseFromTemplate)[];
}

export interface GameSpecFixedOrderTurnOrder {
  readonly type: 'fixedOrder';
  readonly order: readonly string[];
}

export interface GameSpecCardDrivenTurnOrder {
  readonly type: 'cardDriven';
  readonly config: {
    readonly turnFlow: GameSpecTurnFlow;
    readonly coupPlan?: GameSpecCoupPlan;
  };
}

export interface GameSpecRoundRobinTurnOrder {
  readonly type: 'roundRobin';
}

export interface GameSpecSimultaneousTurnOrder {
  readonly type: 'simultaneous';
}

export type GameSpecTurnOrder =
  | GameSpecRoundRobinTurnOrder
  | GameSpecFixedOrderTurnOrder
  | GameSpecCardDrivenTurnOrder
  | GameSpecSimultaneousTurnOrder;

export interface GameSpecPhaseDef {
  readonly id: string;
  readonly onEnter?: readonly unknown[];
  readonly onExit?: readonly unknown[];
  readonly actionDefaults?: {
    readonly pre?: unknown;
    readonly afterEffects?: readonly unknown[];
  };
  readonly _origin?: GameSpecExpansionOrigin;
}

export interface GameSpecPhaseTemplateParam {
  readonly name: string;
}

export interface GameSpecPhaseTemplateDef {
  readonly id: string;
  readonly params: readonly GameSpecPhaseTemplateParam[];
  readonly phase: Readonly<Record<string, unknown>>;
}

export interface GameSpecPhaseFromTemplate {
  readonly fromTemplate: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface GameSpecEffect {
  readonly [key: string]: unknown;
}

export interface GameSpecActionDef {
  readonly id: string;
  readonly actor: unknown;
  readonly executor: unknown;
  readonly phase: readonly string[];
  readonly capabilities?: readonly string[];
  readonly params: readonly unknown[];
  readonly pre: unknown | null;
  readonly cost: readonly unknown[];
  readonly effects: readonly unknown[];
  readonly limits: readonly unknown[];
}

export interface GameSpecTriggerDef {
  readonly id?: string;
  readonly event?: unknown;
  readonly when?: unknown;
  readonly match?: unknown;
  readonly effects: readonly unknown[];
}

export interface GameSpecEndCondition {
  readonly when: unknown;
  readonly result: unknown;
}

export interface GameSpecScoring {
  readonly method: 'highest' | 'lowest';
  readonly value: ValueExpr;
}

export interface GameSpecDataAsset {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly tableContracts?: readonly GameSpecRuntimeTableContract[];
}

export type GameSpecRuntimeTableConstraint =
  | {
      readonly kind: 'monotonic';
      readonly field: string;
      readonly direction: 'asc' | 'desc';
      readonly strict?: boolean;
    }
  | {
      readonly kind: 'contiguousInt';
      readonly field: string;
      readonly start?: number;
      readonly step?: number;
    }
  | {
      readonly kind: 'numericRange';
      readonly field: string;
      readonly min?: number;
      readonly max?: number;
    };

export interface GameSpecRuntimeTableContract {
  readonly tablePath: string;
  readonly uniqueBy?: readonly (readonly string[])[];
  readonly constraints?: readonly GameSpecRuntimeTableConstraint[];
}

export interface GameSpecImport {
  readonly path: string;
}

export type GameSpecTurnFlowDuration = 'turn' | 'nextTurn' | 'round' | 'cycle';

export type GameSpecTurnFlowActionClass = TurnFlowActionClass;

export interface GameSpecTurnFlowCardLifecycle {
  readonly played: string;
  readonly lookahead: string;
  readonly leader: string;
}

export interface GameSpecTurnFlowWindow {
  readonly id: string;
  readonly duration: GameSpecTurnFlowDuration;
  readonly usages: readonly TurnFlowWindowUsage[];
}

export interface GameSpecTurnFlowEligibility {
  readonly seats: readonly string[];
}

export interface GameSpecTurnFlowOptionMatrixRow {
  readonly first: 'event' | 'operation' | 'operationPlusSpecialActivity';
  readonly second: readonly GameSpecTurnFlowActionClass[];
}

export interface GameSpecTurnFlow {
  readonly cardLifecycle: GameSpecTurnFlowCardLifecycle;
  readonly eligibility: GameSpecTurnFlowEligibility;
  readonly windows: readonly GameSpecTurnFlowWindow[];
  readonly actionClassByActionId: Readonly<Record<string, GameSpecTurnFlowActionClass>>;
  readonly optionMatrix: readonly GameSpecTurnFlowOptionMatrixRow[];
  readonly passRewards: readonly GameSpecTurnFlowPassReward[];
  readonly freeOperationActionIds?: readonly string[];
  readonly durationWindows: readonly GameSpecTurnFlowDuration[];
  readonly monsoon?: GameSpecTurnFlowMonsoon;
  readonly pivotal?: GameSpecTurnFlowPivotal;
  readonly cardSeatOrderMetadataKey?: string;
  readonly cardSeatOrderMapping?: Readonly<Record<string, string>>;
}

export interface GameSpecTurnFlowPassReward {
  readonly seat: string;
  readonly resource: string;
  readonly amount: number;
}

export interface GameSpecTurnFlowMonsoonRestriction {
  readonly actionId: string;
  readonly maxParam?: {
    readonly name: string;
    readonly max: number;
  };
  readonly maxParamsTotal?: {
    readonly names: readonly string[];
    readonly max: number;
  };
  readonly overrideToken?: string;
}

export interface GameSpecTurnFlowMonsoon {
  readonly restrictedActions: readonly GameSpecTurnFlowMonsoonRestriction[];
  readonly blockPivotal?: boolean;
  readonly pivotalOverrideToken?: string;
}

export interface GameSpecTurnFlowInterruptCancellation {
  readonly winner: GameSpecTurnFlowInterruptMoveSelector;
  readonly canceled: GameSpecTurnFlowInterruptMoveSelector;
}

export interface GameSpecTurnFlowInterruptMoveSelector {
  readonly actionId?: string;
  readonly actionClass?: GameSpecTurnFlowActionClass;
  readonly eventCardId?: string;
  readonly eventCardTagsAll?: readonly string[];
  readonly eventCardTagsAny?: readonly string[];
  readonly paramEquals?: Readonly<Record<string, string | number | boolean>>;
}

export interface GameSpecTurnFlowInterruptResolution {
  readonly precedence: readonly string[];
  readonly cancellation?: readonly GameSpecTurnFlowInterruptCancellation[];
}

export interface GameSpecTurnFlowPivotal {
  readonly actionIds: readonly string[];
  readonly requirePreActionWindow?: boolean;
  readonly disallowWhenLookaheadIsCoup?: boolean;
  readonly interrupt?: GameSpecTurnFlowInterruptResolution;
}

export interface GameSpecActionPipelineStageDef {
  readonly stage?: string;
  readonly legality?: unknown;
  readonly costValidation?: unknown;
  readonly effects?: readonly unknown[];
}

export interface GameSpecActionPipelineDef {
  readonly id: string;
  readonly actionId: string;
  readonly applicability?: unknown;
  readonly accompanyingOps?: 'any' | readonly string[];
  readonly compoundParamConstraints?: readonly {
    readonly relation: 'disjoint' | 'subset';
    readonly operationParam: string;
    readonly specialActivityParam: string;
  }[];
  readonly legality: unknown;
  readonly costValidation: unknown;
  readonly costEffects: readonly unknown[];
  readonly targeting: Readonly<Record<string, unknown>>;
  readonly stages: readonly GameSpecActionPipelineStageDef[];
  readonly atomicity: 'atomic' | 'partial';
  readonly linkedWindows?: readonly string[];
}

export type GameSpecDerivedMetricComputation = 'markerTotal' | 'controlledPopulation' | 'totalEcon';

export interface GameSpecDerivedMetricZoneFilter {
  readonly zoneIds?: readonly string[];
  readonly zoneKinds?: readonly ('board' | 'aux')[];
  readonly category?: readonly string[];
  readonly attributeEquals?: Readonly<Record<string, AttributeValue>>;
}

export interface GameSpecDerivedMetricRequirement {
  readonly key: string;
  readonly expectedType: 'number';
}

export interface GameSpecDerivedMetricMarkerTotalRuntime {
  readonly kind: 'markerTotal';
  readonly markerId: string;
  readonly markerConfig: {
    readonly activeState: string;
    readonly passiveState: string;
  };
  readonly defaultMarkerState?: string;
}

export interface GameSpecDerivedMetricControlledPopulationRuntime {
  readonly kind: 'controlledPopulation';
  readonly controlFn: 'coin' | 'solo';
  readonly seatGroupConfig: {
    readonly coinSeats: readonly string[];
    readonly insurgentSeats: readonly string[];
    readonly soloSeat: string;
    readonly seatProp: string;
  };
}

export interface GameSpecDerivedMetricTotalEconRuntime {
  readonly kind: 'totalEcon';
  readonly controlFn: 'coin' | 'solo';
  readonly seatGroupConfig: {
    readonly coinSeats: readonly string[];
    readonly insurgentSeats: readonly string[];
    readonly soloSeat: string;
    readonly seatProp: string;
  };
  readonly blockedByTokenTypes?: readonly string[];
}

export type GameSpecDerivedMetricRuntime =
  | GameSpecDerivedMetricMarkerTotalRuntime
  | GameSpecDerivedMetricControlledPopulationRuntime
  | GameSpecDerivedMetricTotalEconRuntime;

export interface GameSpecDerivedMetricDef {
  readonly id: string;
  readonly computation: GameSpecDerivedMetricComputation;
  readonly zoneFilter?: GameSpecDerivedMetricZoneFilter;
  readonly requirements: readonly GameSpecDerivedMetricRequirement[];
  readonly runtime: GameSpecDerivedMetricRuntime;
}

export interface GameSpecCoupPlanPhase {
  readonly id: string;
  readonly steps: readonly string[];
}

export interface GameSpecCoupPlan {
  readonly phases: readonly GameSpecCoupPlanPhase[];
  readonly finalRoundOmitPhases?: readonly string[];
  readonly maxConsecutiveRounds?: number;
}

export type GameSpecVictoryTiming = 'duringCoup' | 'finalCoup';

export interface GameSpecVictoryCheckpoint {
  readonly id: string;
  readonly seat: string;
  readonly timing: GameSpecVictoryTiming;
  readonly when: ConditionAST;
}

export interface GameSpecVictoryMargin {
  readonly seat: string;
  readonly value: ValueExpr;
}

export interface GameSpecVictoryRanking {
  readonly order: 'desc' | 'asc';
}

export interface GameSpecVictory {
  readonly checkpoints: readonly GameSpecVictoryCheckpoint[];
  readonly margins?: readonly GameSpecVictoryMargin[];
  readonly ranking?: GameSpecVictoryRanking;
}

export interface GameSpecTerminal {
  readonly conditions: readonly GameSpecEndCondition[];
  readonly checkpoints?: readonly GameSpecVictoryCheckpoint[];
  readonly margins?: readonly GameSpecVictoryMargin[];
  readonly ranking?: GameSpecVictoryRanking;
  readonly scoring?: GameSpecScoring;
}

export type EffectMacroParamPrimitiveLiteral = string | number | boolean | null;

export type EffectMacroParamType =
  | 'string'
  | 'number'
  | 'effect'
  | 'effects'
  | 'value'
  | 'condition'
  | 'query'
  | 'bindingName'
  | 'bindingTemplate'
  | 'zoneSelector'
  | 'playerSelector'
  | 'tokenSelector'
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'literals'; readonly values: readonly EffectMacroParamPrimitiveLiteral[] }
  | { readonly kind: 'tokenTraitValue'; readonly prop: string }
  | { readonly kind: 'tokenTraitValues'; readonly prop: string };

export interface EffectMacroParam {
  readonly name: string;
  readonly type: EffectMacroParamType;
}

export interface EffectMacroDef {
  readonly id: string;
  readonly params: readonly EffectMacroParam[];
  readonly effects: readonly GameSpecEffect[];
  readonly exports: readonly string[];
}

export interface ConditionMacroDef {
  readonly id: string;
  readonly params: readonly EffectMacroParam[];
  readonly condition: unknown;
}

export type GameSpecAgentParameterType = 'number' | 'integer' | 'boolean' | 'enum' | 'idOrder';

export interface GameSpecAgentParameterDef {
  readonly type: GameSpecAgentParameterType;
  readonly default?: unknown;
  readonly min?: number;
  readonly max?: number;
  readonly tunable?: boolean;
  readonly values?: readonly string[];
  readonly allowedIds?: readonly string[];
}

export type GameSpecPolicySurfaceVisibilityClass = 'public' | 'seatVisible' | 'hidden';

export interface GameSpecPolicySurfacePreviewVisibilityDef {
  readonly visibility?: GameSpecPolicySurfaceVisibilityClass;
  readonly allowWhenHiddenSampling?: boolean;
}

export interface GameSpecPolicySurfaceVisibilityDef {
  readonly current?: GameSpecPolicySurfaceVisibilityClass;
  readonly preview?: GameSpecPolicySurfacePreviewVisibilityDef;
}

export interface GameSpecAgentVisibilitySection {
  readonly globalVars?: Readonly<Record<string, GameSpecPolicySurfaceVisibilityDef>>;
  readonly perPlayerVars?: Readonly<Record<string, GameSpecPolicySurfaceVisibilityDef>>;
  readonly derivedMetrics?: Readonly<Record<string, GameSpecPolicySurfaceVisibilityDef>>;
  readonly victory?: {
    readonly currentMargin?: GameSpecPolicySurfaceVisibilityDef;
    readonly currentRank?: GameSpecPolicySurfaceVisibilityDef;
  };
}

export type GameSpecPolicyExpr =
  | string
  | number
  | boolean
  | null
  | readonly GameSpecPolicyExpr[]
  | { readonly [key: string]: GameSpecPolicyExpr };

export interface GameSpecStateFeatureDef {
  readonly type?: string;
  readonly expr: GameSpecPolicyExpr;
}

export interface GameSpecCandidateFeatureDef {
  readonly type?: string;
  readonly expr: GameSpecPolicyExpr;
}

export interface GameSpecCandidateAggregateDef {
  readonly op: string;
  readonly of: GameSpecPolicyExpr;
  readonly where?: GameSpecPolicyExpr;
}

export interface GameSpecPruningRuleDef {
  readonly when: GameSpecPolicyExpr;
  readonly onEmpty?: 'skipRule' | 'error';
}

export interface GameSpecScoreTermDef {
  readonly when?: GameSpecPolicyExpr;
  readonly weight: GameSpecPolicyExpr;
  readonly value: GameSpecPolicyExpr;
  readonly unknownAs?: number;
  readonly clamp?: {
    readonly min?: number;
    readonly max?: number;
  };
}

export interface GameSpecTieBreakerDef {
  readonly kind: string;
  readonly value?: GameSpecPolicyExpr;
  readonly order?: readonly string[];
}

export interface GameSpecAgentLibrary {
  readonly stateFeatures?: Readonly<Record<string, GameSpecStateFeatureDef>>;
  readonly candidateFeatures?: Readonly<Record<string, GameSpecCandidateFeatureDef>>;
  readonly candidateAggregates?: Readonly<Record<string, GameSpecCandidateAggregateDef>>;
  readonly pruningRules?: Readonly<Record<string, GameSpecPruningRuleDef>>;
  readonly scoreTerms?: Readonly<Record<string, GameSpecScoreTermDef>>;
  readonly completionScoreTerms?: Readonly<Record<string, GameSpecScoreTermDef>>;
  readonly tieBreakers?: Readonly<Record<string, GameSpecTieBreakerDef>>;
}

export interface GameSpecAgentProfileUse {
  readonly pruningRules?: readonly string[];
  readonly scoreTerms?: readonly string[];
  readonly completionScoreTerms?: readonly string[];
  readonly tieBreakers?: readonly string[];
}

export interface GameSpecAgentProfileDef {
  readonly params?: Readonly<Record<string, unknown>>;
  readonly use: GameSpecAgentProfileUse;
  readonly completionGuidance?: {
    readonly enabled?: boolean;
    readonly fallback?: 'random' | 'first';
  };
}

export type GameSpecSeatPolicyBindings = Readonly<Record<string, string>>;

export interface GameSpecAgentsSection {
  readonly parameters?: Readonly<Record<string, GameSpecAgentParameterDef>>;
  readonly visibility?: GameSpecAgentVisibilitySection;
  readonly library?: GameSpecAgentLibrary;
  readonly profiles?: Readonly<Record<string, GameSpecAgentProfileDef>>;
  readonly bindings?: GameSpecSeatPolicyBindings;
}

export interface GameSpecDoc {
  readonly imports: readonly GameSpecImport[] | null;
  readonly metadata: GameSpecMetadata | null;
  readonly constants: Readonly<Record<string, number>> | null;
  readonly dataAssets: readonly GameSpecDataAsset[] | null;
  readonly globalMarkerLattices: readonly (GameSpecGlobalMarkerLatticeDef | GameSpecBatchGlobalMarkerLattice)[] | null;
  readonly globalVars: readonly (GameSpecVarDef | GameSpecBatchVarDef)[] | null;
  readonly perPlayerVars: readonly (GameSpecVarDef | GameSpecBatchVarDef)[] | null;
  readonly zoneVars: readonly GameSpecVarDef[] | null;
  readonly zones: readonly (GameSpecZoneDef | GameSpecZoneTemplateDef)[] | null;
  readonly tokenTypes: readonly GameSpecTokenTypeDef[] | null;
  readonly setup: readonly GameSpecEffect[] | null;
  readonly turnStructure: GameSpecTurnStructure | null;
  readonly phaseTemplates: readonly GameSpecPhaseTemplateDef[] | null;
  readonly turnOrder: GameSpecTurnOrder | null;
  readonly actionPipelines: readonly GameSpecActionPipelineDef[] | null;
  readonly derivedMetrics: readonly GameSpecDerivedMetricDef[] | null;
  readonly eventDecks: readonly EventDeckDef[] | null;
  readonly terminal: GameSpecTerminal | null;
  readonly actions: readonly GameSpecActionDef[] | null;
  readonly triggers: readonly GameSpecTriggerDef[] | null;
  readonly effectMacros: readonly EffectMacroDef[] | null;
  readonly conditionMacros: readonly ConditionMacroDef[] | null;
  readonly agents: GameSpecAgentsSection | null;
  readonly victoryStandings: VictoryStandingsDef | null;
  readonly verbalization: GameSpecVerbalization | null;
}

export interface GameSpecVerbalization {
  readonly labels?: Readonly<Record<string, string | VerbalizationLabelEntry>> | null;
  readonly stages?: Readonly<Record<string, string>> | null;
  readonly actionSummaries?: Readonly<Record<string, string>> | null;
  readonly macros?: Readonly<Record<string, VerbalizationMacroEntry>> | null;
  readonly sentencePlans?: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>> | null;
  readonly suppressPatterns?: readonly string[] | null;
  readonly stageDescriptions?: Readonly<Record<string, Readonly<Record<string, VerbalizationStageDescription>>>> | null;
  readonly modifierEffects?: Readonly<Record<string, readonly VerbalizationModifierEffect[]>> | null;
  readonly modifierClassification?: VerbalizationModifierClassification | null;
}

export interface GameSpecPieceGenerateDimension {
  readonly name: string;
  readonly values: readonly (string | number)[];
}

export interface GameSpecPieceGenerateDerivedProp {
  readonly from: string;
  readonly map: Readonly<Record<string, string | number>>;
  readonly default?: string;
}

export interface GameSpecPieceGenerateBlock {
  readonly generate: {
    readonly idPattern: string;
    readonly seat: string;
    readonly statusDimensions: readonly string[];
    readonly transitions: readonly unknown[];
    readonly dimensions: readonly GameSpecPieceGenerateDimension[];
    readonly derivedProps?: Readonly<Record<string, GameSpecPieceGenerateDerivedProp>>;
    readonly inventoryPerCombination: number;
  };
}

export function createEmptyGameSpecDoc(): GameSpecDoc {
  return {
    imports: null,
    metadata: null,
    constants: null,
    dataAssets: null,
    globalMarkerLattices: null,
    globalVars: null,
    perPlayerVars: null,
    zoneVars: null,
    zones: null,
    tokenTypes: null,
    setup: null,
    turnStructure: null,
    phaseTemplates: null,
    turnOrder: null,
    actionPipelines: null,
    derivedMetrics: null,
    eventDecks: null,
    terminal: null,
    actions: null,
    triggers: null,
    effectMacros: null,
    conditionMacros: null,
    agents: null,
    victoryStandings: null,
    verbalization: null,
  };
}
