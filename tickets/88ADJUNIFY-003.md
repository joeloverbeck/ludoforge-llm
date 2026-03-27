# 88ADJUNIFY-003: Document dual rendering pipeline architecture in CLAUDE.md

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — docs-only
**Deps**: None

## Problem

The runner has two completely independent canvas rendering pipelines — game canvas and map editor — with separate renderers, stores, and update loops. This is undocumented in CLAUDE.md's Architecture section. The omission caused a multi-session debugging failure where 7+ commits modified the game canvas adjacency renderer while the user was viewing the map editor, which uses a separate adjacency renderer.

No documentation maps screens to rendering pipelines. No documentation warns that changes to game canvas renderers have zero effect on the map editor, and vice versa.

## Assumption Reassessment (2026-03-27)

1. CLAUDE.md's Architecture table (section "Architecture") lists directories under `packages/runner/src/` but does not mention the map editor directory or its separate rendering pipeline.
2. `packages/runner/src/map-editor/` contains 15+ files implementing an independent canvas: `map-editor-canvas.ts`, `map-editor-adjacency-renderer.ts`, `map-editor-zone-renderer.ts`, `map-editor-route-renderer.ts`, `map-editor-handle-renderer.ts`, `MapEditorScreen.tsx`, etc.
3. The game canvas pipeline is: `GameCanvas.tsx` → `createGameCanvasRuntime` → `createCanvasUpdater` → renderers in `canvas/renderers/`.
4. The map editor pipeline is: `MapEditorScreen.tsx` → `createEditorCanvas` → editor renderers in `map-editor/`.
5. Session state (`sessionState.screen`) determines which pipeline is active: `'activeGame'` → game canvas, `'mapEditor'` → map editor.
6. No mismatch found.

## Architecture Check

1. This is a documentation-only change. It adds a subsection to CLAUDE.md's Architecture section explicitly documenting the dual pipeline, which pipeline serves which screen, and the key files in each.
2. No code changes — no game-specific logic risk.
3. No backwards-compatibility concerns.

## What to Change

### 1. Add "Dual Rendering Pipelines" subsection to CLAUDE.md Architecture

After the existing Architecture directory table, add a subsection documenting:

- **Game Canvas Pipeline**: entry point (`GameCanvas.tsx` → `createGameCanvasRuntime`), active on `'activeGame'` screen, renderers in `packages/runner/src/canvas/renderers/`, uses `CanvasUpdater` for state-driven updates.
- **Map Editor Pipeline**: entry point (`MapEditorScreen.tsx` → `createEditorCanvas`), active on `'mapEditor'` screen, renderers in `packages/runner/src/map-editor/`, uses direct store subscriptions.
- **Key difference**: Changes to game canvas renderers have no effect on the map editor, and vice versa. Each pipeline has its own adjacency, zone, and route renderers.
- **Session routing**: `sessionState.screen` in `App.tsx` determines which pipeline is mounted.

## Files to Touch

- `CLAUDE.md` (modify — Architecture section)

## Out of Scope

- Code changes to either pipeline.
- Documenting internal renderer APIs.
- AGENTS.md synchronization (can be done as a follow-up if needed).

## Acceptance Criteria

### Tests That Must Pass

1. No code changes — no test changes required.
2. Existing suite: `pnpm turbo test` (documentation changes must not break anything).

### Invariants

1. CLAUDE.md Architecture section explicitly documents both rendering pipelines and which screen activates each.
2. The documentation warns that renderer changes in one pipeline do not affect the other.

## Test Plan

### New/Modified Tests

None — docs-only change.

### Commands

1. `pnpm turbo typecheck && pnpm turbo lint` (verify no regressions from CLAUDE.md formatting)
