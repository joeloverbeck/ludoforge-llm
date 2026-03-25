/**
 * Structural tagger that adds `_k` discriminant tags to EffectAST-shaped
 * objects.  Mirrors the pattern of `tag-value-exprs.ts` for `_t` tags.
 *
 * Use cases:
 * - Bulk-tagging test fixtures that construct EffectAST literals by hand.
 * - Validation: verify compiler-assigned `_k` matches structural inference.
 *
 * Not needed at runtime boundaries — `_k` is serialized in GameDef JSON.
 */

import type { EffectKind } from './types-ast.js';
import { EFFECT_KIND_TAG } from './types-ast.js';

const EFFECT_KIND_KEYS = new Set<string>(Object.keys(EFFECT_KIND_TAG));

/** Property names that hold nested EffectAST arrays inside effect payloads. */
const NESTED_EFFECT_PROPS = new Set<string>([
  'then', 'else', 'effects', 'in', 'compute',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Detect the effect kind key of an EffectAST-shaped object.
 * Returns the kind string if found, or null if the object is not effect-shaped.
 */
function classifyEffectKind(obj: Record<string, unknown>): EffectKind | null {
  for (const key in obj) {
    if (key === '_k') continue;
    if (EFFECT_KIND_KEYS.has(key)) {
      return key as EffectKind;
    }
  }
  return null;
}

/**
 * Recursively walk a structure and add `_k` tags to EffectAST-shaped objects.
 * Returns a new object tree — never mutates the input.
 */
export function tagEffectAsts<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(tagEffectAsts) as unknown as T;
  }

  const rec = obj as Record<string, unknown>;
  const kind = classifyEffectKind(rec);

  if (kind === null) {
    // Not an effect — recursively walk values anyway (could contain nested effects)
    const result: Record<string, unknown> = {};
    for (const key in rec) {
      result[key] = tagEffectAsts(rec[key]);
    }
    return result as T;
  }

  const expectedTag = EFFECT_KIND_TAG[kind];

  const payload = rec[kind];
  const taggedPayload = isRecord(payload)
    ? tagEffectPayload(payload)
    : payload;

  const result: Record<string, unknown> = {
    _k: expectedTag,
    [kind]: taggedPayload,
  };

  // Preserve any other properties (shouldn't exist on well-formed effects,
  // but defensive for passthrough)
  for (const key in rec) {
    if (key === '_k' || key === kind) continue;
    result[key] = tagEffectAsts(rec[key]);
  }

  return result as T;
}

/**
 * Tag nested effect arrays inside an effect payload object.
 */
function tagEffectPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in payload) {
    if (NESTED_EFFECT_PROPS.has(key) && Array.isArray(payload[key])) {
      result[key] = (payload[key] as unknown[]).map(tagEffectAsts);
    } else if (key === 'groups' && Array.isArray(payload[key])) {
      // removeByPriority has groups array with nested objects (no effects inside groups)
      result[key] = payload[key];
    } else {
      result[key] = payload[key];
    }
  }
  return result;
}
