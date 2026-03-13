import type { ReadContext } from './eval-context.js';
import type { FreeOperationSequenceKeyExpr } from './types.js';

export const resolveFreeOperationSequenceKey = (
  key: FreeOperationSequenceKeyExpr,
  ctx: ReadContext,
): string | undefined => {
  if (typeof key === 'string') {
    return key;
  }
  if (key.ref === 'binding') {
    const value = ctx.bindings[key.name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
  if (key.ref === 'grantContext') {
    const value = ctx.freeOperationOverlay?.grantContext?.[key.key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
  return undefined;
};
