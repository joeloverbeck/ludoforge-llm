# PIXIFOUND-015: Accessibility — Keyboard Navigation and Screen Reader

**Status**: ✅ COMPLETED

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: Accessibility section
**Priority**: P1
**Depends on**: PIXIFOUND-014
**Blocks**: None

---

## Reassessed Assumptions and Scope Updates (Validated Against Current Code + Specs 35-00/38)

1. `GameCanvas.tsx` already exists and uses `createGameCanvasRuntime(...)` as the composition seam; accessibility wiring must integrate into this runtime lifecycle, not bypass it.
2. Pointer selection lifecycle ownership remains renderer-bound from PIXIFOUND-012 (`bindSelection` hooks). This ticket should layer keyboard/screen-reader behavior without changing renderer or pointer-interaction contracts.
3. Runner tests execute in Vitest `node` environment (`packages/runner/vitest.config.ts`), so new accessibility modules must be testable with lightweight document/element stubs (no jsdom-only assumptions).
4. Current render model already exposes `zones[].isSelectable`; keyboard navigation should read selectable IDs dynamically from store state to avoid stale focus.
5. Existing accessibility in Spec 38 is partially delivered (`role="application"`, `aria-label="Game board"`), but keyboard selection and live announcements are not implemented yet.

---

## Objective

Add keyboard zone selection (arrow keys to cycle through selectable zones, Enter/Space to confirm) and screen reader announcements for selection changes. These complement the pointer-based interactions from PIXIFOUND-012.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/interactions/keyboard-select.ts` — keyboard navigation handler
- `packages/runner/src/canvas/interactions/aria-announcer.ts` — screen reader live region manager

### Modified files
- `packages/runner/src/canvas/GameCanvas.tsx` — add `aria-live` region and wire keyboard handler

### New test files
- `packages/runner/test/canvas/interactions/keyboard-select.test.ts`
- `packages/runner/test/canvas/interactions/aria-announcer.test.ts`

### Modified test files
- `packages/runner/test/canvas/GameCanvas.test.ts` — verify runtime wiring, announcements, and accessible live-region markup

---

## Out of Scope

- Do NOT implement full WCAG 2.1 AA compliance for the entire app — this ticket covers canvas-specific accessibility only.
- Do NOT implement tab-based focus management for DOM UI panels — that is Spec 39.
- Do NOT implement touch accessibility beyond what pointer events provide.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).
- Do NOT modify renderers (PIXIFOUND-008/009/010) or interactions (PIXIFOUND-012).

---

## Architecture Rationale

Compared to pushing keyboard/screen-reader logic directly into renderer internals or duplicating selection logic, this ticket is more beneficial when implemented as a thin orchestration layer in `GameCanvas` plus two focused interaction utilities:

- Keeps pointer interactions and renderer cleanup boundaries stable (already proven by PIXIFOUND-012 tests).
- Adds accessibility as composable behavior (`attachKeyboardSelect`, `createAriaAnnouncer`) that can later be reused by Spec 39 DOM controls.
- Preserves game-agnostic architecture: keyboard and announcements consume opaque zone/token IDs and `RenderModel` flags only.
- Avoids brittle coupling to DOM runtime in tests by keeping modules side-effect-light and dependency-minimal.

---

## Implementation Details

### Keyboard zone selection (keyboard-select.ts)

```typescript
export interface KeyboardSelectConfig {
  readonly getSelectableZoneIDs: () => readonly string[];
  readonly getCurrentFocusedZoneID: () => string | null;
  readonly onSelect: (zoneId: string) => void;
  readonly onFocusChange: (zoneId: string | null) => void;
  readonly onFocusAnnounce?: (zoneId: string) => void;
}

export function attachKeyboardSelect(config: KeyboardSelectConfig): () => void;
```

- Attaches a `document` `keydown` listener.
- **Arrow keys** (Up/Down or Left/Right): cycle focus through selectable zone IDs list.
- **Enter / Space**: confirm selection on the currently focused zone.
- **Escape**: clear focus (deselect).
- Only active when there are selectable zones (reads from store's RenderModel).
- If focused zone disappears from selectable set, focus is repaired deterministically on next navigation keypress.
- Returns cleanup function to remove the listener.

### Screen reader announcements (aria-announcer.ts)

```typescript
export interface AriaAnnouncer {
  announce(message: string): void;
  destroy(): void;
}

export function createAriaAnnouncer(container: HTMLElement): AriaAnnouncer;
```

- Creates or manages an `aria-live="polite"` region within the canvas container.
- `announce()` sets the text content, triggering screen reader announcement.
- Used to announce: zone/token selection changes, keyboard focus changes.
- `destroy()` removes the live region element.

### GameCanvas.tsx changes

- Add `aria-live="polite"` region as a sibling to the canvas `<div>`.
- Wire `attachKeyboardSelect()` on mount, cleanup on unmount.
- Wire `AriaAnnouncer` to selection dispatcher and keyboard handler.
- Keep runtime teardown ordering deterministic: accessibility cleanup happens before canvas runtime destroy completes.

---

## Acceptance Criteria

### Tests that must pass

**`keyboard-select.test.ts`**:
- Arrow Down with selectable zones `['a', 'b', 'c']` and no current focus: focuses 'a'.
- Arrow Down from 'a': focuses 'b'.
- Arrow Down from 'c' (last): wraps to 'a'.
- Arrow Up from 'a' (first): wraps to 'c'.
- Enter on focused zone: calls `onSelect` with that zone ID.
- Space on focused zone: calls `onSelect` with that zone ID.
- Escape: calls `onFocusChange(null)`.
- No selectable zones: all key presses are no-ops.
- Cleanup function removes the document keydown listener.
- Non-navigation keys are ignored.

**`aria-announcer.test.ts`**:
- `announce('Zone selected: Saigon')` sets text in the live region.
- Subsequent `announce()` replaces previous text.
- `destroy()` removes the live region element from container.
- Live region has `aria-live="polite"` and `role="status"`.

**`GameCanvas.test.ts`**:
- Container markup includes a polite status live-region element.
- Runtime wires keyboard selection + announcement callbacks and tears them down on destroy.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- Keyboard handler reads selectable zones dynamically (not cached at attach time).
- `aria-live` region is polite (not assertive) to avoid interrupting screen reader flow.
- Keyboard navigation is independent of pointer interaction (both work simultaneously).
- No game-specific logic — zone IDs are opaque strings.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/canvas/interactions/keyboard-select.ts` with dynamic selectable-zone keyboard navigation and cleanup-safe document listener lifecycle.
  - Added `packages/runner/src/canvas/interactions/aria-announcer.ts` with polite live-region management and teardown.
  - Added `packages/runner/src/canvas/interactions/canvas-interaction-controller.ts` to centralize selection/focus interaction policy and announcements for pointer + keyboard flows.
  - Updated `packages/runner/src/canvas/GameCanvas.tsx` to wire keyboard selection + screen-reader announcements into runtime composition while preserving deterministic teardown ordering.
  - Added tests:
    - `packages/runner/test/canvas/interactions/keyboard-select.test.ts`
    - `packages/runner/test/canvas/interactions/aria-announcer.test.ts`
    - `packages/runner/test/canvas/interactions/canvas-interaction-controller.test.ts`
  - Strengthened `packages/runner/test/canvas/GameCanvas.test.ts` to validate accessibility markup and runtime accessibility lifecycle wiring.
- **Deviations from original plan**:
  - Added explicit reassessment and architecture-rationale sections to keep ticket assumptions aligned with current runtime architecture and node-based test environment.
  - Reused a static live-region sibling in `GameCanvas` and allowed the announcer module to manage existing regions, which is cleaner for React ownership and remount behavior.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test test/canvas/interactions/keyboard-select.test.ts test/canvas/interactions/aria-announcer.test.ts test/canvas/GameCanvas.test.ts` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
