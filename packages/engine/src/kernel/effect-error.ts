import type { StackingViolation } from './stacking.js';
import { EFFECT_RUNTIME_REASONS, type EffectRuntimeReason } from './runtime-reasons.js';
import type { EffectAST } from './types.js';
import type { TurnFlowActiveSeatInvariantContext } from './runtime-error.js';

export type EffectErrorCode =
  | 'EFFECT_RUNTIME'
  | 'EFFECT_NOT_IMPLEMENTED'
  | 'EFFECT_BUDGET_EXCEEDED'
  | 'SPATIAL_NOT_IMPLEMENTED'
  | 'SPATIAL_DESTINATION_REQUIRED'
  | 'SPATIAL_DESTINATION_NOT_ADJACENT'
  | 'STACKING_VIOLATION';

export type TurnFlowActiveSeatUnresolvableEffectRuntimeContext = Readonly<{
  readonly effectType: 'grantFreeOperation';
}> & TurnFlowActiveSeatInvariantContext;

type TurnFlowRuntimeValidationFailedGenericContext = Readonly<{
  readonly effectType: string;
  readonly invariant?: never;
}> & Readonly<Record<string, unknown>>;

export type TurnFlowRuntimeValidationFailedContext =
  | TurnFlowRuntimeValidationFailedGenericContext
  | TurnFlowActiveSeatUnresolvableEffectRuntimeContext;

type EffectRuntimeGenericContext = Readonly<Record<string, unknown>>;

export type ChoiceRuntimeValidationFailedContext = Readonly<{
  readonly effectType: string;
}> & EffectRuntimeGenericContext;

export type ChoiceProbeAuthorityMismatchContext = Readonly<{
  readonly effectType: string;
}> & EffectRuntimeGenericContext;

export type EffectRuntimeContextByReason = Readonly<{
  readonly [EFFECT_RUNTIME_REASONS.EFFECT_BUDGET_CONFIG_INVALID]: EffectRuntimeGenericContext;
  readonly [EFFECT_RUNTIME_REASONS.INTERNAL_INVARIANT_VIOLATION]: EffectRuntimeGenericContext;
  readonly [EFFECT_RUNTIME_REASONS.SUBSET_RUNTIME_VALIDATION_FAILED]: EffectRuntimeGenericContext;
  readonly [EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED]: ChoiceRuntimeValidationFailedContext;
  readonly [EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH]: ChoiceProbeAuthorityMismatchContext;
  readonly [EFFECT_RUNTIME_REASONS.CONTROL_FLOW_RUNTIME_VALIDATION_FAILED]: EffectRuntimeGenericContext;
  readonly [EFFECT_RUNTIME_REASONS.RESOURCE_RUNTIME_VALIDATION_FAILED]: EffectRuntimeGenericContext;
  readonly [EFFECT_RUNTIME_REASONS.CONCEAL_RUNTIME_VALIDATION_FAILED]: EffectRuntimeGenericContext;
  readonly [EFFECT_RUNTIME_REASONS.REVEAL_RUNTIME_VALIDATION_FAILED]: EffectRuntimeGenericContext;
  readonly [EFFECT_RUNTIME_REASONS.TOKEN_RUNTIME_VALIDATION_FAILED]: EffectRuntimeGenericContext;
  readonly [EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED]: TurnFlowRuntimeValidationFailedContext;
  readonly [EFFECT_RUNTIME_REASONS.VARIABLE_RUNTIME_VALIDATION_FAILED]: EffectRuntimeGenericContext;
}>;

export type EffectRuntimeContext<R extends EffectRuntimeReason = EffectRuntimeReason> =
  EffectRuntimeContextByReason[R];

export type EffectRuntimeReasonsRequiringContext =
  | typeof EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED
  | typeof EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED
  | typeof EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH;

export type EffectRuntimeReasonsWithNoContext = never;

export type EffectRuntimeReasonsWithOptionalContext = Exclude<
  EffectRuntimeReason,
  EffectRuntimeReasonsWithNoContext | EffectRuntimeReasonsRequiringContext
>;

type EffectRuntimeContextArgs<R extends EffectRuntimeReason> =
  R extends EffectRuntimeReasonsRequiringContext
    ? [context: EffectRuntimeContext<R>]
    : R extends EffectRuntimeReasonsWithNoContext
      ? []
      : [context?: EffectRuntimeContext<R>];

export type EffectRuntimeErrorContextForReason<R extends EffectRuntimeReason> = Readonly<{
  readonly reason: R;
}> & EffectRuntimeContext<R>;

export type EffectRuntimeErrorContext = {
  readonly [R in EffectRuntimeReason]: EffectRuntimeErrorContextForReason<R>;
}[EffectRuntimeReason];

export interface EffectErrorContextByCode {
  readonly EFFECT_RUNTIME: EffectRuntimeErrorContext;
  readonly EFFECT_NOT_IMPLEMENTED: Readonly<{
    readonly effectType: string;
    readonly effect?: EffectAST;
  }>;
  readonly EFFECT_BUDGET_EXCEEDED: Readonly<{
    readonly effectType: string;
    readonly maxEffectOps: number;
  }>;
  readonly SPATIAL_NOT_IMPLEMENTED: Readonly<Record<string, unknown>>;
  readonly SPATIAL_DESTINATION_REQUIRED: Readonly<{
    readonly effectType: 'moveTokenAdjacent';
    readonly availableBindings: readonly string[];
    readonly direction?: string;
  }>;
  readonly SPATIAL_DESTINATION_NOT_ADJACENT: Readonly<{
    readonly effectType: 'moveTokenAdjacent';
    readonly fromZoneId: string;
    readonly toZoneId: string;
    readonly adjacentZones: readonly string[];
  }>;
  readonly STACKING_VIOLATION: Readonly<{
    readonly effectType: string;
    readonly zoneId: string;
    readonly constraintId: StackingViolation['constraintId'];
    readonly rule: StackingViolation['rule'];
    readonly matchingCount: StackingViolation['matchingCount'];
    readonly maxCount?: StackingViolation['maxCount'];
  }>;
}

export type EffectErrorContext<C extends EffectErrorCode = EffectErrorCode> = EffectErrorContextByCode[C];

function formatMessage<C extends EffectErrorCode>(message: string, context?: EffectErrorContext<C>): string {
  if (context === undefined) {
    return message;
  }

  return `${message} context=${JSON.stringify(context)}`;
}

export class EffectRuntimeError<C extends EffectErrorCode = EffectErrorCode> extends Error {
  readonly code: C;
  readonly context?: EffectErrorContext<C>;

  constructor(code: C, message: string, context?: EffectErrorContext<C>) {
    super(formatMessage(message, context));
    this.name = 'EffectRuntimeError';
    this.code = code;
    if (context !== undefined) {
      this.context = context;
    }
  }
}

export class EffectBudgetExceededError extends EffectRuntimeError<'EFFECT_BUDGET_EXCEEDED'> {
  constructor(message: string, context?: EffectErrorContext<'EFFECT_BUDGET_EXCEEDED'>) {
    super('EFFECT_BUDGET_EXCEEDED', message, context);
    this.name = 'EffectBudgetExceededError';
  }
}

export class SpatialNotImplementedError extends EffectRuntimeError<'SPATIAL_NOT_IMPLEMENTED'> {
  constructor(message: string, context?: EffectErrorContext<'SPATIAL_NOT_IMPLEMENTED'>) {
    super('SPATIAL_NOT_IMPLEMENTED', message, context);
    this.name = 'SpatialNotImplementedError';
  }
}

export function effectNotImplementedError(
  effectType: string,
  context?: Omit<EffectErrorContext<'EFFECT_NOT_IMPLEMENTED'>, 'effectType'>,
): EffectRuntimeError<'EFFECT_NOT_IMPLEMENTED'> {
  return new EffectRuntimeError('EFFECT_NOT_IMPLEMENTED', `Effect handler is not implemented: ${effectType}`, {
    effectType,
    ...context,
  });
}

export const makeTurnFlowActiveSeatUnresolvableEffectRuntimeContext = (
  context: TurnFlowActiveSeatInvariantContext,
): TurnFlowActiveSeatUnresolvableEffectRuntimeContext => ({
  effectType: 'grantFreeOperation',
  ...context,
});

const TURN_FLOW_RUNTIME_REQUIRED_CONTEXT_FIELDS: readonly (keyof EffectRuntimeContext<'turnFlowRuntimeValidationFailed'> & string)[] =
  ['effectType'];
const CHOICE_RUNTIME_REQUIRED_CONTEXT_FIELDS: readonly (keyof EffectRuntimeContext<'choiceRuntimeValidationFailed'> & string)[] =
  ['effectType'];
const CHOICE_PROBE_MISMATCH_REQUIRED_CONTEXT_FIELDS: readonly (keyof EffectRuntimeContext<'choiceProbeAuthorityMismatch'> & string)[] =
  ['effectType'];

const validateRequiredEffectRuntimeContextFields = (
  reason: EffectRuntimeReason,
  context: unknown,
): void => {
  const requiredFields = reason === EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED
    ? TURN_FLOW_RUNTIME_REQUIRED_CONTEXT_FIELDS
    : reason === EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED
      ? CHOICE_RUNTIME_REQUIRED_CONTEXT_FIELDS
      : reason === EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH
        ? CHOICE_PROBE_MISMATCH_REQUIRED_CONTEXT_FIELDS
    : undefined;
  if (requiredFields === undefined || requiredFields.length === 0) {
    return;
  }
  const contextRecord = typeof context === 'object' && context !== null
    ? (context as Record<string, unknown>)
    : undefined;
  for (const field of requiredFields) {
    if (contextRecord?.[field] === undefined) {
      throw new TypeError(`${reason} requires ${field} in EFFECT_RUNTIME context.`);
    }
  }
};

const isTurnFlowRuntimeValidationFailedContext = (
  context: unknown,
): context is EffectRuntimeContext<'turnFlowRuntimeValidationFailed'> => (
  typeof context === 'object'
  && context !== null
  && typeof (context as Record<string, unknown>).effectType === 'string'
);

const isChoiceRuntimeValidationFailedContext = (
  context: unknown,
): context is EffectRuntimeContext<'choiceRuntimeValidationFailed'> => (
  typeof context === 'object'
  && context !== null
  && typeof (context as Record<string, unknown>).effectType === 'string'
);

const isChoiceProbeAuthorityMismatchContext = (
  context: unknown,
): context is EffectRuntimeContext<'choiceProbeAuthorityMismatch'> => (
  typeof context === 'object'
  && context !== null
  && typeof (context as Record<string, unknown>).effectType === 'string'
);

export function effectRuntimeError<R extends EffectRuntimeReason>(
  reason: R,
  message: string,
  ...args: EffectRuntimeContextArgs<R>
): EffectRuntimeError<'EFFECT_RUNTIME'>;
export function effectRuntimeError(
  reason: EffectRuntimeReason,
  message: string,
  ...args: [context?: EffectRuntimeContext<EffectRuntimeReason>]
): EffectRuntimeError<'EFFECT_RUNTIME'> {
  const context = args[0];
  validateRequiredEffectRuntimeContextFields(reason, context);
  if (reason === EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED) {
    if (!isTurnFlowRuntimeValidationFailedContext(context)) {
      throw new TypeError('turnFlowRuntimeValidationFailed requires effectType in EFFECT_RUNTIME context.');
    }
    const runtimeContext: EffectRuntimeErrorContextForReason<typeof EFFECT_RUNTIME_REASONS.TURN_FLOW_RUNTIME_VALIDATION_FAILED> = {
      reason,
      ...context,
    };
    return new EffectRuntimeError('EFFECT_RUNTIME', message, runtimeContext);
  }

  if (reason === EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED) {
    if (!isChoiceRuntimeValidationFailedContext(context)) {
      throw new TypeError('choiceRuntimeValidationFailed requires effectType in EFFECT_RUNTIME context.');
    }
    const runtimeContext: EffectRuntimeErrorContextForReason<typeof EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED> = {
      reason,
      ...context,
    };
    return new EffectRuntimeError('EFFECT_RUNTIME', message, runtimeContext);
  }

  if (reason === EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH) {
    if (!isChoiceProbeAuthorityMismatchContext(context)) {
      throw new TypeError('choiceProbeAuthorityMismatch requires effectType in EFFECT_RUNTIME context.');
    }
    const runtimeContext: EffectRuntimeErrorContextForReason<typeof EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH> = {
      reason,
      ...context,
    };
    return new EffectRuntimeError('EFFECT_RUNTIME', message, runtimeContext);
  }

  const runtimeContext: EffectRuntimeErrorContextForReason<Exclude<
    EffectRuntimeReason,
    EffectRuntimeReasonsRequiringContext
  >> = {
    reason,
    ...(context ?? {}),
  };
  return new EffectRuntimeError('EFFECT_RUNTIME', message, runtimeContext);
}

export function isEffectRuntimeError(error: unknown): error is EffectRuntimeError {
  return error instanceof EffectRuntimeError;
}

export function isEffectRuntimeReason<R extends EffectRuntimeReason>(
  error: unknown,
  reason: R,
): error is EffectRuntimeError<'EFFECT_RUNTIME'> & Readonly<{
  readonly context: EffectRuntimeErrorContextForReason<R>;
}> {
  return isEffectErrorCode(error, 'EFFECT_RUNTIME') && error.context?.reason === reason;
}

export function isEffectErrorCode<C extends EffectErrorCode>(
  error: unknown,
  code: C,
): error is EffectRuntimeError<C> {
  return isEffectRuntimeError(error) && error.code === code;
}
