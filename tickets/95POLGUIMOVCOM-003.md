# 95POLGUIMOVCOM-003: Validate `completionGuidance` and `completionScoreTerms` in agent spec

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — cnl validate-agents
**Deps**: archive/tickets/95POLGUIMOVCOM-002.md

## Problem

Ticket `002` already had to extend `validate-agents.ts` so authored specs recognize `completionScoreTerms`, `completionGuidance`, and `use.completionScoreTerms` at the structural level. The remaining validation gap is narrower:

- `use.completionScoreTerms` still needs early cross-reference validation against `library.completionScoreTerms`
- `completionGuidance.enabled: true` with no referenced completion score terms should warn at authoring time
- focused validator tests should prove this behavior explicitly instead of relying on broader compile-path tests

## Assumption Reassessment (2026-03-30)

1. `validateAgents` validates library entries by iterating over named maps (`stateFeatures`, `candidateFeatures`, `candidateAggregates`, `pruningRules`, `scoreTerms`, `tieBreakers`). Confirmed — adding `completionScoreTerms` follows the same pattern.
2. Profile validation checks `use.pruningRules`, `use.scoreTerms`, `use.tieBreakers` arrays against library keys. Confirmed — `use.completionScoreTerms` follows the same cross-reference pattern.
3. `GameSpecScoreTermDef` is the shape for both `scoreTerms` and `completionScoreTerms` — same validation logic applies. Confirmed.
4. No existing validation for `completionGuidance` or `fallback` values. Confirmed.
5. Mismatch: ticket `002` already added key recognition plus `completionGuidance` shape and fallback validation to `validate-agents.ts`. This ticket must not duplicate that delivered work.
6. `validateProfileUse` still validates `use.*` entries as string lists only; it does not cross-check `use.completionScoreTerms` ids against authored library keys. Confirmed.

## Architecture Check

1. Cleanest approach: keep structural validation where it already lives, then add the remaining authored cross-reference and warning checks in `validate-agents.ts`. Do not re-open the completed shape-validation work from ticket `002`.
2. Engine agnosticism: validation checks structural correctness, not game-specific content. No game identifiers in validation logic.
3. No backwards-compatibility shims: diagnostics apply only when the new fields are present.
4. Single-source-of-truth cleanup for policy contract keys is a separate architectural concern and should not be folded into this ticket's validation-only scope.

## What to Change

### 1. `validate-agents.ts` — add authored cross-reference validation for `use.completionScoreTerms`

For each profile:
- validate every `use.completionScoreTerms` id against authored `library.completionScoreTerms`
- emit an authoring diagnostic when a referenced id is missing
- keep this in the validator rather than deferring the failure to compiler lowering

### 2. `validate-agents.ts` — warn when guidance is enabled without referenced completion score terms

For each profile with `completionGuidance.enabled: true`:
- if `use.completionScoreTerms` is absent or empty, emit a warning
- keep this as a validator warning, not a compiler error, so authored intent is surfaced early without changing runtime semantics

### 3. Focused validator tests

Add dedicated validation tests for the remaining completion-guidance validator behavior instead of relying only on broader compile-path tests.

## Files to Touch

- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/test/unit/cnl/validate-agents-completion.test.ts` (new or modify)

## Out of Scope

- Structural recognition of `completionScoreTerms` / `completionGuidance` keys or fallback enums (already delivered in ticket `002`)
- Compilation of `completionScoreTerms` (ticket 006 was superseded by ticket `002`; no dependency on it should be added here)
- Runtime evaluation (tickets 005, 007)
- Expression-level validation (handled by existing expression validator, shared with `scoreTerms`)
- `zoneTokenAgg` dynamic zone validation (ticket 004)
- Policy contract centralization across types/schema/validator/compiler (tracked separately)

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: valid `completionScoreTerms` in library passes validation without diagnostics
2. New unit test: `use.completionScoreTerms` referencing nonexistent library key emits error diagnostic
3. New unit test: `completionGuidance.enabled: true` with empty `use.completionScoreTerms` emits warning
4. Existing validator behavior for invalid `completionGuidance.fallback` remains covered and unchanged
5. Existing suite: `pnpm -F @ludoforge/engine test` — all pass
6. Existing suite: `pnpm turbo typecheck` — all pass

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
