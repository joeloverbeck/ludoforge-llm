# ENGINEARCH-014: Centralize Eval Error Classification Surface

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel error-classification module extraction + consumer migration + tests
**Deps**: ENGINEARCH-013

## Problem

Eval-error construction and eval-error policy classification are currently mixed in `eval-error.ts` and downstream policy consumers. This blurs boundaries and makes policy semantics harder to evolve/test independently from error-construction concerns.

## Assumption Reassessment (2026-02-25)

1. `hasEvalErrorDeferClass` and `isRecoverableEvalResolutionError` currently live in `eval-error.ts` alongside error constructors.
2. The eval-error context map is already broader than `SELECTOR_CARDINALITY`: `QUERY_BOUNDS_EXCEEDED`, `DIVISION_BY_ZERO`, and `ZONE_PROP_NOT_FOUND` also have explicit typed context contracts.
3. `MISSING_BINDING` / `MISSING_VAR` / `TYPE_MISMATCH` still use the generic context contract, and there is no current invariant requiring stricter context payloads for those codes.
4. Classification consumers include both missing-binding policy and query evaluation flows (`eval-query.ts`), so extraction should update both import surfaces.
5. Existing compile-time context contract assertions live in `types-foundation.test.ts` (not `types-exhaustive.test.ts`).

## Architecture Check

1. Separating error construction from policy classification produces cleaner boundaries and reduces drift when adding new policy semantics.
2. Forcing new structured context contracts for `MISSING_BINDING` / `MISSING_VAR` / `TYPE_MISMATCH` now would be speculative; there is not yet a stable payload shape consumed by runtime policies.
3. Therefore, extracting classification is a clear net architectural win now; context-map expansion should be deferred until concrete payload invariants emerge.
4. No backwards-compatibility aliases/shims are introduced; this is a direct architecture refinement.

## What to Change

### 1. Introduce a dedicated eval-error classification module

Create a focused module (for example `eval-error-classification.ts`) that owns policy-facing predicates such as recoverability and defer-class checks.

### 2. Update consumers and tests to new centralized classification surface

Migrate existing callers to import classification helpers from the dedicated module and extend tests to verify parity/no regression.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/src/kernel/eval-error-classification.ts` (new)
- `packages/engine/src/kernel/missing-binding-policy.ts` (modify)
- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify)
- `packages/engine/test/unit/eval-error.test.ts` (modify)
- `packages/engine/test/unit/eval-error-classification.test.ts` (new)
- `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` (modify, if needed)

## Out of Scope

- New runtime error policy behavior changes beyond classification ownership/typing
- New eval-error context-map contracts for codes that currently use generic context payloads
- Any game-specific branching in kernel/simulator
- Runner visual/logging concerns

## Acceptance Criteria

### Tests That Must Pass

1. Classification helpers are consumed from the dedicated module with behavior parity.
2. Runtime tests cover classifier extraction and unchanged policy outcomes.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Eval error policy semantics remain centralized and deterministic.
2. Game-specific behavior stays in GameSpecDoc/visual-config data, not in GameDef/kernel classification logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-error.test.ts` — keep constructor/guard coverage focused on eval-error construction surface.
2. `packages/engine/test/unit/eval-error-classification.test.ts` — assert classifier behavior parity after module extraction.
3. `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — confirm policy behavior remains unchanged under new import/module boundaries.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/eval-error.test.js`
4. `node --test packages/engine/dist/test/unit/eval-error-classification.test.js`
5. `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js`
6. `pnpm -F @ludoforge/engine test:unit`
7. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-25
- What changed:
  - Extracted classification helpers into `packages/engine/src/kernel/eval-error-classification.ts`.
  - Removed classification helper ownership from `packages/engine/src/kernel/eval-error.ts`.
  - Migrated classification consumers (`eval-query.ts`, `missing-binding-policy.ts`) to the new module.
  - Exported the new module from `packages/engine/src/kernel/index.ts`.
  - Split tests so eval-error construction/guards remain in `eval-error.test.ts` and classifier behavior moved to new `eval-error-classification.test.ts`.
- Deviations from original plan:
  - Did not expand eval-error context-map contracts for `MISSING_BINDING` / `MISSING_VAR` / `TYPE_MISMATCH`; reassessment showed no stable payload invariants currently consumed by runtime policy, so that work was explicitly deferred.
  - `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` required no changes because behavior parity held under module extraction.
- Verification results:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/eval-error.test.js` passed.
  - `node --test packages/engine/dist/test/unit/eval-error-classification.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed (158/158).
  - `pnpm -F @ludoforge/engine lint` passed.
