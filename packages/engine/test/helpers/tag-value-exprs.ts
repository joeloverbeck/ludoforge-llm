/**
 * Test-only utility: recursively walks any object tree and adds `_t` type-tag
 * discriminants to ValueExpr objects that lack them.
 *
 * Production code never needs this — the compiler assigns `_t` during
 * compilation. This exists solely for test fixtures that construct GameDef
 * objects manually via `as unknown as GameDef`.
 */
import { VALUE_EXPR_TAG } from '../../src/kernel/types.js';

function classifyValueExprTag(obj: Record<string, unknown>): number | null {
  if ('scalarArray' in obj) return VALUE_EXPR_TAG.SCALAR_ARRAY;
  if ('ref' in obj) return VALUE_EXPR_TAG.REF;
  if ('concat' in obj) return VALUE_EXPR_TAG.CONCAT;
  if ('aggregate' in obj) return VALUE_EXPR_TAG.AGGREGATE;
  if ('op' in obj && 'left' in obj && 'right' in obj) return VALUE_EXPR_TAG.OP;
  // ValueExpr `if` has { if: { when, then, else } }
  if ('if' in obj && isRecord(obj.if) && 'when' in obj.if && 'then' in obj.if && 'else' in obj.if) return VALUE_EXPR_TAG.IF;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Known keys in GameDef/EffectAST/ConditionAST that hold ValueExpr values.
 * We tag objects found under these keys. This avoids false-positive tagging
 * of EffectAST `{ if: ... }` or OptionsQuery `{ op: ... }` nodes.
 */
const VALUE_EXPR_KEYS = new Set([
  'left', 'right', 'value', 'delta', 'item', 'set',
  'min', 'max', 'step', 'scoreExpr', 'valueExpr',
  'initial', 'next', 'state', 'marker',
]);

const ZONE_REF_KEYS = new Set(['from', 'to', 'zone', 'space']);

function tagDeep(obj: unknown, isValueExprContext: boolean): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => tagDeep(item, isValueExprContext));
  }

  const rec = obj as Record<string, unknown>;

  // If this object looks like a ValueExpr and is in a ValueExpr context, tag it
  if (isValueExprContext && !('_t' in rec)) {
    const tag = classifyValueExprTag(rec);
    if (tag !== null) {
      const tagged: Record<string, unknown> = { _t: tag };
      for (const [key, val] of Object.entries(rec)) {
        // Recurse into ValueExpr sub-fields
        const childIsValueExpr = VALUE_EXPR_KEYS.has(key) || key === 'concat';
        if (key === 'if' && tag === VALUE_EXPR_TAG.IF) {
          // ValueExpr if: recurse into { when, then, else }
          tagged[key] = tagDeep(val, false);
          const ifObj = tagged[key] as Record<string, unknown>;
          if (isRecord(ifObj)) {
            if ('then' in ifObj) ifObj.then = tagDeep(ifObj.then, true);
            if ('else' in ifObj) ifObj.else = tagDeep(ifObj.else, true);
          }
        } else {
          tagged[key] = tagDeep(val, childIsValueExpr);
        }
      }
      return tagged;
    }
  }

  // Generic recursive walk
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(rec)) {
    const childIsValueExpr = VALUE_EXPR_KEYS.has(key);
    const childIsZoneRef = ZONE_REF_KEYS.has(key);

    if (childIsValueExpr) {
      result[key] = tagDeep(val, true);
    } else if (childIsZoneRef && isRecord(val) && 'zoneExpr' in val) {
      // ZoneRef { zoneExpr: ValueExpr }
      result[key] = { ...val, zoneExpr: tagDeep(val.zoneExpr, true) };
    } else if (key === 'alwaysInclude' && Array.isArray(val)) {
      result[key] = val.map((item) => tagDeep(item, true));
    } else {
      result[key] = tagDeep(val, false);
    }
  }
  return result;
}

/**
 * Recursively adds `_t` tags to all untagged ValueExpr objects in a GameDef.
 * Returns a new object (does not mutate the input).
 *
 * Usage in tests:
 * ```ts
 * const def = tagValueExprs({ ...myGameDef }) as GameDef;
 * ```
 */
export function tagValueExprs<T>(obj: T): T {
  return tagDeep(obj, false) as T;
}
