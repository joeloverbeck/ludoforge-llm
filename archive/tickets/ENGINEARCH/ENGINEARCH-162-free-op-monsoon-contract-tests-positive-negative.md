# ENGINEARCH-162: Reassess Free-Operation Monsoon Contract Coverage (Positive + Negative)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No — verification and ticket-scope correction only
**Deps**: archive/tickets/ENGINEARCH/ENGINEARCH-161-monsoon-window-filter-after-free-op-variants.md

## Problem

This ticket originally assumed monsoon free-operation coverage only asserted the allow-path and lacked the complementary blocked-path assertion.

Current code no longer matches that assumption: both paths are already covered in integration tests.

## Assumption Reassessment (2026-03-04)

1. Verified existing integration coverage asserts the allow-path for monsoon-restricted free operations when `allowDuringMonsoon: true` is set.
2. Verified the same integration test also asserts the blocked-path when grant metadata omits `allowDuringMonsoon`.
3. Verified the ticket dependency (`ENGINEARCH-161`) already records this coverage hardening as completed work.
4. Discrepancy: this ticket's original scope duplicates already-implemented behavior and tests.

## Architecture Check

1. The current architecture is cleaner than adding more near-duplicate monsoon grant tests in this file; policy stays generic in turn-flow legality/window filters and metadata-driven in `GameDef`.
2. Additional aliasing/back-compat layers are unnecessary and would weaken clarity.
3. Best action is to close this ticket as verification-only, avoiding redundant test debt.

## Updated Scope

### 1. Correct ticket assumptions

Document that positive + negative monsoon free-operation contract coverage is already present.

### 2. Verify current contract remains green

Run focused and package-level engine tests plus lint to confirm no regression.

### 3. Archive ticket as completed verification work

Record outcome as "no engine/test code changes required" with executed verification commands.

## Files to Touch

- `tickets/ENGINEARCH-162-free-op-monsoon-contract-tests-positive-negative.md` (modify)

## Out of Scope

- Any kernel/runtime implementation changes.
- Adding duplicate tests for already-covered monsoon allow/deny behavior.

## Acceptance Criteria

### Tests That Must Pass

1. Existing monsoon allow/deny integration assertions in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` remain green.
2. Existing suite: `pnpm -F @ludoforge/engine test`.
3. Lint: `pnpm -F @ludoforge/engine lint`.

### Invariants

1. Monsoon bypass behavior remains explicit and metadata-driven (`allowDuringMonsoon`).
2. No redundant or overlapping contract tests are introduced without new behavioral coverage.

## Test Plan

### New/Modified Tests

1. None (verification-only ticket).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-03-04
- **What actually changed**:
  - Reassessed ticket assumptions against current code/tests and corrected scope to verification-only.
  - Confirmed monsoon positive + negative free-operation coverage already exists in `fitl-event-free-operation-grants` integration tests.
  - No engine runtime/test implementation changes were required.
- **Deviations from original plan**:
  - Original plan to add negative-path coverage was obsolete because that coverage had already landed.
  - Work completed as scope correction + verification rather than code changes.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (376 passed, 0 failed)
  - `pnpm -F @ludoforge/engine lint` ✅
