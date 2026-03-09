import type { EvalContext } from './eval-context.js';
import { evalValue } from './eval-value.js';
import type {
  FreeOperationExecutionContext,
  FreeOperationExecutionContextScalar,
  ResolvedFreeOperationExecutionContext,
  ValueExpr,
} from './types.js';

const isScalar = (value: unknown): value is FreeOperationExecutionContextScalar =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

export const resolveFreeOperationExecutionContext = (
  executionContext: FreeOperationExecutionContext | undefined,
  ctx: EvalContext,
): ResolvedFreeOperationExecutionContext | undefined => {
  if (executionContext === undefined) {
    return undefined;
  }

  const resolvedEntries = Object.entries(executionContext).map(([key, value]) => {
    if (Array.isArray(value)) {
      return [key, [...value]] as const;
    }
    if (isScalar(value)) {
      return [key, value] as const;
    }
    return [key, evalValue(value as ValueExpr, ctx)] as const;
  });

  return Object.fromEntries(resolvedEntries);
};
