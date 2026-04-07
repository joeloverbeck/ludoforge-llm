# 63PRORESABS-004: Migrate missing-binding deferral sites to `ProbeResult`

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel probe deferral refactoring across 4 files
**Deps**: `tickets/63PRORESABS-001.md`

## Problem

Four kernel files use `shouldDeferMissingBinding` in catch blocks to classify missing-binding errors during probing as "deferred" / "unknown" instead of failing:

- `pipeline-viability-policy.ts` line 122 (1 catch block, 1 `shouldDeferMissingBinding` call)
- `action-pipeline-predicates.ts` line 34 (1 catch block, 1 `shouldDeferMissingBinding` call)
- `move-decision-sequence.ts` line 174 (1 catch block, 1 `shouldDeferMissingBinding` call)
- `legal-moves.ts` line 449 (1 catch block, 1 `shouldDeferMissingBinding` call)

Additionally, `pipeline-viability-policy.ts` has a second catch block at its probe site. Total: 6 catch blocks across 4 files.

## Assumption Reassessment (2026-04-07)

1. `shouldDeferMissingBinding` is exported from `missing-binding-policy.ts` line 59 — confirmed via Read.
2. It checks for `MISSING_BINDING` eval errors and `isDeferrableUnresolvedSelectorCardinality` — confirmed. This maps to `ProbeInconclusiveReason` values `'missingBinding'` and `'selectorCardinality'`.
3. The 4 files import and use `shouldDeferMissingBinding` in catch blocks — confirmed via Grep (5 import sites across 4 files, plus the definition file).
4. `shouldDeferMissingBinding` is also used in `missing-binding-policy.ts:81` by `shouldDeferFreeOperationZoneFilterFailure` — this internal use is NOT a probe catch block and is out of scope.

## Architecture Check

1. The refactoring wraps each file's probe evaluation call to return `ProbeResult` instead of throwing on missing bindings.
2. `shouldDeferMissingBinding` remains in `missing-binding-policy.ts` as an internal utility — it's used by `shouldDeferFreeOperationZoneFilterFailure` which has its own separate logic. Only the catch-site usage at the 4 caller files is removed.
3. No game-specific logic. Missing bindings and selector cardinality are generic kernel evaluation concepts.
4. No backwards-compatibility shims.

## What to Change

### 1. Refactor `pipeline-viability-policy.ts`

Replace the catch block at line 122 that calls `shouldDeferMissingBinding`. The probe evaluation should return `ProbeResult`; the caller reads `outcome === 'inconclusive'` instead of catching.

### 2. Refactor `action-pipeline-predicates.ts`

Replace the catch block at line 34 that calls `shouldDeferMissingBinding`. Same pattern as above.

### 3. Refactor `move-decision-sequence.ts`

Replace the catch block at line 174 that calls `shouldDeferMissingBinding`. The function returns `'unknown'` on deferral — change to read `ProbeResult.outcome`.

### 4. Refactor `legal-moves.ts`

Replace the catch block at line 449 that calls `shouldDeferMissingBinding`. Same pattern.

### 5. Remove `shouldDeferMissingBinding` imports from the 4 files

After catch blocks are replaced, the imports of `shouldDeferMissingBinding` and `MISSING_BINDING_POLICY_CONTEXTS` from the 4 caller files are no longer needed. Remove them.

## Files to Touch

- `packages/engine/src/kernel/pipeline-viability-policy.ts` (modify)
- `packages/engine/src/kernel/action-pipeline-predicates.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)

## Out of Scope

- `missing-binding-policy.ts` itself — `shouldDeferMissingBinding` stays as internal utility
- `shouldDeferFreeOperationZoneFilterFailure` — has its own specific logic beyond simple probe deferral
- `legal-choices.ts` catch blocks (ticket 002)
- `choose-n-option-resolution.ts` catch blocks (ticket 003)

## Acceptance Criteria

### Tests That Must Pass

1. The 4 modified files have zero try/catch blocks that call `shouldDeferMissingBinding` for probe classification.
2. The 4 modified files do not import `shouldDeferMissingBinding` or `MISSING_BINDING_POLICY_CONTEXTS`.
3. `pnpm -F @ludoforge/engine test` — all existing tests pass.
4. `pnpm -F @ludoforge/engine test:determinism` — determinism canary passes.

### Invariants

1. All moves that produced `'unknown'` / deferred status before the refactor produce the same classification after.
2. Unknown errors are still rethrown.
3. `shouldDeferMissingBinding` remains available in `missing-binding-policy.ts` for non-probe uses.

## Test Plan

### New/Modified Tests

1. Existing tests exercise pipeline viability, action predicates, move decision sequences, and legal moves extensively. No new test file needed — behavioral equivalence is the acceptance criterion.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:determinism`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
