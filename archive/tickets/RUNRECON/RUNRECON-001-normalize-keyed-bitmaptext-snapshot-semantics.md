# RUNRECON-001: Normalize keyed BitmapText snapshot semantics

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: docs/FOUNDATIONS.md, tickets/README.md, archive/tickets/70BITFONLEA/70BITFONLEA-005-guard-keyed-bitmaptext-style-reassignment.md

## Problem

`packages/runner/src/canvas/text/bitmap-text-runtime.ts` currently treats reused keyed BitmapText entries as a partial patch for some fields and as a reset-to-default snapshot for others:

- `visible` and `renderable` reset to `true` when omitted,
- but `alpha`, `rotation`, and `scale` retain their previous values when omitted.

That contract is inconsistent and hard to reason about. For transform fields that already have obvious neutral defaults, a keyed reconciler should be declarative: each reconcile pass should fully describe the retained transform state for a reused keyed entry. Under the current behavior, a caller that conditionally sets `alpha`, `rotation`, or `scale` can accidentally leak yesterday's transform into today's render just by omitting the field once the condition stops applying.

No current runner path appears to be visibly broken by this yet, but the architecture is weaker than it should be. The inconsistency already exists inside the shared runtime boundary, which means future renderers can inherit it by default.

## Assumption Reassessment (2026-03-21)

1. `createKeyedBitmapTextReconciler()` currently resets `visible` and `renderable` on every reconcile via `spec.visible ?? true` and `spec.renderable ?? true`, but only assigns `alpha`, `rotation`, and `scale` when the field is explicitly present — **confirmed** in `packages/runner/src/canvas/text/bitmap-text-runtime.ts`.
2. The active keyed BitmapText caller in `table-overlay-renderer.ts` currently omits `alpha`, `rotation`, and `scale`, so the stale-state behavior is not exposed there today — **confirmed**.
3. The keyed BitmapText tests currently cover creation, instance-key replacement, style reassignment guards, and non-style updates, but they do **not** assert reset-to-default behavior when `alpha`, `rotation`, or `scale` are omitted on a later reconcile — **confirmed** in `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts`.
4. The recently completed `70BITFONLEA-005` fixed shared style churn and redundant creation-path style writes, but it intentionally did **not** change omission semantics for transform-like fields — **confirmed** in `archive/tickets/70BITFONLEA/70BITFONLEA-005-guard-keyed-bitmaptext-style-reassignment.md`.
5. No engine/compiler/runtime agnostic layers are involved here; this is a Pixi runner display-contract issue only — **confirmed**.
6. `anchor` and `position` still behave as patch-style optional fields today, and this ticket does **not** widen them into reset-to-default semantics because that would be a separate contract change beyond the transform-specific inconsistency described here — **confirmed** in `packages/runner/src/canvas/text/bitmap-text-runtime.ts`.
7. The broader runner suite currently exercises the shared keyed BitmapText runtime through `table-overlay-renderer.test.ts`, whose Pixi `BitmapText` mock lacks a `scale` point even though production `BitmapText` exposes one. Full-suite verification therefore requires updating that harness to match the real Pixi surface — **confirmed** when running `pnpm -F @ludoforge/runner test`.

## Architecture Check

1. Resetting omitted keyed BitmapText transform fields to canonical defaults is cleaner than preserving hidden prior state. It makes transform reconciliation snapshot-based instead of partially stateful.
2. The shared keyed BitmapText runtime is the right ownership boundary. Fixing this once in `bitmap-text-runtime.ts` is more robust than relying on every renderer to remember to explicitly restate neutral `alpha`, `rotation`, and `scale`.
3. This stays entirely inside the runner presentation layer and preserves Foundations 1 and 3. No game-specific rules or data leak into engine/compiler/runtime boundaries.
4. No backwards-compatibility shims or aliasing should be added. If a caller relied on omission preserving prior transform state, that caller should be updated to specify the desired transform explicitly.

## What to Change

### 1. Make keyed BitmapText transform fields snapshot-based

**File**: `packages/runner/src/canvas/text/bitmap-text-runtime.ts`

For reused keyed entries, apply canonical defaults when these fields are omitted:

- `alpha` => `1`
- `rotation` => `0`
- `scale.x` / `scale.y` => `1`

Creation and reuse should follow the same rule so a newly created entry and a reused entry with the same spec resolve to the same transform state.

### 2. Keep style and other keyed behavior unchanged

**File**: `packages/runner/src/canvas/text/bitmap-text-runtime.ts`

Do not regress the architecture already delivered in `70BITFONLEA-005`:

- style reassignment still occurs only on semantic BitmapText style changes,
- newly created keyed entries still avoid a redundant second identical style write,
- `instanceKey` still forces replacement,
- `apply` callbacks still run after the reconciler has established the canonical base state.

### 3. Add omission-reset regression coverage

**File**: `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts`

Add tests that prove:

- omitted `alpha` resets a reused keyed entry back to `1`,
- omitted `rotation` resets a reused keyed entry back to `0`,
- omitted `scale` resets a reused keyed entry back to `(1, 1)`,
- explicit values still apply normally,
- `apply` callbacks can still override the reconciler-set defaults afterwards when needed.

### 4. Keep shared-runtime consumers' test harnesses aligned with Pixi

**File**: `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts`

Update the local `BitmapText` mock so it includes the real Pixi `scale` point API used by the shared runtime. This is a test-harness correction, not a production behavior change, but it is required for the full runner suite to remain a trustworthy proof of the shared runtime contract.

## Files to Touch

- `packages/runner/src/canvas/text/bitmap-text-runtime.ts` (modify)
- `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` (modify)
- `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` (modify)

## Out of Scope

- Generic Pixi `Text` runtime semantics in `packages/runner/src/canvas/text/text-runtime.ts`
- Introducing new BitmapText style fields or widening the typed bitmap font contract
- Renderer-specific animation policy decisions
- Production `table-overlay-renderer.ts` behavior
- Any engine (`packages/engine/`) or GameSpecDoc/GameDef changes

## Acceptance Criteria

### Tests That Must Pass

1. **New**: A keyed BitmapText entry reconciled from `alpha: 0.25` to omitted `alpha` ends at `alpha === 1`.
2. **New**: A keyed BitmapText entry reconciled from non-zero `rotation` to omitted `rotation` ends at `rotation === 0`.
3. **New**: A keyed BitmapText entry reconciled from non-unit `scale` to omitted `scale` ends at `scale.x === 1` and `scale.y === 1`.
4. **New**: `apply` callbacks still run after base-state reconciliation and can override the defaulted transform values intentionally.
5. **New/Test Harness**: `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` uses a `BitmapText` mock surface that includes `scale.set(...)`, matching the shared runtime's real Pixi dependency.
6. **Existing**: All tests in `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` pass.
7. **Existing**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Keyed BitmapText reconciliation is snapshot-based for transform state only: omitted optional transform fields resolve to canonical defaults rather than preserving hidden prior values.
2. Style identity and typed `fontName` behavior from `70BITFONLEA-005` remain intact.
3. Shared-runtime mock-based tests stay aligned with the real Pixi `BitmapText` API surface needed by the reconciler.
4. `instanceKey` replacement semantics are unchanged.
5. `pnpm turbo typecheck` and `pnpm turbo lint` pass with zero errors.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` — add reset-to-default coverage for omitted `alpha`, `rotation`, and `scale`, plus an `apply`-override regression test.
2. `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` — update the hoisted `BitmapText` mock so full-suite verification exercises the same `scale` API shape as production Pixi.

### Commands

1. `pnpm -F @ludoforge/runner test test/canvas/text/bitmap-text-runtime.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Updated `packages/runner/src/canvas/text/bitmap-text-runtime.ts` so omitted keyed `alpha`, `rotation`, and `scale` now reset to canonical transform defaults on both create and reuse.
  - Strengthened `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` with regression coverage for omitted-transform resets and for `apply` intentionally overriding reconciler defaults after base-state application.
  - Corrected `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` so its hoisted `BitmapText` mock exposes `scale.set(...)`, matching the real Pixi API exercised by the shared runtime during the full runner suite.
  - Tightened the ticket wording itself so it accurately scopes the architectural change to transform snapshot semantics only, rather than implicitly promising full-snapshot behavior for every optional field.
- Deviations from original plan:
  - Scope expanded slightly into one additional test file because the full runner suite exposed a harness mismatch (`BitmapText.scale`) that the original ticket assumptions missed. No production renderer behavior changed beyond the shared runtime transform reset semantics.
- Verification results:
  - `pnpm -F @ludoforge/runner test test/canvas/text/bitmap-text-runtime.test.ts` ✅
  - `pnpm -F @ludoforge/runner test test/canvas/renderers/table-overlay-renderer.test.ts` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
