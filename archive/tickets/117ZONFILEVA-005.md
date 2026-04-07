# 117ZONFILEVA-005: Migrate test assertions and run determinism canary

**Status**: NOT IMPLEMENTED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only changes
**Deps**: `archive/tickets/117ZONFILEVA-004.md`

## Problem

After ticket 004 removes `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` from the type system, 4 test assertions across 3 test files that check for this error code will fail to compile or will assert on a non-existent error. These assertions must be migrated to validate the new behavior. Additionally, the determinism canary and FITL playbook golden test must confirm behavioral identity.

## Assumption Reassessment (2026-04-07)

1. `legal-moves.test.ts:1680` — asserts `details.code === 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED'` — confirmed.
2. `legal-choices.test.ts:3102` — asserts `details.code === 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED'` — confirmed.
3. `apply-move.test.ts:984` — asserts `details.code === 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED'` — confirmed.
4. `apply-move.test.ts:1082` — asserts `details.code === 'FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED'` — confirmed.
5. These tests verify that specific error scenarios produce the expected error code. After the migration, these scenarios either: (a) no longer throw (because deferral is handled via result type), or (b) throw a different error. Each assertion must be re-examined for what behavior it actually tests.

## Architecture Check

1. Test migration follows Foundation 16 (Testing as Proof) — tests must validate actual behavior, not assert on removed infrastructure.
2. Never adapt tests to match bugs — the code changed intentionally; tests must validate the new correct behavior.
3. Determinism canary (seeds 1001-1004) proves Foundation 8 (Determinism Is Sacred) is preserved across the refactor.

## What to Change

### 1. Migrate `legal-moves.test.ts` assertion at line 1680

Read the test to understand what scenario it exercises. The test likely verifies that a zone-filter evaluation failure produces the `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` error. After the migration, this scenario is handled via the result type internally — determine whether the test should:
- Assert that the move is still legal (deferral treated as `true`)
- Assert a different error is thrown (if the error was non-deferrable)
- Be restructured to test the result type behavior

### 2. Migrate `legal-choices.test.ts` assertion at line 3102

Same analysis as above. Determine the test's intent and migrate the assertion.

### 3. Migrate `apply-move.test.ts` assertions at lines 984 and 1082

Same analysis for both assertions. These are in `apply-move` context, so they may test that the error propagates during move application. After the migration, the error is handled internally — determine the correct new behavior assertion.

### 4. Run determinism canary

Run seeds 1001-1004 and verify identical outcomes compared to pre-migration baseline. This proves the entire refactor is behavior-preserving.

### 5. Run FITL playbook golden test

Run the FITL playbook golden test and verify identical trace output.

## Files to Touch

- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify — migrate assertion at line 1680)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify — migrate assertion at line 3102)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify — migrate assertions at lines 984, 1082)

## Out of Scope

- Changing the result type definition (ticket 001)
- Changing `evaluateZoneFilterForMove()` behavior (ticket 002)
- Adding new test scenarios beyond what's needed for migration

## Acceptance Criteria

### Tests That Must Pass

1. All 4 migrated test assertions pass with correct new behavior validation.
2. Grep for `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` in all files under `packages/engine/` returns zero matches.
3. Determinism canary: seeds 1001-1004 produce identical outcomes.
4. FITL playbook golden test: identical trace output.
5. Full suite: `pnpm turbo test --force` — zero failures.

### Invariants

1. No reference to `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` remains anywhere in the codebase.
2. Test coverage for zone-filter evaluation scenarios is preserved — no test coverage lost from migration.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — migrate error code assertion to behavior assertion
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — migrate error code assertion to behavior assertion
3. `packages/engine/test/unit/kernel/apply-move.test.ts` — migrate 2 error code assertions to behavior assertions

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test --force`
4. `pnpm turbo typecheck`

## Outcome

**Not Implemented**: 2026-04-07

**Reason**: Ticket 004 (dependency) was closed as NOT IMPLEMENTED — `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` error code was not removed because it is still structurally needed. The 4 test assertions that check for this error code still test valid behavior and should not be migrated.
