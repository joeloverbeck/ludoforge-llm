# 70BITFONLEA-005: Guard Keyed BitmapText Style Reassignment

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: specs/70-bitmap-font-leak-and-init-perf.md, archive/tickets/70BITFONLEA/70BITFONLEA-004-replace-bitmaptext-fontfamily-strings-with-typed-font-contract.md

## Problem

The shared keyed BitmapText reconciler in `packages/runner/src/canvas/text/bitmap-text-runtime.ts` still reassigns `text.style` on every reconcile pass for reused entries, even when the semantic BitmapText style is unchanged. Ticket `70BITFONLEA-002` fixed that churn for table-overlay markers only, but the shared reconciler still drives overlay text nodes and any other keyed BitmapText path through unconditional style-object replacement.

The current runtime also has a smaller architectural redundancy on creation: `createFromSpec()` constructs a new `BitmapText` with the requested style and then immediately routes the same instance through `applySpec()`, which reapplies `text.style` again on first render. That second write is not as hot as the reused-entry churn, but it is still avoidable duplication inside the same ownership boundary.

That leaves the architecture inconsistent:

- marker labels now preserve style identity on equivalent updates,
- keyed BitmapText text nodes still rebuild and reassign style objects every pass,
- and the shared runtime continues to do avoidable work in a hot path that should be the single clean implementation for keyed BitmapText updates.

This is not a backwards-compatibility problem or a game-specific concern. It is a runner-owned rendering-contract issue that should be solved once at the shared runtime boundary.

## Assumption Reassessment (2026-03-21)

1. `createKeyedBitmapTextReconciler()` currently applies `text.style = toPixiBitmapTextStyle(spec.style)` on every reconcile for reused entries — **confirmed** in `bitmap-text-runtime.ts`.
2. The shared keyed reconciler is still used by `table-overlay-renderer.ts` for text-node overlays, so equivalent overlay text updates still incur unconditional style replacement — **confirmed**.
3. The keyed BitmapText contract is already typed around `fontName`, `fill`, `fontSize`, `stroke`, and `fontWeight`; no raw `fontFamily` runner contract remains here after `70BITFONLEA-004` — **confirmed**.
4. `createFromSpec()` currently creates a `BitmapText` with the target style and then immediately reapplies style through `applySpec()`, so new keyed entries take a redundant second style write on creation — **confirmed**.
5. Existing runtime tests verify creation, updates, instance-key replacement, and apply-callback behavior, but they do **not** assert style-object identity preservation for equivalent updates or protect against redundant creation-path churn — **confirmed** in `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts`.
6. No active ticket in `tickets/` currently owns this shared runtime style-churn path. `70BITFONLEA-003` is measurement/deferral work in `game-store.ts`, not BitmapText runtime cleanup — **confirmed**.

## Architecture Check

1. The correct architecture is to make the shared keyed BitmapText reconciler semantically idempotent: reused entries should only receive a new Pixi style object when the typed BitmapText style actually changes.
2. The same runtime should avoid redundant creation-path style writes where possible. Initial construction and subsequent reconciliation should share one semantic style rule rather than paying an immediate extra write after creation.
3. Fixing this in `bitmap-text-runtime.ts` is cleaner than duplicating local guards in every renderer that uses keyed BitmapText. The runtime is the ownership boundary for keyed BitmapText reconciliation.
4. The comparison should operate on the runner-owned semantic style contract (`fontName`, `fill`, `fontSize`, `stroke`, `fontWeight`) rather than comparing generated Pixi objects by reference or deep-inspecting unrelated Pixi fields.
5. This stays fully inside the runner presentation layer, preserving Foundations 1 and 3. No game-specific logic enters GameDef, compiler, or kernel/runtime layers.
6. No backwards-compatibility aliasing: keep the current `fontName` contract and improve reconciliation behavior under that contract.

## What to Change

### 1. Add semantic style-change detection to keyed BitmapText reconciliation

**File**: `packages/runner/src/canvas/text/bitmap-text-runtime.ts`

Inside the keyed reconciler update path for reused entries:

- compare the current BitmapText style payload against the next semantic style values,
- only call `toPixiBitmapTextStyle(spec.style)` and reassign `text.style` when one of the tracked BitmapText style fields actually changes.

The tracked fields must cover the current typed contract:

- `fontName`
- `fill`
- `fontSize`
- `fontWeight`
- `stroke.color`
- `stroke.width`

### 2. Remove redundant creation-path style reassignment

**File**: `packages/runner/src/canvas/text/bitmap-text-runtime.ts`

Ensure a newly created keyed `BitmapText` instance does not immediately receive a second semantically identical style assignment. The runtime should either:

- create the instance with the requested style and skip the follow-up style write for first render, or
- centralize creation/update application so style is written exactly once per semantic change.

### 3. Keep non-style reconciliation behavior unchanged

**File**: `packages/runner/src/canvas/text/bitmap-text-runtime.ts`

The guard must not interfere with:

- `text.text` updates,
- anchor/position/visibility/renderable updates,
- alpha/rotation/scale updates,
- `instanceKey`-driven replacement,
- `apply` callbacks.

### 4. Add shared-runtime regression coverage

**File**: `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts`

Add tests that prove reused keyed BitmapText entries preserve the same style object on equivalent style updates and reassign on semantic style changes. Cover at least one primitive field change and one nested `stroke` change so the shared comparison logic is forced to handle the full contract. The test coverage should also keep creation-path behavior honest by proving non-style updates still apply correctly when style reassignment is skipped.

## Files to Touch

- `packages/runner/src/canvas/text/bitmap-text-runtime.ts` (modify)
- `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` (modify)

## Out of Scope

- Table-overlay marker-specific style caching — already completed in `70BITFONLEA-002`.
- Deferring store work or measuring Chrome violation timings — handled in `70BITFONLEA-003`.
- Introducing new bitmap fonts or widening the legal font contract.
- Refactoring non-keyed `createManagedBitmapText()` unless required by the shared comparison helper.
- Any engine (`packages/engine/`) or GameSpecDoc/GameDef changes.

## Acceptance Criteria

### Tests That Must Pass

1. **New**: Reconciler reuses the same `BitmapText.style` object when a keyed entry is reconciled twice with semantically identical style values.
2. **New**: Reconciler reassigns `BitmapText.style` when `fill`, `fontSize`, `fontName`, `fontWeight`, or `stroke` values change.
3. **New**: Reconciler still updates non-style fields such as `text` and `position` even when style reassignment is skipped.
4. **New/Architectural**: Newly created keyed entries do not take an avoidable second semantically identical style write during first render.
5. **Existing**: All tests in `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` pass.
6. **Existing**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Reused keyed BitmapText entries only receive a new Pixi style object when the semantic BitmapText style changes.
2. The typed BitmapText contract remains `fontName`-based; no raw `fontFamily` aliases or compatibility fields are introduced.
3. Newly created keyed BitmapText entries do not immediately pay a redundant second style write for the same semantic style.
4. `instanceKey` changes still replace the underlying BitmapText instance.
5. `pnpm turbo typecheck` and `pnpm turbo lint` pass with zero errors.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` — add shared keyed-style caching coverage for unchanged styles, changed primitive style fields, changed stroke fields, and unchanged-style text/position updates.

### Commands

1. `pnpm -F @ludoforge/runner test test/canvas/text/bitmap-text-runtime.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Corrected the ticket before implementation so it matches the current shared BitmapText runtime and explicitly includes the redundant creation-path style write.
  - Updated `bitmap-text-runtime.ts` so keyed BitmapText entries cache their semantic style, only reassign Pixi style objects when the semantic BitmapText style changes, and avoid the immediate duplicate style write on initial creation.
  - Strengthened `bitmap-text-runtime.test.ts` to prove unchanged-style reuse, primitive style change reassignment, nested stroke change reassignment, non-style updates under style-skip conditions, and the single style write on initial creation.
- Deviations from original plan:
  - Scope expanded slightly inside the same runtime file to remove the redundant creation-path style write, because leaving it in place would preserve avoidable duplication in the shared ownership boundary even after fixing reused-entry churn.
- Verification results:
  - `pnpm -F @ludoforge/runner test test/canvas/text/bitmap-text-runtime.test.ts` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
