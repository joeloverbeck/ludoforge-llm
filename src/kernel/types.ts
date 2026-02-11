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
  | { readonly ref: 'binding'; readonly name: string };

export type ValueExpr =
  | number
  | boolean
  | string
  | Reference
  | {
      readonly op: '+' | '-' | '*';
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
    };

export type OptionsQuery =
  | { readonly query: 'tokensInZone'; readonly zone: ZoneSel }
  | { readonly query: 'intsInRange'; readonly min: number; readonly max: number }
  | { readonly query: 'enums'; readonly values: readonly string[] }
  | { readonly query: 'players' }
  | { readonly query: 'zones'; readonly filter?: { readonly owner?: PlayerSel } }
  | { readonly query: 'adjacentZones'; readonly zone: ZoneSel }
  | { readonly query: 'tokensInAdjacentZones'; readonly zone: ZoneSel }
  | {
      readonly query: 'connectedZones';
      readonly zone: ZoneSel;
      readonly via?: ConditionAST;
      readonly includeStart?: boolean;
      readonly maxDepth?: number;
    };

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
        readonly n: number;
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

export interface TokenTypeDef {
  readonly id: string;
  readonly props: Readonly<Record<string, 'int' | 'string' | 'boolean'>>;
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
  readonly actions: readonly ActionDef[];
  readonly triggers: readonly TriggerDef[];
  readonly endConditions: readonly EndCondition[];
  readonly scoring?: ScoringDef;
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

export interface TurnFlowDef {
  readonly cardLifecycle: TurnFlowCardLifecycleDef;
  readonly eligibility: TurnFlowEligibilityDef;
  readonly optionMatrix: readonly TurnFlowOptionMatrixRowDef[];
  readonly passRewards: readonly TurnFlowPassRewardDef[];
  readonly durationWindows: readonly TurnFlowDuration[];
}

export type DataAssetKind = 'map' | 'scenario' | 'pieceCatalog';

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

export interface MapPayload {
  readonly spaces: readonly MapSpaceDef[];
  readonly provisionalAdjacency?: readonly ProvisionalAdjacencyDef[];
  readonly tracks?: readonly NumericTrackDef[];
  readonly markerLattices?: readonly SpaceMarkerLatticeDef[];
  readonly spaceMarkers?: readonly SpaceMarkerValueDef[];
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

export interface TurnFlowRuntimeState {
  readonly factionOrder: readonly string[];
  readonly eligibility: Readonly<Record<string, boolean>>;
  readonly currentCard: TurnFlowRuntimeCardState;
  readonly pendingEligibilityOverrides?: readonly TurnFlowPendingEligibilityOverride[];
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
}

export type MoveParamScalar = number | string | boolean | TokenId | ZoneId | PlayerId;
export type MoveParamValue = MoveParamScalar | readonly MoveParamScalar[];

export interface Move {
  readonly actionId: ActionId;
  readonly params: Readonly<Record<string, MoveParamValue>>;
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

export type TriggerLogEntry = TriggerFiring | TriggerTruncated | TurnFlowLifecycleTraceEntry | TurnFlowEligibilityTraceEntry;

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

export type TerminalResult =
  | { readonly type: 'win'; readonly player: PlayerId }
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
