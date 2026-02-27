# ENGINEARCH-108: Query Runtime-Shape Inference Coverage Hardening

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel unit-test surface hardening for query-shape inference
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

`inferQueryRuntimeShapes` now delegates leaf classification through shared query contracts, but current unit tests only assert a narrow nested case. That leaves room for delegation/propagation regressions in the public runtime-shape API without immediate detection.

## Assumption Reassessment (2026-02-27)

1. `packages/engine/src/kernel/query-shape-inference.ts` performs recursion for `concat`/`nextInOrderByCondition` and leaf resolution via shared contract helper.
2. `packages/engine/test/unit/query-shape-inference.test.ts` currently validates only one nested `concat(players,enums,players)` runtime-shape scenario.
3. Mismatch: architecture now has stronger shared contracts than test coverage; corrected scope is test-surface expansion for the public runtime-shape inference function.

## Architecture Check

1. Exhaustive runtime-shape tests on the public inferencer are cleaner than relying only on helper-level tests because they lock integration behavior where consumers attach.
2. Tests remain game-agnostic and validate generic query contracts, with no game-specific GameSpecDoc content embedded in kernel expectations.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Expand leaf-variant runtime-shape coverage

Add table-driven tests that assert `inferQueryRuntimeShapes` outputs for every leaf `OptionsQuery` variant.

### 2. Expand recursive propagation coverage

Add explicit tests for `nextInOrderByCondition` and mixed `concat` compositions to ensure shape propagation and dedup behavior remain stable.

## Files to Touch

- `packages/engine/test/unit/query-shape-inference.test.ts` (modify)

## Out of Scope

- Changes to query semantics or query schemas.
- Compiler-domain diagnostics changes (covered by separate tickets).

## Acceptance Criteria

### Tests That Must Pass

1. `inferQueryRuntimeShapes` has explicit assertions for each current leaf query kind.
2. Recursive query composition and dedup behavior are covered by deterministic unit tests.
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
