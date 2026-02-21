# CONCPAR-006: Conceal AST schema coverage hardening

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — tests (AST schema contract)
**Deps**: CONCPAR-001

## Problem

`conceal.from` and `conceal.filter` were added to AST/schema contracts, but schema-focused tests do not explicitly exercise the conceal variants the way reveal is exercised. This leaves a regression gap for parser/schema contract drift.

## Assumption Reassessment (2026-02-21)

1. `schemas-ast.ts` now accepts `conceal: { zone, from?, filter? }`.
2. `packages/engine/test/unit/schemas-ast.test.ts` currently has reveal examples but **no explicit conceal examples at all** (neither base `conceal: { zone }` nor `from`/`filter` variants).
3. Existing negative schema checks do not currently exercise conceal-specific rejection paths (invalid `from`, invalid `filter` item shape, strict unknown-key rejection under `conceal`).
4. This gap is not addressed by CONCPAR-002/003/004, which target compiler/runtime/trace behavior rather than AST schema contract coverage.

## Architecture Check

1. For a robust game-agnostic GameSpecDoc pipeline, AST schema tests must cover each effect’s full declared surface.
2. Extending existing `schemas-ast` contract tests is the cleanest architecture fit: no runtime/compiler coupling and no game-specific branching.
3. No compatibility aliases; tests assert only the canonical current AST shape.

## What to Change

### 1. Add positive conceal schema cases

In `schemas-ast` tests, add accepted examples for:
- `conceal: { zone }`
- `conceal: { zone, from: 'all' }`
- `conceal: { zone, from: { id: ... } }`
- `conceal: { zone, from: { chosen: ... } }`
- `conceal: { zone, filter: [...] }`

### 2. Add negative conceal schema cases

Add rejected cases for:
- invalid `from` object shape
- invalid filter predicate op/value shape
- unknown extra keys under `conceal` (strictness)

### 3. Keep architecture surface stable

- Do not introduce schema aliases or compatibility branches.
- Keep all coverage inside `schemas-ast.test.ts` (contract test layer only).

## Files to Touch

- `packages/engine/test/unit/schemas-ast.test.ts` (modify)

## Out of Scope

- Compiler lowering of conceal fields — CONCPAR-002
- Runtime selective conceal execution — CONCPAR-003
- Trace model changes — CONCPAR-004

## Acceptance Criteria

### Tests That Must Pass

1. Conceal positive schema examples parse successfully.
2. Conceal negative schema examples fail with expected diagnostics/assertions.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Conceal schema coverage matches declared AST contract (`zone`, optional `from`, optional `filter`).
2. Strict object policy remains enforced for conceal payloads.
3. Contract tests stay engine-agnostic (no game-specific fixtures or behaviors).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — add explicit conceal positive contract tests (base + `from` + `filter`).
2. `packages/engine/test/unit/schemas-ast.test.ts` — add explicit conceal negative contract tests (`from` shape, `filter` shape/op/value, strict extra keys).

### Commands

1. `pnpm -F @ludoforge/engine exec node --test --test-name-pattern "schemas-ast|conceal" "dist/test/unit/**/*.test.js" "dist/test/integration/**/*.test.js"`
2. `pnpm turbo typecheck && pnpm turbo test`

## Outcome

- Completion date: 2026-02-21
- What changed:
  - Added explicit positive `conceal` AST schema tests for base payload and optional `from`/`filter` variants.
  - Added explicit negative `conceal` AST schema tests for malformed `from`, malformed `filter` predicate shape/op/value, and strict unknown-key rejection.
  - Corrected ticket assumptions to match current repository reality before implementation.
- Deviations from original plan:
  - No scope expansion beyond contract tests; only clarified assumptions/scope text first.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine exec node --test --test-name-pattern "schemas-ast|conceal" "dist/test/unit/**/*.test.js" "dist/test/integration/**/*.test.js"` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.
