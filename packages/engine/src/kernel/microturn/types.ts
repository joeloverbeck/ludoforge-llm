import { asSeatId, type ActionId, type SeatId, type TriggerId } from '../branded.js';
import type { DecisionKey } from '../decision-scope.js';
import type { ChoiceIllegalReason } from '../legality-reasons.js';
import type { ChooseNOptionResolution } from '../types-core.js';
import type { MoveParamScalar, MoveParamValue } from '../types-ast.js';
import type { TurnFlowPendingFreeOperationGrant } from '../types-turn-flow.js';

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

export const resolveActiveDeciderSeatIdForPlayer = (
  def: Readonly<{ seats?: readonly { readonly id: string }[] }>,
  playerIndex: number,
): SeatId => asSeatId(def.seats?.[playerIndex]?.id ?? String(playerIndex));
