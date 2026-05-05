import { createHash } from 'node:crypto';

export function fingerprintPolicyIr(value: unknown): string {
  return createHash('sha256')
    .update('agent-policy-ir-v1')
    .update('\0')
    .update(canonicalizePolicyIr(value))
    .digest('hex');
}

function canonicalizePolicyIr(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizePolicyIr(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalizePolicyIr(entryValue)}`);
  return `{${entries.join(',')}}`;
}
