# 74VISMAPLAYEDI-009: YAML Export, Validation, and Download

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 74VISMAPLAYEDI-002, 74VISMAPLAYEDI-008

## Problem

The map editor's purpose is to produce an updated `visual-config.yaml` file. Users must be able to export their position/route edits as a valid YAML file that the runner can consume.

## Assumption Reassessment (2026-03-21)

1. `VisualConfigSchema` (Zod schema) exists in `visual-config-types.ts` and validates the full visual config structure. Confirmed.
2. `FixedPositionHintSchema` exists at lines 41-45 of `visual-config-types.ts`: `{ zone: string, x: number, y: number }`. Confirmed.
3. `yaml` package is a project dependency (used in engine for YAML 1.2 parsing). Confirmed — need to verify it's available in runner or add as dependency.
4. `parseVisualConfigStrict` parses a YAML string into a validated `VisualConfig`. Confirmed.
5. Connection routes and anchors are stored in `zones.connectionAnchors` and `zones.connectionRoutes` in visual config. Confirmed.

## Architecture Check

1. Export module is a pure function: takes editor state + original visual config → produces YAML string. Highly testable (Foundation 11).
2. Validates output against `VisualConfigSchema` before download — ensures the exported file is always valid (Foundation 8).
3. Visual data stays in `visual-config.yaml` — no GameSpecDoc changes (Foundation 3).
4. Export remains a service used by `MapEditorScreen`/toolbar wiring. It must not become a second editor composition root or take ownership of canvas/store/session lifecycle.

## What to Change

### 1. Create export module

New file `packages/runner/src/map-editor/map-editor-export.ts`:

**`buildExportConfig(state: EditorExportInput): VisualConfig`**:
- Takes: `originalVisualConfig`, `zonePositions`, `connectionAnchors`, `connectionRoutes`
- Start from a deep copy of `originalVisualConfig`
- **Zone positions** → write into `layout.hints.fixed` as an array of `{ zone, x, y }` — one entry per zone in `zonePositions`
- **Connection anchors** → replace `zones.connectionAnchors` with entries from `connectionAnchors` map (converted to `{ x, y }` objects keyed by anchor ID)
- **Connection routes** → replace `zones.connectionRoutes` with entries from `connectionRoutes` map (converted back to visual config route format)
- **All other sections** pass through unchanged (factions, tokens, styles, edges, regions, etc.)
- Return the merged `VisualConfig` object

**`serializeVisualConfig(config: VisualConfig): string`**:
- Use the `yaml` library's `stringify` to produce YAML
- Configure for readable output (default flow for short objects, block for complex)

**`validateAndExport(state: EditorExportInput): { yaml: string } | { error: string }`**:
- Call `buildExportConfig` → validate against `VisualConfigSchema` → serialize
- If validation fails, return error message (should not happen if editor state is consistent)

**`triggerDownload(yamlString: string, filename: string): void`**:
- Create `Blob` with YAML content, `type: 'text/yaml'`
- Create `URL.createObjectURL(blob)`
- Create hidden `<a>` element, set `href` and `download` attributes
- Programmatically click, then revoke object URL

### 2. Convert `EditableConnectionRoute` back to visual config format

Pure function: `toVisualConfigRoute(route: EditableConnectionRoute): ConnectionRouteDefinition`:
- Convert `points` array back to `ConnectionEndpoint[]` format
- Convert `segments` array back to `ConnectionRouteSegment[]` format (with control points as `{ kind: 'position', x, y }`)

### 3. Wire export button in toolbar

Modify `packages/runner/src/map-editor/map-editor-toolbar.tsx`:
- Replace placeholder export handler with actual `validateAndExport` call
- On success: trigger download with filename `visual-config.yaml`
- On error: display error message (alert or inline error)
- After successful export: optionally set `dirty = false`

### 4. Ensure `yaml` dependency is available in runner

Check `packages/runner/package.json` — if `yaml` is not listed, add it as a dependency (it's already in the engine package).

## Files to Touch

- `packages/runner/src/map-editor/map-editor-export.ts` (new)
- `packages/runner/src/map-editor/map-editor-toolbar.tsx` (modify — wire export)
- `packages/runner/package.json` (modify — add `yaml` dependency if not present)

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
7. `toVisualConfigRoute` correctly converts `EditableConnectionRoute` back to visual config format for both straight and quadratic segments.
8. `triggerDownload` creates a Blob and triggers download (mock DOM API).
9. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Exported YAML always validates against `VisualConfigSchema` — invalid output is never downloaded.
2. No modification to `visual-config-types.ts` or `visual-config-loader.ts`.
3. Export is a pure function of editor state — no side effects except the final download trigger (Foundation 7).
4. Unedited config sections are byte-identical in the output (no reordering, no value changes).
5. Export wiring remains downstream of `MapEditorScreen` composition; no bootstrap/session/canvas responsibilities move into export code.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/map-editor/map-editor-export.test.ts` — buildExportConfig (zone positions, anchors, routes, passthrough), round-trip validation, toVisualConfigRoute conversion, serializeVisualConfig output format

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
