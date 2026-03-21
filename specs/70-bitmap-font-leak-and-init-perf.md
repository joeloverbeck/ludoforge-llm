# Spec 70 — BitmapText Font Leak & Initialization Performance

## Status: NOT STARTED

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

Move `projectRenderModel()` out of the synchronous Zustand `set()` callback. Keep `deriveRunnerFrame()` and `deriveStoreWorldLayout()` synchronous (required for state consistency), but schedule `projectRenderModel()` via `queueMicrotask()`. This splits the heavy initialization work across two event loop turns.

The store state will briefly lack the projected render model between the two microtasks. The canvas updater subscription should handle this gracefully — it already uses equality selectors that will simply see the update arrive on the next tick.

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
- If violations persist: defer `projectRenderModel()` via `queueMicrotask()`
- Document measurement results
