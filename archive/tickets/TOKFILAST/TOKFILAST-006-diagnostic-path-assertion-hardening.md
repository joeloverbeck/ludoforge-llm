# TOKFILAST-006: Restore Diagnostic Path Precision Assertions for Token-Filter Compilation

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — compiler/integration test coverage hardening
**Deps**: tickets/TOKFILAST-005-victory-lowering-unit-coverage-hardening.md, archive/tickets/TOKFILAST-002-cnl-lowering-and-no-shim-migration.md

## Problem

A few `compile-pipeline` integration assertions were loosened from `code + exact path` to `code-only` checks during token-filter migration. That weakens regression protection for diagnostic path fidelity, which is part of compiler contract quality and critical for author debugging.

## Assumption Reassessment (2026-03-06)

1. `packages/engine/test/integration/compile-pipeline.test.ts` includes token-filter assertions that currently check diagnostic code only:
   - `CNL_COMPILER_TOKEN_FILTER_VALUE_NON_CANONICAL`
   - `CNL_COMPILER_TOKEN_FILTER_PROP_UNKNOWN`
2. `packages/engine/test/unit/compile-conditions.test.ts` already asserts deterministic path precision for token-filter `PROP_UNKNOWN` failures, so unit path coverage is partially present already.
3. Deterministic path semantics are still core compiler contract behavior (used by authoring/debug flows), so integration-level path assertions remain architecturally important.
4. No active ticket in `tickets/*` currently claims this exact path-hardening work.

## Architecture Check

1. Restoring path-precise assertions improves compiler contract rigor without expanding runtime complexity.
2. This is test-only work and preserves the GameSpecDoc (game-specific) vs GameDef/runtime (agnostic) boundary.
3. No backwards-compatibility aliases or shims are introduced.

## What to Change

### 1. Reintroduce exact diagnostic path assertions

Strengthen relevant `compile-pipeline` integration tests to assert both diagnostic code and exact path for token-filter validation failures.

### 2. Add focused unit-level path checks where missing

Add or expand unit checks only where path-precision gaps remain. Based on current code, the missing unit-level lock is the non-canonical token trait literal path (`...filter.args.0.value`).

## Files to Touch

- `packages/engine/test/integration/compile-pipeline.test.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)

## Out of Scope

- Any production GameSpecDoc behavior changes.
- Any runtime/kernel diagnostic plumbing redesign.

## Acceptance Criteria

### Tests That Must Pass

1. Integration checks assert exact diagnostic path and code for token-filter shape/prop failures.
2. Unit tests lock the missing token-filter non-canonical value diagnostic path shape in query lowering.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Compiler diagnostics remain deterministic and location-precise.
2. No game-specific logic is added to compiler/runtime.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/compile-pipeline.test.ts` — restore path-precise assertions.
2. `packages/engine/test/unit/compile-conditions.test.ts` — add missing path-level lock for non-canonical token-filter value diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:integration`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- Implemented exactly the contract-hardening scope (tests only) with no runtime/compiler behavior changes.
- `compile-pipeline` token-filter checks now assert `code + exact path` for both:
  - `CNL_COMPILER_TOKEN_FILTER_VALUE_NON_CANONICAL` at `doc.actions.0.effects.0.forEach.over.filter.args.0.value`
  - `CNL_COMPILER_TOKEN_FILTER_PROP_UNKNOWN` at `doc.actions.0.effects.0.forEach.over.filter.args.0.prop`
- Added a focused unit test in `compile-conditions` for non-canonical token trait literals that locks:
  - lowerer-level value retention plus diagnostic emission
  - lowerer-level path shape `...filter.args.0.value`
- Unified path encoding across lowerer and full compile for token-filter argument diagnostics: both now emit canonical dot-index paths (no bracket-index divergence).
