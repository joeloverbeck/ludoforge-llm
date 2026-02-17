import type { ConditionAST } from './types.js';

export type TurnFlowErrorCode = 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED';

export type TurnFlowErrorContext = Readonly<Record<string, unknown>>;

function formatMessage(message: string, context?: TurnFlowErrorContext): string {
  if (context === undefined) {
    return message;
  }
  return `${message} context=${JSON.stringify(context)}`;
}

export class TurnFlowRuntimeError extends Error {
  readonly code: TurnFlowErrorCode;
  readonly context?: TurnFlowErrorContext;

  constructor(code: TurnFlowErrorCode, message: string, context?: TurnFlowErrorContext, cause?: unknown) {
    super(formatMessage(message, context));
    this.name = 'TurnFlowRuntimeError';
    this.code = code;
    if (context !== undefined) {
      this.context = context;
    }
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export interface FreeOperationZoneFilterErrorInput {
  readonly surface: 'turnFlowEligibility' | 'legalChoices';
  readonly actionId: string;
  readonly moveParams: Readonly<Record<string, unknown>>;
  readonly zoneFilter: ConditionAST;
  readonly candidateZone?: string;
  readonly candidateZones?: readonly string[];
  readonly cause: unknown;
}

export function freeOperationZoneFilterEvaluationError(
  input: FreeOperationZoneFilterErrorInput,
): TurnFlowRuntimeError {
  const { cause } = input;
  const causeError = cause instanceof Error ? cause : undefined;

  return new TurnFlowRuntimeError(
    'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED',
    `free-operation zoneFilter evaluation failed on ${input.surface}`,
    {
      surface: input.surface,
      actionId: input.actionId,
      moveParams: input.moveParams,
      zoneFilter: input.zoneFilter,
      ...(input.candidateZones === undefined ? {} : { candidateZones: input.candidateZones }),
      ...(input.candidateZone === undefined ? {} : { candidateZone: input.candidateZone }),
      ...(causeError === undefined
        ? { causeType: typeof cause }
        : {
            causeName: causeError.name,
            causeMessage: causeError.message,
            ...(('code' in causeError && typeof causeError.code === 'string') ? { causeCode: causeError.code } : {}),
          }),
    },
    cause,
  );
}

export function isTurnFlowRuntimeError(error: unknown): error is TurnFlowRuntimeError {
  return error instanceof TurnFlowRuntimeError;
}

export function isTurnFlowErrorCode<C extends TurnFlowErrorCode>(
  error: unknown,
  code: C,
): error is TurnFlowRuntimeError & { readonly code: C } {
  return isTurnFlowRuntimeError(error) && error.code === code;
}
