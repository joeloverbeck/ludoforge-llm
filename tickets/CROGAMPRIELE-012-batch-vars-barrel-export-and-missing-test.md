# CROGAMPRIELE-012: Batch vars barrel export and missing test coverage

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — barrel export, unit test
**Deps**: archive/tickets/CROGAMPRIELE/CROGAMPRIELE-003-batch-variable-declarations.md

## Problem

CROGAMPRIELE-003 delivered `expand-batch-vars.ts` but missed two items:

1. **Missing barrel export**: `expand-batch-markers.ts` and `expand-piece-generation.ts` are exported from `packages/engine/src/cnl/index.ts`. The new `expand-batch-vars.ts` is not. This breaks the established convention and will block CROGAMPRIELE-008 if it imports via the barrel.

2. **Missing test for `CNL_COMPILER_BATCH_VAR_INVALID_TYPE`**: The diagnostic code is defined and implemented (line 58-66 of `expand-batch-vars.ts`) but has no test. While TypeScript constrains `batch.type` to `'int' | 'boolean'` at compile time, `GameSpecDoc` is parsed from YAML with `as` casts, so invalid runtime values are reachable. The `expand-batch-markers` test suite covers all its diagnostic codes — this file should too.

## Assumption Reassessment (2026-03-01)

1. `cnl/index.ts` currently exports `expand-batch-markers.js` (line 4) and `expand-piece-generation.js` (line 5). `expand-batch-vars.js` is absent.
2. `CNL_COMPILER_BATCH_VAR_INVALID_TYPE` is defined in `compiler-diagnostic-codes.ts` and used in `expand-batch-vars.ts:58-66`, but no test in `expand-batch-vars.test.ts` exercises this path.
3. `GameSpecBatchVarDef.batch.type` is typed as `'int' | 'boolean'` but YAML parsing produces `unknown` values cast via `as`, so runtime mismatches are possible.

## Architecture Check

1. All other expansion modules are barrel-exported — consistency is the clearest pattern.
2. Every implemented diagnostic code should have a corresponding test — untested error paths are invisible regressions waiting to happen.
3. No game-specific or backwards-compatibility concerns — this is purely a hygiene fix.

## What to Change

### 1. Add barrel export in `cnl/index.ts`

Add `export * from './expand-batch-vars.js';` alongside the existing expansion module exports.

### 2. Add test for invalid batch type

Add a test case that constructs a `GameSpecBatchVarDef` with an invalid `type` value (e.g., `'string'` cast via `as unknown as 'int' | 'boolean'`) and asserts the `CNL_COMPILER_BATCH_VAR_INVALID_TYPE` diagnostic is emitted.

## Files to Touch

- `packages/engine/src/cnl/index.ts` (modify — add barrel export)
- `packages/engine/test/unit/expand-batch-vars.test.ts` (modify — add test case)

## Out of Scope

- Wiring into compiler pipeline (CROGAMPRIELE-008)
- Validator batch-awareness (CROGAMPRIELE-013)
- Any other expansion passes

## Acceptance Criteria

### Tests That Must Pass

1. New test: batch entry with invalid `type` emits `CNL_COMPILER_BATCH_VAR_INVALID_TYPE` diagnostic.
2. `expandBatchVars` is importable from `@ludoforge/engine` barrel path.
3. Existing suite: `pnpm turbo test`

### Invariants

1. All diagnostic codes defined in `COMPILER_DIAGNOSTIC_CODES_BATCH_VARS` have at least one corresponding test.
2. All expansion modules in `cnl/` are exported from `cnl/index.ts`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-batch-vars.test.ts` — add test 13: invalid `batch.type` produces `CNL_COMPILER_BATCH_VAR_INVALID_TYPE`. Rationale: closes the untested diagnostic code gap.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/expand-batch-vars.test.js`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
