import type { ActionSelectorContractViolation } from './action-selector-contract-registry.js';
import { ILLEGAL_MOVE_REASON_MESSAGES, PIPELINE_RUNTIME_REASONS } from './runtime-reasons.js';
import { ILLEGAL_MOVE_REASONS } from './runtime-reasons.js';
import type { IllegalMoveReason, PipelineRuntimeReason, RuntimeContractReason } from './runtime-reasons.js';
import type { FreeOperationBlockExplanation } from './free-operation-denial-contract.js';
import type { ActionDef, ActionPipelineDef, GameState, Move, TurnFlowActionClass } from './types.js';

export type KernelRuntimeErrorCode =
  | 'ILLEGAL_MOVE'
  | 'RUNTIME_CONTRACT_INVALID'
  | 'ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED'
  | 'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED'
  | 'LEGAL_CHOICES_UNKNOWN_ACTION'
  | 'LEGAL_CHOICES_VALIDATION_FAILED'
  | 'LEGAL_MOVES_VALIDATION_FAILED'
  | 'INITIAL_STATE_NO_PHASES'
  | 'PHASE_ADVANCE_NO_PHASES'
  | 'PHASE_ADVANCE_CURRENT_PHASE_NOT_FOUND'
  | 'PHASE_ADVANCE_NEXT_PHASE_NOT_FOUND'
  | 'DECISION_POINT_NO_PHASES'
  | 'DECISION_POINT_STALL_LOOP_DETECTED'
  | 'TURN_FLOW_PASS_REWARD_NON_NUMERIC_RESOURCE'
  | 'TERMINAL_SCORING_CONFIG_MISSING'
  | 'TERMINAL_SCORING_NON_NUMERIC'
  | 'TERMINAL_MARGIN_NON_NUMERIC'
  | 'TERMINAL_CHECKPOINT_SEAT_UNMAPPED'
  | 'TERMINAL_WINNER_SEAT_UNMAPPED'
  | 'DERIVED_VALUE_FORMULA_NON_NUMERIC_VAR'
  | 'DERIVED_VALUE_CONTRACT_MISSING'
  | 'DERIVED_VALUE_ZONE_ATTRIBUTE_INVALID';

export type SelectorBoundarySurface = 'applyMove' | 'legalChoices' | 'legalMoves';

export type SelectorSurface = 'actor' | 'executor';

export interface RuntimeContractInvalidContext {
  readonly surface: SelectorBoundarySurface;
  readonly selector: SelectorSurface;
  readonly actionId: ActionDef['id'];
  readonly reason: RuntimeContractReason;
  readonly selectorContractViolations?: readonly ActionSelectorContractViolation[];
}

type IllegalMoveBaseContext<R extends IllegalMoveReason> = Readonly<{
  readonly actionId: Move['actionId'];
  readonly params: Move['params'];
  readonly reason: R;
}>;
type CompoundMovePayload = NonNullable<Move['compound']>;
type CompoundMoveInvalidField = keyof Pick<CompoundMovePayload, 'insertAfterStage' | 'replaceRemainingStages'>;

export interface IllegalMoveContextByReason {
  readonly [ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE> & Readonly<{
      readonly detail?: string;
    }>;
  readonly [ILLEGAL_MOVE_REASONS.MOVE_HAS_INCOMPLETE_PARAMS]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.MOVE_HAS_INCOMPLETE_PARAMS> & Readonly<{
      readonly nextDecisionId?: string;
      readonly nextDecisionName?: string;
    }>;
  readonly [ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID> & Readonly<{
      readonly detail?: string;
    }>;
  readonly [ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION>;
  readonly [ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID>;
  readonly [ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED> & Readonly<{
      readonly operationActionId: Move['actionId'];
      readonly specialActivityActionId: Move['actionId'];
      readonly profileId: string;
    }>;
  readonly [ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED> & Readonly<{
      readonly operationActionId: Move['actionId'];
      readonly specialActivityActionId: Move['actionId'];
      readonly profileId: string;
      readonly relation: 'disjoint' | 'subset';
      readonly operationParam: string;
      readonly specialActivityParam: string;
    }>;
  readonly [ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH> & Readonly<{
      readonly mappedActionClass: TurnFlowActionClass;
      readonly submittedActionClass: string;
    }>;
  readonly [ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED> & Readonly<{
      readonly freeOperationDenial: FreeOperationBlockExplanation;
    }>;
  readonly [ILLEGAL_MOVE_REASONS.ACTION_ACTOR_NOT_APPLICABLE]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.ACTION_ACTOR_NOT_APPLICABLE>;
  readonly [ILLEGAL_MOVE_REASONS.ACTION_EXECUTOR_NOT_APPLICABLE]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.ACTION_EXECUTOR_NOT_APPLICABLE>;
  readonly [ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE> & Readonly<{
      readonly detail?: string;
    }>;
  readonly [ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED> & Readonly<{
      readonly profileId?: string;
    }>;
  readonly [ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED> & Readonly<{
      readonly profileId?: string;
      readonly partialExecutionMode?: ActionPipelineDef['atomicity'];
    }>;
  readonly [ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID> & Readonly<{
      readonly timing?: CompoundMovePayload['timing'];
      readonly invalidField?: CompoundMoveInvalidField;
      readonly insertAfterStage?: number;
      readonly stageCount?: number;
      readonly detail?: string;
    }>;
  readonly [ILLEGAL_MOVE_REASONS.SIMULTANEOUS_SUBMISSION_COMPOUND_UNSUPPORTED]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.SIMULTANEOUS_SUBMISSION_COMPOUND_UNSUPPORTED>;
  readonly [ILLEGAL_MOVE_REASONS.SIMULTANEOUS_RUNTIME_STATE_REQUIRED]:
    IllegalMoveBaseContext<typeof ILLEGAL_MOVE_REASONS.SIMULTANEOUS_RUNTIME_STATE_REQUIRED>;
}

export type IllegalMoveContext<R extends IllegalMoveReason = IllegalMoveReason> = IllegalMoveContextByReason[R];
type IllegalMoveContextInput<R extends IllegalMoveReason> = Omit<IllegalMoveContext<R>, 'actionId' | 'params' | 'reason'>;
type RequiredKeys<T> = {
  [K in keyof T]-?: Pick<T, K> extends Required<Pick<T, K>> ? K : never;
}[keyof T];
type IllegalMoveReasonsWithNoContext = {
  [R in IllegalMoveReason]: [keyof IllegalMoveContextInput<R>] extends [never] ? R : never;
}[IllegalMoveReason];
type IllegalMoveReasonsRequiringContext = {
  [R in IllegalMoveReason]: [RequiredKeys<IllegalMoveContextInput<R>>] extends [never] ? never : R;
}[IllegalMoveReason];
type IllegalMoveContextArgs<R extends IllegalMoveReason> =
  R extends IllegalMoveReasonsRequiringContext
    ? [context: IllegalMoveContextInput<R>]
    : R extends IllegalMoveReasonsWithNoContext
      ? []
      : [context?: IllegalMoveContextInput<R>];

export interface KernelRuntimeErrorContextByCode {
  readonly ILLEGAL_MOVE: IllegalMoveContext;
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
  readonly LEGAL_CHOICES_VALIDATION_FAILED: Readonly<{
    readonly actionId: ActionDef['id'];
    readonly param: string;
    readonly value: unknown;
  }>;
  readonly LEGAL_MOVES_VALIDATION_FAILED: Readonly<{
    readonly actionId: ActionDef['id'];
    readonly param: string;
    readonly value: unknown;
  }>;
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
  readonly TERMINAL_SCORING_CONFIG_MISSING: Readonly<Record<string, never>>;
  readonly TERMINAL_SCORING_NON_NUMERIC: Readonly<Record<string, never>>;
  readonly TERMINAL_MARGIN_NON_NUMERIC: Readonly<{
    readonly seat: string;
  }>;
  readonly TERMINAL_CHECKPOINT_SEAT_UNMAPPED: Readonly<{
    readonly seat: string;
    readonly checkpointId: string;
  }>;
  readonly TERMINAL_WINNER_SEAT_UNMAPPED: Readonly<{
    readonly winnerSeat: string;
    readonly checkpointId: string;
  }>;
  readonly DERIVED_VALUE_FORMULA_NON_NUMERIC_VAR: Readonly<{
    readonly varName: string;
  }>;
  readonly DERIVED_VALUE_CONTRACT_MISSING: Readonly<{
    readonly computation: 'computeMarkerTotal' | 'computeTotalEcon' | 'sumControlledPopulation';
    readonly zoneId: string;
    readonly attributeKey: string;
  }>;
  readonly DERIVED_VALUE_ZONE_ATTRIBUTE_INVALID: Readonly<{
    readonly computation: 'computeMarkerTotal' | 'computeTotalEcon' | 'sumControlledPopulation';
    readonly zoneId: string;
    readonly attributeKey: string;
    readonly expectedType: 'number';
    readonly actualType: string;
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

  constructor(move: Move, context: IllegalMoveContext) {
    const reasonMessage = ILLEGAL_MOVE_REASON_MESSAGES[context.reason];
    super(
      'ILLEGAL_MOVE',
      `Illegal move: actionId=${String(move.actionId)} reason=${context.reason} detail=${reasonMessage} params=${JSON.stringify(move.params)}`,
      context,
    );
    this.name = 'IllegalMoveError';
    this.actionId = move.actionId;
    this.params = move.params;
    this.reason = context.reason;
  }
}

export function illegalMoveError<R extends IllegalMoveReason>(
  move: Move,
  reason: R,
  ...args: IllegalMoveContextArgs<R>
): IllegalMoveError;
export function illegalMoveError(
  move: Move,
  reason: IllegalMoveReason,
  ...args: [context?: IllegalMoveContextInput<IllegalMoveReason>]
): IllegalMoveError {
  const context = args[0];
  if (reason === ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED && (context as { freeOperationDenial?: unknown } | undefined)?.freeOperationDenial === undefined) {
    throw new TypeError('FREE_OPERATION_NOT_GRANTED requires freeOperationDenial in ILLEGAL_MOVE context.');
  }
  const resolvedContext = {
    actionId: move.actionId,
    params: move.params,
    reason,
    ...(context ?? {}),
  } as IllegalMoveContext;
  return new IllegalMoveError(move, resolvedContext);
}

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
