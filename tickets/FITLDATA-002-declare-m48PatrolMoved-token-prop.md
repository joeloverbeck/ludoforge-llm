# FITLDATA-002: Declare `m48PatrolMoved` token prop in piece catalog

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — data-only
**Deps**: None

## Problem

The M-48 Patton shaded capability macro (`cap-patrol-m48-shaded-moved-cube-penalty`) uses a token prop `m48PatrolMoved` to flag cubes that moved during Patrol. This prop is used in `setTokenProp` effects and in token filter conditions (`{ prop: m48PatrolMoved, eq: true }`). However, `m48PatrolMoved` is not declared in the FITL piece catalog (`40-content-data-assets.md`), which means:

1. **No compile-time typo protection** — a misspelling like `m48PatrolMove` would silently match no tokens
2. **Not discoverable** — tooling that enumerates declared token properties won't list it
3. **Fragile under compiler tightening** — if `tokenTraitVocabulary` validation is ever made strict for token filter props, these filters would break

## Assumption Reassessment (2026-03-01)

1. `m48PatrolMoved` appears in `20-macros.md` (filter and setTokenProp) and `30-rules-actions.md` (setTokenProp during movement) — confirmed by grep.
2. `40-content-data-assets.md` contains the piece catalog and token trait vocabulary — confirmed; `m48PatrolMoved` is absent.
3. The kernel's `applySetTokenProp` handles arbitrary prop names without validation — confirmed in `effects-token.ts`. The runtime is not blocking.
4. The compiler's `tokenTraitVocabulary` is currently only used for `tokenTraitValue` param type validation in macro params, not for general token filter prop validation — so no compile error today.

## Architecture Check

1. **Cleaner than alternative**: Declaring the prop in the piece catalog is the correct source-of-truth location. The alternative (leaving it undeclared and relying on runtime flexibility) works today but creates silent failure modes for typos and blocks future compiler hardening.
2. **Game-specific data stays in GameSpecDoc**: The prop declaration goes in the FITL data file (`40-content-data-assets.md`), not in engine code. No game-specific logic enters the kernel or compiler.
3. **No backwards-compatibility shims**: This is additive — declaring a previously-undeclared prop has no breaking effects.

## What to Change

### 1. Add `m48PatrolMoved` to the piece catalog

In `data/games/fire-in-the-lake/40-content-data-assets.md`, add `m48PatrolMoved` as a boolean runtime prop on cube piece types (US and ARVN troops and police). The prop should have values `[true, false]` with a default of `false`.

The exact location depends on how the piece catalog declares runtime props — follow the existing pattern for props like `activity` on guerrillas.

## Files to Touch

- `data/games/fire-in-the-lake/40-content-data-assets.md` (modify) — declare `m48PatrolMoved` in piece catalog

## Out of Scope

- Adding compiler-level strict validation for all token filter props against the trait vocabulary (that would be a separate engine-level ticket)
- Other undeclared token props in FITL data (audit separately if needed)

## Acceptance Criteria

### Tests That Must Pass

1. FITL production spec compiles without new diagnostics: `compileProductionSpec()` returns 0 errors
2. Existing M48 Patton integration tests continue to pass
3. Existing suite: `pnpm turbo test`

### Invariants

1. `m48PatrolMoved` appears in the compiled `tokenTraitVocabulary` of the GameDef
2. No game-specific logic added to engine code

## Test Plan

### New/Modified Tests

1. No new test files needed — existing integration tests (`fitl-capabilities-train-patrol-rally.test.ts`) already exercise the `m48PatrolMoved` prop at runtime

### Commands

1. `pnpm turbo build && pnpm turbo test`
2. `node --test packages/engine/dist/test/integration/fitl-capabilities-train-patrol-rally.test.js`
