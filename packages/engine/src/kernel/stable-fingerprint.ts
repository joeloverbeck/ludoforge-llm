const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const FNV_MOD_64 = 0xffffffffffffffffn;

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

const fnv1a64 = (input: string): bigint => {
  let hash = FNV_OFFSET_BASIS_64;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * FNV_PRIME_64) & FNV_MOD_64;
  }
  return hash;
};

export const stableFingerprintHex = (namespace: string, value: unknown): string =>
  fnv1a64(`${namespace}\0${canonicalizeFingerprintValue(value)}`).toString(16).padStart(16, '0');
