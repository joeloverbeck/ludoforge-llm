# ENGINEARCH-014: Centralize Eval Error Classification and Expand Code-Context Contract Map

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel error-classification module + eval-error context map + tests
**Deps**: ENGINEARCH-013

## Problem

Eval-error construction and eval-error policy classification are currently mixed in `eval-error.ts` and downstream policy consumers. This makes it harder to evolve classification rules consistently as more error codes gain structured metadata.

## Assumption Reassessment (2026-02-25)

1. `hasEvalErrorDeferClass` and `isRecoverableEvalResolutionError` currently live in `eval-error.ts` alongside error constructors.
2. Only `SELECTOR_CARDINALITY` currently has explicit code-mapped context typing; other policy-relevant codes still rely on generic context records.
3. Policy consumers (for example missing-binding policy) already depend on classification helpers and would benefit from a dedicated, centralized classifier surface.

## Architecture Check

1. Separating error construction from policy classification produces cleaner boundaries and reduces drift when adding new policy semantics.
2. Expanding code-context mapping for policy-relevant codes improves extensibility while keeping GameDef/simulation generic and game-agnostic.
3. No backwards-compatibility aliases/shims are introduced; this is a direct architecture refinement.

## What to Change

### 1. Introduce a dedicated eval-error classification module

Create a focused module (for example `eval-error-classification.ts`) that owns policy-facing predicates such as recoverability and defer-class checks.

### 2. Expand context-map typing for policy-relevant eval error codes

Promote additional error-code context contracts into the code-context map for high-value policy/readability paths (for example `MISSING_BINDING`, `MISSING_VAR`, `TYPE_MISMATCH`, `QUERY_BOUNDS_EXCEEDED`) where structured fields are frequently consumed.

### 3. Update consumers and tests to new centralized classification surface

Migrate existing callers to import classification helpers from the dedicated module and extend tests to verify parity/no regression.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/src/kernel/eval-error-classification.ts` (new)
- `packages/engine/src/kernel/missing-binding-policy.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/test/unit/eval-error.test.ts` (modify)
- `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` (modify, if needed)
- `packages/engine/test/unit/types-exhaustive.test.ts` (modify, if needed for contract guards)

## Out of Scope

- New runtime error policy behavior changes beyond classification ownership/typing
- Any game-specific branching in kernel/simulator
- Runner visual/logging concerns

## Acceptance Criteria

### Tests That Must Pass

1. Classification helpers are consumed from the dedicated module with behavior parity.
2. Type-level and runtime tests cover expanded code-context map contracts without regressions.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Eval error policy semantics remain centralized and deterministic.
2. Game-specific behavior stays in GameSpecDoc/visual-config data, not in GameDef/kernel classification logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-error.test.ts` — assert classification helper parity after module extraction.
2. `packages/engine/test/unit/types-exhaustive.test.ts` — add/adjust compile-time contract assertions for expanded eval-error context map.
3. `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — confirm policy behavior remains unchanged under new import/module boundaries.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/eval-error.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js`
5. `pnpm -F @ludoforge/engine test:unit`
