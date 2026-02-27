# ENGINEARCH-108: Query Runtime-Shape Inference Coverage Hardening

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel unit-test surface hardening for query-shape inference
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

`inferQueryRuntimeShapes` now delegates leaf classification through shared query contracts, but current unit tests only assert a narrow nested case. That leaves room for delegation/propagation regressions in the public runtime-shape API without immediate detection.

## Assumption Reassessment (2026-02-27)

1. `packages/engine/src/kernel/query-shape-inference.ts` performs recursion for `concat`/`nextInOrderByCondition` and leaf resolution via shared contract helper.
2. `packages/engine/test/unit/query-shape-inference.test.ts` currently contains three tests, but only one runtime-shape test (`concat(players,enums,players)`); the other two tests cover value-shape inference and source/anchor compatibility.
3. `packages/engine/test/unit/kernel/query-runtime-shapes.test.ts` already has exhaustive leaf + recursion coverage for the set-based helper in `query-runtime-shapes.ts`.
4. Mismatch: set-based coverage is strong, but array-based public inference used by validation (`query-shape-inference.ts`) is under-covered. Corrected scope is to harden that API's leaf coverage plus array-order/dedup propagation behavior.

## Architecture Check

1. Runtime-shape logic currently exists in both `query-runtime-shapes.ts` (set return) and `query-shape-inference.ts` (array return). This duplication is acceptable short-term but should stay contract-locked by tests where each API is consumed.
2. Expanding tests on `query-shape-inference.ts` is beneficial because validators consume this array API and depend on deterministic propagation/dedup behavior that set-based tests do not assert.
3. Tests remain game-agnostic and validate generic query contracts, with no game-specific GameSpecDoc content embedded in kernel expectations.
4. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Expand array-API leaf runtime-shape coverage

Add table-driven tests that assert `inferQueryRuntimeShapes` outputs for every leaf `OptionsQuery` variant in the array-returning API.

### 2. Expand recursive propagation + dedup/order coverage

Add explicit tests for `nextInOrderByCondition` and mixed/nested `concat` compositions to ensure shape propagation plus first-seen-order dedup behavior remain stable.

## Files to Touch

- `packages/engine/test/unit/query-shape-inference.test.ts` (modify)

## Out of Scope

- Changes to query semantics or query schemas.
- Compiler-domain diagnostics changes (covered by separate tickets).

## Acceptance Criteria

### Tests That Must Pass

1. `inferQueryRuntimeShapes` has explicit assertions for each current leaf query kind.
2. Recursive query composition and first-seen-order dedup behavior are covered by deterministic unit tests.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Runtime-shape inference remains a game-agnostic kernel contract.
2. Query contract coverage does not introduce game-specific branching or presentation concerns.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/query-shape-inference.test.ts` — add per-variant runtime-shape matrix assertions.
2. `packages/engine/test/unit/query-shape-inference.test.ts` — add recursion/propagation assertions for `concat` and `nextInOrderByCondition`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit`
2. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion Date**: 2026-02-27
- **What Changed**:
  - Reassessed ticket assumptions against live code/tests and corrected scope to target array-based `query-shape-inference.ts` coverage (not helper/set coverage already handled in `query-runtime-shapes.test.ts`).
  - Expanded `packages/engine/test/unit/query-shape-inference.test.ts` with:
    - explicit leaf-variant runtime-shape matrix coverage for all non-recursive `OptionsQuery` kinds
    - recursive propagation coverage including `nextInOrderByCondition` and nested `concat`
    - deterministic first-seen-order dedup assertion for the array API
- **Deviations From Original Plan**:
  - Original assumptions stated only one test existed in `query-shape-inference.test.ts`; corrected to reflect three tests with one runtime-shape test.
  - Scope was refined to avoid duplicating already-exhaustive set-based coverage in `query-runtime-shapes.test.ts`.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `pnpm -F @ludoforge/engine test:unit` ✅
  - `pnpm -F @ludoforge/engine test` ✅
