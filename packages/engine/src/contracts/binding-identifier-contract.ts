import { rankByEditDistance } from './edit-distance-contract.js';

const DEFAULT_ALTERNATIVE_LIMIT = 5;

export const CANONICAL_BINDING_IDENTIFIER_PATTERN = /^\$.+/;
export const CANONICAL_BINDING_IDENTIFIER_MESSAGE = 'Binding identifiers must use canonical "$name" form.';

export const isCanonicalBindingIdentifier = (value: string): boolean => CANONICAL_BINDING_IDENTIFIER_PATTERN.test(value);

export const hasBindingIdentifier = (name: string, scope: ReadonlySet<string> | readonly string[]): boolean => {
  for (const candidate of scope) {
    if (candidate === name) {
      return true;
    }
  }
  return false;
};

export const rankBindingIdentifierAlternatives = (
  name: string,
  inScope: readonly string[],
  limit = DEFAULT_ALTERNATIVE_LIMIT,
): readonly string[] =>
  rankByEditDistance(name, [...new Set(inScope)])
    .map((entry) => entry.candidate)
    .slice(0, limit);
