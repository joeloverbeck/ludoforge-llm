/**
 * Type-safe factory for constructing EffectAST nodes with `_k` tags.
 *
 * Derives the numeric `_k` tag from the effect kind string automatically,
 * eliminating manual tag assignment at construction sites.
 */

import type { EffectKind, EffectKindMap, WithKindTag } from './types-ast.js';
import { EFFECT_KIND_TAG } from './types-ast.js';

/** Extract the inner payload type for effect kind K. */
type EffectPayloadOf<K extends EffectKind> = EffectKindMap[K] extends { readonly [P in K]: infer V } ? V : never;

export function makeEffect<K extends EffectKind>(
  kind: K,
  payload: EffectPayloadOf<K>,
): WithKindTag<K> {
  return { _k: EFFECT_KIND_TAG[kind], [kind]: payload } as unknown as WithKindTag<K>;
}
