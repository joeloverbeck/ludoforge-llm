# PIXIFOUND-012: Selection Dispatcher and Click-to-Select Interactions

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D8 + D13
**Priority**: P0
**Depends on**: PIXIFOUND-008, PIXIFOUND-010
**Blocks**: PIXIFOUND-014

---

## Objective

Implement the unified `SelectionDispatcher` and click-to-select interaction handlers for both zones and tokens. Includes click/drag intent detection (pointer distance threshold) so that panning does not trigger selection. Token clicks call `stopPropagation()` to prevent bubbling to parent zones.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/interactions/selection-dispatcher.ts` — `dispatchCanvasSelection()` function
- `packages/runner/src/canvas/interactions/zone-select.ts` — `attachZoneSelectHandlers()` function
- `packages/runner/src/canvas/interactions/token-select.ts` — `attachTokenSelectHandlers()` function

### New test files
- `packages/runner/test/canvas/interactions/selection-dispatcher.test.ts`
- `packages/runner/test/canvas/interactions/zone-select.test.ts`
- `packages/runner/test/canvas/interactions/token-select.test.ts`

---

## Out of Scope

- Do NOT implement drag-and-drop move execution — the click/drag intent detection is a no-op stub for drag; only selection is implemented here.
- Do NOT implement keyboard zone selection — that is PIXIFOUND-015.
- Do NOT implement hover highlight visuals — those are part of the renderer visual state (PIXIFOUND-008/010). This ticket only dispatches selection events.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).
- Do NOT modify renderers (PIXIFOUND-008/009/010).

---

## Implementation Details

### SelectionDispatcher

```typescript
export function dispatchCanvasSelection(
  store: GameStore,
  target: { type: 'zone'; id: string } | { type: 'token'; id: string },
): void;
```

Dispatches `store.chooseOne(target.id)` when a zone or token is selected. This feeds into the existing move construction pipeline.

### Zone click-to-select (zone-select.ts)

```typescript
export function attachZoneSelectHandlers(
  zoneContainer: Container,
  zoneId: string,
  isSelectable: () => boolean,
  dispatcher: (target: { type: 'zone'; id: string }) => void,
): () => void;  // Returns cleanup function
```

- `pointerdown`: record pointer position.
- `pointermove`: if distance > 5px threshold, set `dragIntent = true`.
- `pointerup`: if `!dragIntent && isSelectable()`, call `dispatcher({ type: 'zone', id: zoneId })`.
- `pointerover`/`pointerout`: used for hover visual feedback (set cursor style).
- Returns a cleanup function that removes all listeners.

### Token click-to-select (token-select.ts)

Same pattern as zone selection, plus:
- `pointerup` calls `event.stopPropagation()` to prevent bubbling to parent zone.
- Uses `{ type: 'token', id: tokenId }` target.

---

## Acceptance Criteria

### Tests that must pass

**`selection-dispatcher.test.ts`** (mock GameStore):
- `dispatchCanvasSelection(store, { type: 'zone', id: 'z1' })` calls `store.chooseOne('z1')`.
- `dispatchCanvasSelection(store, { type: 'token', id: 't1' })` calls `store.chooseOne('t1')`.

**`zone-select.test.ts`** (mock Container, mock events):
- pointerdown + pointerup (no move) with `isSelectable() === true`: dispatcher called with zone target.
- pointerdown + pointermove (>5px) + pointerup: dispatcher NOT called (drag intent).
- pointerdown + pointerup with `isSelectable() === false`: dispatcher NOT called.
- Cleanup function removes all listeners from container.
- pointerdown + pointermove (<5px) + pointerup: dispatcher IS called (small jitter allowed).

**`token-select.test.ts`** (mock Container, mock events):
- Same click/drag intent tests as zone-select.
- pointerup calls `stopPropagation()` on the event.
- Dispatcher called with `{ type: 'token', id }`.
- Cleanup function removes all listeners.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- Token clicks do NOT bubble to parent zone handlers.
- Drag threshold (5px) prevents pan from triggering selection.
- `isSelectable` is checked at event time, not at attach time (supports dynamic selectability).
- No game-specific logic — selection target is an opaque ID string.
