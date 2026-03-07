import type { Token } from './types.js';

export function hasTokenRuntimeShapeKeys(value: unknown): value is {
  readonly id: unknown;
  readonly type: unknown;
  readonly props: unknown;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'type' in value &&
    'props' in value &&
    typeof (value as { readonly props: unknown }).props === 'object' &&
    (value as { readonly props: unknown }).props !== null &&
    !Array.isArray((value as { readonly props: unknown }).props)
  );
}

export function isRuntimeToken(value: unknown): value is Token {
  return hasTokenRuntimeShapeKeys(value)
    && typeof (value as { readonly id: unknown }).id === 'string'
    && typeof (value as { readonly type: unknown }).type === 'string';
}
