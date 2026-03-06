/**
 * Suppression rules for tooltip generation.
 * Determines whether variable/binding names or effect types should be
 * hidden from tooltip output.
 */

/**
 * Built-in suffix patterns that indicate telemetry/tracking variables.
 * These are always suppressed regardless of VerbalizationDef.
 */
const BUILTIN_SUFFIX_PATTERNS = ['Count', 'Tracker'] as const;

/**
 * Check whether a variable/binding name should be suppressed from tooltip output.
 *
 * Suppression rules (checked in order):
 * 1. Names starting with `__` (internal convention)
 * 2. Names ending with `Count` or `Tracker` (telemetry convention)
 * 3. Names matching explicit suppress patterns from VerbalizationDef
 *
 * Patterns use simple glob-style matching:
 * - `*` at the start matches any prefix
 * - `*` at the end matches any suffix
 * - `*` at both ends matches substring containment
 * - No `*` requires exact match
 *
 * @param name - The variable or binding name to check
 * @param patterns - Explicit suppress patterns from VerbalizationDef.suppressPatterns
 */
export const isSuppressed = (
  name: string,
  patterns: readonly string[],
): boolean => {
  // Convention: double-underscore prefix
  if (name.startsWith('__')) return true;

  // Convention: telemetry suffixes
  for (const suffix of BUILTIN_SUFFIX_PATTERNS) {
    if (name.endsWith(suffix)) return true;
  }

  // Explicit patterns
  return patterns.some((pattern) => matchGlob(pattern, name));
};

/**
 * Simple glob-style pattern matching supporting `*` as prefix/suffix wildcard.
 */
const matchGlob = (pattern: string, value: string): boolean => {
  const startsWithStar = pattern.startsWith('*');
  const endsWithStar = pattern.endsWith('*');

  if (startsWithStar && endsWithStar) {
    // *foo* → substring match
    const inner = pattern.slice(1, -1);
    return inner.length === 0 || value.includes(inner);
  }
  if (startsWithStar) {
    // *foo → suffix match
    const suffix = pattern.slice(1);
    return value.endsWith(suffix);
  }
  if (endsWithStar) {
    // foo* → prefix match
    const prefix = pattern.slice(0, -1);
    return value.startsWith(prefix);
  }
  // exact match
  return value === pattern;
};

/**
 * EffectAST property keys that represent internal scaffolding or turn machinery.
 * These effects should be suppressed from tooltip output because they are
 * implementation details, not user-facing game actions.
 *
 * Scaffolding: `let`, `bindValue` — zone construction, intermediate bindings
 * Internal computation: `evaluateSubset` — bot AI subset scoring
 * Turn machinery: `setActivePlayer`, `gotoPhaseExact`, `advancePhase`, `pushInterruptPhase`, `popInterruptPhase`
 */
const SCAFFOLDING_EFFECT_KEYS: ReadonlySet<string> = new Set([
  // Zone construction scaffolding
  'let',
  'bindValue',
  // Internal computation
  'evaluateSubset',
  // Turn machinery
  'setActivePlayer',
  'gotoPhaseExact',
  'advancePhase',
  'pushInterruptPhase',
  'popInterruptPhase',
]);

/**
 * Check whether an EffectAST property key represents internal scaffolding
 * or turn machinery that should be suppressed from tooltip output.
 *
 * @param effectKey - The EffectAST discriminant property key (e.g. 'let', 'moveToken', 'advancePhase')
 */
export const isScaffoldingEffect = (effectKey: string): boolean =>
  SCAFFOLDING_EFFECT_KEYS.has(effectKey);
