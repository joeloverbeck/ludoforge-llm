# ENGINEARCH-073: Add unit tests for hygienic binding template preservation in macro expansion

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler unit tests
**Deps**: none

## Problem

`sanitizeBindingStemPreservingTemplates` in `expand-effect-macros.ts` preserves well-formed non-nested `{...}` runtime template segments while sanitizing other special characters in binding stems. Coverage existed in broad macro-hygiene tests, but there was no focused unit lock on sanitizer edge cases. If these regress, failures can surface later as binding mismatches instead of pinpointed sanitizer assertions.

Edge cases with no direct coverage include: nested braces (`{foo{bar}}`), adjacent templates (`{$a}{$b}`), templates mixed with special characters (`prefix-{$zone}:suffix`), empty stems, and stems with no templates.

## Assumption Reassessment (2026-02-26)

1. `sanitizeBindingStemPreservingTemplates` was added to fix a bug where `sanitizeForBindingNamespace` destroyed `{$var}` templates in macro-hygienized binding names.
2. The function is used only in `makeHygienicBindingName` for the stem portion.
3. Macro hygiene is already covered by unit/integration/property tests (`packages/engine/test/unit/expand-effect-macros.test.ts`, `packages/engine/test/unit/property/macro-hygiene.property.test.ts`, and FITL integration/e2e tests), but there is no focused unit coverage for sanitizer-specific edge cases.
4. Existing tests verify hygienic prefixes and reference rewrites, but do not explicitly lock down edge-case stem sanitization patterns such as adjacent templates, empty stems, and nested braces.

## Architecture Check

1. Exporting private helpers only for tests would weaken module boundaries. Tests should target behavior through `expandEffectMacros` outputs (the public entrypoint used by compiler flows).
2. These are compiler internals — no game-specific branching involved.
3. No backwards-compatibility concerns.

## What to Change

### 1. Do not export sanitizer internals

Keep `sanitizeBindingStemPreservingTemplates` and `makeHygienicBindingName` module-private. Add coverage by asserting the resulting rewritten binder names produced by `expandEffectMacros`.

### 2. Unit tests covering edge cases

Add focused tests in the existing macro-expansion unit suite to validate hygienized binder stems for:
- Simple template: `$hopLocs_{$zone}` preserves `{$zone}`
- Adjacent templates: `$foo{$a}{$b}` preserves both template groups
- No-template baseline: `$hop-locs@zone:foo` sanitizes to underscores
- Mixed template + specials: `$hop-locs@{$zone}:suffix` preserves template and sanitizes outside characters
- Nested braces fallback: `$foo{bar{baz}}` sanitizes unsupported nested-brace form into safe stem characters

## Files to Touch

- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify — add focused hygiene edge-case tests)

## Out of Scope

- Refactoring macro expansion architecture beyond tests
- Other macro expansion test coverage beyond hygiene

## Acceptance Criteria

### Tests That Must Pass

1. Simple template preservation: `{$zone}` survives in hygienized name
2. Adjacent templates: `{$a}{$b}` both preserved
3. Mixed special chars + templates: special chars sanitized, templates intact
4. No-template baseline: special characters sanitize to `_`
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Well-formed non-nested `{...}` groups in binding stems are preserved by sanitization.
2. Characters outside preserved template groups are sanitized to `[A-Za-z0-9_]`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-effect-macros.test.ts` — focused macro-hygiene stem sanitization edge-case tests

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/expand-effect-macros.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Reassessed and corrected ticket assumptions/scope to align with current repository reality.
  - Added focused hygiene edge-case unit tests in `packages/engine/test/unit/expand-effect-macros.test.ts` via public `expandEffectMacros` behavior (no private helper exports).
- Deviations from original plan:
  - Did not add a new dedicated `.../unit/cnl/...` test file.
  - Did not export `makeHygienicBindingName`; kept sanitizer internals private to preserve module boundaries.
  - Clarified nested-brace behavior to match current sanitizer contract (`$foo{bar{baz}}` -> suffix `_foo_bar{baz}_`).
- Verification:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/expand-effect-macros.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (297 passed, 0 failed).
