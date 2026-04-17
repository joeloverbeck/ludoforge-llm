import type {
  IllegalMoveContext,
  KernelRuntimeError,
  KernelRuntimeErrorCode,
  KernelRuntimeErrorContext,
} from './runtime-error.js';
import type {
  ChoicePendingRequest,
  ChoiceStochasticPendingRequest,
  Move,
  RuntimeWarning,
} from './types.js';

export type MoveViabilityVerdictCode = 'VIABLE' | KernelRuntimeErrorCode;

export const MOVE_VIABILITY_VERDICT_CODES = [
  'VIABLE',
  'ILLEGAL_MOVE',
  'RUNTIME_CONTRACT_INVALID',
  'ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED',
  'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED',
  'LEGAL_CHOICES_UNKNOWN_ACTION',
  'LEGAL_CHOICES_VALIDATION_FAILED',
  'LEGAL_MOVES_VALIDATION_FAILED',
  'INITIAL_STATE_NO_PHASES',
  'PHASE_ADVANCE_NO_PHASES',
  'PHASE_ADVANCE_CURRENT_PHASE_NOT_FOUND',
  'PHASE_ADVANCE_NEXT_PHASE_NOT_FOUND',
  'DECISION_POINT_NO_PHASES',
  'DECISION_POINT_STALL_LOOP_DETECTED',
  'TURN_FLOW_PASS_REWARD_NON_NUMERIC_RESOURCE',
  'TERMINAL_SCORING_CONFIG_MISSING',
  'TERMINAL_SCORING_NON_NUMERIC',
  'TERMINAL_MARGIN_NON_NUMERIC',
  'TERMINAL_CHECKPOINT_SEAT_UNMAPPED',
  'TERMINAL_WINNER_SEAT_UNMAPPED',
  'DERIVED_VALUE_FORMULA_NON_NUMERIC_VAR',
  'DERIVED_VALUE_CONTRACT_MISSING',
  'DERIVED_VALUE_ZONE_ATTRIBUTE_INVALID',
  'HASH_DRIFT',
] as const satisfies readonly MoveViabilityVerdictCode[];

export type MoveViabilityResult =
  | Readonly<{
      readonly viable: true;
      readonly complete: true;
      readonly move: Move;
      readonly warnings: readonly RuntimeWarning[];
      readonly code: undefined;
      readonly context: undefined;
      readonly error: undefined;
      readonly nextDecision: undefined;
      readonly nextDecisionSet: undefined;
      readonly stochasticDecision: undefined;
    }>
  | Readonly<{
      readonly viable: true;
      readonly complete: false;
      readonly move: Move;
      readonly warnings: readonly RuntimeWarning[];
      readonly code: undefined;
      readonly context: undefined;
      readonly error: undefined;
      readonly nextDecision: ChoicePendingRequest | undefined;
      readonly nextDecisionSet: readonly ChoicePendingRequest[] | undefined;
      readonly stochasticDecision: ChoiceStochasticPendingRequest | undefined;
    }>
  | Readonly<{
      readonly viable: false;
      readonly complete: undefined;
      readonly move: undefined;
      readonly warnings: undefined;
      readonly code: 'ILLEGAL_MOVE';
      readonly context: IllegalMoveContext;
      readonly error: KernelRuntimeError<'ILLEGAL_MOVE'>;
      readonly nextDecision: undefined;
      readonly nextDecisionSet: undefined;
      readonly stochasticDecision: undefined;
    }>
  | Readonly<{
      readonly viable: false;
      readonly complete: undefined;
      readonly move: undefined;
      readonly warnings: undefined;
      readonly code: Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>;
      readonly context: KernelRuntimeErrorContext<Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>> | undefined;
      readonly error: KernelRuntimeError<Exclude<KernelRuntimeErrorCode, 'ILLEGAL_MOVE'>>;
      readonly nextDecision: undefined;
      readonly nextDecisionSet: undefined;
      readonly stochasticDecision: undefined;
    }>;

const isDeferredFreeOperationTemplateZoneFilterMismatch = (
  move: Move,
  viability: MoveViabilityResult,
): boolean => {
  if (move.freeOperation !== true || viability.viable || viability.code !== 'ILLEGAL_MOVE') {
    return false;
  }
  const ctx = viability.context;
  return (
    ctx.reason === 'freeOperationNotGranted'
    && 'freeOperationDenial' in ctx
    && (ctx as { readonly freeOperationDenial: { readonly cause: string } }).freeOperationDenial.cause === 'zoneFilterMismatch'
  );
};

export const deriveMoveViabilityVerdict = (
  move: Move,
  viability: MoveViabilityResult,
): MoveViabilityResult => {
  if (!isDeferredFreeOperationTemplateZoneFilterMismatch(move, viability)) {
    return viability;
  }
  return {
    viable: true,
    complete: false,
    move,
    warnings: [],
    code: undefined,
    context: undefined,
    error: undefined,
    nextDecision: undefined,
    nextDecisionSet: undefined,
    stochasticDecision: undefined,
  };
};

export const toMoveViabilityVerdictCode = (
  viability: MoveViabilityResult,
): MoveViabilityVerdictCode => (viability.viable ? 'VIABLE' : viability.code);
