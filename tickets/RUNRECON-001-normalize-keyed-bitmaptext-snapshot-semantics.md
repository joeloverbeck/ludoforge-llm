# RUNRECON-001: Normalize keyed BitmapText snapshot semantics

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: docs/FOUNDATIONS.md, tickets/README.md, archive/tickets/70BITFONLEA/70BITFONLEA-005-guard-keyed-bitmaptext-style-reassignment.md

## Problem

`packages/runner/src/canvas/text/bitmap-text-runtime.ts` currently treats reused keyed BitmapText entries as a partial patch for some fields and as a full snapshot for others:

- `visible` and `renderable` reset to `true` when omitted,
- but `alpha`, `rotation`, and `scale` retain their previous values when omitted.

That contract is inconsistent and hard to reason about. A keyed reconciler should be declarative: each reconcile pass should fully describe the retained display state for a reused keyed entry. Under the current behavior, a caller that conditionally sets `alpha`, `rotation`, or `scale` can accidentally leak yesterday's transform into today's render just by omitting the field once the condition stops applying.

No current runner path appears to be visibly broken by this yet, but the architecture is weaker than it should be. The inconsistency already exists inside the shared runtime boundary, which means future renderers can inherit it by default.

## Assumption Reassessment (2026-03-21)

1. `createKeyedBitmapTextReconciler()` currently resets `visible` and `renderable` on every reconcile via `spec.visible ?? true` and `spec.renderable ?? true`, but only assigns `alpha`, `rotation`, and `scale` when the field is explicitly present — **confirmed** in `packages/runner/src/canvas/text/bitmap-text-runtime.ts`.
2. The active keyed BitmapText caller in `table-overlay-renderer.ts` currently omits `alpha`, `rotation`, and `scale`, so the stale-state behavior is not exposed there today — **confirmed**.
3. The keyed BitmapText tests currently cover creation, instance-key replacement, style reassignment guards, and non-style updates, but they do **not** assert reset-to-default behavior when `alpha`, `rotation`, or `scale` are omitted on a later reconcile — **confirmed** in `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts`.
4. The recently completed `70BITFONLEA-005` fixed shared style churn and redundant creation-path style writes, but it intentionally did **not** change omission semantics for transform-like fields — **confirmed** in `archive/tickets/70BITFONLEA/70BITFONLEA-005-guard-keyed-bitmaptext-style-reassignment.md`.
5. No engine/compiler/runtime agnostic layers are involved here; this is a Pixi runner display-contract issue only — **confirmed**.

## Architecture Check

1. Resetting omitted keyed BitmapText transform fields to canonical defaults is cleaner than preserving hidden prior state. It makes the reconciler behave like a true snapshot API rather than a partially stateful patch API.
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

Creation and reuse should follow the same rule so a newly created entry and a reused entry with the same spec resolve to the same display state.

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

## Files to Touch

- `packages/runner/src/canvas/text/bitmap-text-runtime.ts` (modify)
- `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` (modify)

## Out of Scope

- Generic Pixi `Text` runtime semantics in `packages/runner/src/canvas/text/text-runtime.ts`
- Introducing new BitmapText style fields or widening the typed bitmap font contract
- Renderer-specific animation policy decisions
- Any engine (`packages/engine/`) or GameSpecDoc/GameDef changes

## Acceptance Criteria

### Tests That Must Pass

1. **New**: A keyed BitmapText entry reconciled from `alpha: 0.25` to omitted `alpha` ends at `alpha === 1`.
2. **New**: A keyed BitmapText entry reconciled from non-zero `rotation` to omitted `rotation` ends at `rotation === 0`.
3. **New**: A keyed BitmapText entry reconciled from non-unit `scale` to omitted `scale` ends at `scale.x === 1` and `scale.y === 1`.
4. **New**: `apply` callbacks still run after base-state reconciliation and can override the defaulted transform values intentionally.
5. **Existing**: All tests in `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` pass.
6. **Existing**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. Keyed BitmapText reconciliation is snapshot-based for transform state: omitted optional transform fields resolve to canonical defaults rather than preserving hidden prior values.
2. Style identity and typed `fontName` behavior from `70BITFONLEA-005` remain intact.
3. `instanceKey` replacement semantics are unchanged.
4. `pnpm turbo typecheck` and `pnpm turbo lint` pass with zero errors.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` — add reset-to-default coverage for omitted `alpha`, `rotation`, and `scale`, plus an `apply`-override regression test.

### Commands

1. `pnpm -F @ludoforge/runner test test/canvas/text/bitmap-text-runtime.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
