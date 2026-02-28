# ENGINEARCH-121: Verify Turn-Flow Action-Class Runtime Guard Parity and Close Follow-Up Scope

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Possibly — tests only, if parity signal is missing
**Deps**: archive/tickets/ENGINEARCH-120-turn-flow-action-class-canonical-contract-unification.md

## Problem

This follow-up ticket assumed runtime action-class guard deduplication was still pending. Reassessment shows the architectural refactor already landed; remaining value is to verify and lock schema/runtime parity with explicit tests, then close the ticket.

## Assumption Reassessment (2026-02-28)

1. Discrepancy: `isTurnFlowActionClass` is already centralized in `packages/engine/src/kernel/turn-flow-action-class-contract.ts`.
2. Discrepancy: `turn-flow-eligibility.ts` and `effects-turn-flow.ts` already import and use the canonical guard; duplicate local predicates are not present.
3. Confirmed: existing guard tests (`turn-flow-action-class-contract-guard.test.ts`) enforce canonical import boundaries and protect against literal-redeclaration drift.
4. Remaining gap to verify: whether tests explicitly assert behavioral parity between canonical guard acceptance and schema enum acceptance.

## Scope Correction

1. Remove duplicate-guard implementation work from scope; it is already complete.
2. Keep only parity-verification hardening work:
   - ensure a focused test covers runtime guard acceptance parity with schema enum acceptance.
3. If parity coverage is already sufficient after reassessment, close with no production code changes.

## Architecture Check

1. Current architecture (single canonical action-class contract + shared runtime guard) is superior to pre-refactor duplication.
2. Additional implementation rewrites are not beneficial now; incremental parity tests are the highest-value, lowest-risk reinforcement.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Validate parity coverage sufficiency

Reassess existing tests for explicit runtime-guard vs schema-enum acceptance parity.

### 2. Add/strengthen parity test only if needed

If missing, add a focused unit test that compares accepted/rejected action-class values across runtime guard and schema-backed canonical values.

## Files to Touch

- `packages/engine/test/unit/kernel/` (modify/add only if parity test signal is missing)
- `tickets/ENGINEARCH-121-shared-turn-flow-action-class-runtime-guard.md` (this reassessment update)

## Out of Scope

- Any additional runtime guard rewiring already completed by ENGINEARCH-120.
- Turn-flow behavior/semantics changes.
- Game-specific logic, `GameSpecDoc`, or data-asset changes.

## Acceptance Criteria

### Tests That Must Pass

1. Canonical action-class guard remains single-source and consumed by runtime modules.
2. Parity test coverage demonstrates runtime guard acceptance aligns with schema canonical enum values.
3. `pnpm -F @ludoforge/engine test` passes.
4. `pnpm turbo lint` passes.

### Invariants

1. Runtime validation and schema/canonical contract validation remain parity-aligned.
2. Kernel remains generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/turn-flow-action-class-contract-guard.test.ts` (existing) — import-boundary and duplicate-literal drift guard.
2. `packages/engine/test/unit/kernel/turn-flow-action-class-parity.test.ts` (new, if needed) — explicit accepted/rejected parity between guard and canonical action-class values.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/turn-flow-action-class-contract-guard.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/turn-flow-action-class-parity.test.js` (if added)
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-28
- **What actually changed**:
  - Reassessed ticket assumptions and corrected scope to reflect that runtime guard centralization/rewiring was already completed by ENGINEARCH-120.
  - Added `packages/engine/test/unit/kernel/turn-flow-action-class-parity.test.ts` to explicitly enforce schema/runtime acceptance parity for action-class values.
- **What changed vs originally planned**:
  - No production kernel code changes were necessary because the architectural implementation target had already landed.
  - Work focused on explicit parity-proof test coverage and ticket closure instead of additional refactors.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/turn-flow-action-class-contract-guard.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/turn-flow-action-class-parity.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`318` passed, `0` failed).
  - `pnpm turbo lint` passed.
