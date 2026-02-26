# ENGINEARCH-073: Add unit tests for hygienic binding template preservation in macro expansion

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler unit tests
**Deps**: none

## Problem

`sanitizeBindingStemPreservingTemplates` in `expand-effect-macros.ts` preserves `{$var}` runtime templates while sanitizing other special characters in binding stems. This function is module-private and only tested indirectly through the FITL playbook golden E2E test. If it regresses, the failure would manifest as a cryptic runtime binding mismatch rather than a clear unit test failure pointing to the sanitizer.

Edge cases with no direct coverage include: nested braces (`{foo{bar}}`), adjacent templates (`{$a}{$b}`), templates mixed with special characters (`prefix-{$zone}:suffix`), empty stems, and stems with no templates.

## Assumption Reassessment (2026-02-26)

1. `sanitizeBindingStemPreservingTemplates` was added to fix a bug where `sanitizeForBindingNamespace` destroyed `{$var}` templates in macro-hygienized binding names.
2. The function is used only in `makeHygienicBindingName` for the stem portion.
3. No unit test file exists for `expand-effect-macros.ts` sanitization helpers.
4. The golden E2E test covers the happy path (sweep hop bindings with `{$zone}` templates) but not edge cases.

## Architecture Check

1. Unit testing a private function requires either exporting it for test access or testing through the public `makeHygienicBindingName` function. Testing through `makeHygienicBindingName` is cleaner since it tests the actual integration point.
2. These are compiler internals — no game-specific branching involved.
3. No backwards-compatibility concerns.

## What to Change

### 1. Export `makeHygienicBindingName` for testing (or use a test-accessible wrapper)

If the function is already accessible through compilation integration tests, write tests at that level. Otherwise, add a minimal export for test access.

### 2. Unit tests covering edge cases

Test `makeHygienicBindingName` with binding names containing:
- Simple template: `$hopLocs_{$zone}` → preserves `{$zone}`
- Multiple templates: `$foo_{$a}_{$b}` → preserves both
- No template (baseline): `$simpleVar` → sanitizes normally
- Special chars outside template: `$hop-locs@zone:foo` → replaces `-`, `@`, `:` with `_`
- Template with special chars outside: `$hop-locs@{$zone}:suffix` → preserves `{$zone}`, sanitizes rest

## Files to Touch

- `packages/engine/src/cnl/expand-effect-macros.ts` (modify — export for testing if needed)
- `packages/engine/test/unit/cnl/expand-effect-macros-hygiene.test.ts` (new)

## Out of Scope

- Refactoring the sanitization approach itself
- Other macro expansion test coverage beyond hygiene

## Acceptance Criteria

### Tests That Must Pass

1. Simple template preservation: `{$zone}` survives in hygienized name
2. Adjacent templates: `{$a}{$b}` both preserved
3. Mixed special chars + templates: special chars sanitized, templates intact
4. No-template baseline: standard sanitization behavior unchanged
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `{...}` groups in binding stems are never destroyed by sanitization
2. Characters outside `{...}` groups are sanitized to `[A-Za-z0-9_]` as before

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/expand-effect-macros-hygiene.test.ts` — Dedicated hygiene sanitization tests

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "hygien"`
2. `pnpm turbo build && pnpm -F @ludoforge/engine test`
