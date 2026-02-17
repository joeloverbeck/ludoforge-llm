# PIXIFOUND-015: Accessibility — Keyboard Navigation and Screen Reader

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: Accessibility section
**Priority**: P1
**Depends on**: PIXIFOUND-014
**Blocks**: None

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

---

## Out of Scope

- Do NOT implement full WCAG 2.1 AA compliance for the entire app — this ticket covers canvas-specific accessibility only.
- Do NOT implement tab-based focus management for DOM UI panels — that is Spec 39.
- Do NOT implement touch accessibility beyond what pointer events provide.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).
- Do NOT modify renderers (PIXIFOUND-008/009/010) or interactions (PIXIFOUND-012).

---

## Implementation Details

### Keyboard zone selection (keyboard-select.ts)

```typescript
export interface KeyboardSelectConfig {
  readonly getSelectableZoneIDs: () => readonly string[];
  readonly getCurrentFocusedZoneID: () => string | null;
  readonly onSelect: (zoneId: string) => void;
  readonly onFocusChange: (zoneId: string | null) => void;
}

export function attachKeyboardSelect(config: KeyboardSelectConfig): () => void;
```

- Attaches a `document` `keydown` listener.
- **Arrow keys** (Up/Down or Left/Right): cycle focus through selectable zone IDs list.
- **Enter / Space**: confirm selection on the currently focused zone.
- **Escape**: clear focus (deselect).
- Only active when there are selectable zones (reads from store's RenderModel).
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

**`aria-announcer.test.ts`**:
- `announce('Zone selected: Saigon')` sets text in the live region.
- Subsequent `announce()` replaces previous text.
- `destroy()` removes the live region element from container.
- Live region has `aria-live="polite"` and `role="status"`.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- Keyboard handler reads selectable zones dynamically (not cached at attach time).
- `aria-live` region is polite (not assertive) to avoid interrupting screen reader flow.
- Keyboard navigation is independent of pointer interaction (both work simultaneously).
- No game-specific logic — zone IDs are opaque strings.
