# 99MAPEDIREN-005: Delete editor renderers and clean up

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/99-map-editor-renderer-unification.md`, `archive/tickets/99MAPEDIREN-004-wire-game-renderers-into-editor.md`

## Problem

After 99MAPEDIREN-004 wires game canvas renderers into the map editor, the three editor-specific renderer files (~920 lines) become dead code. They must be deleted along with their test files and any now-unused helper (`map-editor-zone-visuals.ts`). This completes the unification with a net ~570-line reduction.

## Assumption Reassessment (2026-03-30)

1. `map-editor-zone-renderer.ts` (210 lines) — will be dead code after 004. CONFIRMED.
2. `map-editor-adjacency-renderer.ts` (70 lines) — will be dead code after 004. CONFIRMED.
3. `map-editor-route-renderer.ts` (641 lines) — will be dead code after 004. CONFIRMED.
4. `map-editor-zone-visuals.ts` (20 lines) — imported ONLY by `map-editor-handle-renderer.ts` (`resolveMapEditorZoneVisuals`). Must check if handle renderer still needs it after 004. If handle renderer still uses it, KEEP it.
5. Test files exist for all three renderers: `map-editor-zone-renderer.test.ts`, `map-editor-adjacency-renderer.test.ts`, `map-editor-route-renderer.test.ts` — CONFIRMED.

## Architecture Check

1. Deleting dead code with no shims aligns with Foundation 9 (No Backwards Compatibility).
2. This is the final cleanup step — no partial deletion, no commented-out code left behind.
3. No engine changes. Purely removing unused runner files.

## What to Change

### 1. Delete editor renderer source files

- `packages/runner/src/map-editor/map-editor-zone-renderer.ts` (210 lines)
- `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` (70 lines)
- `packages/runner/src/map-editor/map-editor-route-renderer.ts` (641 lines)

### 2. Delete editor renderer test files

- `packages/runner/test/map-editor/map-editor-zone-renderer.test.ts`
- `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts`
- `packages/runner/test/map-editor/map-editor-route-renderer.test.ts`

### 3. Conditionally delete `map-editor-zone-visuals.ts`

Check if `map-editor-handle-renderer.ts` still imports `resolveMapEditorZoneVisuals` after 004:
- If NO other file imports it → delete `map-editor-zone-visuals.ts`
- If `map-editor-handle-renderer.ts` still needs it → KEEP it (it serves the handle overlay, not the base map renderers)

### 4. Verify no dangling imports

Grep the codebase for any remaining imports of the deleted files. Fix any found.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-zone-renderer.ts` (delete)
- `packages/runner/src/map-editor/map-editor-adjacency-renderer.ts` (delete)
- `packages/runner/src/map-editor/map-editor-route-renderer.ts` (delete)
- `packages/runner/test/map-editor/map-editor-zone-renderer.test.ts` (delete)
- `packages/runner/test/map-editor/map-editor-adjacency-renderer.test.ts` (delete)
- `packages/runner/test/map-editor/map-editor-route-renderer.test.ts` (delete)
- `packages/runner/src/map-editor/map-editor-zone-visuals.ts` (delete — conditional, see §3)

## Out of Scope

- Game canvas renderers (NOT modified)
- Editor overlay renderers (`vertex-handle-renderer.ts`, `map-editor-handle-renderer.ts`, grid renderer) — these REMAIN
- `map-editor-route-geometry.ts` and `map-editor-route-geometry.test.ts` — these are NOT editor renderers, they compute route geometry used by handle renderer. KEEP.
- `map-editor-drag.ts` — interaction logic, not rendering. KEEP.
- Presentation adapter (`map-editor-presentation-adapter.ts`) — already created in 003. KEEP.
- Any engine package changes

## Acceptance Criteria

### Tests That Must Pass

1. No imports reference any of the deleted files — `pnpm -F @ludoforge/runner typecheck` passes.
2. No test files reference deleted modules — `pnpm -F @ludoforge/runner test` passes.
3. `map-editor-handle-renderer.test.ts` still passes (handle renderer is not deleted).
4. All game canvas renderer tests still pass (untouched).
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. Typecheck: `pnpm -F @ludoforge/runner typecheck`
7. Lint: `pnpm -F @ludoforge/runner lint`

### Invariants

1. No dead code remains — deleted files have zero remaining importers.
2. No backwards-compatibility shims, re-exports, or aliases for deleted modules.
3. Editor overlay renderers (`vertex-handle-renderer.ts`, `map-editor-handle-renderer.ts`) continue to function.
4. Net line removal is ~920 lines of source + associated test lines.

## Test Plan

### New/Modified Tests

None created. Only deletions.

### Commands

1. `pnpm -F @ludoforge/runner typecheck` — confirms no dangling imports
2. `pnpm -F @ludoforge/runner test` — confirms no test references broken
3. `pnpm -F @ludoforge/runner lint` — confirms no lint issues from deletions
