# SEATRES-068: Remove redundant effect-runtime code checks at reason-guard consumers

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — guard usage cleanup in runtime reason consumer sites
**Deps**: archive/tickets/SEATRES/SEATRES-054-complete-effect-runtime-reason-context-contracts-and-guarded-consumption.md

## Problem

Some consumers perform `isEffectErrorCode(error, 'EFFECT_RUNTIME') && isEffectRuntimeReason(error, ...)`. Since `isEffectRuntimeReason(...)` already implies effect-runtime code, this duplicates guard logic and weakens single-source semantics for reason checks.

## Assumption Reassessment (2026-03-03)

1. `isEffectRuntimeReason(...)` currently checks `isEffectErrorCode(error, 'EFFECT_RUNTIME')` internally.
2. Updated consumer paths (`apply-move.ts`, `legal-choices.ts`) still include redundant outer `isEffectErrorCode` checks.
3. No active ticket currently removes this duplication and standardizes consumer guard style.

## Architecture Check

1. Using a single canonical reason guard is cleaner and less error-prone than duplicated compound conditions.
2. This is policy simplification in agnostic runtime logic and does not leak game-specific behavior.
3. No backward-compatibility layer: adopt canonical guard usage directly and update tests accordingly.

## What to Change

### 1. Simplify runtime reason consumer predicates

1. Replace redundant `isEffectErrorCode(..., 'EFFECT_RUNTIME') && isEffectRuntimeReason(...)` with `isEffectRuntimeReason(...)` in targeted consumers.
2. Keep behavior and error mapping unchanged.

### 2. Add guard-style regression coverage

1. Extend source-guard assertions to enforce canonical single-guard usage at known consumer sites.
2. Assert absence of redundant pre-check patterns where `isEffectRuntimeReason` is already used.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify)

## Out of Scope

- Broad refactor of all `isEffectErrorCode` usages unrelated to reason guards
- Changes to error taxonomy or reason IDs
- GameSpecDoc/visual-config data model changes

## Acceptance Criteria

### Tests That Must Pass

1. `apply-move` and `legal-choices` use `isEffectRuntimeReason(...)` directly for reason-specific branching.
2. Existing behavior remains unchanged for illegal move mapping and probe mismatch handling.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Reason-consumer logic depends on a single canonical runtime reason guard.
2. Guarding policy remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-error-contracts.test.ts` — extend source-guard checks to enforce direct `isEffectRuntimeReason(...)` usage without redundant `isEffectErrorCode(..., 'EFFECT_RUNTIME')` conjunctions in targeted sites.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
