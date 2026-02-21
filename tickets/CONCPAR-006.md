# CONCPAR-006: Conceal AST schema coverage hardening

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — tests (AST schema contract)
**Deps**: CONCPAR-001

## Problem

`conceal.from` and `conceal.filter` were added to AST/schema contracts, but schema-focused tests do not explicitly exercise the conceal variants the way reveal is exercised. This leaves a regression gap for parser/schema contract drift.

## Assumption Reassessment (2026-02-21)

1. `schemas-ast.ts` now accepts `conceal: { zone, from?, filter? }`.
2. `schemas-ast` tests include reveal samples but no explicit conceal-with-from/filter positive/negative cases.
3. This gap is not addressed by CONCPAR-002/003/004 (compiler/runtime/trace scope).

## Architecture Check

1. For a robust game-agnostic GameSpecDoc pipeline, AST schema tests must cover each effect’s full declared surface.
2. This change improves contract confidence without coupling to any game-specific content.
3. No compatibility aliases; tests assert the canonical current contract only.

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

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — add conceal positive/negative contract tests.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "schemas-ast|conceal"`
2. `pnpm turbo typecheck && pnpm turbo test`
