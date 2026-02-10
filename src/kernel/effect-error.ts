export type EffectErrorCode =
  | 'EFFECT_RUNTIME'
  | 'EFFECT_NOT_IMPLEMENTED'
  | 'EFFECT_BUDGET_EXCEEDED'
  | 'SPATIAL_NOT_IMPLEMENTED'
  | 'SPATIAL_DESTINATION_REQUIRED'
  | 'SPATIAL_DESTINATION_NOT_ADJACENT';

export type EffectErrorContext = Readonly<Record<string, unknown>>;

function formatMessage(message: string, context?: EffectErrorContext): string {
  if (context === undefined) {
    return message;
  }

  return `${message} context=${JSON.stringify(context)}`;
}

export class EffectRuntimeError extends Error {
  readonly code: EffectErrorCode;
  readonly context?: EffectErrorContext;

  constructor(code: EffectErrorCode, message: string, context?: EffectErrorContext) {
    super(formatMessage(message, context));
    this.name = 'EffectRuntimeError';
    this.code = code;
    if (context !== undefined) {
      this.context = context;
    }
  }
}

export class EffectBudgetExceededError extends EffectRuntimeError {
  constructor(message: string, context?: EffectErrorContext) {
    super('EFFECT_BUDGET_EXCEEDED', message, context);
    this.name = 'EffectBudgetExceededError';
  }
}

export class SpatialNotImplementedError extends EffectRuntimeError {
  constructor(message: string, context?: EffectErrorContext) {
    super('SPATIAL_NOT_IMPLEMENTED', message, context);
    this.name = 'SpatialNotImplementedError';
  }
}

export function effectNotImplementedError(effectType: string, context?: EffectErrorContext): EffectRuntimeError {
  return new EffectRuntimeError('EFFECT_NOT_IMPLEMENTED', `Effect handler is not implemented: ${effectType}`, {
    effectType,
    ...context,
  });
}

export function isEffectRuntimeError(error: unknown): error is EffectRuntimeError {
  return error instanceof EffectRuntimeError;
}

export function isEffectErrorCode<C extends EffectErrorCode>(
  error: unknown,
  code: C,
): error is EffectRuntimeError & { readonly code: C } {
  return isEffectRuntimeError(error) && error.code === code;
}
