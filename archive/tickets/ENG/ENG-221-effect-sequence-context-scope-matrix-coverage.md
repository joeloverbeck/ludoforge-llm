# ENG-221: Expand Effect Sequence-Context Scope Matrix Coverage

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture regression coverage for effect scope propagation
**Deps**: packages/engine/src/kernel/effect-sequence-context-scope.ts, packages/engine/src/kernel/effect-grant-sequence-context-paths.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts, archive/tickets/ENG/ENG-219-reject-nested-sequence-context-grants-in-evaluate-subset-compute.md

## Problem

`effect-sequence-context-scope.ts` is now the shared policy that drives both validator scope propagation and sequence-context linkage traversal. The remaining gap is narrower than originally assumed: validator coverage already exercises the `evaluateSubset.compute` rejection and `evaluateSubset.in` acceptance paths in `packages/engine/test/unit/validate-gamedef.test.ts`, but the focused helper-level suite in `effect-sequence-context-scope.test.ts` still only pins `evaluateSubset`. The helper also governs `if`, `let`, `forEach`, `reduce`, `removeByPriority`, and `rollRandom`. Without direct helper/traversal coverage for each shape, future control-flow changes can silently alter game-agnostic scope semantics while still leaving the validator suite partially green.

## Assumption Reassessment (2026-03-09)

1. Current code centralizes nested effect scope propagation in `packages/engine/src/kernel/effect-sequence-context-scope.ts`.
2. Current focused helper tests in `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` cover `evaluateSubset.compute` and `evaluateSubset.in`, but do not directly assert expected scope behavior for the other nested effect forms routed through the same helper.
3. Existing validator tests in `packages/engine/test/unit/validate-gamedef.test.ts` already cover the non-persistent `evaluateSubset.compute` rejection and persistent `evaluateSubset.in` acceptance paths.
4. Mismatch: the architecture moved to a shared policy, but the helper-focused regression suite still validates only one branch family. Correction: add a compact matrix that covers every nested effect form owned by the helper, and keep validator changes out of scope unless the new helper tests expose a bug.

## Architecture Check

1. A shared policy helper is only as robust as its regression surface; direct per-node coverage is cleaner than relying on indirect downstream failures.
2. The present architecture is still better than duplicating per-consumer scope logic: one shared policy plus consumer-specific traversal semantics is the cleanest extensible shape here, provided the regression surface covers every helper-owned effect form.
3. This stays fully game-agnostic: the tests exercise generic `EffectAST` control-flow semantics and do not encode any game-specific `GameSpecDoc` data or visual concerns.
4. No compatibility aliasing or shims are needed; the tests should lock the canonical behavior exactly as implemented.

## What to Change

### 1. Add a scope-matrix regression suite

Extend `effect-sequence-context-scope.test.ts` with table-driven cases that cover all nested effect forms owned by `getNestedEffectSequenceContextScopes`.

### 2. Assert helper and traversal behavior where it is not already covered elsewhere

For each nested effect form, pin both:

- the child scope descriptors returned by `getNestedEffectSequenceContextScopes`
- the linkage traversal behavior where applicable, so persistent descendants remain visible and non-persistent descendants stay excluded

Do not duplicate existing `validate-gamedef.test.ts` assertions unless the new matrix exposes a validator bug.

## Files to Touch

- `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` (modify)
- `packages/engine/src/kernel/effect-sequence-context-scope.ts` (modify only if the test matrix exposes a real bug)
- `packages/engine/src/kernel/effect-grant-sequence-context-paths.ts` (modify only if the test matrix exposes a real bug)

## Out of Scope

- Changing sequence-context semantics
- Refactoring consumer architecture beyond what tests require
- Duplicating existing validator coverage just to mirror helper-level assertions
- Any `GameSpecDoc`, data asset, or `visual-config.yaml` changes

## Acceptance Criteria

### Tests That Must Pass

1. Every nested effect form routed through `getNestedEffectSequenceContextScopes` has direct regression coverage.
2. The regression suite fails if any future edit changes child path/scope propagation or persistence semantics for those forms.
3. Existing validator coverage in `packages/engine/test/unit/validate-gamedef.test.ts` remains intact.
4. Existing suite: `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`

### Invariants

1. Shared effect-scope policy remains the canonical source of nested sequence-context persistence semantics.
2. Coverage remains game-agnostic and does not introduce any per-game assumptions into kernel tests.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` — add table-driven coverage for `if`, `let`, `forEach`, `reduce`, `removeByPriority`, `evaluateSubset`, and `rollRandom`.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — no planned edits; existing `evaluateSubset` validator coverage is part of the assumption baseline unless new helper tests expose a real validator defect.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-09
- What actually changed: corrected the ticket assumptions to reflect that `packages/engine/test/unit/validate-gamedef.test.ts` already covered the `evaluateSubset.compute` rejection and `evaluateSubset.in` acceptance paths; expanded `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` into a helper/traversal matrix that directly covers `if`, `let`, `forEach`, `reduce`, `removeByPriority`, `evaluateSubset`, and `rollRandom`, plus optional-child omission cases.
- Deviations from original plan: no engine source changes were needed, and no validator test changes were needed because the stronger helper-level matrix closed the actual gap without duplicating existing coverage.
- Verification results: `pnpm -F @ludoforge/engine build`, `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`, `pnpm -F @ludoforge/engine test`, and `pnpm -F @ludoforge/engine lint` all passed.
