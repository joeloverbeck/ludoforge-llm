import { fnv1a64, fnv1a64FromState, updateFnv1a64State } from './fnv1a64.js';

export const canonicalizeFingerprintValue = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'bigint') {
    return JSON.stringify(value.toString());
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeFingerprintValue(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalizeFingerprintValue(entryValue)}`);
  return `{${entries.join(',')}}`;
};

export const stableFingerprintHex = (namespace: string, value: unknown): string =>
  fnv1a64(`${namespace}\0${canonicalizeFingerprintValue(value)}`).toString(16).padStart(16, '0');

export const createStableFingerprintHasher = (namespace: string): (value: unknown) => string => {
  const namespaceState = updateFnv1a64State(`${namespace}\0`);
  return (value: unknown): string =>
    fnv1a64FromState(canonicalizeFingerprintValue(value), namespaceState).toString(16).padStart(16, '0');
};
