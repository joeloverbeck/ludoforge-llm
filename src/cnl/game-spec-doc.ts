import type { ConditionAST, ValueExpr } from '../kernel/types.js';

export interface GameSpecMetadata {
  readonly id: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly maxTriggerDepth?: number;
}

export interface GameSpecVarDef {
  readonly name: string;
  readonly type: string;
  readonly init: number;
  readonly min: number;
  readonly max: number;
}

export interface GameSpecZoneDef {
  readonly id: string;
  readonly owner: string;
  readonly visibility: string;
  readonly ordering: string;
  readonly adjacentTo?: readonly string[];
}

export interface GameSpecTokenTypeDef {
  readonly id: string;
  readonly props: Readonly<Record<string, string>>;
}

export interface GameSpecTurnStructure {
  readonly phases: readonly GameSpecPhaseDef[];
  readonly activePlayerOrder: string;
}

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
  readonly phase: string;
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

export interface GameSpecDataAsset {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
}

export type GameSpecTurnFlowDuration = 'card' | 'nextCard' | 'coup' | 'campaign';

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
  readonly winnerActionId: string;
  readonly canceledActionId: string;
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
  readonly durationWindows: readonly GameSpecTurnFlowDuration[];
  readonly monsoon?: GameSpecTurnFlowMonsoon;
  readonly pivotal?: GameSpecTurnFlowPivotal;
}

export interface GameSpecOperationProfilePartialExecution {
  readonly mode: 'forbid' | 'allow';
}

export interface GameSpecOperationProfileDef {
  readonly id: string;
  readonly actionId: string;
  readonly legality: Readonly<Record<string, unknown>>;
  readonly cost: Readonly<Record<string, unknown>>;
  readonly targeting: Readonly<Record<string, unknown>>;
  readonly resolution: readonly Readonly<Record<string, unknown>>[];
  readonly partialExecution: GameSpecOperationProfilePartialExecution;
  readonly linkedSpecialActivityWindows?: readonly string[];
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

export interface EffectMacroParam {
  readonly name: string;
  readonly type: 'string' | 'number' | 'effect' | 'effects' | 'value' | 'condition' | 'query';
}

export interface EffectMacroDef {
  readonly id: string;
  readonly params: readonly EffectMacroParam[];
  readonly effects: readonly GameSpecEffect[];
}

export interface GameSpecDoc {
  readonly metadata: GameSpecMetadata | null;
  readonly constants: Readonly<Record<string, number>> | null;
  readonly dataAssets: readonly GameSpecDataAsset[] | null;
  readonly globalVars: readonly GameSpecVarDef[] | null;
  readonly perPlayerVars: readonly GameSpecVarDef[] | null;
  readonly zones: readonly GameSpecZoneDef[] | null;
  readonly tokenTypes: readonly GameSpecTokenTypeDef[] | null;
  readonly setup: readonly GameSpecEffect[] | null;
  readonly turnStructure: GameSpecTurnStructure | null;
  readonly turnFlow: GameSpecTurnFlow | null;
  readonly operationProfiles: readonly GameSpecOperationProfileDef[] | null;
  readonly coupPlan: GameSpecCoupPlan | null;
  readonly victory: GameSpecVictory | null;
  readonly actions: readonly GameSpecActionDef[] | null;
  readonly triggers: readonly GameSpecTriggerDef[] | null;
  readonly endConditions: readonly GameSpecEndCondition[] | null;
  readonly effectMacros: readonly EffectMacroDef[] | null;
}

export function createEmptyGameSpecDoc(): GameSpecDoc {
  return {
    metadata: null,
    constants: null,
    dataAssets: null,
    globalVars: null,
    perPlayerVars: null,
    zones: null,
    tokenTypes: null,
    setup: null,
    turnStructure: null,
    turnFlow: null,
    operationProfiles: null,
    coupPlan: null,
    victory: null,
    actions: null,
    triggers: null,
    endConditions: null,
    effectMacros: null,
  };
}
