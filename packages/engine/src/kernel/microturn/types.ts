import { asSeatId, type ActionId, type PlayerId, type SeatId, type TriggerId } from '../branded.js';
import type { DecisionKey, DecisionScope } from '../decision-scope.js';
import type { FreeOperationExecutionOverlay } from '../free-operation-overlay.js';
import type { ChoiceIllegalReason } from '../legality-reasons.js';
import type { PlayerObservation } from '../observation.js';
import type { PrioritizedTierEntry } from '../prioritized-tier-legality.js';
import type { ChooseNOptionResolution } from '../types-core.js';
import type { EffectAST, MoveParamScalar, MoveParamValue } from '../types-ast.js';
import type { ActionResolutionStageDef } from '../types-operations.js';
import type { TurnFlowPendingFreeOperationGrant } from '../types-turn-flow.js';
import type {
  AgentDecisionTrace,
  ConditionTraceEntry,
  DecisionTraceEntry,
  EffectTraceEntry,
  ExecutionOptions,
  GameDef,
  GameState,
  Move,
  Rng,
  RuntimeWarning,
  SelectorTraceEntry,
  StateDelta,
  TriggerLogEntry,
} from '../types-core.js';
import type { MicroturnSnapshot } from '../../sim/snapshot-types.js';
import type { GameDefRuntime } from '../gamedef-runtime.js';

export type DecisionContextKind =
  | 'actionSelection'
  | 'chooseOne'
  | 'chooseNStep'
  | 'stochasticResolve'
  | 'outcomeGrantResolve'
  | 'turnRetirement';

export type TurnId = number & { readonly __brand: 'TurnId' };
export type DecisionFrameId = number & { readonly __brand: 'DecisionFrameId' };
export type ActiveDeciderSeatId = SeatId | '__chance' | '__kernel';

export const asTurnId = (value: number): TurnId => value as TurnId;
export const asDecisionFrameId = (value: number): DecisionFrameId => value as DecisionFrameId;

export interface ChooseOption {
  readonly value: MoveParamValue;
  readonly legality: 'legal' | 'illegal' | 'unknown';
  readonly illegalReason: ChoiceIllegalReason | null;
  readonly resolution?: ChooseNOptionResolution;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type ChooseNStepCommand = 'add' | 'remove' | 'confirm';

export interface StochasticDistributionEntry {
  readonly value: MoveParamValue;
  readonly weight: number;
}

export interface StochasticDistribution {
  readonly outcomes: readonly StochasticDistributionEntry[];
}

export interface EffectExecutionFrameSnapshot {
  readonly programCounter: number;
  readonly boundedIterationCursors: Readonly<Record<string, number>>;
  readonly localBindings: Readonly<Record<string, MoveParamValue>>;
  readonly pendingTriggerQueue: readonly TriggerId[];
  readonly decisionHistory?: readonly CompoundTurnTraceEntry[];
  readonly suspendedFrame?: SuspendedEffectFrameSnapshot;
}

export interface SuspendedChoiceBindingOption {
  readonly comparable: MoveParamScalar;
  readonly binding: unknown;
}

export interface SuspendedChooseOneLeaf {
  readonly kind: 'chooseOne';
  readonly decisionKey: DecisionKey;
  readonly bind: string;
  readonly decisionScope: DecisionScope;
  readonly bindingOptions: readonly SuspendedChoiceBindingOption[];
}

export interface SuspendedChooseNLeaf {
  readonly kind: 'chooseN';
  readonly decisionKey: DecisionKey;
  readonly bind: string;
  readonly decisionScope: DecisionScope;
  readonly bindingOptions: readonly SuspendedChoiceBindingOption[];
}

export type SuspendedDecisionLeaf =
  | SuspendedChooseOneLeaf
  | SuspendedChooseNLeaf;

export interface SuspendedSequenceResumeFrame {
  readonly kind: 'sequence';
  readonly effects: readonly EffectAST[];
}

export interface SuspendedForEachResumeFrame {
  readonly kind: 'forEach';
  readonly bind: string;
  readonly items: readonly unknown[];
  readonly nextIndex: number;
  readonly effects: readonly EffectAST[];
  readonly parentBindings: Readonly<Record<string, unknown>>;
  readonly parentIterationPath: string;
}

export interface SuspendedLetResumeFrame {
  readonly kind: 'let';
  readonly bind: string;
  readonly parentBindings: Readonly<Record<string, unknown>>;
}

export interface SuspendedReduceResumeFrame {
  readonly kind: 'reduce';
  readonly bind: string;
  readonly parentBindings: Readonly<Record<string, unknown>>;
}

export interface SuspendedPipelineResumeFrame {
  readonly kind: 'pipeline';
  readonly actionId: ActionId;
  readonly profileId: string;
  readonly atomicity: 'atomic' | 'partial';
  readonly remainingStages: readonly ActionResolutionStageDef[];
  readonly eventEffects: readonly EffectAST[];
}

export type SuspendedResumeFrame =
  | SuspendedSequenceResumeFrame
  | SuspendedForEachResumeFrame
  | SuspendedLetResumeFrame
  | SuspendedReduceResumeFrame
  | SuspendedPipelineResumeFrame;

export interface SuspendedEffectFrameSnapshot {
  readonly state: GameState;
  readonly rng: Rng;
  readonly actorPlayer: GameState['activePlayer'];
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly freeOperationOverlay?: FreeOperationExecutionOverlay;
  readonly leaf: SuspendedDecisionLeaf;
  readonly resumeStack: readonly SuspendedResumeFrame[];
}

export interface ActionSelectionContext {
  readonly kind: 'actionSelection';
  readonly seatId: SeatId;
  readonly eligibleActions: readonly ActionId[];
}

export interface ChooseOneContext {
  readonly kind: 'chooseOne';
  readonly seatId: SeatId;
  readonly decisionKey: DecisionKey;
  readonly options: readonly ChooseOption[];
}

export interface ChooseNStepContext {
  readonly kind: 'chooseNStep';
  readonly seatId: SeatId;
  readonly decisionKey: DecisionKey;
  readonly options: readonly ChooseOption[];
  readonly selectedSoFar: readonly MoveParamScalar[];
  readonly cardinality: { readonly min: number; readonly max: number };
  readonly stepCommands: readonly ChooseNStepCommand[];
  readonly templateHint?: {
    readonly normalizedDomain: readonly MoveParamScalar[];
    readonly prioritizedTierEntries: readonly (readonly PrioritizedTierEntry[])[] | null;
    readonly qualifierMode: 'none' | 'byQualifier';
  };
}

export interface StochasticResolveContext {
  readonly kind: 'stochasticResolve';
  readonly seatId: '__chance';
  readonly decisionKey: DecisionKey;
  readonly distribution: StochasticDistribution;
}

export interface OutcomeGrantResolveContext {
  readonly kind: 'outcomeGrantResolve';
  readonly seatId: '__kernel';
  readonly grant: TurnFlowPendingFreeOperationGrant;
}

export interface TurnRetirementContext {
  readonly kind: 'turnRetirement';
  readonly seatId: '__kernel';
  readonly retiringTurnId: TurnId;
}

export type DecisionContext =
  | ActionSelectionContext
  | ChooseOneContext
  | ChooseNStepContext
  | StochasticResolveContext
  | OutcomeGrantResolveContext
  | TurnRetirementContext;

export interface DecisionStackFrame {
  readonly frameId: DecisionFrameId;
  readonly parentFrameId: DecisionFrameId | null;
  readonly turnId: TurnId;
  readonly context: DecisionContext;
  readonly accumulatedBindings: Readonly<Record<DecisionKey, MoveParamValue>>;
  readonly effectFrame: EffectExecutionFrameSnapshot;
}

export interface ProjectedGameState {
  readonly state: GameState;
  readonly observation?: PlayerObservation;
}

export interface ActionSelectionDecision {
  readonly kind: 'actionSelection';
  readonly actionId: ActionId;
  readonly move?: Move;
}

export interface ChooseOneDecision {
  readonly kind: 'chooseOne';
  readonly decisionKey: DecisionKey;
  readonly value: MoveParamValue;
}

export interface ChooseNStepDecision {
  readonly kind: 'chooseNStep';
  readonly decisionKey: DecisionKey;
  readonly command: ChooseNStepCommand;
  readonly value?: MoveParamScalar;
}

export interface StochasticResolveDecision {
  readonly kind: 'stochasticResolve';
  readonly decisionKey: DecisionKey;
  readonly value: MoveParamValue;
}

export interface OutcomeGrantResolveDecision {
  readonly kind: 'outcomeGrantResolve';
  readonly grantId: string;
}

export interface TurnRetirementDecision {
  readonly kind: 'turnRetirement';
  readonly retiringTurnId: TurnId;
}

export type Decision =
  | ActionSelectionDecision
  | ChooseOneDecision
  | ChooseNStepDecision
  | StochasticResolveDecision
  | OutcomeGrantResolveDecision
  | TurnRetirementDecision;

export interface CompoundTurnTraceEntry {
  readonly seatId: ActiveDeciderSeatId;
  readonly decisionContextKind: DecisionContextKind;
  readonly decisionKey: DecisionKey | null;
  readonly decision: Decision;
  readonly frameId: DecisionFrameId;
}

export interface MicroturnState {
  readonly kind: DecisionContextKind;
  readonly seatId: ActiveDeciderSeatId;
  readonly decisionContext: DecisionContext;
  readonly legalActions: readonly Decision[];
  readonly projectedState: ProjectedGameState;
  readonly turnId: TurnId;
  readonly frameId: DecisionFrameId;
  readonly compoundTurnTrace: readonly CompoundTurnTraceEntry[];
}

export interface DecisionLog {
  readonly stateHash: bigint;
  readonly seatId: ActiveDeciderSeatId;
  readonly playerId?: PlayerId;
  readonly decisionContextKind: DecisionContextKind;
  readonly decisionKey: DecisionKey | null;
  readonly decision: Decision;
  readonly turnId: TurnId;
  readonly turnRetired: boolean;
  readonly legalActionCount: number;
  readonly deltas: readonly StateDelta[];
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
  readonly conditionTrace?: readonly ConditionTraceEntry[];
  readonly decisionTrace?: readonly DecisionTraceEntry[];
  readonly selectorTrace?: readonly SelectorTraceEntry[];
  readonly agentDecision?: AgentDecisionTrace;
  readonly snapshot?: MicroturnSnapshot;
}

export interface ApplyDecisionResult {
  readonly state: GameState;
  readonly log: DecisionLog;
  readonly triggerFirings: readonly TriggerLogEntry[];
  readonly warnings: readonly RuntimeWarning[];
  readonly effectTrace?: readonly EffectTraceEntry[];
  readonly conditionTrace?: readonly ConditionTraceEntry[];
  readonly decisionTrace?: readonly DecisionTraceEntry[];
  readonly selectorTrace?: readonly SelectorTraceEntry[];
}

export interface AdvanceAutoresolvableResult {
  readonly state: GameState;
  readonly rng: Rng;
  readonly autoResolvedLogs: readonly DecisionLog[];
}

export interface PublishMicroturn {
  (
    def: GameDef,
    state: GameState,
    runtime?: GameDefRuntime,
  ): MicroturnState;
}

export interface ApplyDecision {
  (
    def: GameDef,
    state: GameState,
    decision: Decision,
    options?: ExecutionOptions,
    runtime?: GameDefRuntime,
  ): ApplyDecisionResult;
}

export interface AdvanceAutoresolvable {
  (
    def: GameDef,
    state: GameState,
    rng: Rng,
    runtime?: GameDefRuntime,
  ): AdvanceAutoresolvableResult;
}

export const resolveActiveDeciderSeatIdForPlayer = (
  def: Readonly<{ seats?: readonly { readonly id: string }[] }>,
  playerIndex: number,
): SeatId => asSeatId(def.seats?.[playerIndex]?.id ?? String(playerIndex));
