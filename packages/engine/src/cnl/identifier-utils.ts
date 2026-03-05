import { canonicalizeIdentifier } from '../contracts/index.js';

export function normalizeIdentifier(value: string): string {
  return canonicalizeIdentifier(value);
}
