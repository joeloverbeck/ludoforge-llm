import { isNonEmptyString } from './validate-spec-shared.js';

export type MacroIdKind = 'condition' | 'effect';

export function isValidMacroId(value: unknown): value is string {
  return isNonEmptyString(value);
}

export function invalidMacroIdMessage(kind: MacroIdKind): string {
  return `${kind === 'condition' ? 'Condition' : 'Effect'} macro id must be a non-empty string.`;
}
