# 63PRORESABS-005: Delete `isChoiceDecisionOwnerMismatchDuringProbe` and add export surface guard

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel export cleanup + new guard test
**Deps**: `archive/tickets/63PRORESABS-002.md`, `archive/tickets/63PRORESABS-003.md`

## Problem

After tickets 002 and 003 migrate all catch sites away from `isChoiceDecisionOwnerMismatchDuringProbe`, the function has no remaining callers. It should be deleted (FOUNDATIONS §14: no unused code). Additionally, the new `probe-result.ts` module needs an export surface guard test to prevent accidental API drift.

## Assumption Reassessment (2026-04-07)

1. `isChoiceDecisionOwnerMismatchDuringProbe` is exported from `legal-choices.ts` line 304 — confirmed.
2. It is imported by `choose-n-option-resolution.ts` line 16 — confirmed. After ticket 003, this import will be removed.
3. It is re-exported from `kernel/index.ts` — needs verification during implementation. If re-exported, the index line must also be removed.
4. No other files import it — confirmed via Grep (only 2 files: definition + 1 consumer).

## Architecture Check

1. Deleting unused exports follows FOUNDATIONS §14 (No Backwards Compatibility) — no compatibility shims for removed code.
2. The export surface guard follows the project pattern established by `free-operation-viability-export-surface-guard.test.ts` and similar guard tests.
3. No game-specific logic.

## What to Change

### 1. Delete `isChoiceDecisionOwnerMismatchDuringProbe` from `legal-choices.ts`

Remove the function definition at line 304 and its export. If there are any internal callers remaining in `legal-choices.ts` after ticket 002, they should already have been replaced.

### 2. Remove re-export from `kernel/index.ts` (if present)

Grep for `isChoiceDecisionOwnerMismatchDuringProbe` in `index.ts`. If found, remove the re-export line.

### 3. Add export surface guard for `probe-result.ts`

Create a guard test that asserts the exact set of exports from `probe-result.ts`:
- `ProbeOutcome` (type)
- `ProbeInconclusiveReason` (type)
- `ProbeResult` (interface)

This prevents accidental additions or removals from the module's public surface.

### 4. Final verification grep

Run a grep across the entire engine source for any remaining `isChoiceDecisionOwnerMismatchDuringProbe` references. There should be zero.

Run a grep across the 6 migrated files for the pattern `catch (error` followed by `isChoiceDecisionOwnerMismatchDuringProbe`, `shouldDeferMissingBinding`, or `isEffectErrorCode(error, 'STACKING_VIOLATION')` — confirm zero matches.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify — delete function)
- `packages/engine/src/kernel/index.ts` (modify — remove re-export if present)
- `packages/engine/test/unit/kernel/probe-result-export-surface-guard.test.ts` (new)

## Out of Scope

- Refactoring `shouldDeferMissingBinding` out of `missing-binding-policy.ts` — it has non-probe uses
- Refactoring `isEffectErrorCode` — it's a general utility with many uses beyond probing
- Performance optimization of probe execution

## Acceptance Criteria

### Tests That Must Pass

1. `isChoiceDecisionOwnerMismatchDuringProbe` does not exist anywhere in `packages/engine/src/`.
2. Export surface guard test passes for `probe-result.ts`.
3. Grep for probe-classification catch patterns across the 6 migrated files returns zero matches.
4. `pnpm -F @ludoforge/engine test` — all existing tests pass.
5. `pnpm turbo typecheck` — no new errors.

### Invariants

1. No backwards-compatibility shims for the deleted function (FOUNDATIONS §14).
2. `probe-result.ts` export surface is locked by the guard test.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/probe-result-export-surface-guard.test.ts` — asserts exact export set of `probe-result.ts`

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

**Completed**: 2026-04-07

### What changed

1. **Deleted `isChoiceDecisionOwnerMismatchDuringProbe`** from `packages/engine/src/kernel/legal-choices.ts`. Inlined its body (`isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_PROBE_AUTHORITY_MISMATCH)`) into the sole internal caller `classifyChoiceProbeError`.
2. **No barrel change needed** — `isChoiceDecisionOwnerMismatchDuringProbe` was not re-exported from `kernel/index.ts`.
3. **Updated stale comment** in `packages/engine/test/unit/kernel/choose-n-stochastic-ambiguous.test.ts` referencing the deleted function.
4. **Created export surface guard** at `packages/engine/test/unit/kernel/probe-result-export-surface-guard.test.ts` — locks `probe-result.ts` exports to `ProbeOutcome`, `ProbeInconclusiveReason`, `ProbeResult`.

### Deviations

- Ticket expected a possible `kernel/index.ts` re-export removal. Grep confirmed none existed — no change needed.

### Verification

- `pnpm -F @ludoforge/engine test`: 5592/5592 pass
- `pnpm turbo typecheck`: clean
- `pnpm turbo lint`: clean
- Grep for `isChoiceDecisionOwnerMismatchDuringProbe` across `packages/engine/`: zero matches
