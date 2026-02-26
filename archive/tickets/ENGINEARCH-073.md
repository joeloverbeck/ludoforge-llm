# ENGINEARCH-073: Add dedicated tests for kernel AST export-contract helper behavior

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test-helper contract coverage for kernel architecture guards
**Deps**: ENGINEARCH-072

## Problem

`kernel-source-ast-guard.ts` now provides reusable AST helpers used by architecture guards, but helper behavior itself is not directly contract-tested for export-shape edge cases. Without helper-focused tests, regressions in helper semantics can silently weaken multiple architecture guards.

## Assumption Reassessment (2026-02-26)

1. Kernel architecture guards import `parseTypeScriptSource` and related helpers from `packages/engine/test/helpers/kernel-source-ast-guard.ts`.
2. Export-surface analysis helper logic is shared and is a dependency for API-boundary guard tests (for example `scoped-var-write-surface-guard`).
3. There is already a dedicated helper test file at `packages/engine/test/unit/kernel-source-ast-guard.test.ts`, including coverage for wildcard/default/export-assignment detection.
4. **Mismatch + correction**: scope is not “create first helper test file”; scope is “close remaining helper-contract edge-case gaps” (especially aliased re-export semantics, default declaration forms, and mixed-export source surfaces).

## Architecture Check

1. Testing helper contracts directly is cleaner and more extensible than relying only on indirect downstream guard tests because it localizes failures to the helper abstraction.
2. This is game-agnostic test infrastructure work and does not introduce any game-specific logic into GameDef/kernel/runtime/simulator.
3. No backwards-compatibility aliasing/shims should be introduced.

## What to Change

### 1. Add helper-focused unit tests

Extend existing dedicated helper tests in `packages/engine/test/unit/kernel-source-ast-guard.test.ts` with synthetic TS snippets that verify expected export metadata behavior.

### 2. Cover edge-case export shapes explicitly

Add assertions for at least:
- direct named exports
- aliased named re-exports
- wildcard re-exports (`export * from ...`)
- default export declaration/assignment forms
- mixed-export source files

## Files to Touch

- `packages/engine/test/unit/kernel-source-ast-guard.test.ts` (modify; broaden contract coverage)
- `packages/engine/test/helpers/kernel-source-ast-guard.ts` (modify only if helper API needs minor testability adjustments)

## Out of Scope

- Scoped-var runtime behavior changes
- Compiler/runtime game semantics
- GameSpecDoc/GameDef schema changes

## Acceptance Criteria

### Tests That Must Pass

1. Helper tests fail when export-shape handling regresses for wildcard/default/aliased forms.
2. Helper tests document expected export-surface contract behavior for architecture guards.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Shared AST helper behavior remains explicit and regression-tested.
2. Architecture guards depending on shared helper logic retain reliable failure semantics.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel-source-ast-guard.test.ts` — direct helper contract tests across export-shape edge cases.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel-source-ast-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-26
- **What changed**:
  - Reassessed and corrected ticket assumptions to match repository reality (existing helper test file already present; scope narrowed to coverage gaps).
  - Extended `packages/engine/test/unit/kernel-source-ast-guard.test.ts` with helper-contract cases for aliased re-exports, default export declaration forms, and mixed export-surface metadata.
- **Deviations from original plan**:
  - Did not create `packages/engine/test/unit/helpers/kernel-source-ast-guard.test.ts` because that assumption was incorrect; extended the existing dedicated helper test file instead.
  - No helper implementation changes were needed after reassessment; test-only hardening achieved the ticket goal.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel-source-ast-guard.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`297 passed, 0 failed`).
  - `pnpm -F @ludoforge/engine lint` passed.
