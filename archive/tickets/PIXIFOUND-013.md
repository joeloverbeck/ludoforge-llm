# PIXIFOUND-013: Coordinate Bridge

**Status**: ✅ COMPLETED

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D9
**Priority**: P1
**Depends on**: PIXIFOUND-006 (completed, archived at `archive/tickets/PIXIFOUND-006.md`)
**Blocks**: PIXIFOUND-014

---

## Objective

Implement a coordinate bridge that converts between canvas world-space and DOM screen-space. This is required for Spec 39 overlay positioning (tooltips/popovers over zones and tokens).

---

## Reassessed Assumptions (Validated Against Current Code + Specs 35-00/38)

1. `packages/runner/src/canvas/coordinate-bridge.ts` does not exist yet and must be created.
2. `ViewportResult`/`setupViewport(...)` already exist (`packages/runner/src/canvas/viewport-setup.ts`) and expose the `viewport` instance needed for `toGlobal`/`toLocal` transforms.
3. The canonical shared position type in current canvas modules is `Position` from `packages/runner/src/canvas/renderers/renderer-types.ts`; this ticket should reuse it rather than introducing duplicate coordinate aliases.
4. Runner tests execute in Vitest `node` environment (`packages/runner/vitest.config.ts`), so hard dependency on runtime `DOMRect` construction is brittle. The bridge should return a DOMRect-compatible plain object shape.
5. Dependency `PIXIFOUND-006` is already completed and archived; this ticket should treat it as a resolved prerequisite.

---

## Architecture Rationale

Compared to introducing ad-hoc coordinate helpers at call sites, a dedicated bridge module is more robust and extensible because it:

- Centralizes world/screen conversion rules behind one small interface.
- Avoids DOM runtime coupling by returning serializable rect objects, which are easier to test and can still satisfy DOM overlay consumers.
- Keeps math pure and game-agnostic, aligned with Spec 38 and runner architecture.

Long-term cleanup note (not in scope for this ticket): `Position` currently lives in `renderers/renderer-types.ts` but is also used by `position-store.ts`; moving geometry primitives to a canvas-level shared geometry module would reduce renderer coupling.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/coordinate-bridge.ts` — `CoordinateBridge` interface and `createCoordinateBridge()` factory

### New test files
- `packages/runner/test/canvas/coordinate-bridge.test.ts`

---

## Out of Scope

- Do NOT implement Floating UI tooltip logic — that belongs to Spec 39.
- Do NOT modify viewport setup behavior (PIXIFOUND-006).
- Do NOT modify runner `store/`, `model/`, `worker/`, or `bridge/` behavior.
- Do NOT modify any files in `packages/engine/`.

---

## Implementation Details

### Interface

```typescript
export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface CoordinateBridge {
  canvasToScreen(worldPos: Position): Position;
  screenToCanvas(screenPos: Position): Position;
  worldBoundsToScreenRect(worldBounds: {
    x: number; y: number; width: number; height: number;
  }): ScreenRect;
}
```

### Factory

```typescript
export function createCoordinateBridge(
  viewport: Viewport,
  canvasElement: HTMLCanvasElement,
): CoordinateBridge;
```

### Implementation

- `canvasToScreen`: `viewport.toGlobal(worldPos)` + `canvasElement.getBoundingClientRect()` offsets.
- `screenToCanvas`: subtract rect offsets, then `viewport.toLocal(...)`.
- `worldBoundsToScreenRect`: transform all 4 world rect corners through `canvasToScreen`, then return enclosing axis-aligned screen rect.
- Validate world bounds shape (`width >= 0`, `height >= 0`, finite numbers) and throw descriptive error on invalid input.

---

## Acceptance Criteria

### Tests that must pass

**`coordinate-bridge.test.ts`** (mock viewport transforms + mock canvas rect):
- `canvasToScreen({x: 0, y: 0})` returns expected screen coordinates based on viewport transform and canvas offset.
- `screenToCanvas(...)` reverses `canvasToScreen(...)` (round-trip identity for representative points).
- `worldBoundsToScreenRect(...)` returns an enclosing axis-aligned screen rect with correct `left/top/right/bottom` fields.
- Pan and zoom changes in viewport transform affect `canvasToScreen(...)` as expected.
- Changing canvas `getBoundingClientRect()` shifts screen coordinates correctly.
- Invalid world bounds (`negative width/height`, non-finite values) throw explicit errors.

- Existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true

- `pnpm -F @ludoforge/runner typecheck` passes.
- Pure coordinate math only; no rendering side effects.
- Conversions always account for viewport transform and canvas element position.
- API remains game-agnostic and reusable for any board overlay consumer.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/canvas/coordinate-bridge.ts` with `createCoordinateBridge(...)`, `CoordinateBridge`, and `ScreenRect`.
  - Added `packages/runner/test/canvas/coordinate-bridge.test.ts` with coverage for transforms, round-trip behavior, viewport pan/zoom effects, canvas offset shifts, and invalid world-bounds guards.
  - Reassessed and corrected ticket assumptions before implementation (archived dependency status and DOMRect runtime coupling in Node tests).
- **Deviations from original plan**:
  - Return shape changed from runtime `DOMRect` to a DOMRect-compatible plain object (`ScreenRect`) to keep the module pure, serializable, and Node-testable without DOM globals.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test test/canvas/coordinate-bridge.test.ts` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm turbo test typecheck lint` passed.
