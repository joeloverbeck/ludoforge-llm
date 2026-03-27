# 88ADJUNIFY-003: Document dual rendering pipeline architecture in CLAUDE.md

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — docs-only
**Deps**: None

## Problem

The runner exposes two screen-specific rendering flows — the active game canvas and the map editor canvas. They do not share renderer implementations, but they also are not fully independent stacks: the map editor reuses shared Pixi/canvas bootstrapping from `packages/runner/src/canvas/`. CLAUDE.md's Architecture section does not document this split or the shared substrate. The omission caused a multi-session debugging failure where 7+ commits modified the game canvas adjacency renderer while the user was viewing the map editor, which uses a different adjacency renderer.

No documentation maps screens to rendering pipelines. No documentation warns that changes to game canvas renderers have zero effect on the map editor, and vice versa.

## Assumption Reassessment (2026-03-27)

1. `CLAUDE.md`'s Architecture table currently documents `packages/runner/src/canvas/` and other runner directories, but it does not mention `packages/runner/src/map-editor/` at all.
2. `packages/runner/src/map-editor/` currently contains the map editor screen, store, editor-specific canvas wrapper, and editor-specific renderers (`MapEditorScreen.tsx`, `map-editor-canvas.ts`, `map-editor-adjacency-renderer.ts`, `map-editor-zone-renderer.ts`, `map-editor-route-renderer.ts`, `map-editor-handle-renderer.ts`, etc.).
3. The active game flow is still accurately summarized as `GameCanvas.tsx` → `createGameCanvasRuntime` → `createCanvasUpdater` → renderer modules under `packages/runner/src/canvas/renderers/`.
4. The map editor flow is `MapEditorScreen.tsx` → `createEditorCanvas` → editor renderers under `packages/runner/src/map-editor/`.
5. The original ticket overstated the separation: `createEditorCanvas()` reuses shared canvas bootstrapping via `createGameCanvas()` from `packages/runner/src/canvas/create-app.ts`, and it also reuses shared viewport setup via `setupViewport()` from `packages/runner/src/canvas/viewport-setup.ts`. The flows are separate at the screen/runtime/renderer layer, not at the entire canvas stack.
6. `App.tsx` routes by `sessionState.screen`, with `'activeGame'` mounting the game flow and `'mapEditor'` mounting `MapEditorScreen`.
7. Tests already exist around both sides of this architecture (`packages/runner/test/canvas/`, `packages/runner/test/map-editor/`, and `packages/runner/test/ui/App.test.ts`). This remains a docs ticket; no behavioral gap was found that requires code changes.

## Architecture Check

1. This remains a documentation-only change. It should add a subsection to `CLAUDE.md`'s Architecture section documenting the two screen-specific rendering flows, the shared canvas substrate they both depend on, which screen mounts each flow, and the key files in each.
2. No code changes — no game-specific logic risk.
3. No backwards-compatibility concerns.

## What to Change

### 1. Add rendering architecture subsection to CLAUDE.md Architecture

After the existing Architecture directory table, add a subsection documenting:

- **Shared canvas substrate**: `packages/runner/src/canvas/create-app.ts` provides Pixi application/layer bootstrapping used by both flows; `packages/runner/src/canvas/viewport-setup.ts` is also reused by the editor.
- **Game Canvas Flow**: entry point (`GameCanvas.tsx` → `createGameCanvasRuntime`), active on `'activeGame'` screen, renderers in `packages/runner/src/canvas/renderers/`, uses `CanvasUpdater` for state-driven updates.
- **Map Editor Flow**: entry point (`MapEditorScreen.tsx` → `createEditorCanvas`), active on `'mapEditor'` screen, editor-specific renderers in `packages/runner/src/map-editor/`, uses direct editor-store subscriptions inside the screen/editor runtime.
- **Key boundary**: Changes to game canvas renderer modules do not affect map-editor renderer modules, and vice versa, but shared canvas bootstrapping changes can affect both.
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
2. The documentation makes the shared canvas substrate explicit so contributors do not mistake the flows for fully isolated stacks.
3. The documentation warns that renderer changes in one flow do not affect the other, while shared canvas infrastructure changes may affect both.

## Test Plan

### New/Modified Tests

None — docs-only change.

### Commands

1. `pnpm turbo test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-27
- **What actually changed**: Corrected the ticket's architectural assumptions before implementation, then updated `CLAUDE.md` to document the runner's two screen-specific rendering flows, the screen routing that mounts them, and the shared canvas substrate reused by both.
- **Deviations from original plan**: The original ticket described the game canvas and map editor as fully independent pipelines. The code shows a cleaner split: separate screen/runtime/renderer layers built on shared canvas bootstrapping and shared viewport infrastructure. The delivered documentation reflects that actual architecture instead of reinforcing a false boundary.
- **Verification results**: `pnpm turbo test` passed, `pnpm turbo typecheck` passed, and `pnpm turbo lint` passed. No code behavior change was required, so no tests were added or modified.
