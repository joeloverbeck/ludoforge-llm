# ENGINEARCH-207: Binder Surface Nested Collection Parity Regression Coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL binder-surface registry test hardening
**Deps**: packages/engine/src/cnl/binder-surface-registry.ts, packages/engine/test/unit/binder-surface-registry.test.ts, archive/tickets/ENGINEARCH/ENGINEARCH-205-unify-binder-surface-string-traversal.md

## Problem

`rewriteBinderSurfaceStringsInNode` now has explicit nested record/array regression coverage, but `collectBinderSurfaceStringSites` does not yet have an equivalent deep-tree parity regression. That leaves a gap in proving collect/rewrite stay aligned across nested wrappers and array entries.

## Assumption Reassessment (2026-03-04)

1. `binder-surface-registry` now uses a shared deep-tree traversal for both rewrite and collect paths.
2. Existing tests verify nested rewrite behavior and no-op rewrite identity.
3. Mismatch: no explicit nested collection parity test currently proves that collection traverses the same deep structures and path formatting shapes as rewrite.

## Architecture Check

1. Adding deep collection parity tests hardens traversal invariants without adding complexity to runtime code.
2. This remains fully game-agnostic: only generic binder-surface traversal behavior is tested; no GameSpecDoc-specific branches are introduced.
3. No backwards-compatibility shims or alias paths are introduced; this is strict invariant coverage.

## What to Change

### 1. Add nested collection parity regression test

Add a unit test that builds a nested record/array structure with binder-surface string sites under wrapper nodes and asserts deterministic collected paths/values.

### 2. Add collect/rewrite parity assertion in the same fixture

Use the same fixture to run rewrite then collect, and assert collected values/path targets reflect rewritten results in expected nested locations.

## Files to Touch

- `packages/engine/test/unit/binder-surface-registry.test.ts` (modify)

## Out of Scope

- Binder-surface policy changes.
- Contract path semantics changes.
- Macro hygiene diagnostics changes.

## Acceptance Criteria

### Tests That Must Pass

1. Nested record/array collection regression test passes and asserts deterministic path formatting.
2. Collect/rewrite parity assertion passes for the shared fixture.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Collect and rewrite traversal cover the same nested object/array search space.
2. String-site path formatting remains deterministic under nested wrappers and arrays.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/binder-surface-registry.test.ts` — add nested collection parity regression and collect/rewrite parity assertion.

### Commands

1. `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/binder-surface-registry.test.ts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test`
