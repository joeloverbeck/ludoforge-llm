import type { StackingViolation } from './stacking.js';
import type { EffectRuntimeReason } from './runtime-reasons.js';
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

export type EffectRuntimeContextByReason = Readonly<{
  readonly [R in Exclude<EffectRuntimeReason, 'turnFlowRuntimeValidationFailed'>]: Readonly<Record<string, unknown>>;
}> & Readonly<{
  readonly turnFlowRuntimeValidationFailed: TurnFlowRuntimeValidationFailedContext;
}>;

export type EffectRuntimeContext<R extends EffectRuntimeReason = EffectRuntimeReason> =
  EffectRuntimeContextByReason[R];

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

export function effectRuntimeError<R extends EffectRuntimeReason>(
  reason: R,
  message: string,
  context?: EffectRuntimeContext<R>,
): EffectRuntimeError<'EFFECT_RUNTIME'> {
  const runtimeContext = {
    reason,
    ...(context === undefined ? {} : context),
  } as EffectRuntimeErrorContextForReason<R>;
  return new EffectRuntimeError('EFFECT_RUNTIME', message, runtimeContext as EffectErrorContext<'EFFECT_RUNTIME'>);
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
