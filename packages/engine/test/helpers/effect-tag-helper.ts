/**
 * Test helper: wraps raw EffectAST-shaped literals with `_k` tags.
 *
 * Use `eff({ setVar: { ... } })` instead of `{ setVar: { ... } }` in test
 * fixtures when constructing EffectAST literals.  This avoids the need to
 * manually specify `_k` in every test fixture while preserving type safety.
 *
 * For arrays of effects, use `effs([...])`.
 */

import type { EffectAST, EffectKind, EffectKindMap } from '../../src/kernel/types-ast.js';
import { tagEffectAsts } from '../../src/kernel/tag-effect-asts.js';

/** An EffectAST literal shape without the `_k` tag. */
type RawEffectAST = { [K in EffectKind]: EffectKindMap[K] }[EffectKind];

/** Tag a single raw EffectAST literal, returning a properly typed EffectAST. */
export function eff(raw: RawEffectAST): EffectAST {
  return tagEffectAsts(raw) as unknown as EffectAST;
}

/** Tag an array of raw EffectAST literals. */
export function effs(raw: readonly RawEffectAST[]): readonly EffectAST[] {
  return raw.map(eff);
}
