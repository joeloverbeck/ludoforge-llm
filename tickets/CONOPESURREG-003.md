# CONOPESURREG-003: Replace SUPPORTED_CONDITION_OPS in compile-conditions.ts with import from metadata module

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL compiler change
**Deps**: CONOPESURREG-001, CONOPESURREG-002

## Problem

`compile-conditions.ts` (line ~86) maintains its own `SUPPORTED_CONDITION_OPS` array, duplicating the canonical operator identity already captured in the `ConditionAST` union. After CONOPESURREG-001 establishes a single source of truth, this duplicate list must be removed and replaced with an import.

## Assumption Reassessment (2026-03-14)

1. `SUPPORTED_CONDITION_OPS` is defined at line ~86 of `compile-conditions.ts` as: `['and', 'or', 'not', '==', '!=', '<', '<=', '>', '>=', 'in', 'adjacent', 'connected', 'zonePropIncludes', 'markerStateAllowed', 'markerShiftAllowed']`.
2. It is used at line ~330 in a `missingCapability()` diagnostic call within the `default` branch of a switch, providing the user a list of supported operators when an unknown operator is encountered.
3. The switch statement itself (CNL lowering logic) is NOT being changed — only the source of the operator list for diagnostics changes.
4. The `CONDITION_OPERATORS` tuple from the metadata module contains the same operator strings. The import will be `CONDITION_OPERATORS` or `isConditionOperator`, depending on usage.

## Architecture Check

1. This is a single-line import swap + deletion of the local constant. Minimal diff, minimal risk.
2. The CNL module importing from `kernel/` follows the existing dependency direction (CNL already imports kernel types).
3. No shims, no re-exports, no backwards-compatibility aliases.

## What to Change

### 1. Remove `SUPPORTED_CONDITION_OPS` declaration

Delete the local `const SUPPORTED_CONDITION_OPS = [...]` array from `compile-conditions.ts`.

### 2. Add import from metadata module

Import `CONDITION_OPERATORS` (or `isConditionOperator` if the usage site benefits from a type guard) from `packages/engine/src/kernel/condition-operator-meta.ts`.

### 3. Update the diagnostic call site

Replace the reference to `SUPPORTED_CONDITION_OPS` in the `missingCapability()` call with `CONDITION_OPERATORS`. If the usage expects a mutable array, spread into a new array: `[...CONDITION_OPERATORS]`.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)

## Out of Scope

- Modifying the CNL lowering switch statement logic itself
- Modifying any other CNL files
- Modifying `types-ast.ts` or the `ConditionAST` union
- Modifying any kernel switch-based dispatch files (`eval-condition.ts`, `ast-to-display.ts`, etc.)
- Modifying `zone-selector-aliases.ts` or `validate-conditions.ts` (those are separate tickets)

## Acceptance Criteria

### Tests That Must Pass

1. `grep -r 'SUPPORTED_CONDITION_OPS' packages/engine/src/` returns zero matches — no independent operator identity list remains in source.
2. Compiling a spec with an unsupported condition operator still produces the correct diagnostic message listing available operators.
3. Existing CNL compilation tests pass unchanged.
4. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions.
5. `pnpm turbo typecheck` passes.
6. `pnpm turbo lint` passes.

### Invariants

1. CNL lowering switch logic is unchanged — same cases, same lowering behavior.
2. Diagnostic messages remain user-facing and helpful (still list available operators).
3. `ConditionAST` union unchanged.
4. No circular dependency introduced (`cnl/` importing from `kernel/` is the existing direction).

## Test Plan

### New/Modified Tests

1. No new test file needed. Existing CNL compilation tests cover the diagnostic path. If no existing test exercises the "unsupported operator" diagnostic, add one test case in the existing `compile-conditions` test file.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo lint`
