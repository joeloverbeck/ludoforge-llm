# RUNRECON-003: Normalize keyed text geometry snapshot semantics

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: docs/FOUNDATIONS.md, tickets/README.md, archive/tickets/RUNRECON/RUNRECON-001-normalize-keyed-bitmaptext-snapshot-semantics.md, tickets/RUNRECON-002-normalize-keyed-text-snapshot-semantics.md

## Problem

Both shared keyed text runtimes still leave geometry fields partially stateful:

- `packages/runner/src/canvas/text/bitmap-text-runtime.ts` resets `visible`, `renderable`, and now transform fields, but still preserves prior `anchor` and `position` when they are omitted on reuse.
- `packages/runner/src/canvas/text/text-runtime.ts` does the same for keyed Pixi `Text`.

That means a caller can stop specifying geometry and still inherit stale placement from an earlier reconcile pass. This is the same class of hidden-state problem already removed for visibility and transform state: the rendered result depends on history, not only on the current keyed spec.

Pixi already gives these fields clear neutral defaults:

- `anchor` => `(0, 0)`
- `position` => `(0, 0)`

If keyed reconciliation is meant to be declarative, reused keyed entries should resolve omitted geometry the same way a fresh entry does.

## Assumption Reassessment (2026-03-21)

1. `createKeyedBitmapTextReconciler()` only applies `anchor` and `position` when the corresponding field is explicitly present, so reused keyed BitmapText entries preserve prior geometry when those fields are omitted — **confirmed** in `packages/runner/src/canvas/text/bitmap-text-runtime.ts`.
2. `createKeyedTextReconciler()` has the same omission behavior for keyed Pixi `Text` entries — **confirmed** in `packages/runner/src/canvas/text/text-runtime.ts`.
3. Current keyed callers (`table-overlay-renderer.ts`, `card-template-renderer.ts`, and `region-boundary-renderer.ts`) currently provide the geometry fields they rely on, so no confirmed live bug is exposed today — **confirmed**.
4. Existing runtime tests cover creation and explicit geometry application, but they do **not** assert reset-to-default behavior when keyed `anchor` or `position` are omitted on a later reconcile — **confirmed** in `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` and `packages/runner/test/canvas/text/text-runtime.test.ts`.
5. `RUNRECON-001` intentionally stopped at BitmapText transform semantics, and `RUNRECON-002` intentionally scopes plain `Text` work to transform/style semantics; neither active ticket owns geometry omission semantics today — **confirmed** from those ticket scopes.

## Architecture Check

1. Resetting omitted keyed geometry to canonical defaults is cleaner than preserving hidden prior placement. It makes geometry reconciliation snapshot-based, matching the direction already established for visibility and transform state.
2. The shared text runtimes are the correct ownership boundary. Requiring every renderer to manually restate `{ anchor: { x: 0, y: 0 }, position: { x: 0, y: 0 } }` would duplicate policy and make future regressions more likely.
3. This remains fully inside the runner presentation layer and aligns with Foundations 1, 3, 9, and 10. No game-specific logic enters engine/compiler/runtime layers, and no compatibility aliasing is introduced.
4. The architecture should converge on one rule: a newly created keyed entry and a reused keyed entry must resolve the same spec to the same display state, including geometry.

## What to Change

### 1. Make keyed BitmapText geometry snapshot-based

**File**: `packages/runner/src/canvas/text/bitmap-text-runtime.ts`

For keyed BitmapText reconciliation, omitted geometry must reset to canonical defaults on both create and reuse:

- `anchor.x` / `anchor.y` => `0`
- `position.x` / `position.y` => `0`

This should not change the already-delivered transform, visibility, style-identity, or `instanceKey` semantics.

### 2. Make keyed Text geometry snapshot-based

**File**: `packages/runner/src/canvas/text/text-runtime.ts`

Apply the same omission semantics for keyed Pixi `Text` entries:

- `anchor.x` / `anchor.y` => `0`
- `position.x` / `position.y` => `0`

Creation and reuse must again follow the same rule so the current spec fully determines geometry.

### 3. Add regression coverage for geometry resets

**Files**:
- `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts`
- `packages/runner/test/canvas/text/text-runtime.test.ts`

Add tests that prove:

- omitted `anchor` resets a reused keyed entry to `(0, 0)`,
- omitted `position` resets a reused keyed entry to `(0, 0)`,
- explicit `anchor` and `position` values still apply normally,
- `apply` callbacks still run after base-state reconciliation and can intentionally override the defaulted geometry afterwards when needed.

## Files to Touch

- `packages/runner/src/canvas/text/bitmap-text-runtime.ts` (modify)
- `packages/runner/src/canvas/text/text-runtime.ts` (modify)
- `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` (modify)
- `packages/runner/test/canvas/text/text-runtime.test.ts` (modify)

## Out of Scope

- BitmapText transform semantics already handled in `archive/tickets/RUNRECON/RUNRECON-001-normalize-keyed-bitmaptext-snapshot-semantics.md`
- Plain `Text` transform/style semantics handled in `tickets/RUNRECON-002-normalize-keyed-text-snapshot-semantics.md`
- Renderer-specific layout policy or typography choices
- Any engine (`packages/engine/`) or GameSpecDoc/GameDef changes

## Acceptance Criteria

### Tests That Must Pass

1. **New**: A keyed BitmapText entry reconciled from non-zero `anchor` / `position` to omitted geometry ends at `anchor === (0, 0)` and `position === (0, 0)`.
2. **New**: A keyed `Text` entry reconciled from non-zero `anchor` / `position` to omitted geometry ends at `anchor === (0, 0)` and `position === (0, 0)`.
3. **New**: `apply` callbacks in both runtimes still run after base-state reconciliation and can intentionally override geometry defaults.
4. **Existing**: All tests in `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` pass.
5. **Existing**: All tests in `packages/runner/test/canvas/text/text-runtime.test.ts` pass.
6. **Existing**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Keyed text reconciliation is snapshot-based for geometry as well as the already-normalized visibility/transform fields that each runtime owns.
2. Freshly created and reused keyed text entries resolve the same spec to the same display state.
3. No backwards-compatibility shims, alias fields, or dual omission semantics are introduced.
4. `pnpm turbo typecheck` and `pnpm turbo lint` pass with zero errors.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` — add omitted-geometry reset coverage and an `apply` geometry-override regression check.
2. `packages/runner/test/canvas/text/text-runtime.test.ts` — add the same coverage for the keyed Pixi `Text` runtime.

### Commands

1. `pnpm -F @ludoforge/runner test test/canvas/text/bitmap-text-runtime.test.ts`
2. `pnpm -F @ludoforge/runner test test/canvas/text/text-runtime.test.ts`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
