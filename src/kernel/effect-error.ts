import type { StackingViolation } from './stacking.js';
import type { EffectAST } from './types.js';

export type EffectErrorCode =
  | 'EFFECT_RUNTIME'
  | 'EFFECT_NOT_IMPLEMENTED'
  | 'EFFECT_BUDGET_EXCEEDED'
  | 'SPATIAL_NOT_IMPLEMENTED'
  | 'SPATIAL_DESTINATION_REQUIRED'
  | 'SPATIAL_DESTINATION_NOT_ADJACENT'
  | 'STACKING_VIOLATION';

export type EffectRuntimeReason =
  | 'effectBudgetConfigInvalid'
  | 'subsetRuntimeValidationFailed'
  | 'choiceRuntimeValidationFailed'
  | 'controlFlowRuntimeValidationFailed'
  | 'resourceRuntimeValidationFailed'
  | 'revealRuntimeValidationFailed'
  | 'tokenRuntimeValidationFailed'
  | 'turnFlowRuntimeValidationFailed'
  | 'variableRuntimeValidationFailed';

export interface EffectErrorContextByCode {
  readonly EFFECT_RUNTIME: Readonly<{
    readonly reason: EffectRuntimeReason;
  } & Record<string, unknown>>;
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

export const effectRuntimeError = (
  reason: EffectRuntimeReason,
  message: string,
  context?: Readonly<Record<string, unknown>>,
): EffectRuntimeError<'EFFECT_RUNTIME'> =>
  new EffectRuntimeError('EFFECT_RUNTIME', message, {
    reason,
    ...(context === undefined ? {} : context),
  });

export function isEffectRuntimeError(error: unknown): error is EffectRuntimeError {
  return error instanceof EffectRuntimeError;
}

export function isEffectErrorCode<C extends EffectErrorCode>(
  error: unknown,
  code: C,
): error is EffectRuntimeError<C> {
  return isEffectRuntimeError(error) && error.code === code;
}
