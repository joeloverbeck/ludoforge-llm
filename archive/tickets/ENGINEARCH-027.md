# ENGINEARCH-027: Restrict Selector-Cardinality Builder Helpers to Internal Kernel Surface

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel API surface tightening + internal helper relocation + boundary tests
**Deps**: ENGINEARCH-021

## Problem

Selector-cardinality context builder helpers are currently exported on the shared `eval-error` module surface. These are internal assembly primitives used by selector resolution; exposing them publicly expands API surface and couples external callers to internal context construction details.

## Assumption Reassessment (2026-02-25)

Validated against current code/tests:

1. Builder helpers are currently exported from `packages/engine/src/kernel/eval-error.ts`:
   - `selectorCardinalityPlayerCountContext`
   - `selectorCardinalityPlayerResolvedContext`
   - `selectorCardinalityZoneResolvedContext`
2. `packages/engine/src/kernel/index.ts` and `packages/engine/src/kernel/runtime.ts` both export `./eval-error.js`, so these helpers leak through both public kernel/runtime barrels.
3. Internal runtime usage is concentrated in `packages/engine/src/kernel/resolve-selectors.ts`.
4. Existing tests currently rely on these helper exports and will break when the boundary is tightened:
   - `packages/engine/test/unit/eval-error.test.ts`
   - `packages/engine/test/unit/types-foundation.test.ts`
5. Existing API-shape/smoke tests do not currently assert absence of these helpers on public barrels.

## Architecture Reassessment

1. Internalizing these helper constructors is cleaner than exposing low-level context assembly through public runtime/kernel entrypoints.
2. Public `EvalError` APIs should preserve typed error constructors and type contracts, while selector-specific assembly details remain private to selector resolution.
3. This change improves long-term extensibility by allowing selector-cardinality context evolution without external API commitments.
4. No compatibility aliases or shims will be introduced; call sites and tests must be updated to the tightened contract.

## Updated Scope

### 1. Move selector-cardinality builder helpers behind an internal module boundary

Create/use a kernel-internal module for selector-cardinality context construction and migrate `resolve-selectors.ts` imports to that internal module.

### 2. Tighten public `eval-error` surface

Remove exports of selector-cardinality builder helpers from `eval-error.ts` while preserving:
- `EvalError` class
- error constructors (`selectorCardinalityError`, etc.)
- guards and context/type exports used by public callers

### 3. Update tests to reflect the new API boundary

- Replace helper-constructor usage in tests that currently import from public kernel barrel.
- Add explicit API-surface guard assertions that these helper names are absent from public kernel exports.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/src/kernel/resolve-selectors.ts` (modify)
- `packages/engine/src/kernel/selector-cardinality-context.ts` (new internal helper module)
- `packages/engine/test/unit/game-loop-api-shape.test.ts` (modify)
- `packages/engine/test/unit/smoke.test.ts` (modify)
- `packages/engine/test/unit/eval-error.test.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)

`packages/engine/src/kernel/index.ts` and `packages/engine/src/kernel/runtime.ts` are expected to require no direct edits unless barrel changes become necessary.

## Out of Scope

- Selector semantics changes
- Error-code taxonomy/defer-class policy changes
- `GameSpecDoc`, schema, or runner visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Selector-cardinality builder helpers are not present on public kernel/runtime entrypoints.
2. Internal selector resolution preserves selector-cardinality error context behavior.
3. Engine unit suite passes after boundary tightening.

### Invariants

1. Public kernel API remains minimal and stable; low-level context assembly details are internal.
2. Runtime behavior and game-agnostic architecture are preserved.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/game-loop-api-shape.test.ts`
   - add explicit negative assertions for selector-cardinality builder helper export names.
2. `packages/engine/test/unit/smoke.test.ts`
   - keep module import smoke coverage and add targeted public-surface guard for helper absence.
3. `packages/engine/test/unit/eval-error.test.ts`
   - validate selector-cardinality context shapes without calling removed public helper constructors.
4. `packages/engine/test/unit/types-foundation.test.ts`
   - preserve compile-time contract checks via `selectorCardinalityError` typed contexts rather than removed helper functions.
5. `packages/engine/test/unit/resolve-selectors.test.ts`
   - verify selector-cardinality context parity remains unchanged (existing assertions retained).

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-25
- What actually changed:
  - Moved selector-cardinality context builders into internal module `packages/engine/src/kernel/selector-cardinality-context.ts`.
  - Removed builder helper exports from public `packages/engine/src/kernel/eval-error.ts`.
  - Updated `packages/engine/src/kernel/resolve-selectors.ts` to import internal builders.
  - Updated unit tests to remove public-helper dependence and added explicit public-export absence checks.
- Deviations from original plan:
  - No edits were required in `packages/engine/src/kernel/index.ts` or `packages/engine/src/kernel/runtime.ts`; removing helper exports from `eval-error.ts` was sufficient to tighten public barrels.
  - `resolve-selectors` behavior tests remained semantically unchanged; existing assertions already covered context parity.
- Verification results:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
