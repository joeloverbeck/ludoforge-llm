# 74VISMAPLAYEDI-009: YAML Export, Validation, and Download

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-002, 74VISMAPLAYEDI-008

## Problem

The map editor's purpose is to produce an updated `visual-config.yaml` file. Users must be able to export their position/route edits as a valid YAML file that the runner can consume.

## Assumption Reassessment (2026-03-21)

1. `VisualConfigSchema` (Zod schema) exists in `visual-config-types.ts` and validates the full visual config structure. Confirmed.
2. `layout.hints.fixed` already exists in `visual-config-types.ts` as the canonical fixed-position schema `{ zone: string, x: number, y: number }`. Confirmed.
3. `yaml` is already available in the runner workspace, but it currently lives in `devDependencies`. Because export runs in browser/runtime code, the correct change is to move it to `dependencies`, not add a duplicate entry. Corrected.
4. `parseVisualConfigStrict` validates an already-parsed YAML object, not a YAML string. Runner bootstrap currently loads `visual-config.yaml` via Vite's YAML loader and passes the resulting object graph into validation. Corrected.
5. Connection routes and anchors are stored in `zones.connectionAnchors` and `zones.connectionRoutes` in visual config. Confirmed.
6. The editor store already uses canonical `ConnectionRouteDefinition` values in `connectionRoutes`; there is no separate `EditableConnectionRoute` layer. Export should serialize the existing document state directly instead of introducing an alias model. Corrected.
7. The toolbar is already a generic presentational component that receives `onExport` and `exportEnabled` from its parent. The missing export wiring currently lives in `MapEditorScreen`, not inside toolbar internals. Corrected.

## Architecture Check

1. Export module should stay a pure document serializer: takes editor document state + original visual config → produces a validated `VisualConfig` and YAML string. Highly testable (Foundation 11).
2. Validates output against `VisualConfigSchema` before download — ensures the exported file is always valid (Foundation 8).
3. Visual data stays in `visual-config.yaml` — no GameSpecDoc changes (Foundation 3).
4. Export remains a service used by `MapEditorScreen`. The toolbar stays dumb/presentational and must not absorb bootstrap, store orchestration, or download lifecycle concerns.
5. Saved-state ownership belongs in the editor store. If export success clears the unsaved indicator, the store needs an explicit saved-baseline API rather than a one-off React-side boolean hack.

## What to Change

### 1. Create export module

New file `packages/runner/src/map-editor/map-editor-export.ts`:

**`buildExportConfig(state: EditorExportInput): VisualConfig`**:
- Takes: `originalVisualConfig`, `zonePositions`, `connectionAnchors`, `connectionRoutes`
- Start from a deep copy of `originalVisualConfig`
- **Zone positions** → write into `layout.hints.fixed` as an array of `{ zone, x, y }` — one entry per zone in `zonePositions`
- **Connection anchors** → replace `zones.connectionAnchors` with entries from `connectionAnchors` map (converted to `{ x, y }` objects keyed by anchor ID)
- **Connection routes** → replace `zones.connectionRoutes` with entries from `connectionRoutes` map
- **All other sections** pass through unchanged (factions, tokens, styles, edges, regions, etc.)
- Return the merged `VisualConfig` object

**`serializeVisualConfig(config: VisualConfig): string`**:
- Use the `yaml` library's `stringify` to produce YAML
- Configure for readable output (default flow for short objects, block for complex)

**`exportVisualConfig(state: EditorExportInput): string`**:
- Call `buildExportConfig` → validate against `VisualConfigSchema` → serialize
- Throw if validation fails; do not introduce a parallel result-envelope type for an exceptional path

**`triggerDownload(yamlString: string, filename: string): void`**:
- Create `Blob` with YAML content, `type: 'text/yaml'`
- Create `URL.createObjectURL(blob)`
- Create hidden `<a>` element, set `href` and `download` attributes
- Programmatically click, then revoke object URL

### 2. Preserve canonical route shape directly

No `EditableConnectionRoute` conversion layer should be introduced. The store already holds `ConnectionRouteDefinition`, which is the canonical visual-config shape and should remain the single source of truth.

### 3. Wire export from `MapEditorScreen`

Modify `packages/runner/src/map-editor/MapEditorScreen.tsx`:
- Replace the placeholder `onExport={() => {}}` handler with actual export orchestration
- Read the current editor document state from the store
- Call `exportVisualConfig(...)`
- On success: trigger download with filename `visual-config.yaml`
- On error: display error message in screen-owned UI state
- Pass `exportEnabled` based on whether the editor is ready

`packages/runner/src/map-editor/map-editor-toolbar.tsx` should remain focused on button state and callbacks. Only touch it if export-enabled affordance or error presentation needs a prop change.

### 4. Track saved/exported state in the store

Modify `packages/runner/src/map-editor/map-editor-store.ts`:
- Add an explicit saved-baseline mechanism (`markSaved()` or equivalent)
- Successful export updates the saved baseline so the UI no longer shows stale unsaved state
- Undo/redo must continue to work correctly after saving

### 5. Ensure `yaml` dependency is available in runner runtime dependencies

Update `packages/runner/package.json` so `yaml` is in `dependencies` rather than `devDependencies`.

## Files to Touch

- `packages/runner/src/map-editor/map-editor-export.ts` (new)
- `packages/runner/src/map-editor/MapEditorScreen.tsx` (modify — wire export)
- `packages/runner/src/map-editor/map-editor-store.ts` (modify — saved-state ownership)
- `packages/runner/src/map-editor/map-editor-toolbar.tsx` (modify only if prop/UI adjustments are needed)
- `packages/runner/package.json` (modify — move `yaml` to runtime dependencies)

## Out of Scope

- Layout engine changes for `layout.hints.fixed` (74VISMAPLAYEDI-010)
- Import/re-import of exported YAML (users manually replace the file)
- Server-side storage or API endpoints
- Any visual-config-types.ts changes

## Acceptance Criteria

### Tests That Must Pass

1. `buildExportConfig` produces a `VisualConfig` with `layout.hints.fixed` containing all zone positions.
2. `buildExportConfig` preserves unedited sections (factions, tokens, styles) unchanged.
3. `buildExportConfig` writes edited `connectionAnchors` to `zones.connectionAnchors`.
4. `buildExportConfig` writes edited `connectionRoutes` to `zones.connectionRoutes`.
5. Round-trip test: load known visual config → apply edits → export → re-parse with `parseVisualConfigStrict` → verify round-trip. Specifically: zone positions in `layout.hints.fixed` match, route definitions match.
6. Output validates against `VisualConfigSchema` (Zod `.parse()` succeeds).
7. Export wiring from `MapEditorScreen` triggers a download for ready editors and surfaces export failures without moving orchestration into the toolbar.
8. Successful export marks the document as saved so the unsaved indicator is cleared until the next edit.
9. `triggerDownload` creates a Blob and triggers download (mock DOM API).
10. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Exported YAML always validates against `VisualConfigSchema` — invalid output is never downloaded.
2. No modification to `visual-config-types.ts` or `visual-config-loader.ts`.
3. Export is a pure function of editor state — no side effects except the final download trigger (Foundation 7).
4. Unedited config sections remain semantically unchanged in the exported config object. Serialized YAML formatting may normalize, so byte-identical output is not required.
5. Export wiring remains downstream of `MapEditorScreen` composition; no bootstrap/session/canvas responsibilities move into export code.
6. `ConnectionRouteDefinition` remains the only route document shape in the editor; no alias or duplicate editable-route type is introduced.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-export.test.ts` — build/export config (zone positions, anchors, routes, passthrough), schema validation, round-trip validation, download trigger
2. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — export wiring success and failure paths
3. `packages/runner/test/map-editor/map-editor-store.test.ts` — saved-baseline behavior and dirty-state expectations after export

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Added `packages/runner/src/map-editor/map-editor-export.ts` with pure export helpers that build a new `VisualConfig`, validate it with `VisualConfigSchema`, serialize it to YAML, and trigger browser download.
  - Wired export orchestration in `MapEditorScreen` and surfaced export failures in screen-owned UI state.
  - Added saved-baseline ownership to `map-editor-store.ts` via `markSaved()` and dirty-state recomputation against the saved snapshot so export clears unsaved state cleanly and undo/redo remain correct after saving.
  - Moved `yaml` from `devDependencies` to runtime `dependencies` in `packages/runner/package.json`.
- Deviations from original plan:
  - No `EditableConnectionRoute` conversion layer was added because the editor already stores canonical `ConnectionRouteDefinition` values; keeping a second route shape would have weakened the architecture.
  - No toolbar-internal export orchestration was added; the toolbar remained presentational and `MapEditorScreen` kept ownership of export flow and error handling.
  - The saved/exported state work was implemented as part of this ticket instead of leaving dirty reset optional.
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
