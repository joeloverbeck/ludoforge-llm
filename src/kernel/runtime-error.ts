import type { ActionDef, Move } from './types.js';

export type KernelRuntimeErrorCode =
  | 'ILLEGAL_MOVE'
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

export type KernelRuntimeErrorContext = Readonly<Record<string, unknown>>;

function formatMessage(message: string, context?: KernelRuntimeErrorContext): string {
  if (context === undefined) {
    return message;
  }
  return `${message} context=${JSON.stringify(context)}`;
}

export class KernelRuntimeError extends Error {
  readonly code: KernelRuntimeErrorCode;
  readonly context?: KernelRuntimeErrorContext;

  constructor(code: KernelRuntimeErrorCode, message: string, context?: KernelRuntimeErrorContext, cause?: unknown) {
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

export const kernelRuntimeError = (
  code: KernelRuntimeErrorCode,
  message: string,
  context?: KernelRuntimeErrorContext,
  cause?: unknown,
): KernelRuntimeError => new KernelRuntimeError(code, message, context, cause);

export class IllegalMoveError extends KernelRuntimeError {
  readonly actionId: Move['actionId'];
  readonly params: Move['params'];
  readonly reason: string;
  readonly metadata?: Readonly<Record<string, unknown>>;

  constructor(move: Move, reason: string, metadata?: Readonly<Record<string, unknown>>) {
    super(
      'ILLEGAL_MOVE',
      `Illegal move: actionId=${String(move.actionId)} reason=${reason} params=${JSON.stringify(move.params)}`,
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
  reason: string,
  metadata?: Readonly<Record<string, unknown>>,
): IllegalMoveError => new IllegalMoveError(move, reason, metadata);

export const pipelineApplicabilityEvaluationError = (
  action: ActionDef,
  profileId: string,
  cause: unknown,
): KernelRuntimeError =>
  new KernelRuntimeError(
    'ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED',
    `action pipeline applicability evaluation failed for actionId=${String(action.id)} profileId=${profileId}`,
    {
      actionId: action.id,
      profileId,
      reason: 'applicabilityEvaluationFailed',
    },
    cause,
  );

export const pipelinePredicateEvaluationError = (
  action: ActionDef,
  profileId: string,
  predicate: 'legality' | 'costValidation',
  cause: unknown,
): KernelRuntimeError =>
  new KernelRuntimeError(
    'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED',
    `action pipeline ${predicate} evaluation failed for actionId=${String(action.id)} profileId=${profileId}`,
    {
      actionId: action.id,
      profileId,
      predicate,
      reason: 'pipelinePredicateEvaluationFailed',
    },
    cause,
  );

export function isKernelRuntimeError(error: unknown): error is KernelRuntimeError {
  return error instanceof KernelRuntimeError;
}

export function isKernelErrorCode<C extends KernelRuntimeErrorCode>(
  error: unknown,
  code: C,
): error is KernelRuntimeError & { readonly code: C } {
  return isKernelRuntimeError(error) && error.code === code;
}
