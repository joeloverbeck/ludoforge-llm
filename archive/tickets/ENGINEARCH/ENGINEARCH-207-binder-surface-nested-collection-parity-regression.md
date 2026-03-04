# ENGINEARCH-207: Binder Surface Nested Collection Parity Regression Coverage

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL binder-surface registry test hardening
**Deps**: packages/engine/src/cnl/binder-surface-registry.ts, packages/engine/test/unit/binder-surface-registry.test.ts, archive/tickets/ENGINEARCH/ENGINEARCH-205-unify-binder-surface-string-traversal.md

## Problem

`rewriteBinderSurfaceStringsInNode` has explicit nested record/array regression coverage, but collection coverage is currently indirect: one mixed rewrite+collect non-effect test validates only a subset of collected output and does not lock deterministic nested paths/order across deep wrapper/array trees. That leaves a gap in proving collect/rewrite stay aligned over the same deep traversal surface.

## Assumption Reassessment (2026-03-04)

1. `binder-surface-registry` now uses a shared deep-tree traversal for both rewrite and collect paths.
2. Existing tests verify nested rewrite behavior and no-op rewrite identity.
3. Existing tests include a mixed rewrite+collect non-effect coverage case (`rewrites and collects non-effect binder referencers via canonical registry helpers`) but only assert selected fields and one collected site.
4. Mismatch: there is still no explicit nested collection parity regression that proves deterministic collect paths/order over deep wrapper+array trees and validates collect output against rewritten fixtures at those nested paths.

## Architecture Check

1. Adding deep collection parity tests hardens traversal invariants without adding complexity to runtime code.
2. This remains fully game-agnostic: only generic binder-surface traversal behavior is tested; no GameSpecDoc-specific branches are introduced.
3. Benefit over current architecture: **Yes**. Dedicated parity tests move critical traversal guarantees from implicit behavior to explicit invariants, improving long-term robustness/extensibility with zero runtime branching cost.
4. No backwards-compatibility shims or alias paths are introduced; this is strict invariant coverage.

## What to Change

### 1. Add nested collection parity regression test

Add a unit test that builds a nested record/array structure with binder-surface string sites under wrapper nodes and asserts deterministic collected paths/values (not only spot checks).

### 2. Add collect/rewrite parity assertion in the same fixture

Use the same fixture to run rewrite then collect, and assert collected values/path targets reflect rewritten results in expected nested locations and ordering.

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

## Outcome

- **Completion date**: 2026-03-04
- **What actually changed**:
  - Reassessed and corrected ticket assumptions/scope to reflect existing partial mixed collect+rewrite coverage and the remaining gap (deterministic deep nested collect parity coverage).
  - Added nested collection parity regression coverage in `packages/engine/test/unit/binder-surface-registry.test.ts` that asserts exact deterministic nested paths and values.
  - Added explicit collect/rewrite parity assertion on the same deep fixture by rewriting and re-collecting while preserving path targets/order.
- **Deviations from original plan**:
  - No runtime/architecture code changes were needed; the existing shared traversal architecture was already appropriate. The implementation remained test hardening only.
  - `pnpm turbo test` initially failed due a stale dist lock (`/tmp/ludoforge-engine-dist-locks/.../.dist-lock`) and passed after stale lock cleanup and rerun.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/binder-surface-registry.test.ts` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo test` ✅
