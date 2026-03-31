# Map Editor Dark Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Switch the map editor from a light cream theme to the same dark navy theme used by the game canvas, so adjacency visuals render identically in both contexts.

**Architecture:** Pure cosmetic change — swap hardcoded color constants in 4 source files and update 1 test file that asserts a grid color value. No structural, behavioral, or API changes.

**Tech Stack:** PixiJS (canvas background, renderer colors), CSS Modules (DOM panel theming)

---

### Task 1: Dark canvas background and grid color

**Files:**
- Modify: `packages/runner/src/map-editor/map-editor-canvas.ts:12` (background color constant)
- Modify: `packages/runner/src/map-editor/map-editor-grid-renderer.ts:6` (grid color constant)
- Modify: `packages/runner/test/map-editor/map-editor-grid-renderer.test.ts:154` (grid color assertion)

**Step 1: Update the editor background color**

In `packages/runner/src/map-editor/map-editor-canvas.ts`, change:
```ts
const EDITOR_BACKGROUND_COLOR = 0xf3efe4;
```
to:
```ts
const EDITOR_BACKGROUND_COLOR = 0x0b1020;
```

**Step 2: Update the grid color for dark background visibility**

In `packages/runner/src/map-editor/map-editor-grid-renderer.ts`, change:
```ts
const GRID_COLOR = 0x8f7751;
```
to:
```ts
const GRID_COLOR = 0x334155;
```

**Step 3: Update the grid color test assertion**

In `packages/runner/test/map-editor/map-editor-grid-renderer.test.ts`, change:
```ts
      color: 0x8f7751,
```
to:
```ts
      color: 0x334155,
```

**Step 4: Run grid renderer tests**

Run: `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/map-editor/map-editor-grid-renderer.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/runner/src/map-editor/map-editor-canvas.ts packages/runner/src/map-editor/map-editor-grid-renderer.ts packages/runner/test/map-editor/map-editor-grid-renderer.test.ts
git commit -m "feat: dark background for map editor canvas and grid"
```

---

### Task 2: Vertex handle stroke colors for dark background

**Files:**
- Modify: `packages/runner/src/map-editor/vertex-handle-renderer.ts:202,206,225` (black strokes to white)

**Step 1: Replace black strokes with white in vertex handles**

In `packages/runner/src/map-editor/vertex-handle-renderer.ts`, change all three occurrences of `0x000000` to `0xffffff`:

Line 202 (hovered vertex):
```ts
      .stroke({ color: 0xffffff, width: 1.5 });
```

Line 206 (default vertex):
```ts
      .stroke({ color: 0xffffff, width: 1.5 });
```

Line 225 (midpoint handle):
```ts
    .stroke({ color: 0xffffff, width: 1, alpha: 0.3 });
```

**Step 2: Run map editor tests**

Run: `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/map-editor/`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/runner/src/map-editor/vertex-handle-renderer.ts
git commit -m "feat: white vertex handle strokes for dark editor background"
```

---

### Task 3: Dark CSS theme for map editor DOM panels

**Files:**
- Modify: `packages/runner/src/map-editor/MapEditorScreen.module.css` (full file retheme)

**Step 1: Replace the entire CSS file with dark theme**

Replace the contents of `packages/runner/src/map-editor/MapEditorScreen.module.css` with:

```css
.container {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: linear-gradient(180deg, #0b1020 0%, #141b2d 100%);
}

.canvasContainer {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.toolbar {
  position: absolute;
  top: 1rem;
  left: 1rem;
  right: 1rem;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 0.9rem;
  background: rgba(15, 20, 35, 0.92);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(10px);
  flex-wrap: wrap;
}

.toolbarTitle {
  font-weight: 700;
  color: #e2e8f0;
}

.toolbarSpacer {
  flex: 1;
}

.toolbarButton {
  border: 1px solid #475569;
  border-radius: 0.6rem;
  background: #1e293b;
  color: #e2e8f0;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
}

.toolbarButton:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.toolbarToggleActive {
  border: 1px solid #4ade80;
  border-radius: 0.6rem;
  background: #166534;
  color: #f0fdf4;
  cursor: pointer;
  padding: 0.45rem 0.8rem;
}

.dirtyIndicator {
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
}

.coordinateReadout {
  color: #94a3b8;
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
}

.gridSizeControl {
  align-items: center;
  color: #cbd5e1;
  display: inline-flex;
  gap: 0.45rem;
}

.gridSizeLabel {
  font-size: 0.88rem;
  font-weight: 600;
}

.gridSizeInput {
  width: 4.25rem;
  border: 1px solid #475569;
  border-radius: 0.55rem;
  background: #1e293b;
  color: #e2e8f0;
  padding: 0.35rem 0.5rem;
}

.gridSizeInput:disabled {
  opacity: 0.55;
}

.statusPanel {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 5rem 1.5rem 1.5rem;
}

.statusCard {
  max-width: 34rem;
  padding: 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1rem;
  background: rgba(15, 20, 35, 0.92);
  color: #e2e8f0;
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.3);
}

.statusCard h1,
.statusCard p {
  margin: 0;
}

.statusCard p {
  margin-top: 0.65rem;
  color: #94a3b8;
}
```

**Step 2: Run map editor UI tests**

Run: `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/map-editor/`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/runner/src/map-editor/MapEditorScreen.module.css
git commit -m "feat: dark CSS theme for map editor panels"
```

---

### Task 4: Final verification

**Step 1: Run full runner test suite**

Run: `pnpm -F @ludoforge/runner test`
Expected: All tests PASS

**Step 2: Run typecheck**

Run: `pnpm -F @ludoforge/runner typecheck`
Expected: No errors

**Step 3: Run lint**

Run: `pnpm -F @ludoforge/runner lint`
Expected: No errors
