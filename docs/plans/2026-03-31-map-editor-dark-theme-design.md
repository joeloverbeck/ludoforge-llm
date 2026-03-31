# Map Editor Dark Theme

**Date**: 2026-03-31
**Goal**: Match the map editor's background to the game canvas (`0x0b1020` dark navy) so adjacency visuals render identically in both contexts.

## Problem

The map editor uses a light cream background (`0xf3efe4`) while the game canvas uses a dark navy background (`0x0b1020`). Adjacency line visuals designed for the dark game background blend into and disappear against the light editor background.

## Changes

### 1. PixiJS canvas background (`map-editor-canvas.ts`)

Change `EDITOR_BACKGROUND_COLOR` from `0xf3efe4` to `0x0b1020`.

### 2. Grid renderer (`map-editor-grid-renderer.ts`)

Change `GRID_COLOR` from `0x8f7751` (brown, designed for light bg) to a muted slate visible on dark background (e.g. `0x334155`).

### 3. Vertex/handle stroke colors (`vertex-handle-renderer.ts`)

Vertex handle strokes use `0x000000` (black) which is invisible on dark background. Swap to white (`0xffffff`). Amber and blue fill colors already contrast well on dark -- no change needed. `HANDLE_STROKE_COLOR` in `map-editor-handle-renderer.ts` is already `0xffffff` -- no change.

### 4. CSS panels (`MapEditorScreen.module.css`)

Full dark theme for all DOM UI elements:
- `.container` gradient: dark tones (`#0b1020` to `#141b2d`)
- `.toolbar`: dark glassmorphism (`rgba(15, 20, 35, 0.92)`, light border)
- All text colors: invert to light on dark
- `.toolbarButton`, `.gridSizeInput`: dark backgrounds, light text, subtle borders
- `.statusCard`: dark background, light text
- `.dirtyIndicator`: adjusted for dark context

### What stays the same

- `GameCanvas.tsx` -- untouched
- Adjacency renderer -- untouched (already works on dark, which is the whole point)
- Handle fill colors (amber/blue) -- already high contrast on dark
