import type { ActionSelectorContractViolation } from './action-selector-contract-registry.js';
import { ILLEGAL_MOVE_REASON_MESSAGES, PIPELINE_RUNTIME_REASONS } from './runtime-reasons.js';
import type { IllegalMoveReason, PipelineRuntimeReason, RuntimeContractReason } from './runtime-reasons.js';
import type { ActionDef, GameState, Move } from './types.js';

export type KernelRuntimeErrorCode =
  | 'ILLEGAL_MOVE'
  | 'RUNTIME_CONTRACT_INVALID'
  | 'ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED'
  | 'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED'
  | 'LEGAL_CHOICES_UNKNOWN_ACTION'
  | 'LEGAL_CHOICES_VALIDATION_FAILED'
  | 'INITIAL_STATE_NO_PHASES'
  | 'PHASE_ADVANCE_NO_PHASES'
  | 'PHASE_ADVANCE_CURRENT_PHASE_NOT_FOUND'
  | 'PHASE_ADVANCE_NEXT_PHASE_NOT_FOUND'
  | 'DECISION_POINT_NO_PHASES'
  | 'DECISION_POINT_STALL_LOOP_DETECTED'
  | 'TURN_FLOW_PASS_REWARD_NON_NUMERIC_RESOURCE'
  | 'MOVE_DECISION_SEQUENCE_MAX_STEPS_EXCEEDED'
  | 'TERMINAL_SCORING_CONFIG_MISSING'
  | 'TERMINAL_SCORING_NON_NUMERIC'
  | 'TERMINAL_MARGIN_NON_NUMERIC'
  | 'TERMINAL_CHECKPOINT_FACTION_UNMAPPED'
  | 'TERMINAL_WINNER_FACTION_UNMAPPED'
  | 'DERIVED_VALUE_FORMULA_NON_NUMERIC_VAR';

export type SelectorBoundarySurface = 'applyMove' | 'legalChoices' | 'legalMoves';

export type SelectorSurface = 'actor' | 'executor';

export interface RuntimeContractInvalidContext {
  readonly surface: SelectorBoundarySurface;
  readonly selector: SelectorSurface;
  readonly actionId: ActionDef['id'];
  readonly reason: RuntimeContractReason;
  readonly selectorContractViolations?: readonly ActionSelectorContractViolation[];
}

export interface KernelRuntimeErrorContextByCode {
  readonly ILLEGAL_MOVE: Readonly<{
    readonly actionId: Move['actionId'];
    readonly params: Move['params'];
    readonly reason: IllegalMoveReason;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }>;
  readonly RUNTIME_CONTRACT_INVALID: RuntimeContractInvalidContext;
  readonly ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED: Readonly<{
    readonly actionId: ActionDef['id'];
    readonly profileId: string;
    readonly reason: Extract<PipelineRuntimeReason, 'applicabilityEvaluationFailed'>;
  }>;
  readonly ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED: Readonly<{
    readonly actionId: ActionDef['id'];
    readonly profileId: string;
    readonly predicate: 'legality' | 'costValidation';
    readonly reason: Extract<PipelineRuntimeReason, 'pipelinePredicateEvaluationFailed'>;
  }>;
  readonly LEGAL_CHOICES_UNKNOWN_ACTION: Readonly<{
    readonly actionId: Move['actionId'];
  }>;
  readonly LEGAL_CHOICES_VALIDATION_FAILED: Readonly<Record<string, unknown>>;
  readonly INITIAL_STATE_NO_PHASES: Readonly<Record<string, never>>;
  readonly PHASE_ADVANCE_NO_PHASES: Readonly<Record<string, never>>;
  readonly PHASE_ADVANCE_CURRENT_PHASE_NOT_FOUND: Readonly<{
    readonly currentPhase: GameState['currentPhase'];
  }>;
  readonly PHASE_ADVANCE_NEXT_PHASE_NOT_FOUND: Readonly<{
    readonly nextPhaseIndex: number;
  }>;
  readonly DECISION_POINT_NO_PHASES: Readonly<Record<string, never>>;
  readonly DECISION_POINT_STALL_LOOP_DETECTED: Readonly<{
    readonly maxAutoAdvancesPerMove: number;
  }>;
  readonly TURN_FLOW_PASS_REWARD_NON_NUMERIC_RESOURCE: Readonly<{
    readonly resource: string;
  }>;
  readonly MOVE_DECISION_SEQUENCE_MAX_STEPS_EXCEEDED: Readonly<{
    readonly maxSteps: number;
  }>;
  readonly TERMINAL_SCORING_CONFIG_MISSING: Readonly<Record<string, never>>;
  readonly TERMINAL_SCORING_NON_NUMERIC: Readonly<Record<string, never>>;
  readonly TERMINAL_MARGIN_NON_NUMERIC: Readonly<{
    readonly faction: string;
  }>;
  readonly TERMINAL_CHECKPOINT_FACTION_UNMAPPED: Readonly<{
    readonly faction: string;
    readonly checkpointId: string;
  }>;
  readonly TERMINAL_WINNER_FACTION_UNMAPPED: Readonly<{
    readonly winnerFaction: string;
    readonly checkpointId: string;
  }>;
  readonly DERIVED_VALUE_FORMULA_NON_NUMERIC_VAR: Readonly<{
    readonly varName: string;
  }>;
}

export type KernelRuntimeErrorContext<C extends KernelRuntimeErrorCode = KernelRuntimeErrorCode> =
  KernelRuntimeErrorContextByCode[C];

function formatMessage<C extends KernelRuntimeErrorCode>(message: string, context?: KernelRuntimeErrorContext<C>): string {
  if (context === undefined) {
    return message;
  }
  return `${message} context=${JSON.stringify(context)}`;
}

export class KernelRuntimeError<C extends KernelRuntimeErrorCode = KernelRuntimeErrorCode> extends Error {
  readonly code: C;
  readonly context?: KernelRuntimeErrorContext<C>;

  constructor(code: C, message: string, context?: KernelRuntimeErrorContext<C>, cause?: unknown) {
    super(formatMessage(message, context));
    this.name = 'KernelRuntimeError';
    this.code = code;
    if (context !== undefined) {
      this.context = context;
    }
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export const kernelRuntimeError = <C extends KernelRuntimeErrorCode>(
  code: C,
  message: string,
  context?: KernelRuntimeErrorContext<C>,
  cause?: unknown,
): KernelRuntimeError<C> => new KernelRuntimeError(code, message, context, cause);

export class IllegalMoveError extends KernelRuntimeError<'ILLEGAL_MOVE'> {
  readonly actionId: Move['actionId'];
  readonly params: Move['params'];
  readonly reason: IllegalMoveReason;
  readonly metadata?: Readonly<Record<string, unknown>>;

  constructor(move: Move, reason: IllegalMoveReason, metadata?: Readonly<Record<string, unknown>>) {
    const reasonMessage = ILLEGAL_MOVE_REASON_MESSAGES[reason];
    super(
      'ILLEGAL_MOVE',
      `Illegal move: actionId=${String(move.actionId)} reason=${reason} detail=${reasonMessage} params=${JSON.stringify(move.params)}`,
      {
        actionId: move.actionId,
        params: move.params,
        reason,
        ...(metadata === undefined ? {} : { metadata }),
      },
    );
    this.name = 'IllegalMoveError';
    this.actionId = move.actionId;
    this.params = move.params;
    this.reason = reason;
    if (metadata !== undefined) {
      this.metadata = metadata;
    }
  }
}

export const illegalMoveError = (
  move: Move,
  reason: IllegalMoveReason,
  metadata?: Readonly<Record<string, unknown>>,
): IllegalMoveError => new IllegalMoveError(move, reason, metadata);

export const pipelineApplicabilityEvaluationError = (
  action: ActionDef,
  profileId: string,
  cause: unknown,
): KernelRuntimeError<'ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED'> =>
  new KernelRuntimeError(
    'ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED',
    `action pipeline applicability evaluation failed for actionId=${String(action.id)} profileId=${profileId}`,
    {
      actionId: action.id,
      profileId,
      reason: PIPELINE_RUNTIME_REASONS.APPLICABILITY_EVALUATION_FAILED,
    },
    cause,
  );

export const pipelinePredicateEvaluationError = (
  action: ActionDef,
  profileId: string,
  predicate: 'legality' | 'costValidation',
  cause: unknown,
): KernelRuntimeError<'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED'> =>
  new KernelRuntimeError(
    'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED',
    `action pipeline ${predicate} evaluation failed for actionId=${String(action.id)} profileId=${profileId}`,
    {
      actionId: action.id,
      profileId,
      predicate,
      reason: PIPELINE_RUNTIME_REASONS.PREDICATE_EVALUATION_FAILED,
    },
    cause,
  );

export const runtimeContractInvalidError = (
  message: string,
  context?: KernelRuntimeErrorContext<'RUNTIME_CONTRACT_INVALID'>,
  cause?: unknown,
): KernelRuntimeError<'RUNTIME_CONTRACT_INVALID'> => new KernelRuntimeError('RUNTIME_CONTRACT_INVALID', message, context, cause);

export function isKernelRuntimeError(error: unknown): error is KernelRuntimeError {
  return error instanceof KernelRuntimeError;
}

export function isKernelErrorCode<C extends KernelRuntimeErrorCode>(
  error: unknown,
  code: C,
): error is KernelRuntimeError<C> {
  return isKernelRuntimeError(error) && error.code === code;
}
