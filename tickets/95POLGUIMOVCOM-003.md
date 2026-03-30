# 95POLGUIMOVCOM-003: Validate `completionGuidance` and `completionScoreTerms` in agent spec

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — cnl validate-agents
**Deps**: tickets/95POLGUIMOVCOM-002.md

## Problem

The agent validation layer (`validate-agents.ts`) does not recognize `completionScoreTerms` in the library section or `completionGuidance` / `use.completionScoreTerms` in profile definitions. Without validation, malformed YAML (missing weight, invalid fallback values, referencing nonexistent library entries) would pass through silently and fail at compilation or runtime.

## Assumption Reassessment (2026-03-30)

1. `validateAgents` validates library entries by iterating over named maps (`stateFeatures`, `candidateFeatures`, `candidateAggregates`, `pruningRules`, `scoreTerms`, `tieBreakers`). Confirmed — adding `completionScoreTerms` follows the same pattern.
2. Profile validation checks `use.pruningRules`, `use.scoreTerms`, `use.tieBreakers` arrays against library keys. Confirmed — `use.completionScoreTerms` follows the same cross-reference pattern.
3. `GameSpecScoreTermDef` is the shape for both `scoreTerms` and `completionScoreTerms` — same validation logic applies. Confirmed.
4. No existing validation for `completionGuidance` or `fallback` values. Confirmed.

## Architecture Check

1. Cleanest approach: reuse the existing `validateScoreTermDef` helper (or equivalent validation path) for `completionScoreTerms`. Add `completionGuidance` as a simple shape check (enabled: boolean, fallback: enum).
2. Engine agnosticism: validation checks structural correctness, not game-specific content. No game identifiers in validation logic.
3. No backwards-compatibility shims: validation only fires when the new fields are present.

## What to Change

### 1. `validate-agents.ts` — validate `completionScoreTerms` library entries

Iterate `library.completionScoreTerms` (if present) using the same validation path as `scoreTerms`:
- Each entry must have `weight` (required expression) and `value` (required expression)
- `when` is optional (expression)
- `unknownAs` is optional (number)
- `clamp` is optional (`{ min?: number; max?: number }`)

### 2. `validate-agents.ts` — validate `completionGuidance` in profiles

For each profile with `completionGuidance`:
- `enabled` must be boolean (if present)
- `fallback` must be `'random'` or `'first'` (if present)
- If `completionGuidance.enabled` is true, `use.completionScoreTerms` should be non-empty (warning, not error)

### 3. `validate-agents.ts` — validate `use.completionScoreTerms` cross-references

For each profile, validate that every entry in `use.completionScoreTerms` (if present) references an existing key in `library.completionScoreTerms`. Emit diagnostic error for missing references.

## Files to Touch

- `packages/engine/src/cnl/validate-agents.ts` (modify)

## Out of Scope

- Compilation of `completionScoreTerms` (ticket 006)
- Runtime evaluation (tickets 005, 007)
- Expression-level validation (handled by existing expression validator, shared with `scoreTerms`)
- `zoneTokenAgg` dynamic zone validation (ticket 004)

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: valid `completionScoreTerms` in library passes validation without diagnostics
2. New unit test: `completionScoreTerms` entry missing `weight` emits error diagnostic
3. New unit test: `completionScoreTerms` entry missing `value` emits error diagnostic
4. New unit test: `completionGuidance.fallback` with invalid value emits error diagnostic
5. New unit test: `use.completionScoreTerms` referencing nonexistent library key emits error diagnostic
6. New unit test: `completionGuidance.enabled: true` with empty `use.completionScoreTerms` emits warning
7. Existing suite: `pnpm -F @ludoforge/engine test` — all pass

### Invariants

1. Specs without `completionScoreTerms` or `completionGuidance` produce zero new diagnostics (backward compatible).
2. Validation does not import or depend on compilation logic.
3. Foundation #8 (Compiler-Kernel Boundary): validation is purely structural — no semantic/runtime checks.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/validate-agents-completion.test.ts` — covers all validation cases above

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "validate.*completion"` (targeted)
2. `pnpm turbo test && pnpm turbo typecheck` (full suite)
