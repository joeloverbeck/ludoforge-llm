# 104UNIDECCON-008: Diagnostic codes, schema artifacts, golden fixtures, and full verification

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `compiler-diagnostic-codes.ts`, schema artifacts
**Deps**: `archive/tickets/104UNIDECCON-001.md`, `archive/tickets/104UNIDECCON-002.md`, `archive/tickets/104UNIDECCON-003.md`, `archive/tickets/104UNIDECCON-004.md`, `tickets/104UNIDECCON-005.md`, `tickets/104UNIDECCON-006.md`, `tickets/104UNIDECCON-007.md`, `specs/104-unified-decision-context-considerations.md`

## Problem

New diagnostic codes used by consideration compilation and scope validation must be registered in the canonical registry. Schema artifacts must be regenerated and verified idempotent. Golden fixtures must be updated. Full verification must pass.

## Assumption Reassessment (2026-04-01)

1. `compiler-diagnostic-codes.ts` — confirmed. New `CNL_COMPILER_*` codes need registration.
2. Diagnostic registry audit test forbids inline `CNL_COMPILER_*` literals — confirmed.
3. `schema:artifacts:check` validates sync — confirmed.
4. `CompileSectionResults` exhaustiveness test may need updating — confirmed.

## Architecture Check

1. All `CNL_COMPILER_*` codes registered — codebase convention.
2. Schema artifacts regenerated from Zod — automatic.
3. Full verification is the final gate.

## What to Change

### 1. Register diagnostic codes

Typical candidates:
- `CNL_COMPILER_CONSIDERATION_SCOPE_EMPTY` — empty scopes array
- `CNL_COMPILER_CONSIDERATION_SCOPE_INVALID` — unknown scope value
- `CNL_COMPILER_CONSIDERATION_SCOPE_VIOLATION` — scope-specific ref violation (error)
- `CNL_COMPILER_CONSIDERATION_SCOPE_WARNING` — dual-scope cross-context ref warning

### 2. Update `CompileSectionResults` exhaustiveness test

If library shape change affects `CompileSectionResults`, update `compiler-structured-results.test.ts`.

### 3. Regenerate schema artifacts

### 4. Update golden fixtures

Regenerate `fitl-policy-catalog.golden.json`, `texas-policy-catalog.golden.json`, `fitl-policy-summary.golden.json`, `texas-policy-summary.golden.json`.

### 5. Full verification

## Files to Touch

- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify — if needed)
- `packages/engine/schemas/GameDef.schema.json` (modify — regenerated)
- `packages/engine/test/fixtures/gamedef/*.golden.json` (modify)
- `packages/engine/test/fixtures/trace/*.golden.json` (modify)

## Out of Scope

- New feature work
- Runner or simulator changes

## Acceptance Criteria

### Tests That Must Pass

1. Diagnostic registry audit passes
2. `schema:artifacts:check` passes
3. `pnpm turbo build` succeeds
4. `pnpm turbo test` — all tests pass
5. `pnpm turbo lint` — 0 warnings
6. `pnpm turbo typecheck` passes

### Invariants

1. All `CNL_COMPILER_*` codes registered
2. Schema artifacts in sync

## Test Plan

### New/Modified Tests

1. No new test files — verification of existing tests

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts` — regenerate
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` — full verification
