# ENGINEARCH-012: Replace Deferrable Selector Heuristic with Structured Runtime Error Context

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel eval error context/policy + tests
**Deps**: ENGINEARCH-011

## Problem

Current deferral policy for selector cardinality relies on a string heuristic (`selector.startsWith('$') && resolvedCount === 0`). This is brittle, hard to audit, and can misclassify future selector forms as deferrable or non-deferrable.

## Assumption Reassessment (2026-02-25)

1. `shouldDeferMissingBinding` now recognizes a subset of `SELECTOR_CARDINALITY` errors using selector-string introspection.
2. `SELECTOR_CARDINALITY` `EvalError`s are currently emitted by selector resolution (`resolve-selectors`) and include ad hoc context (`selector`, `resolvedCount`, plus resolved payload fields).
3. There is no explicit, typed error-context field that states whether an error is unresolved-binding-derived and safe to defer.

## Architecture Check

1. A structured error-context contract is cleaner than ad hoc string checks and scales to new selector forms without policy fragility.
2. The design remains game-agnostic: classification is derived from runtime semantics, not game identifiers.
3. No backwards-compatibility aliases/shims are added; policy behavior becomes explicit and testable.

## What to Change

### 1. Introduce structured deferral metadata for relevant eval/runtime errors

Add explicit context field(s) (for example, a `deferClass`/`origin` enum) on `SELECTOR_CARDINALITY` eval errors where selector resolution can indicate unresolved-binding-derived conditions.

### 2. Update missing-binding policy to use structured metadata

Refactor `shouldDeferMissingBinding` to consume typed context instead of selector string-prefix heuristics.

### 3. Expand policy tests to guard classification boundaries

Add tests proving deferred vs non-deferred cardinality errors are classified by structured context, including negative cases where selector text alone is insufficient.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/src/kernel/resolve-selectors.ts` (modify)
- `packages/engine/src/kernel/missing-binding-policy.ts` (modify)
- `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` (modify)
- `packages/engine/test/unit/resolve-selectors.test.ts` (modify, if needed)

## Out of Scope

- Changing selector language semantics
- Game data updates
- Runner/UI formatting behavior

## Acceptance Criteria

### Tests That Must Pass

1. Missing-binding policy tests validate structured-context-driven deferral for selector-cardinality cases.
2. Selector-resolution tests validate the new context metadata is emitted for unresolved-binding-derived cardinality paths.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Deferral policy remains deterministic and centralized.
2. Kernel/runtime error classification remains generic and free of game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — assert structured-context classification matrix.
2. `packages/engine/test/unit/resolve-selectors.test.ts` — assert emitted cardinality error metadata for unresolved-binding-derived cases.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js`
3. `node --test packages/engine/dist/test/unit/resolve-selectors.test.js`
4. `pnpm -F @ludoforge/engine test:unit`

## Outcome

- Completion date: 2026-02-25
- What changed:
  - Added structured deferral classification constant/type in `eval-error` (`EVAL_ERROR_DEFER_CLASS.UNRESOLVED_BINDING_SELECTOR_CARDINALITY`).
  - Upgraded `EvalError` to a code-aware generic with per-code context typing (`EvalErrorContextForCode`), making selector-cardinality context shape explicit at compile time.
  - Added a typed guard helper (`hasEvalErrorDeferClass`) so defer-class policy checks are centralized and reusable.
  - Updated selector resolution to emit this metadata for zero-cardinality direct binding selectors in `resolveSingleZoneSel`.
  - Replaced selector string-prefix deferral heuristic in `shouldDeferMissingBinding` with metadata-driven classification.
  - Expanded policy and selector-resolution unit tests to validate positive and negative boundaries, and added eval-error contract coverage for the typed defer-class guard.
- Deviations from original plan:
  - Expanded architecture scope within `eval-error` to formalize code-aware context typing rather than only adding ad hoc metadata fields.
  - No additional selector-runtime files were required beyond `resolve-selectors`; implementation stayed focused on current `SELECTOR_CARDINALITY` emit sites.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/eval-error.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js` passed.
  - `node --test packages/engine/dist/test/unit/resolve-selectors.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
