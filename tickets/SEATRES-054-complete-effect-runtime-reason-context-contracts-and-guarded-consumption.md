# SEATRES-054: Complete effect-runtime reason context contracts and guarded consumption

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — effect runtime reason schema typing, effect callsites, and runtime reason consumption sites
**Deps**: tickets/SEATRES-052-enforce-required-effect-runtime-context-args-by-reason.md, tickets/SEATRES-053-remove-unsafe-casts-from-effect-runtime-error-construction.md

## Problem

Most `EffectRuntimeReason` entries still map to generic `Record<string, unknown>` context. This limits compile-time guarantees and leaves reason payload contracts mostly implicit. Some consumers still inspect reasons via string literals instead of typed reason guards/constants.

## Assumption Reassessment (2026-03-02)

1. `EffectRuntimeContextByReason` currently defines explicit structure only for `turnFlowRuntimeValidationFailed`; most reasons are generic records.
2. Callsites across effect modules emit reason-specific fields but those shapes are not fully encoded in shared reason contracts.
3. At least one consumer path (for example in `apply-move.ts`) still matches reason via raw string literal instead of stable constants/guard helpers.

## Architecture Check

1. Exhaustive reason-context typing yields cleaner, more robust architecture than ad-hoc payload bags.
2. This strengthens engine contracts while keeping GameSpecDoc/visual-config game data separate from game-agnostic runtime logic.
3. No compatibility shims: migrate all targeted callsites to canonical reason constants and reason guards directly.

## What to Change

### 1. Expand per-reason effect runtime context contracts

1. Replace generic `Record<string, unknown>` entries in `EffectRuntimeContextByReason` with explicit interfaces for active reasons.
2. Keep schemas focused on stable semantics (reason-level contracts), not callsite-local incidental keys.

### 2. Migrate effect emitters to explicit reason contracts

1. Update `effectRuntimeError` callsites to satisfy new per-reason types.
2. Ensure all required keys are present and typed per reason.

### 3. Standardize reason consumption

1. Replace raw reason string literal comparisons with `EFFECT_RUNTIME_REASONS.*` constants.
2. Prefer `isEffectRuntimeReason(...)` where context narrowing is needed.

## Files to Touch

- `packages/engine/src/kernel/effect-error.ts` (modify)
- `packages/engine/src/kernel/effects-*.ts` (modify scoped subsets as needed)
- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify, if reason payload contracts require)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify/add)
- `packages/engine/test/unit/*` (modify/add targeted reason contract tests where affected)

## Out of Scope

- Changing error code taxonomy boundaries (`EFFECT_RUNTIME` vs kernel runtime error codes)
- Game-specific schema additions in `GameDef` or simulator runtime branches

## Acceptance Criteria

### Tests That Must Pass

1. `EffectRuntimeContextByReason` provides explicit context contracts for targeted runtime reasons with no fallback generic entries for those reasons.
2. Updated callsites compile without casts and satisfy reason-specific payload requirements.
3. Consumers use constants/guards for reason checks where context narrowing is required.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Effect runtime reason contracts are centralized, explicit, and game-agnostic.
2. Runtime error handling uses stable semantic reason IDs, not fragile string literals.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-error-contracts.test.ts` — add exhaustive reason contract assertions for migrated reasons.
2. `packages/engine/test/unit/kernel/apply-move.test.ts` (or closest focused test file) — assert guarded reason-based behavior remains correct after migration from string literals.
3. Additional affected unit tests under `packages/engine/test/unit/` — update reason payload assertions to align with explicit contracts.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
