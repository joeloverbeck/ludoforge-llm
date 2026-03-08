# FITLEVENTARCH-013: Enforce canonical decision-sequence export surface

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel decision-sequence export-surface guard (dedicated source-contract test)
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-012-unify-legal-move-admission-policy-surface-across-callsites.md

## Problem

The legacy helper `isMoveDecisionSequenceNotUnsatisfiable(...)` was removed, but there is no dedicated source-shape guard on `move-decision-sequence.ts` itself preventing reintroduction of legacy/alias admission helpers in that module.

Without a module-level contract test, future changes could silently re-add policy-split surfaces and re-fragment legal-move admission semantics.

## Assumption Reassessment (2026-03-08)

1. `packages/engine/src/kernel/move-decision-sequence.ts` now exposes canonical surfaces (`classify...`, `is...Satisfiable`, `is...AdmittedForLegalMove`) and no longer exports `isMoveDecisionSequenceNotUnsatisfiable(...)`.
2. Existing source-shape guards in `packages/engine/test/unit/kernel/legal-moves.test.ts` already protect callsites/import usage, but they do not assert the export surface of `move-decision-sequence.ts` directly.
3. Mismatch + correction: enforce module-level export ownership using a dedicated guard test file rather than extending behavior-focused `move-decision-sequence.test.ts`.

## Architecture Check

1. A dedicated export-surface guard is cleaner than relying on indirect callsite tests; it catches drift at the boundary where policy helpers are defined.
2. This is pure kernel architecture hardening and does not introduce game-specific behavior; GameDef/runtime remain game-agnostic.
3. No backwards-compatibility aliases/shims: the ticket explicitly rejects reintroducing legacy helper names or alias wrappers.

## What to Change

### 1. Add dedicated decision-sequence export-surface guard test

Add a focused source-shape contract test that parses `move-decision-sequence.ts` and enforces canonical helper ownership.

### 2. Assert no legacy helper reintroduction

Fail if `isMoveDecisionSequenceNotUnsatisfiable` or any equivalent unsatisfiable-only admission wrapper is reintroduced as an exported helper.

## Files to Touch

- `packages/engine/test/unit/kernel/move-decision-sequence-export-surface-guard.test.ts` (new)

## Out of Scope

- Legal-move callsite migration work (already completed in FITLEVENTARCH-012)
- Missing-binding policy semantics changes
- GameSpecDoc/schema or visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Source guard fails if legacy unsatisfiable-only admission helper is exported again from `move-decision-sequence.ts`.
2. Source guard confirms canonical exported helper set remains intact.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Legal-move admission helper ownership remains centralized in one canonical decision-sequence module surface.
2. Kernel policy surfaces remain game-agnostic and do not leak game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-decision-sequence-export-surface-guard.test.ts` — AST/source-shape contract assertions for canonical exports and forbidden legacy helper names.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence-export-surface-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`

## Outcome

- **Completion date**: 2026-03-08
- **What changed**:
  - Added dedicated source-contract guard test: `packages/engine/test/unit/kernel/move-decision-sequence-export-surface-guard.test.ts`.
  - Enforced exact named export contract for `src/kernel/move-decision-sequence.ts`.
  - Added explicit guard that legacy helper name `isMoveDecisionSequenceNotUnsatisfiable` is not reintroduced.
- **Deviations from original plan**:
  - Instead of modifying `move-decision-sequence.test.ts`, implemented a standalone guard test file to keep behavior tests separate from module API contract checks.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence-export-surface-guard.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck` ✅
