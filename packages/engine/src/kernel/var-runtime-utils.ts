import type { IntVariableDef } from './types.js';

export const clampIntVarValue = (
  value: number,
  variableDef: IntVariableDef,
): number => Math.max(variableDef.min, Math.min(variableDef.max, value));
