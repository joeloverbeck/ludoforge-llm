const TRUSTED_MACRO_ORIGIN = Symbol('trustedMacroOrigin');

export function markTrustedMacroOriginByExpansion<TValue extends Record<string, unknown>>(node: TValue): TValue {
  const mutable = node as Record<PropertyKey, unknown>;
  mutable[TRUSTED_MACRO_ORIGIN] = true;
  return node;
}

export function isTrustedMacroOriginCarrier(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[TRUSTED_MACRO_ORIGIN] === true;
}

export function copyTrustedMacroOriginMarker(
  source: unknown,
  target: Record<PropertyKey, unknown>,
): void {
  if (isTrustedMacroOriginCarrier(source)) {
    target[TRUSTED_MACRO_ORIGIN] = true;
  }
}
