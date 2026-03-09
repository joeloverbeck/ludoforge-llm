# ENG-221: Expand Effect Sequence-Context Scope Matrix Coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture regression coverage for effect scope propagation
**Deps**: packages/engine/src/kernel/effect-sequence-context-scope.ts, packages/engine/src/kernel/effect-grant-sequence-context-paths.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts, archive/tickets/ENG/ENG-219-reject-nested-sequence-context-grants-in-evaluate-subset-compute.md

## Problem

`effect-sequence-context-scope.ts` is now the shared policy that drives both validator scope propagation and sequence-context linkage traversal, but current focused tests only pin `evaluateSubset`. The helper also governs `if`, `let`, `forEach`, `reduce`, `removeByPriority`, and `rollRandom`. Without direct coverage for each shape, future control-flow changes can silently alter game-agnostic scope semantics in both consumers at once.

## Assumption Reassessment (2026-03-09)

1. Current code centralizes nested effect scope propagation in `packages/engine/src/kernel/effect-sequence-context-scope.ts`.
2. Current focused tests cover `evaluateSubset.compute` and `evaluateSubset.in`, but do not directly assert expected scope behavior for the other nested effect forms routed through the same helper.
3. Mismatch: the architecture moved to a shared policy, but the regression suite still validates only one branch family. Correction: add a compact matrix that covers every nested effect form owned by the helper.

## Architecture Check

1. A shared policy helper is only as robust as its regression surface; direct per-node coverage is cleaner than relying on indirect downstream failures.
2. This stays fully game-agnostic: the tests exercise generic `EffectAST` control-flow semantics and do not encode any game-specific `GameSpecDoc` data or visual concerns.
3. No compatibility aliasing or shims are needed; the tests should lock the canonical behavior exactly as implemented.

## What to Change

### 1. Add a scope-matrix regression suite

Extend `effect-sequence-context-scope.test.ts` with table-driven cases that cover all nested effect forms owned by `getNestedEffectSequenceContextScopes`.

### 2. Assert both helper and consumer behavior

For each nested effect form, pin both:

- the child scope descriptors returned by `getNestedEffectSequenceContextScopes`
- the linkage traversal behavior where applicable, so persistent descendants remain visible and non-persistent descendants stay excluded

## Files to Touch

- `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` (modify)
- `packages/engine/src/kernel/effect-sequence-context-scope.ts` (modify only if the test matrix exposes a real bug)

## Out of Scope

- Changing sequence-context semantics
- Refactoring consumer architecture beyond what tests require
- Any `GameSpecDoc`, data asset, or `visual-config.yaml` changes

## Acceptance Criteria

### Tests That Must Pass

1. Every nested effect form routed through `getNestedEffectSequenceContextScopes` has direct regression coverage.
2. The regression suite fails if any future edit changes child path/scope propagation or persistence semantics for those forms.
3. Existing suite: `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`

### Invariants

1. Shared effect-scope policy remains the canonical source of nested sequence-context persistence semantics.
2. Coverage remains game-agnostic and does not introduce any per-game assumptions into kernel tests.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` — add table-driven coverage for `if`, `let`, `forEach`, `reduce`, `removeByPriority`, `evaluateSubset`, and `rollRandom`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`
3. `pnpm -F @ludoforge/engine test`
