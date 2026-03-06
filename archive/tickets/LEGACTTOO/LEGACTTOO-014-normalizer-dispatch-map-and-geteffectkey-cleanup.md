# LEGACTTOO-014: Normalizer — Dispatch Map & getEffectKey Cleanup

**Status**: REJECTED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — rejected after reassessment
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-004-core-normalizer-variable-token-marker-rules.md, tickets/LEGACTTOO-005-compound-normalizer-control-flow-macros-stages.md

## Problem

The normalizer's `normalizeEffect` entry point uses an 18-line if-chain for dispatch and relies on `Object.keys(effect)[0]` (via `getEffectKey`) for the scaffolding check and unhandled fallback. As LEGACTTOO-005 adds ~10 more compound handlers, this if-chain becomes harder to maintain and review.

The `Object.keys(effect)[0]` pattern works because `EffectAST` members have exactly one key (enforced by `.strict()` schemas), but this is an implicit contract — nothing in the type system guarantees single-key objects.

## Rejection Rationale (2026-03-06)

After reassessing the actual code against the ticket's proposed changes:

### The if-chain is superior to a dispatch map

1. **Type narrowing**: Each `if ('addVar' in effect)` narrows `effect` to include `addVar`, so TypeScript accepts typed handler calls (`normalizeAddVar(effect, ctx, astPath)`) without any casts. A dispatch map (`Record<string, handler>`) would require `as EffectOf<'addVar'>` casts on every handler call — a regression in type safety.

2. **Idiomatic TypeScript**: The if-chain is the standard pattern for discriminated union dispatch in TypeScript. It's what developers expect and what tooling (IDE go-to-definition, refactoring) supports best.

3. **Comparable maintenance burden**: Adding a handler is one function + one if-branch (current) vs one function + one map entry (proposed). The effort is identical; the proposed change doesn't reduce it.

4. **`getEffectKey` is fine**: A named 2-line function used in 2 places. It communicates intent better than inlining `Object.keys(effect)[0]` at both call sites.

### No code changes made

The current architecture in `tooltip-normalizer.ts` (lines 363-401) is clean, type-safe, and idiomatic. All 56 existing tests pass unchanged.

## Outcome

**Rejected** — the proposed dispatch map refactor would strictly worsen type safety (requiring `as` casts) without meaningful maintenance benefit. The existing if-chain preserves TypeScript's discriminated union narrowing, which is the architecturally correct approach. No code was changed.
