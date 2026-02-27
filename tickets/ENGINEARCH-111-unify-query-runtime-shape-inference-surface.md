# ENGINEARCH-111: Unify Query Runtime-Shape Inference Surface

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel inference API consolidation and consumer alignment
**Deps**: specs/51-cross-game-primitive-elevation.md, tickets/ENGINEARCH-109-shared-options-query-recursion-walker.md

## Problem

Runtime-shape inference currently exists in two modules (`query-shape-inference.ts` and `query-runtime-shapes.ts`) with overlapping responsibilities and different return forms (array vs set). This duplication increases drift risk for compiler/validator consumers.

## Assumption Reassessment (2026-02-27)

1. `query-shape-inference.ts` already exposes `inferQueryRuntimeShapes` and is used by validator behavior checks.
2. `query-runtime-shapes.ts` adds a second inferencer used by compile-effects contracts.
3. Mismatch: two runtime-shape inferencers can diverge semantically; corrected scope is a single canonical runtime-shape inference surface with consistent semantics.

## Architecture Check

1. Single-source inference contracts are cleaner and more extensible than parallel inferencers.
2. Consolidation stays game-agnostic and purely about generic `OptionsQuery` structure.
3. No compatibility aliasing/shims; internal callers should migrate to the canonical API.

## What to Change

### 1. Define canonical runtime-shape inferencer

Select one module as canonical (recommended: `query-shape-inference.ts`), and remove duplicate inference implementation.

### 2. Align consumers

Refactor compile-effects and validator consumers to share the same canonical inferencer and shared recursion utility (from ENGINEARCH-109 scope).

### 3. Consolidate tests

Keep one authoritative runtime-shape matrix suite and ensure all consumers rely on it; remove duplicate inferencer-only test scaffolding.

## Files to Touch

- `packages/engine/src/kernel/query-shape-inference.ts` (modify)
- `packages/engine/src/kernel/query-runtime-shapes.ts` (delete or fold into canonical module)
- `packages/engine/src/cnl/compile-effects.ts` (modify import/use sites)
- `packages/engine/test/unit/query-shape-inference.test.ts` (modify)
- `packages/engine/test/unit/kernel/query-runtime-shapes.test.ts` (modify/remove if superseded)

## Out of Scope

- Query semantics changes.
- Effect runtime behavior changes outside contract inference usage.

## Acceptance Criteria

### Tests That Must Pass

1. Only one canonical query runtime-shape inferencer remains in kernel.
2. Compile and validator consumers use that canonical inferencer.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Runtime-shape inference remains deterministic and game-agnostic.
2. Recursive query handling semantics are centralized and non-duplicated.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/query-shape-inference.test.ts` — exhaustive leaf + recursive propagation coverage for canonical inferencer.
2. `packages/engine/test/unit/compile-effects.test.ts` — verify choice-option contract behavior still holds via canonical inferencer.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/query-shape-inference.test.js`
3. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
