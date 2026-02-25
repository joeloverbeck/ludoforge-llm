# ENGINEARCH-013: Seal EvalError Context Typing and Enforce Typed Selector-Cardinality Metadata

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — selector-cardinality context construction hardening + eval-error type guardrails + type/runtime tests
**Deps**: ENGINEARCH-012

## Problem

`EvalError` supports code-aware context typing, but `SELECTOR_CARDINALITY` context can still be smuggled through widened intermediates (`Record<string, unknown>`). The current `resolveSingleZoneSel` path assembles context as a broad record and mutates `deferClass`, which weakens compile-time guarantees.

## Assumption Reassessment (2026-02-25)

1. `EvalErrorContextForCode<'SELECTOR_CARDINALITY'>` exists in `packages/engine/src/kernel/eval-error.ts`, and `deferClass` is currently modeled via `SelectorCardinalityEvalErrorContext`.
2. `resolveSingleZoneSel` currently builds selector-cardinality context as `Record<string, unknown>` and conditionally writes `context.deferClass` before throwing `selectorCardinalityError`.
3. Runtime tests already cover selector-cardinality behavior and deferral metadata (`resolve-selectors.test.ts`, `kernel/missing-binding-policy.test.ts`).
4. There is currently no type-level assertion proving that widened intermediates are rejected for selector-cardinality context construction.

## Architecture Reassessment

1. Proposed direction is beneficial over current architecture: it removes a known widening hole and makes invalid `deferClass` states harder to represent at compile time.
2. This change is engine-generic and policy-generic (no game-specific branching, no schema coupling to a specific game).
3. This is an in-place hardening change, not an alias/shim; breakages should surface at compile time and be fixed directly.

## Scope

### In Scope

1. Replace widened selector-cardinality context construction in selector resolution with typed construction.
2. Tighten selector-cardinality context typing in `eval-error.ts` to reject broad/widened intermediates when `deferClass` may be present as `unknown`.
3. Add/extend tests to cover both compile-time and runtime contract preservation.

### Out of Scope

1. Selector language semantics changes.
2. GameSpecDoc/YAML schema changes.
3. Runner/UI behavior changes.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/src/kernel/resolve-selectors.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)
- `packages/engine/test/unit/eval-error.test.ts` (modify)

## Acceptance Criteria

1. Invalid selector-cardinality `deferClass` values are rejected by compile-time tests (including widened intermediary misuse).
2. Selector-cardinality runtime behavior and deferral classification remain unchanged.
3. `pnpm -F @ludoforge/engine test:unit` passes.

## Invariants

1. `EvalError` classification metadata remains generic and policy-driven.
2. Selector-cardinality defer metadata is compile-time constrained where emitted.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-foundation.test.ts`
   - Add `@ts-expect-error` assertions for invalid `deferClass` literals and widened intermediary misuse.
2. `packages/engine/test/unit/eval-error.test.ts`
   - Add runtime assertion confirming typed selector-cardinality context still preserves expected metadata and guard behavior.

### Validation Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/resolve-selectors.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js`
5. `pnpm -F @ludoforge/engine test:unit`

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Hardened selector-cardinality context typing in `eval-error.ts` so widened contexts with `deferClass: unknown` are rejected at compile time.
  - Replaced mutable `Record<string, unknown>` assembly in `resolveSingleZoneSel` with typed context construction.
  - Added compile-time guardrails in `types-foundation.test.ts` for invalid `deferClass` literals and widened intermediary misuse.
  - Added runtime coverage in `eval-error.test.ts` confirming typed context preserves defer metadata and guard classification.
- **Deviations from original plan**:
  - No functional/runtime behavior changes were required; the implementation was pure type-contract hardening plus test coverage expansion.
- **Verification results**:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/resolve-selectors.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
