# TOKFILAST-015: Align Non-Empty Invariant Failures with Compiler/Kernel Contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL lowering invariant hardening
**Deps**: archive/tickets/TOKFILAST-010-boolean-arity-policy-unification-conditionast-tokenfilter.md, archive/tickets/TOKFILAST/TOKFILAST-014-token-filter-traversal-error-boundary-decoupling.md

## Problem

`compile-conditions.ts` still includes a local `toNonEmpty` helper that throws plain `Error('Expected non-empty values.')` when fed an empty array. While current lowering guards make this path effectively latent, keeping generic throws in compiler lowering weakens contract clarity and risks future regressions leaking non-deterministic error surfaces.

## Assumption Reassessment (2026-03-06)

1. `compile-conditions.ts` still uses `toNonEmpty` and still throws plain generic `Error` on empty arrays.
2. `hidden-info-grants.ts` does **not** use `toNonEmpty` anymore and already throws deterministic token-filter traversal errors (`TOKEN_FILTER_TRAVERSAL_ERROR`) via `tokenFilterBooleanArityError`.
3. Existing tests already cover hidden-info zero-arity token-filter rejection; the uncovered gap is compiler-side non-empty invariant hardening and explicit regression coverage there.

## Architecture Reassessment

1. Introducing a shared kernel-level non-empty helper for this ticket is not the cleanest architecture for current boundaries.
2. Compiler lowering and kernel traversal intentionally surface different contracts (compiler diagnostics vs traversal errors); forcing a shared helper risks coupling boundaries that should remain decoupled.
3. The cleaner long-term shape is to keep boundary-specific contracts and remove latent generic throws from compiler lowering by using explicit fail-closed diagnostics where needed.

## Updated Scope

### In scope

1. Remove latent generic `Error` throw usage from non-empty coercion in `compile-conditions.ts`.
2. Ensure boolean-arity/non-empty violations in compiler lowering resolve to deterministic compiler diagnostics rather than generic throws.
3. Add regression tests in compiler unit tests to lock this behavior.

### Out of scope

1. Changes to `hidden-info-grants.ts` behavior or tests unless a regression is discovered.
2. Broad kernel error-system redesign.
3. Token-filter traversal fail-closed dispatch work tracked in `TOKFILAST-013`.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify)

## Acceptance Criteria

### Tests That Must Pass

1. Compiler lowering paths covered by this ticket do not throw plain generic `Error` for non-empty/boolean-arity invariants.
2. Empty/non-conforming boolean argument shapes in compiler lowering produce deterministic `CNL_COMPILER_MISSING_CAPABILITY` diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Non-empty boolean arity remains enforced at type/schema/validator/runtime/lowering boundaries.
2. Boundary contracts stay decoupled: compiler emits diagnostics, kernel traversal emits traversal errors.
3. Shared engine/compiler infrastructure remains game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — add cases asserting empty boolean args for condition and token-filter lowering produce deterministic compiler diagnostics and do not throw.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - Removed latent plain-`Error` non-empty coercion from `compile-conditions.ts`.
  - Hardened token-filter normalization/lowering to stay fail-closed with deterministic compiler diagnostics instead of generic throws.
  - Added compiler tests proving empty boolean arg shapes are rejected deterministically without throwing.
- Deviations from original plan:
  - Did not add a shared kernel invariant helper.
  - Did not modify `hidden-info-grants.ts`; reassessment confirmed it already uses deterministic traversal error contracts and already has coverage.
  - Narrowed scope to compiler lowering where the remaining contract gap actually existed.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
