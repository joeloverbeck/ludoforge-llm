# PIXIFOUND-014: React Mount Component (GameCanvas.tsx)

**Status**: ✅ COMPLETED

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D10
**Priority**: P0
**Depends on**:
- PIXIFOUND-005 (completed, archived at `archive/tickets/PIXIFOUND-005.md`)
- PIXIFOUND-006 (completed, archived at `archive/tickets/PIXIFOUND-006.md`)
- PIXIFOUND-011 (completed, archived at `archive/tickets/PIXIFOUND-011-canvas-updater-and-zustand-subscription-wiring.md`)
- PIXIFOUND-012 (completed, archived at `archive/tickets/PIXIFOUND-012.md`)
- PIXIFOUND-013 (completed, archived at `archive/tickets/PIXIFOUND-013.md`)
**Blocks**: PIXIFOUND-015

---

## Objective

Create the React component that mounts the PixiJS application, initializes the full canvas pipeline (layers, viewport, renderers, subscriptions, interactions, coordinate bridge), and performs ordered teardown on unmount.

---

## Reassessed Assumptions and Scope Updates (Validated Against Current Code + Specs 35-00/38)

1. `packages/runner/src/canvas/GameCanvas.tsx` does not exist yet and must be created.
2. Core canvas primitives already exist and are usable: `createGameCanvas`, `setupViewport`, renderers, `createCanvasUpdater`, interaction modules, `createPositionStore`, and `createCoordinateBridge`.
3. Interaction lifecycle ownership is renderer-bound in the current architecture (PIXIFOUND-012): `createZoneRenderer(..., { bindSelection })` and `createTokenRenderer(..., { bindSelection })` attach and clean up handlers as containers are diffed/removed.
4. Because of (3), this ticket should not add duplicated global interaction cleanup logic in the mount component. The mount layer should wire selection binding callbacks; renderer `destroy()` remains the cleanup boundary.
5. Runner tests currently run in Vitest `node` environment and include only `test/**/*.test.ts` (`packages/runner/vitest.config.ts`). Acceptance tests should not assume `@testing-library/react`/`tsx` setup unless this ticket explicitly changes test infra.
6. `createGameCanvas(container, config)` requires config input (`backgroundColor`), so mount sequence assumptions must include this dependency.
7. Dependency tickets 005/006/011/012/013 are already archived and completed; this ticket is integration/composition work, not foundational implementation.

---

## Architecture Rationale

Compared to ad-hoc orchestration directly inside one large React effect, introducing a small runtime orchestration seam (used by `GameCanvas.tsx`) is more robust and extensible because it:

- Keeps React mount concerns thin while isolating Pixi lifecycle composition in a testable module-level API.
- Preserves renderer ownership of dynamic interaction listener lifecycle, avoiding duplicate or stale handler registries.
- Enables deterministic teardown ordering enforcement in tests without requiring DOM-heavy harnesses.
- Keeps the canvas pipeline game-agnostic by consuming only `RenderModel` IDs and generic store actions.

This is cleaner than pushing all orchestration details into component internals and aligns better with long-term extensibility for Spec 39 overlays and Spec 40 animation hooks.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/GameCanvas.tsx` — React component + canvas runtime composition seam

### New test files
- `packages/runner/test/canvas/GameCanvas.test.ts`

---

## Out of Scope

- Do NOT implement any DOM UI panels (action toolbar, variables panel, etc.) — Spec 39.
- Do NOT implement animations or GSAP — Spec 40.
- Do NOT implement the graph-based layout engine — Spec 41.
- Do NOT modify any files in `packages/engine/`.
- Do NOT alter renderer internals beyond existing public factory APIs.

---

## Implementation Details

### Component interface

```tsx
export interface GameCanvasProps {
  readonly store: StoreApi<GameStore>;
  readonly backgroundColor?: number;
  readonly onCoordinateBridgeReady?: (bridge: CoordinateBridge | null) => void;
}

export function GameCanvas({ store }: GameCanvasProps): JSX.Element;
```

### Mount sequence

1. Render a `<div>` ref container with `role="application"` and `aria-label="Game board"`.
2. On mount:
   a. Create a position store from current `renderModel` zone IDs (fallback empty when renderModel is null).
   b. `createGameCanvas(containerDiv, { backgroundColor })`.
   c. `setupViewport(...)` for the created app/layers.
   d. Create renderers:
      - `createZoneRenderer(...)` with `bindSelection` wired via `attachZoneSelectHandlers` + `dispatchCanvasSelection`.
      - `createAdjacencyRenderer(...)`.
      - `createTokenRenderer(...)` with `bindSelection` wired via `attachTokenSelectHandlers` + `dispatchCanvasSelection`.
   e. Create updater via `createCanvasUpdater(...)` and call `start()`.
   f. Create `createCoordinateBridge(viewport, app.canvas)` and expose via `onCoordinateBridgeReady`.

### Teardown ordering (critical)

On unmount, cleanup must happen in this order:
1. `canvasUpdater.destroy()` (unsubscribe Zustand + position subscriptions).
2. `zoneRenderer.destroy()`, `adjacencyRenderer.destroy()`, `tokenRenderer.destroy()`.
   - Note: zone/token interaction handlers are cleaned inside renderer destroy via PIXIFOUND-012 integration.
3. `viewportResult.destroy()`.
4. `gameCanvas.destroy()` (which calls `app.destroy(true, { children: true, texture: true })`) last.

### Async mount race safety

If unmount happens while async Pixi app initialization is in-flight, runtime must self-clean once initialization resolves to avoid leaks.

---

## Acceptance Criteria

### Tests that must pass

**`GameCanvas.test.ts`** (Vitest, mocked canvas modules):
- `GameCanvas` renders a container with `role="application"` and `aria-label="Game board"`.
- Runtime mount calls `createGameCanvas` with container and config.
- Runtime mount calls `setupViewport` and all renderer factories.
- Runtime mount calls `createCanvasUpdater(...).start()`.
- Teardown order is enforced: updater destroy before renderer destroy; renderer destroy before viewport destroy; viewport destroy before `gameCanvas.destroy`.
- Coordinate bridge callback is emitted on mount and reset to `null` on unmount.
- Remounting does not leak subscriptions (each mount has paired updater `start`/`destroy`).

- Existing runner tests pass: `pnpm -F @ludoforge/runner test`.

### Invariants that must remain true

- `pnpm -F @ludoforge/runner typecheck` passes.
- Teardown ordering remains deterministic and explicit.
- Canvas container remains accessible (`role="application"`, `aria-label`).
- No game-specific logic in composition.
- Pixi resources are fully cleaned up on unmount.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/canvas/GameCanvas.tsx` with:
    - `GameCanvas` React mount component.
    - `createGameCanvasRuntime(...)` orchestration seam for deterministic mount/teardown lifecycle.
    - full pipeline wiring: app creation, viewport setup, position store, renderers, updater start, coordinate bridge exposure.
  - Added `packages/runner/test/canvas/GameCanvas.test.ts` with coverage for:
    - accessible root container rendering,
    - runtime mount wiring,
    - teardown ordering guarantees,
    - remount safety/no leaked zone-ID subscriptions.
- **Deviations from original plan**:
  - Instead of embedding all orchestration directly in `useEffect`, introduced a runtime seam to keep React thin and make lifecycle ordering testable without DOM-heavy harnesses.
  - Kept interaction cleanup renderer-owned (per PIXIFOUND-012) rather than duplicating interaction teardown in `GameCanvas`, which better matches current architecture.
  - Added zone-ID subscription to keep position layout synchronized as render-model zone sets evolve, improving robustness over one-time initial layout only.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test test/canvas/GameCanvas.test.ts` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
