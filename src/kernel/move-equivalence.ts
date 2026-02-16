import type { Move } from './types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (!isRecord(value)) {
    return value;
  }

  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    ordered[key] = canonicalize(value[key]);
  }
  return ordered;
};

export const canonicalMoveParamsKey = (params: Move['params']): string => JSON.stringify(canonicalize(params));

export const areMoveParamsEquivalent = (left: Move['params'], right: Move['params']): boolean =>
  canonicalMoveParamsKey(left) === canonicalMoveParamsKey(right);

export const areMovesEquivalent = (
  left: Pick<Move, 'actionId' | 'params'>,
  right: Pick<Move, 'actionId' | 'params'>,
): boolean => String(left.actionId) === String(right.actionId) && areMoveParamsEquivalent(left.params, right.params);
