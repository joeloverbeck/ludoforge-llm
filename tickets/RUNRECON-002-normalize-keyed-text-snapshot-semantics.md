# RUNRECON-002: Normalize keyed Text snapshot semantics

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: docs/FOUNDATIONS.md, tickets/README.md, archive/tickets/RUNRECON/RUNRECON-001-normalize-keyed-bitmaptext-snapshot-semantics.md

## Problem

`packages/runner/src/canvas/text/text-runtime.ts` currently exposes the same partial-patch problem as the keyed BitmapText runtime, and one additional inconsistency:

- `visible` and `renderable` reset to `true` when omitted,
- `alpha`, `rotation`, and `scale` preserve prior values when omitted,
- and `style` preserves prior values when omitted on a reused keyed entry.

That makes reused keyed `Text` nodes stateful in ways the spec does not express. A caller can stop specifying a transform or stop supplying a style object and still inherit stale render state from a previous reconcile pass. This is weaker than a declarative keyed runtime should be, especially because `createManagedText()` already has a clear notion of the unstyled/default display state for a newly created entry.

## Assumption Reassessment (2026-03-21)

1. `createKeyedTextReconciler()` currently assigns `text.style` only when `spec.style !== undefined`, and only assigns `alpha`, `rotation`, and `scale` when those fields are explicitly present — **confirmed** in `packages/runner/src/canvas/text/text-runtime.ts`.
2. The same runtime already treats `visible` and `renderable` as snapshot fields by resetting them with `?? true`, so the current contract is internally inconsistent — **confirmed**.
3. Current keyed `Text` callers are `card-template-renderer.ts` and `region-boundary-renderer.ts`; both currently provide the fields they rely on, so no known live bug is exposed today — **confirmed**.
4. Existing `text-runtime` tests verify creation, updates, replacement, teardown, and advanced-property application, but they do **not** assert reset-to-default behavior for omitted transform/style fields on reused entries — **confirmed** in `packages/runner/test/canvas/text/text-runtime.test.ts`.
5. The cleanest default for omitted `style` is to align reused keyed entries with the same unstyled/base behavior that a fresh `createManagedText({ text })` entry receives, not to preserve old style objects invisibly — **inferred from current runtime design and needs explicit implementation/tests**.
6. `anchor` and `position` are also still patch-style optional fields in `text-runtime.ts`, but this ticket intentionally does **not** widen them to reset-to-default semantics because geometry snapshotting is a separate contract change that should stay isolated from the transform/style work here.

## Architecture Check

1. Normalizing keyed `Text` reconciliation to snapshot semantics is more robust than preserving sticky prior state. It makes renderer output depend on the current spec only, not on the path taken to reach it.
2. The shared keyed `Text` runtime is the correct ownership boundary. Fixing this once avoids spreading “remember to reset alpha/rotation/scale/style” boilerplate across every present and future renderer.
3. This remains fully inside the runner presentation layer and aligns with Foundations 1, 3, 9, and 10. No game-specific logic enters agnostic engine/compiler/runtime layers, and no compatibility aliasing should be introduced.
4. The unstyled/default `Text` state must be explicit and tested. If Pixi requires a concrete empty/default style object to reestablish that state, the runtime should own that conversion rather than leaving callers to guess.

## What to Change

### 1. Make keyed Text transform fields snapshot-based

**File**: `packages/runner/src/canvas/text/text-runtime.ts`

For reused keyed entries, apply canonical defaults when omitted:

- `alpha` => `1`
- `rotation` => `0`
- `scale.x` / `scale.y` => `1`

Creation and reuse must resolve the same spec to the same display state.

### 2. Define explicit omission semantics for keyed Text style

**File**: `packages/runner/src/canvas/text/text-runtime.ts`

When a reused keyed entry omits `style`, reset it to the same neutral/unconfigured text style a fresh `createManagedText({ text })` entry would have, instead of preserving the prior style object.

The implementation should choose one canonical runtime-owned representation of that default state and use it consistently in both creation and reuse paths.

### 3. Add regression coverage for reset semantics

**File**: `packages/runner/test/canvas/text/text-runtime.test.ts`

Add tests that prove:

- omitted `alpha`, `rotation`, and `scale` reset to defaults on reused entries,
- omitted `style` resets a reused keyed entry to the runtime's canonical unstyled state,
- explicit `style` and transform values still apply normally,
- `apply` callbacks still run after the reconciler establishes the canonical base state.

## Files to Touch

- `packages/runner/src/canvas/text/text-runtime.ts` (modify)
- `packages/runner/test/canvas/text/text-runtime.test.ts` (modify)

## Out of Scope

- BitmapText runtime semantics in `packages/runner/src/canvas/text/bitmap-text-runtime.ts`
- Keyed geometry omission semantics for `anchor` and `position` in either text runtime
- Renderer-specific typography or layout decisions
- New style abstractions beyond what the shared keyed runtime needs
- Any engine (`packages/engine/`) or GameSpecDoc/GameDef changes

## Acceptance Criteria

### Tests That Must Pass

1. **New**: A keyed `Text` entry reconciled from `alpha: 0.25` to omitted `alpha` ends at `alpha === 1`.
2. **New**: A keyed `Text` entry reconciled from non-zero `rotation` and non-unit `scale` to omitted values ends at `rotation === 0`, `scale.x === 1`, and `scale.y === 1`.
3. **New**: A keyed `Text` entry reconciled from a styled spec to an omitted-style spec resets to the runtime's canonical unstyled/default text style instead of preserving the previous style.
4. **New**: `apply` callbacks still run after the base-state reconciliation and can intentionally override default values.
5. **Existing**: All tests in `packages/runner/test/canvas/text/text-runtime.test.ts` pass.
6. **Existing**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Keyed `Text` reconciliation is snapshot-based for transform and style state; omitted optional fields no longer preserve hidden prior values.
2. Freshly created and reused keyed `Text` entries resolve the same spec to the same display state.
3. No backwards-compatibility shims or dual semantics are introduced for omitted fields.
4. `pnpm turbo typecheck` and `pnpm turbo lint` pass with zero errors.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/text/text-runtime.test.ts` — add reset-to-default coverage for omitted transform/style fields and an `apply`-override regression test.

### Commands

1. `pnpm -F @ludoforge/runner test test/canvas/text/text-runtime.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
