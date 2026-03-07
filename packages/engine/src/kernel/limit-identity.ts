import type { LimitDef } from './types-core.js';

export type LimitScope = LimitDef['scope'];

export interface ParsedLimitId {
  readonly actionId: string;
  readonly scope: LimitScope;
  readonly index: number;
}

const SEPARATOR = '::';
const VALID_SCOPES: ReadonlySet<string> = new Set<string>(['turn', 'phase', 'game']);

export const buildCanonicalLimitId = (
  actionId: string,
  limitIndex: number,
  scope: LimitScope,
): string => `${actionId}${SEPARATOR}${scope}${SEPARATOR}${limitIndex}`;

export const parseCanonicalLimitId = (id: string): ParsedLimitId | null => {
  const lastSep = id.lastIndexOf(SEPARATOR);
  if (lastSep < 0) return null;

  const indexStr = id.slice(lastSep + SEPARATOR.length);
  const rest = id.slice(0, lastSep);

  const secondSep = rest.lastIndexOf(SEPARATOR);
  if (secondSep < 0) return null;

  const scope = rest.slice(secondSep + SEPARATOR.length);
  const actionId = rest.slice(0, secondSep);

  if (actionId.length === 0) return null;
  if (!VALID_SCOPES.has(scope)) return null;

  const index = Number(indexStr);
  if (!Number.isInteger(index) || index < 0) return null;

  return { actionId, scope: scope as LimitScope, index };
};

export const isCanonicalLimitIdForAction = (
  id: string,
  actionId: string,
  limitIndex: number,
  scope: LimitScope,
): boolean => id === buildCanonicalLimitId(actionId, limitIndex, scope);
