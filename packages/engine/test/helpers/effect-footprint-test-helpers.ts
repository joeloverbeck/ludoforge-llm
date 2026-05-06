import type { EffectAST } from '../../src/kernel/types.js';

export function stripEffectFootprints<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripEffectFootprints) as T;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'footprint') {
      continue;
    }
    result[key] = stripEffectFootprints(entry);
  }
  return result as T;
}

export function stripCompiledEffectsFootprints(effects: readonly EffectAST[] | undefined): readonly EffectAST[] | undefined {
  return stripEffectFootprints(effects);
}
