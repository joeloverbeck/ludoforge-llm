# ENGINEARCH-202: Add AST Schema Regression Coverage for `removeByPriority` Canonical Bind Fields

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — unit test coverage and schema-contract lock-in
**Deps**: packages/engine/src/kernel/schemas-ast.ts, packages/engine/test/unit/schemas-ast.test.ts, packages/engine/test/unit/validate-gamedef.test.ts

## Problem

`removeByPriority` bind fields are canonicalized in schema and validation, but there is no direct AST schema regression test proving non-canonical values are rejected at schema level.

## Assumption Reassessment (2026-03-03)

1. Current behavior-validation tests cover non-canonical `removeByPriority` bind fields and expect diagnostics.
2. Current schema tests include a canonical `removeByPriority` example only inside a broad parse smoke test, not a dedicated regression lock.
3. Current schema tests do not explicitly cover invalid non-canonical values for `removeByPriority.groups[].bind`, `.countBind`, or `.remainingBind`.
4. Mismatch: schema contract changed without dedicated schema regression lock; scope is corrected to add targeted schema tests.

## Architecture Check

1. Schema-level regression tests are a cleaner contract guard than relying only on downstream behavior validation.
2. This is fully engine-agnostic and contract-level; no game-specific logic is introduced.
3. No compatibility behavior is introduced; tests enforce strict canonical inputs only.
4. Compared to the prior architecture (implicit coverage only), explicit schema-boundary regression checks are a cleaner long-term guard because they fail at the contract source, not downstream validators.

## What to Change

### 1. Add explicit failing schema cases

In `schemas-ast` unit tests, add cases that fail when:
- `removeByPriority.groups[].bind` is non-canonical (`name` without `$`)
- `removeByPriority.groups[].countBind` is non-canonical
- `removeByPriority.remainingBind` is non-canonical

### 2. Keep explicit canonical control

Keep a positive control showing canonical `$name` bind fields validate while adding focused failing assertions.

## Files to Touch

- `packages/engine/test/unit/schemas-ast.test.ts` (modify)

## Out of Scope

- Runtime behavior changes.
- Production data migration.
- Broader binding-surface canonicalization.

## Acceptance Criteria

### Tests That Must Pass

1. `schemas-ast` tests include explicit `removeByPriority` canonical binding coverage (invalid field variants plus canonical control).
2. Existing suite: `pnpm turbo test`.

### Invariants

1. AST schema contract for `removeByPriority` bind fields remains strict `$name`.
2. No game-specific behavior changes.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-ast.test.ts` — lock schema behavior for `removeByPriority` bind/countBind/remainingBind.

### Commands

1. `pnpm turbo build`
2. `node --test "packages/engine/dist/test/unit/schemas-ast.test.js"`
3. `pnpm turbo test`

## Outcome

- Added an explicit schema regression test in `packages/engine/test/unit/schemas-ast.test.ts` that verifies:
  - canonical `removeByPriority` bind fields parse successfully
  - non-canonical `groups[].bind`, `groups[].countBind`, and `remainingBind` are rejected by AST schema validation
- No runtime/compiler/kernel production logic changed.
- Scope remained test-only and engine-agnostic as planned, with clarified assumptions about existing broad parse coverage.
