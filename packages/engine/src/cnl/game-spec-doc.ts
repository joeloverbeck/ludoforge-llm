import type {
  AttributeValue,
  ConditionAST,
  EventDeckDef,
  TokenVisualHints,
  ValueExpr,
  ZoneVisualHints,
} from '../kernel/types.js';

export interface GameSpecCardTokenTypeSelectors {
  readonly ids?: readonly string[];
  readonly idPrefixes?: readonly string[];
}

export interface GameSpecCardAnimationZoneRoles {
  readonly draw: readonly string[];
  readonly hand: readonly string[];
  readonly shared: readonly string[];
  readonly burn: readonly string[];
  readonly discard: readonly string[];
}

export interface GameSpecCardAnimationMetadata {
  readonly cardTokenTypes: GameSpecCardTokenTypeSelectors;
  readonly zoneRoles: GameSpecCardAnimationZoneRoles;
}

export interface GameSpecMetadata {
  readonly id: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly maxTriggerDepth?: number;
  readonly defaultScenarioAssetId?: string;
  readonly namedSets?: Readonly<Record<string, readonly string[]>>;
  readonly cardAnimation?: GameSpecCardAnimationMetadata;
}

export interface GameSpecVarDef {
  readonly name: string;
  readonly type: string;
  readonly init: unknown;
  readonly min?: unknown;
  readonly max?: unknown;
}

export interface GameSpecGlobalMarkerLatticeDef {
  readonly id: string;
  readonly states: readonly string[];
  readonly defaultState: string;
}

export interface GameSpecZoneDef {
  readonly id: string;
  readonly zoneKind?: 'board' | 'aux';
  readonly owner: string;
  readonly visibility: string;
  readonly ordering: string;
  readonly adjacentTo?: readonly string[];
  readonly category?: string;
  readonly attributes?: Readonly<Record<string, AttributeValue>>;
  readonly visual?: ZoneVisualHints;
}

export interface GameSpecTokenTypeDef {
  readonly id: string;
  readonly props: Readonly<Record<string, string>>;
  readonly faction?: string;
  readonly visual?: TokenVisualHints;
}

export interface GameSpecTurnStructure {
  readonly phases: readonly GameSpecPhaseDef[];
  readonly interrupts?: readonly GameSpecPhaseDef[];
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

export type GameSpecTurnFlowActionClass =
  | 'pass'
  | 'event'
  | 'operation'
  | 'limitedOperation'
  | 'operationPlusSpecialActivity';

export interface GameSpecTurnFlowCardLifecycle {
  readonly played: string;
  readonly lookahead: string;
  readonly leader: string;
}

export interface GameSpecTurnFlowEligibilityOverrideWindow {
  readonly id: string;
  readonly duration: GameSpecTurnFlowDuration;
}

export interface GameSpecTurnFlowEligibility {
  readonly factions: readonly string[];
  readonly overrideWindows: readonly GameSpecTurnFlowEligibilityOverrideWindow[];
}

export interface GameSpecTurnFlowOptionMatrixRow {
  readonly first: 'event' | 'operation' | 'operationPlusSpecialActivity';
  readonly second: readonly GameSpecTurnFlowActionClass[];
}

export interface GameSpecTurnFlowPassReward {
  readonly factionClass: string;
  readonly resource: string;
  readonly amount: number;
}

export interface GameSpecTurnFlowMonsoonRestriction {
  readonly actionId: string;
  readonly maxParam?: {
    readonly name: string;
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

export interface GameSpecTurnFlow {
  readonly cardLifecycle: GameSpecTurnFlowCardLifecycle;
  readonly eligibility: GameSpecTurnFlowEligibility;
  readonly optionMatrix: readonly GameSpecTurnFlowOptionMatrixRow[];
  readonly passRewards: readonly GameSpecTurnFlowPassReward[];
  readonly freeOperationActionIds?: readonly string[];
  readonly durationWindows: readonly GameSpecTurnFlowDuration[];
  readonly monsoon?: GameSpecTurnFlowMonsoon;
  readonly pivotal?: GameSpecTurnFlowPivotal;
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
  readonly stages: readonly Readonly<Record<string, unknown>>[];
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

export interface GameSpecDerivedMetricDef {
  readonly id: string;
  readonly computation: GameSpecDerivedMetricComputation;
  readonly zoneFilter?: GameSpecDerivedMetricZoneFilter;
  readonly requirements: readonly GameSpecDerivedMetricRequirement[];
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
  readonly faction: string;
  readonly timing: GameSpecVictoryTiming;
  readonly when: ConditionAST;
}

export interface GameSpecVictoryMargin {
  readonly faction: string;
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

export interface GameSpecDoc {
  readonly imports: readonly GameSpecImport[] | null;
  readonly metadata: GameSpecMetadata | null;
  readonly constants: Readonly<Record<string, number>> | null;
  readonly dataAssets: readonly GameSpecDataAsset[] | null;
  readonly globalMarkerLattices: readonly GameSpecGlobalMarkerLatticeDef[] | null;
  readonly globalVars: readonly GameSpecVarDef[] | null;
  readonly perPlayerVars: readonly GameSpecVarDef[] | null;
  readonly zones: readonly GameSpecZoneDef[] | null;
  readonly tokenTypes: readonly GameSpecTokenTypeDef[] | null;
  readonly setup: readonly GameSpecEffect[] | null;
  readonly turnStructure: GameSpecTurnStructure | null;
  readonly turnOrder: GameSpecTurnOrder | null;
  readonly actionPipelines: readonly GameSpecActionPipelineDef[] | null;
  readonly derivedMetrics: readonly GameSpecDerivedMetricDef[] | null;
  readonly eventDecks: readonly EventDeckDef[] | null;
  readonly terminal: GameSpecTerminal | null;
  readonly actions: readonly GameSpecActionDef[] | null;
  readonly triggers: readonly GameSpecTriggerDef[] | null;
  readonly effectMacros: readonly EffectMacroDef[] | null;
  readonly conditionMacros: readonly ConditionMacroDef[] | null;
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
    zones: null,
    tokenTypes: null,
    setup: null,
    turnStructure: null,
    turnOrder: null,
    actionPipelines: null,
    derivedMetrics: null,
    eventDecks: null,
    terminal: null,
    actions: null,
    triggers: null,
    effectMacros: null,
    conditionMacros: null,
  };
}
