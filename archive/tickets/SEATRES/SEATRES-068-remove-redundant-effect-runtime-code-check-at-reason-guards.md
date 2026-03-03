# SEATRES-068: Remove redundant effect-runtime code checks at reason-guard consumers

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — guard usage cleanup in runtime reason consumer sites
**Deps**: archive/tickets/SEATRES/SEATRES-054-complete-effect-runtime-reason-context-contracts-and-guarded-consumption.md

## Problem

Some consumers perform `isEffectErrorCode(error, 'EFFECT_RUNTIME') && isEffectRuntimeReason(error, ...)`. Since `isEffectRuntimeReason(...)` already implies effect-runtime code, this duplicates guard logic and weakens single-source semantics for reason checks.

## Assumption Reassessment (2026-03-03)

1. `isEffectRuntimeReason(...)` currently checks `isEffectErrorCode(error, 'EFFECT_RUNTIME')` internally.
2. Updated consumer paths (`apply-move.ts`, `legal-choices.ts`) still include redundant outer `isEffectErrorCode` checks at current guard sites.
3. Existing unit coverage verifies canonical reason constants and raw-literal avoidance, but does not yet guard against redundant outer `isEffectErrorCode(..., 'EFFECT_RUNTIME')` conjunctions at these consumer sites.
4. No active ticket currently removes this duplication and standardizes consumer guard style.

## Architecture Check

1. Using a single canonical reason guard is cleaner and less error-prone than duplicated compound conditions.
2. This is policy simplification in agnostic runtime logic and does not leak game-specific behavior.
3. No backward-compatibility layer: adopt canonical guard usage directly and update tests accordingly.

## What to Change

### 1. Simplify runtime reason consumer predicates

1. Replace redundant `isEffectErrorCode(..., 'EFFECT_RUNTIME') && isEffectRuntimeReason(...)` with `isEffectRuntimeReason(...)` in targeted consumers.
2. Keep behavior and error mapping unchanged.
3. Remove any now-unused `isEffectErrorCode` imports from updated modules.

### 2. Add guard-style regression coverage

1. Extend source-guard assertions to enforce canonical single-guard usage at known consumer sites.
2. Assert absence of redundant pre-check patterns where `isEffectRuntimeReason` is already used.
3. Keep existing raw-literal reason guard assertions intact.

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
2. Updated modules compile without unused-import regressions.
3. Existing behavior remains unchanged for illegal move mapping and probe mismatch handling.
4. Existing suite: `pnpm -F @ludoforge/engine test`

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

## Outcome

- **Completion date**: 2026-03-03
- **What changed**:
  - Simplified runtime reason handling in `apply-move.ts` and `legal-choices.ts` by removing redundant `isEffectErrorCode(..., 'EFFECT_RUNTIME')` checks where `isEffectRuntimeReason(...)` is used.
  - Preserved existing non-runtime `isEffectErrorCode(..., 'STACKING_VIOLATION')` handling in `legal-choices.ts`.
  - Strengthened `effect-error-contracts.test.ts` source-guard assertions to reject the redundant conjunction pattern at both targeted consumer sites.
  - Upgraded the redundant-conjunction source guard from regex matching to a TypeScript AST-based detector in `test/helpers/kernel-source-ast-guard.ts`, reducing false positives/negatives from formatting or wrapping changes.
- **Deviations from original plan**:
  - The initial scope note about removing now-unused `isEffectErrorCode` imports only applied to `apply-move.ts`; `legal-choices.ts` still requires `isEffectErrorCode` for stacking-violation handling.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - Re-validated after AST guard upgrade: `pnpm turbo build`, `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`, `pnpm -F @ludoforge/engine test`, `pnpm turbo lint` all passed.
