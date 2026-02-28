# ENGINEARCH-111: Unify Query Runtime-Shape Inference Surface

**Status**: COMPLETED (2026-02-28)
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel inference API consolidation and consumer alignment
**Deps**: specs/51-cross-game-primitive-elevation.md, tickets/ENGINEARCH-109-shared-options-query-recursion-walker.md

## Problem

Runtime-shape inference currently has two exported surfaces (`query-shape-inference.ts` and `query-runtime-shapes.ts`) with overlapping intent and different return forms (array vs set). Even though one currently delegates to the other, this split keeps two public kernel modules and duplicate test matrices alive, increasing maintenance and drift risk.

## Assumption Reassessment (2026-02-28)

1. `query-shape-inference.ts` exports `inferQueryRuntimeShapes` (array form) and is consumed by validator behavior checks and the choice-options runtime-shape contract.
2. `query-runtime-shapes.ts` exports a set-form inferencer and is currently only consumed by `query-shape-inference.ts` and inferencer-focused tests.
3. `compile-effects.ts` does not directly call runtime-shape inference; it consumes `createChoiceOptionsRuntimeShapeDiagnostic` from `choice-options-runtime-shape-contract.ts`.
4. Corrected scope: remove the secondary inferencer module and keep one canonical inferencer API in `query-shape-inference.ts`; keep consumer behavior unchanged.

## Architecture Check

1. A single inference surface in kernel is cleaner and more extensible than split modules with format adapters.
2. Consolidation remains game-agnostic and purely about generic `OptionsQuery` traversal and leaf contracts.
3. No compatibility aliasing/shims; internal callers and tests should rely only on the canonical module.

## What to Change

### 1. Define canonical runtime-shape inferencer

Use `query-shape-inference.ts` as canonical and inline runtime-shape inference there, reusing shared query recursion traversal.

### 2. Remove duplicate surface

Delete `query-runtime-shapes.ts` and migrate all imports/tests to `query-shape-inference.ts`.

### 3. Consolidate tests

Keep one authoritative runtime-shape matrix suite in `query-shape-inference.test.ts`; remove duplicate inferencer-only test scaffolding.

## Files to Touch

- `packages/engine/src/kernel/query-shape-inference.ts` (modify)
- `packages/engine/src/kernel/query-runtime-shapes.ts` (delete)
- `packages/engine/test/unit/query-shape-inference.test.ts` (modify)
- `packages/engine/test/unit/kernel/query-runtime-shapes.test.ts` (delete)

## Out of Scope

- Query semantics changes.
- Effect runtime behavior changes outside contract inference usage.
- Refactoring `compile-effects.ts` unless required by import fallout.

## Acceptance Criteria

### Tests That Must Pass

1. Only one canonical query runtime-shape inferencer remains in kernel.
2. Validator and choice-options contract consumers use that canonical inferencer.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Runtime-shape inference remains deterministic and game-agnostic.
2. Recursive query handling semantics are centralized and non-duplicated.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/query-shape-inference.test.ts` — authoritative leaf + recursive propagation coverage for canonical inferencer.
2. `packages/engine/test/unit/kernel/choice-options-runtime-shape-contract.test.ts` — contract-level regression guard for compile/validator diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/query-shape-inference.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-contract.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- Removed duplicate inference surface by deleting `packages/engine/src/kernel/query-runtime-shapes.ts` and inlining runtime-shape inference into canonical `query-shape-inference.ts`.
- Consolidated inference tests under `query-shape-inference.test.ts` and removed duplicate inferencer-only suite (`packages/engine/test/unit/kernel/query-runtime-shapes.test.ts`).
- No `compile-effects.ts` changes were required after reassessment because it already consumes the shared choice-options runtime-shape contract rather than direct inferencer APIs.
