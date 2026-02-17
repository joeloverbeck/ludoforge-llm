# PIXIFOUND-012: Selection Dispatcher and Click-to-Select Interactions

**Status**: ✅ COMPLETED

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D8 + D13
**Priority**: P0
**Depends on**: PIXIFOUND-008, PIXIFOUND-010
**Blocks**: PIXIFOUND-014

---

## Objective

Implement the unified `SelectionDispatcher` and click-to-select interaction handlers for zones and tokens with click/drag intent detection (pointer distance threshold) so pan/drag gestures do not trigger selection. Token pointer-up selection must call `stopPropagation()` to prevent bubbling to parent zones.

---

## Reassessed Assumptions (Validated Against Current Code + Specs 35-00/38)

1. `packages/runner/src/canvas/interactions/*` does not exist yet; this ticket must create those modules and tests.
2. Current renderer lifecycle ownership lives in `zone-renderer.ts` and `token-renderer.ts` (container create/remove/destroy), so robust event listener cleanup cannot be guaranteed by interaction helpers alone unless renderer integration points are added.
3. The existing ticket assumption "do not modify renderers" conflicts with Spec 38 D8/D13 behavior ownership and current architecture; minimal renderer integration hooks are in-scope for correctness and cleanup guarantees.
4. `GameCanvas.tsx` wiring is not present yet in this branch; this ticket should deliver reusable interaction modules and renderer-level integration seams, not full app-mount orchestration.
5. `GameStore.chooseOne(...)` already provides the correct generic selection action target for both zone IDs and token IDs; no game-specific branching is required.

---

## Architecture Rationale

Compared to the current architecture (renderers create interactive containers but no click-selection pipeline), this change is beneficial because it:

- Centralizes selection intent in `dispatchCanvasSelection(...)` instead of ad-hoc callbacks.
- Keeps interaction logic in dedicated modules (`zone-select.ts`, `token-select.ts`) while letting renderers own listener lifecycle, preventing leaked listeners on diff/remove/destroy paths.
- Preserves game-agnostic behavior by dispatching opaque IDs only (`chooseOne(id)`), aligned with Spec 38 and runner RenderModel semantics.
- Creates extensible seams for future interaction policies (drag/drop, keyboard focus, hover visuals) without aliasing or duplicating logic.

Long-term note: once canvas mount/orchestration is finalized, these hooks should be passed from the top-level canvas composition root, not hardcoded inside renderers.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/interactions/selection-dispatcher.ts` — `dispatchCanvasSelection()`
- `packages/runner/src/canvas/interactions/zone-select.ts` — `attachZoneSelectHandlers()`
- `packages/runner/src/canvas/interactions/token-select.ts` — `attachTokenSelectHandlers()`
- `packages/runner/test/canvas/interactions/selection-dispatcher.test.ts`
- `packages/runner/test/canvas/interactions/zone-select.test.ts`
- `packages/runner/test/canvas/interactions/token-select.test.ts`

### Existing files (minimal integration)
- `packages/runner/src/canvas/renderers/zone-renderer.ts` — add optional interaction binding hook + cleanup
- `packages/runner/src/canvas/renderers/token-renderer.ts` — add optional interaction binding hook + cleanup
- `packages/runner/test/canvas/renderers/zone-renderer.test.ts` — coverage for interaction hook lifecycle
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` — coverage for interaction hook lifecycle

---

## Out of Scope

- Do NOT implement drag-and-drop move execution; click/drag intent detection remains selection-only.
- Do NOT implement keyboard zone selection; that is PIXIFOUND-015.
- Do NOT implement hover highlight visuals beyond pointer cursor feedback.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify runner `store/`, `model/`, `worker/`, or `bridge/` behavior.
- Do NOT implement full canvas app mount/orchestration wiring (`GameCanvas` lifecycle ticket scope).

---

## Implementation Details

### SelectionDispatcher

```typescript
export function dispatchCanvasSelection(
  store: GameStore,
  target: { type: 'zone'; id: string } | { type: 'token'; id: string },
): void;
```

Dispatches `store.chooseOne(target.id)` when a zone or token is selected.

### Zone click-to-select (`zone-select.ts`)

```typescript
export function attachZoneSelectHandlers(
  zoneContainer: Container,
  zoneId: string,
  isSelectable: () => boolean,
  dispatcher: (target: { type: 'zone'; id: string }) => void,
): () => void;
```

- `pointerdown`: record pointer position.
- `pointermove`: if distance > 5px threshold, set drag intent.
- `pointerup`: if not drag intent and `isSelectable()` at event time, dispatch zone target.
- `pointerover`/`pointerout`: pointer cursor feedback.
- Returns cleanup function removing all registered listeners.

### Token click-to-select (`token-select.ts`)

Same click/drag intent pattern as zone selection, plus:
- `pointerup` calls `event.stopPropagation()`.
- Dispatches token target.
- Returns cleanup function removing listeners.

### Renderer integration seam

Renderers accept optional interaction callbacks to bind/unbind handlers per container lifecycle. If no callback is provided, renderers behave exactly as before. On remove/destroy, renderer must invoke cleanup handlers.

---

## Acceptance Criteria

### Tests that must pass

**`selection-dispatcher.test.ts`**
- zone target calls `store.chooseOne(zoneId)`.
- token target calls `store.chooseOne(tokenId)`.

**`zone-select.test.ts`**
- pointerdown + pointerup without move and selectable => dispatcher called.
- move > threshold => dispatcher not called.
- not selectable at pointerup => dispatcher not called.
- move < threshold jitter => dispatcher called.
- cleanup removes listeners.

**`token-select.test.ts`**
- same click/drag/selectability behavior as zone.
- pointerup calls `stopPropagation()`.
- dispatcher receives token target.
- cleanup removes listeners.

**Renderer lifecycle tests**
- zone renderer invokes interaction cleanup when a zone is removed/destroyed (when integration hook provided).
- token renderer invokes interaction cleanup when a token is removed/destroyed (when integration hook provided).

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`.

### Invariants that must remain true

- `pnpm -F @ludoforge/runner typecheck` passes.
- Token clicks do NOT bubble to parent zone handlers.
- Drag threshold (5px) prevents panning intent from triggering selection.
- `isSelectable` is evaluated at event time, not attach time.
- No game-specific logic; selection payload is opaque string ID.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `selection-dispatcher`, `zone-select`, and `token-select` modules in `packages/runner/src/canvas/interactions/`.
  - Added new interaction tests:
    - `packages/runner/test/canvas/interactions/selection-dispatcher.test.ts`
    - `packages/runner/test/canvas/interactions/zone-select.test.ts`
    - `packages/runner/test/canvas/interactions/token-select.test.ts`
  - Added renderer integration seams and cleanup ownership in:
    - `packages/runner/src/canvas/renderers/zone-renderer.ts`
    - `packages/runner/src/canvas/renderers/token-renderer.ts`
  - Strengthened renderer lifecycle cleanup tests in:
    - `packages/runner/test/canvas/renderers/zone-renderer.test.ts`
    - `packages/runner/test/canvas/renderers/token-renderer.test.ts`
- **Deviations from original plan**:
  - Updated scope to include minimal renderer integration hooks because renderer-owned container lifecycle is the correct cleanup boundary; helpers-only integration would leave cleanup risk.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test test/canvas/interactions/selection-dispatcher.test.ts test/canvas/interactions/zone-select.test.ts test/canvas/interactions/token-select.test.ts test/canvas/renderers/zone-renderer.test.ts test/canvas/renderers/token-renderer.test.ts` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
