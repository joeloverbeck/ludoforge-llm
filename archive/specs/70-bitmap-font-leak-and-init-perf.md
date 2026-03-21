# Spec 70 — BitmapText Font Leak & Initialization Performance

## Status: ✅ COMPLETED

## Problem

After Spec 69 eliminated canvas-blanking crashes, two categories of browser console warnings remain:

1. **BitmapText dynamic font leak** (critical) — PixiJS emits `"You have dynamically created N bitmap fonts"` warnings where N climbs from 51 to 86+ during a single session, incrementing by 1 per render tick. This is an unbounded memory and performance leak.
2. **Chrome Violation warnings** (secondary) — `'message' handler took 150ms` and `'requestAnimationFrame' handler took 61–99ms` during game initialization.

## Root Cause Analysis

### 1. BitmapText Font Leak

The runner pre-installs two bitmap fonts at startup via `bitmap-font-registry.ts`:
- `ludoforge-label` (plain monospace, 14px)
- `ludoforge-label-stroke` (monospace with black stroke, 14px)

Zone renderers, token renderers, and hidden-zone-stack all correctly reference these pre-installed font names. However, the **table overlay path** bypasses them:

- `project-table-overlay-surface.ts` line 56 sets `DEFAULT_FONT_FAMILY = 'monospace'` — the raw CSS font family name, not a pre-installed bitmap font name.
- This value flows into `table-overlay-renderer.ts`:
  - Line 49: initial marker label uses `fontFamily: 'monospace'`
  - Line 87: `updateMarkerSlot()` sets `fontFamily: resolved.style.fontFamily` (which resolves to `'monospace'`)
  - Lines 110–114: text reconciliation specs use `fontFamily: item.style.fontFamily` (also `'monospace'`)

When PixiJS BitmapText receives `fontFamily: 'monospace'` (not a recognized pre-installed bitmap font name), it auto-generates a new bitmap font from the CSS font. Additionally, `updateMarkerSlot()` at line 84 reassigns `slot.label.style = { ... }` with a **new object on every update cycle**, which triggers PixiJS's font lookup and creation each time.

### 2. Chrome Violations

During game initialization, `game-store.ts` lines 693–706 perform three expensive synchronous operations inside a single Zustand `set()` callback:

1. `deriveRunnerFrame()` — O(zones × tokens + cards) traversal
2. `projectRenderModel()` — second full traversal of game state
3. `deriveStoreWorldLayout()` — ForceAtlas2 layout computation

All of this runs synchronously in the worker `message` event handler before the browser can paint a frame. The subsequent `requestAnimationFrame` then triggers `applySnapshot()` in the canvas updater, which synchronously creates all zone/token display objects.

For FITL (10+ zones, 20–50 tokens, 117 event cards), this creates a 3–4 frame stall.

## Solution

### Pillar 1: Fix BitmapText Font Leak

#### 1a. Use Pre-Installed Font Names in Table Overlay Surface

**File**: `packages/runner/src/presentation/project-table-overlay-surface.ts`

Change `DEFAULT_FONT_FAMILY` from `'monospace'` to `LABEL_FONT_NAME` (imported from `bitmap-font-registry.ts`). This ensures all table overlay text uses the pre-installed bitmap font instead of triggering dynamic font creation.

#### 1b. Use Pre-Installed Font Name in Table Overlay Renderer

**File**: `packages/runner/src/canvas/renderers/table-overlay-renderer.ts`

Change the initial marker label creation (line 49) from `fontFamily: 'monospace'` to `fontFamily: LABEL_FONT_NAME`.

#### 1c. Cache Style Objects to Prevent Per-Tick Recreation

**File**: `packages/runner/src/canvas/renderers/table-overlay-renderer.ts`

In `updateMarkerSlot()` (lines 84–88), avoid creating a new style object on every call. Instead, compare the incoming style properties against the current ones and only reassign `slot.label.style` when a property has actually changed. This prevents PixiJS from re-evaluating the font lookup on every render tick.

### Pillar 2: Violation Mitigation (Measure-Gated)

This pillar is gated on measurement. The font leak fix in Pillar 1 may itself reduce `requestAnimationFrame` handler time below the violation threshold, since dynamic font generation is expensive per-tick work.

#### Measurement Protocol

After implementing Pillar 1:
1. Run `pnpm -F @ludoforge/runner dev`
2. Open browser console
3. Verify: no `"dynamically created N bitmap fonts"` warnings
4. Check: are `requestAnimationFrame` violations still > 50ms?
5. Check: is `message` handler violation still > 100ms?

If violations persist:

#### 2a. Defer Render Model Projection

**File**: `packages/runner/src/store/game-store.ts`

Original proposal: move `projectRenderModel()` out of the synchronous Zustand `set()` callback and schedule it via `queueMicrotask()`.

Final reassessment on 2026-03-21: this mitigation was **not** implemented. After tickets `70BITFONLEA-001`, `70BITFONLEA-002`, `70BITFONLEA-004`, and `70BITFONLEA-005`, the violation warnings no longer reproduced in live Chrome measurement, and the proposed async split was architecturally weaker than the synchronous snapshot model:

- `renderModel` is a first-class derived store artifact consumed by React chrome and trace emission, not only by the canvas updater.
- Deferring it would publish a partially derived store snapshot where `runnerProjection`, `runnerFrame`, and `worldLayout` were current but `renderModel` was stale or null.
- `queueMicrotask()` would not create a durable paint boundary; it would add state inconsistency without a strong performance guarantee.

The clean resolution was to keep `setAndDerive()` synchronous and close the mitigation pillar with no code change.

## Foundations Alignment

| Foundation | Alignment |
|---|---|
| F1. Engine Agnosticism | No engine changes |
| F3. Visual Separation | Font names remain in presentation layer, not in GameSpecDoc |
| F5. Determinism | Unaffected — timing changes are presentation-only |
| F7. Immutability | Preserved — style caching compares values, doesn't mutate |
| F9. No Backwards Compat | Clean fix, no shims or aliases |
| F10. Architectural Completeness | Addresses root cause (wrong font name) not symptoms |
| F11. Testing as Proof | Regression tests prove the leak is fixed |

## Testing

### New Tests

1. **BitmapText font leak regression test**: After canvas initialization with a game state, spy on `BitmapFontManager.install`. Verify no additional calls occur beyond the 2 pre-installed fonts during a simulated render cycle.

2. **Table overlay style caching test**: Call `updateMarkerSlot()` twice with identical style properties. Verify that the BitmapText's style property is not reassigned on the second call.

3. **Table overlay font name test**: Verify that `resolveTextStyle()` and `resolveMarkerStyle()` in `project-table-overlay-surface.ts` return the pre-installed font name, not `'monospace'`.

### Existing Tests

- All existing `table-overlay-renderer` tests must continue passing.
- All existing `bitmap-font-registry` tests must continue passing.

### Manual Verification

1. `pnpm -F @ludoforge/runner test` — all tests pass
2. `pnpm turbo typecheck` — no type errors
3. `pnpm turbo lint` — no lint errors
4. Run `pnpm -F @ludoforge/runner dev`, open browser console:
   - Confirm: no `"dynamically created N bitmap fonts"` warnings
   - Confirm: Chrome Violation warnings reduced or eliminated
   - Confirm: canvas renders correctly with zone labels, token badges, and table overlays

## Ticket Breakdown

### Ticket 1: BITMAPLEAK-001 — Use Pre-Installed Font Names in Table Overlay
- Change `DEFAULT_FONT_FAMILY` in `project-table-overlay-surface.ts`
- Change initial marker label font in `table-overlay-renderer.ts`
- Add font name test for overlay surface

### Ticket 2: BITMAPLEAK-002 — Cache Table Overlay Style Objects
- Implement style comparison in `updateMarkerSlot()`
- Add style caching test
- Add font leak regression test

### Ticket 3: BITMAPLEAK-003 — Measure and Mitigate Initialization Violations
- Measure console output after tickets 1–2
- If violations persist: reassess the hot path before changing store architecture
- Document measurement results

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Implemented the bitmap-font leak fixes and BitmapText style-churn reductions through the archived `70BITFONLEA-001`, `70BITFONLEA-002`, `70BITFONLEA-004`, and `70BITFONLEA-005` tickets.
  - Reassessed the initialization-violation mitigation against the current codebase and live Chrome measurement.
  - Closed the violation-mitigation pillar without production code changes because the Chrome `Violation` warnings no longer reproduced after the earlier fixes.
- Deviations from original plan:
  - The spec’s original `queueMicrotask()` deferral idea was rejected during ticket `70BITFONLEA-003` closeout because it would have weakened the store architecture by splitting `renderModel` away from the rest of the derived snapshot.
  - No new runner store tests were added in the final ticket because no store code changed.
- Verification results:
  - Live browser measurement on 2026-03-21 during Fire in the Lake initialization showed no bitmap-font leak warnings and no Chrome `Violation` warnings.
  - `pnpm -F @ludoforge/runner test` ✅ (`174` files, `1752` tests)
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
