# 70BITFONLEA-003: Measure and Mitigate Initialization Chrome Violations

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small–Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/70BITFONLEA/70BITFONLEA-001-use-preinstalled-font-names-in-table-overlay.md, archive/tickets/70BITFONLEA/70BITFONLEA-002-guard-table-overlay-marker-style-reassignment.md, archive/tickets/70BITFONLEA/70BITFONLEA-004-replace-bitmaptext-fontfamily-strings-with-typed-font-contract.md, archive/tickets/70BITFONLEA/70BITFONLEA-005-guard-keyed-bitmaptext-style-reassignment.md

## Problem

During game initialization, Chrome emits `'message' handler took 150ms` and `'requestAnimationFrame' handler took 61–99ms` violation warnings. The `setAndDerive()` function in `game-store.ts` performs three expensive synchronous operations inside a single Zustand `set()` callback:

1. `deriveStoreRunnerProjection()` — O(zones × tokens + cards) traversal
2. `deriveStoreWorldLayout()` — ForceAtlas2 layout computation
3. `projectRenderModel()` — second full traversal of game state

This creates a 3–4 frame stall for FITL (10+ zones, 20–50 tokens, 117 event cards).

**This ticket is measurement-gated**: the font leak and BitmapText style-churn fixes across tickets 001 + 002 + 004 + 005 may themselves reduce handler times below the violation threshold, since dynamic font generation and repeated BitmapText style reassignment were part of the work happening during initialization. Implementation of the deferral only proceeds if violations persist.

## Assumption Reassessment (2026-03-21)

1. `setAndDerive()` in `game-store.ts` (lines 690–709) calls `deriveStoreRunnerProjection()`, `deriveStoreWorldLayout()`, and `projectRenderModel()` synchronously inside a single `set()` callback — **confirmed**.
2. `projectRenderModel()` depends on `runnerProjection` being non-null — **confirmed** (guarded by null check at line 705).
3. The canvas updater subscribes to store changes with equality selectors — **confirmed**, but that does **not** make `renderModel` a safe deferred side channel because React chrome and other store consumers also read it directly.
4. `deriveStoreWorldLayout()` depends only on `gameDef` and `visualConfigProvider`, not on `runnerProjection` — **confirmed**.
5. `renderModel` is a first-class derived store artifact, not an optional presentation cache:
   - `GameContainer.tsx`, `PhaseIndicator.tsx`, `ActionToolbar.tsx`, and multiple other UI surfaces subscribe to it directly.
   - `emitMoveAppliedTrace()` falls back to `state.renderModel` for player labeling.
   - Existing store tests already assume `initGame()` leaves the store with a populated `renderModel` before callers continue.
6. `queueMicrotask()` would not create a true paint boundary. It would split one internally consistent store snapshot into two updates while still running before the browser returns to rendering.

## Architecture Check

1. The originally proposed `queueMicrotask()` deferral is **not** better than the current architecture. It would intentionally publish a partially derived store snapshot where `runnerProjection`, `runnerFrame`, and `worldLayout` are current while `renderModel` is stale or null.
2. That split weakens the store contract for minimal gain. `renderModel` is consumed across UI chrome and trace emission, not only by the canvas updater.
3. Because microtasks run before the browser returns to rendering, this proposal is also a weak mitigation strategy for frame-budget problems. It adds state inconsistency without establishing a durable async pipeline boundary.
4. The cleaner architecture is to keep `setAndDerive()` producing one internally consistent derived snapshot. If initialization performance regresses again, the next fix should target the measured hot path directly:
   - projection/layout caching,
   - reducing duplicate work inside the synchronous derivation pipeline,
   - or introducing a deliberate architectural boundary backed by profiling and tests.
5. No backwards-compatibility shims or aliasing are needed. The correct resolution for this ticket is to close it without changing the store architecture.

## What to Change

### 1. Measurement Protocol (mandatory before any code changes)

After `70BITFONLEA-001`, `70BITFONLEA-002`, `70BITFONLEA-004`, and `70BITFONLEA-005` are merged:

1. Run `pnpm -F @ludoforge/runner dev`
2. Open Chrome DevTools console
3. Verify: no `"dynamically created N bitmap fonts"` warnings
4. Check: are `requestAnimationFrame` violations still > 50ms?
5. Check: is `message` handler violation still > 100ms?
6. Document results in this ticket file (update the Measurement Results section below).

**If violations are absent or ≤ 50ms / ≤ 100ms respectively**: close this ticket with no runner code changes — the earlier bitmap-font fixes resolved the issue enough that this mitigation is no longer justified.

**If violations persist**: proceed to step 2.

### 2. Reassess Architecture Before Any Store Change

**Do not implement the originally proposed `queueMicrotask()` split.**

If initialization violations still reproduce in a future regression, open a new profiling-driven ticket against the measured hot path rather than splitting `renderModel` away from the rest of the synchronous derivation snapshot.

## Measurement Results

Measured on 2026-03-21 after `70BITFONLEA-001`, `70BITFONLEA-002`, `70BITFONLEA-004`, and `70BITFONLEA-005` were already in place.

- Environment:
  - local runner dev server at `http://127.0.0.1:4173/`
  - Chrome DevTools browser session
  - Fire in the Lake initialized from the pre-game screen on 2026-03-21
- Observed console output:
  - no `"You have dynamically created N bitmap fonts"` warnings
  - no Chrome `Violation` warnings for `'message' handler` or `'requestAnimationFrame' handler` during initialization
- `requestAnimationFrame` violation duration: not observed
- `message` handler violation duration: not observed
- Decision: CLOSE WITH NO CODE CHANGE

## Files to Touch

- This ticket required no production code changes after reassessment and measurement.

## Out of Scope

- Font name changes — completed in 70BITFONLEA-001.
- Table-overlay marker style caching — handled in `70BITFONLEA-002`.
- Shared keyed BitmapText style-guard work — handled in `70BITFONLEA-005`.
- Typed BitmapText font-contract cleanup — completed in `70BITFONLEA-004`.
- Refactoring `deriveStoreRunnerProjection()` or `deriveStoreWorldLayout()` internals without a fresh measured regression.
- Any changes to canvas updater subscription logic.
- Adding `performance.mark()` / `performance.measure()` instrumentation in this closeout.
- Any engine (`packages/engine/`) changes.
- Any changes to `bitmap-font-registry.ts` or `table-overlay-renderer.ts`.

## Acceptance Criteria

### Tests That Must Pass

1. Measurement is rerun after the bitmap-font fixes land.
2. If the violation warnings are absent or below threshold, no runner store change is made.
3. **Existing**: `pnpm -F @ludoforge/runner test` passes.
4. **Existing**: `pnpm turbo typecheck` passes.
5. **Existing**: `pnpm turbo lint` passes.

### Invariants

1. `deriveStoreRunnerProjection()`, `deriveStoreWorldLayout()`, and `projectRenderModel()` continue to be published as one synchronous derived snapshot.
2. `renderModel` is not split into a delayed follow-up store update.
3. `pnpm turbo typecheck` and `pnpm turbo lint` pass with zero errors.
4. Because measurement shows the violations are no longer present, **no code changes are made** in this ticket.

## Test Plan

### New/Modified Tests

1. None. Existing coverage already asserts that `initGame()` leaves the store with a populated `renderModel`, and no code path changed in this ticket.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

### Manual Verification

1. Run `pnpm -F @ludoforge/runner dev`, open browser console:
   - Confirm: no `"dynamically created N bitmap fonts"` warnings
   - Confirm: no Chrome `Violation` warnings during initialization
   - Confirm: canvas renders correctly with zone labels, token badges, table overlays, and chrome panels

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Reassessed the ticket against the current runner store, canvas updater, React chrome, and existing tests.
  - Measured FITL initialization in a live Chrome DevTools session after the earlier bitmap-font fixes were already in place.
  - Closed the ticket without production code changes because the original violation warnings no longer reproduce.
- Deviations from original plan:
  - Rejected the proposed `queueMicrotask()` deferral after reassessment. It would have weakened the store architecture by publishing a partially derived snapshot and would not have established a real paint-boundary mitigation.
  - No new tests were added because no code path changed; existing tests already cover the synchronous `renderModel` invariant and the full runner suite remained green.
- Verification results:
  - Live browser measurement on 2026-03-21: no bitmap-font leak warnings; no Chrome `Violation` warnings observed during FITL initialization.
  - `pnpm -F @ludoforge/runner test` ✅ (`174` files, `1752` tests)
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
