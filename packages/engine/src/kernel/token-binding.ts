import { isRuntimeToken } from './token-shape.js';
import type { Token } from './types.js';

export interface ResolvedRuntimeTokenBinding {
  readonly tokenId: string;
  readonly tokenFromBinding: Token | null;
}

export function resolveRuntimeTokenBindingValue(value: unknown): ResolvedRuntimeTokenBinding | null {
  if (typeof value === 'string') {
    return { tokenId: value, tokenFromBinding: null };
  }
  if (isRuntimeToken(value)) {
    return { tokenId: value.id, tokenFromBinding: value };
  }
  return null;
}
