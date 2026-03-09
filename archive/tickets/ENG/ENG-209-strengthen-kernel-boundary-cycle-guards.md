# ENG-209: Strengthen Kernel Boundary Cycle Guards

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard tests and import-boundary contracts
**Deps**: archive/tickets/ENG-206-decouple-viability-probe-from-kernel-cycle.md, archive/tickets/ENG/ENG-208-harden-free-operation-discovery-api-surface.md, packages/engine/src/kernel/legal-choices.ts, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/turn-flow-action-class.ts, packages/engine/test/unit/kernel/free-operation-discovery-boundary.test.ts, packages/engine/test/unit/kernel/free-operation-discovery-export-surface-guard.test.ts

## Problem

Current boundary guard coverage remains incomplete for cycle prevention: one guard still blocks a single symbol import instead of the whole import edge, and there is no explicit cycle-edge contract test covering the three-module chain.

## Assumption Reassessment (2026-03-09)

1. `free-operation-discovery-boundary.test.ts` currently asserts that `legal-choices.ts` does not import one legacy symbol from `turn-flow-eligibility.ts`.
2. Discrepancy: the same test does not enforce a zero-import edge policy (`legal-choices.ts -> turn-flow-eligibility.ts`), leaving bypass paths via alternate imported symbols.
3. Discrepancy: export-surface guard coverage for `free-operation-discovery-analysis.ts` already exists in `free-operation-discovery-export-surface-guard.test.ts` (ENG-208), so this ticket should not duplicate it.
4. Gap: there is no dedicated source-level cycle-edge contract test for `turn-flow-eligibility -> move-decision-sequence -> legal-choices` with an explicit forbidden back-edge from `legal-choices` to `turn-flow-eligibility`.
5. Gap: `turn-flow-action-class.ts` has consumer/content guard coverage but no strict top-level export-surface contract assertion.
6. Correction: scope this ticket to missing architecture guards only (full import-edge prohibition, explicit cycle-edge contract, strict action-class module export-surface contract).

## Architecture Check

1. Explicit source contracts (edge and export-surface) are cleaner than convention-only boundaries and reduce regression risk during refactors.
2. This is architecture/test hardening only in agnostic kernel layers and does not inject game-specific logic.
3. No compatibility shims: enforce canonical boundaries directly and fail fast on violations.

## What to Change

### 1. Enforce full boundary prohibition for `legal-choices`

Update architecture guard tests so `legal-choices.ts` must not import `turn-flow-eligibility.ts` at all.

### 2. Add explicit cycle-edge contract coverage

Add a dedicated kernel boundary cycle guard test that captures expected direct edges (`turn-flow-eligibility -> move-decision-sequence`, `move-decision-sequence -> legal-choices`) and asserts forbidden back-edge (`legal-choices -/-> turn-flow-eligibility`).

### 3. Add strict export-surface guard for `turn-flow-action-class`

Strengthen `turn-flow-action-class-contract-guard.test.ts` to assert the curated top-level export surface of `turn-flow-action-class.ts`.

## Files to Touch

- `packages/engine/test/unit/kernel/free-operation-discovery-boundary.test.ts` (modify)
- `packages/engine/test/unit/kernel/turn-flow-action-class-contract-guard.test.ts` (modify)
- `packages/engine/test/unit/kernel/kernel-boundary-cycle-guard.test.ts` (new)

## Out of Scope

- Free-operation grant semantics/policy contracts (ENG-202/ENG-203/ENG-207).
- Card data encoding changes (ENG-204).
- Reworking existing `free-operation-discovery-export-surface-guard.test.ts` coverage beyond keeping it green.

## Acceptance Criteria

### Tests That Must Pass

1. `legal-choices.ts` has no direct import edge to `turn-flow-eligibility.ts`.
2. Dedicated cycle-edge guard test enforces the expected acyclic edge set for this boundary.
3. `turn-flow-action-class.ts` has explicit curated export-surface guard coverage.
4. Existing suite: `node --test packages/engine/dist/test/unit/kernel/free-operation-discovery-boundary.test.js packages/engine/dist/test/unit/kernel/turn-flow-action-class-contract-guard.test.js packages/engine/dist/test/unit/kernel/kernel-boundary-cycle-guard.test.js`

### Invariants

1. The previously observed cycle edge cannot be reintroduced without failing architecture guard tests.
2. Kernel boundary modules remain game-agnostic and strictly layered.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-discovery-boundary.test.ts` — forbid any `legal-choices.ts -> turn-flow-eligibility.ts` import.
2. `packages/engine/test/unit/kernel/turn-flow-action-class-contract-guard.test.ts` — enforce strict export-surface contract for canonical action-class module.
3. `packages/engine/test/unit/kernel/kernel-boundary-cycle-guard.test.ts` — represent cycle-edge invariant explicitly.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/free-operation-discovery-boundary.test.js packages/engine/dist/test/unit/kernel/turn-flow-action-class-contract-guard.test.js packages/engine/dist/test/unit/kernel/kernel-boundary-cycle-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completed: 2026-03-09
- Actually changed:
  - Tightened `free-operation-discovery-boundary.test.ts` to forbid any direct import edge from `legal-choices.ts` to `turn-flow-eligibility.ts`.
  - Added `kernel-boundary-cycle-guard.test.ts` to lock the intended edge chain (`turn-flow-eligibility -> move-decision-sequence -> legal-choices`) and forbid the legacy back-edge.
  - Strengthened `turn-flow-action-class-contract-guard.test.ts` with explicit export-surface contract assertions for `turn-flow-action-class.ts`.
- Deviations from original plan:
  - Removed duplicate scope for free-operation discovery export-surface work because that guard already exists via ENG-208 (`free-operation-discovery-export-surface-guard.test.ts`).
  - Kept changes test-only; no runtime kernel implementation changes were necessary.
- Verification:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/free-operation-discovery-boundary.test.js packages/engine/dist/test/unit/kernel/turn-flow-action-class-contract-guard.test.js packages/engine/dist/test/unit/kernel/kernel-boundary-cycle-guard.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (447/447).
  - `pnpm -F @ludoforge/engine lint` passed.
