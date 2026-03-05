# TOKFILAST-006: Restore Diagnostic Path Precision Assertions for Token-Filter Compilation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler/integration test coverage hardening
**Deps**: tickets/TOKFILAST-005-victory-lowering-unit-coverage-hardening.md, archive/tickets/TOKFILAST-002-cnl-lowering-and-no-shim-migration.md

## Problem

A few `compile-pipeline` integration assertions were loosened from `code + exact path` to `code-only` checks during token-filter migration. That weakens regression protection for diagnostic path fidelity, which is part of compiler contract quality and critical for author debugging.

## Assumption Reassessment (2026-03-06)

1. `packages/engine/test/integration/compile-pipeline.test.ts` currently includes checks that assert only diagnostic code presence for token-filter failures.
2. Compiler diagnostic paths remain intentionally structured and deterministic across lowerers; path-level precision is still expected architecture.
3. This gap is not covered by active tickets in `tickets/*`.

## Architecture Check

1. Restoring path-precise assertions improves compiler contract rigor without expanding runtime complexity.
2. This is test-only work and preserves the GameSpecDoc (game-specific) vs GameDef/runtime (agnostic) boundary.
3. No backwards-compatibility aliases or shims are introduced.

## What to Change

### 1. Reintroduce exact diagnostic path assertions

Strengthen relevant `compile-pipeline` integration tests to assert both diagnostic code and exact path for token-filter validation failures.

### 2. Add focused unit-level path checks where missing

If needed, add/expand unit tests in compile lowerer suites to lock exact path shapes for representative failure nodes.

## Files to Touch

- `packages/engine/test/integration/compile-pipeline.test.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify, if needed)
- `packages/engine/test/unit/compile-effects.test.ts` (modify, if needed)

## Out of Scope

- Any production GameSpecDoc behavior changes.
- Any runtime/kernel diagnostic plumbing redesign.

## Acceptance Criteria

### Tests That Must Pass

1. Integration checks assert exact diagnostic path and code for token-filter shape/prop failures.
2. Unit tests (if added) cover canonical path shape for at least one failure in query lowering and one in effect lowering.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Compiler diagnostics remain deterministic and location-precise.
2. No game-specific logic is added to compiler/runtime.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/compile-pipeline.test.ts` — restore path-precise assertions.
2. `packages/engine/test/unit/compile-conditions.test.ts` — optional path-level failure-node lock.
3. `packages/engine/test/unit/compile-effects.test.ts` — optional path-level failure-node lock.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:integration`
3. `pnpm -F @ludoforge/engine test`
