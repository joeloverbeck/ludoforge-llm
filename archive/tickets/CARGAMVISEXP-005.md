# CARGAMVISEXP-005: Table overlays (pot, bets, dealer button)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: CARGAMVISEXP-003 (needs zone positions from table layout for playerSeat-relative placement)

## Problem

Pot, bets, and dealer seat are only visible as raw text in the scoreboard panel. There is no on-table visual representation. Card games need variable-driven overlays positioned relative to the table center or individual player seats.

## Assumption Reassessment (2026-02-20)

1. `VisualConfigSchema` does NOT have a `tableOverlays` field yet — confirmed.
2. `canvas-updater.ts` is subscription-driven (not per-frame) and currently wires only zone/adjacency/token updates — confirmed.
3. `GameCanvas.tsx` creates/wires renderers and already handles table background. It does not yet create an overlay renderer.
4. Render model exposes variables as `globalVars` and `playerVars` (not `globalVariables` / `variables`) and player state via `players`.
5. Layout/position state currently provides zone positions and bounds, but no explicit seat anchor map. Seat anchors must be derived generically from positioned player-owned zones.
6. `layers.ts` already centralizes world layer structure (`background`, `adjacency`, `zone`, etc.). Overlay layering should be integrated there rather than ad-hoc container wiring in `GameCanvas`.

## Architecture Check

1. `TableOverlaysSchema` is a generic visual config feature: any game can define variable-driven overlays at table center or player seats. No game-specific branching.
2. Overlay rendering should read values from the render model at update time through the existing canvas update cycle — purely reactive, no game logic.
3. Three overlay kinds (`globalVar`, `perPlayerVar`, `marker`) are generic patterns that cover common board game needs beyond poker.
4. No backwards-compatibility shims: `tableOverlays` is optional. Games without it see no overlays.

## Architecture Verdict

The proposed change is beneficial versus current architecture because overlays are currently impossible without leaking game-specific UI into the scoreboard/HUD. A dedicated world-space overlay renderer keeps rendering concerns in the canvas pipeline, keeps game rules/data in the render model + YAML, and preserves agnostic-engine constraints.

To keep the architecture clean and extensible long-term:

1. Wire overlays through existing layer and updater seams (`layers.ts`, `GameCanvas.tsx`, `canvas-updater.ts`) instead of one-off update hooks.
2. Resolve seat-relative positions from generic runtime data (player-owned zone positions + player ids), not game-specific zone id patterns.
3. Keep `tableOverlays` declarative and additive; no alias fields or legacy fallback keys.

## What to Change

### 1. Add `TableOverlayItemSchema` and `TableOverlaysSchema` to visual-config-types.ts

```typescript
const TableOverlayItemSchema = z.object({
  kind: z.enum(['globalVar', 'perPlayerVar', 'marker']),
  varName: z.string(),
  label: z.string().optional(),
  position: z.enum(['tableCenter', 'playerSeat']),
  offsetX: z.number().optional(),
  offsetY: z.number().optional(),
  fontSize: z.number().optional(),
  color: z.string().optional(),
  markerShape: z.enum(['circle', 'badge']).optional(),
});

const TableOverlaysSchema = z.object({
  items: z.array(TableOverlayItemSchema).optional(),
});
```

Add to `VisualConfigSchema`: `tableOverlays: TableOverlaysSchema.optional()`.

### 2. Add `getTableOverlays()` to visual-config-provider.ts

Returns `config?.tableOverlays ?? null`.

### 3. Create `table-overlay-renderer.ts`

New file in `packages/runner/src/canvas/renderers/`. Exports:
- `TableOverlayRenderer` class or `updateTableOverlays()` function
- Reads overlay config items, resolves variable values from render model
- Positions PixiJS Text/Graphics at configured locations:
  - `globalVar` at `tableCenter`: renders `label: value` at table center + offset
  - `perPlayerVar` at `playerSeat`: renders for each non-eliminated player near their derived seat anchor + offset
  - `marker` at `playerSeat`: renders a marker badge at the seat whose index equals the variable's value
- In world-space (pans/zooms with viewport)

### 4. Wire into layers.ts, canvas-updater.ts, and GameCanvas.tsx

- `layers.ts`: add an explicit table overlay layer within `boardGroup` (above zone layer)
- `GameCanvas.tsx`: create/destroy overlay renderer against that layer
- `canvas-updater.ts`: invoke overlay update on each reactive snapshot application with current render model + position snapshot

### 5. Update Texas Hold'em visual-config.yaml

```yaml
tableOverlays:
  items:
    - kind: globalVar
      varName: pot
      label: "Pot"
      position: tableCenter
      offsetY: 60
      fontSize: 14
      color: "#fbbf24"
    - kind: perPlayerVar
      varName: streetBet
      label: "Bet"
      position: playerSeat
      offsetY: -40
      fontSize: 11
      color: "#94a3b8"
    - kind: marker
      varName: dealerSeat
      label: "D"
      position: playerSeat
      offsetX: -60
      offsetY: -20
      markerShape: circle
      color: "#fbbf24"
```

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/canvas/layers.ts` (modify)
- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts` (new)
- `packages/runner/src/canvas/canvas-updater.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` (new)
- `packages/runner/test/canvas/layers.test.ts` (modify)
- `packages/runner/test/canvas/canvas-updater.test.ts` (modify)
- `packages/runner/test/canvas/GameCanvas.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)
- `data/games/texas-holdem/visual-config.yaml` (modify)

## Out of Scope

- Token type matching or card template rendering — that's CARGAMVISEXP-001/002
- Zone layout or promotion logic — that's CARGAMVISEXP-003
- Table background — that's CARGAMVISEXP-004
- Hand panel UI — that's CARGAMVISEXP-006
- Engine/kernel changes of any kind
- FITL visual config changes
- Any layout algorithm changes

## Acceptance Criteria

### Tests That Must Pass

1. `table-overlay-renderer.test.ts` — new test: `globalVar` overlay renders label + value at table center + offset
2. `table-overlay-renderer.test.ts` — new test: `globalVar` overlay updates when variable value changes
3. `table-overlay-renderer.test.ts` — new test: `perPlayerVar` overlay renders for each active player near their seat
4. `table-overlay-renderer.test.ts` — new test: `perPlayerVar` overlay skips eliminated players
5. `table-overlay-renderer.test.ts` — new test: `marker` overlay renders badge at the seat whose index equals the variable value
6. `table-overlay-renderer.test.ts` — new test: `marker` overlay moves when variable value changes (dealer rotates)
7. `table-overlay-renderer.test.ts` — new test: no overlays rendered when config has no `tableOverlays`
8. Existing suite: `pnpm -F @ludoforge/runner test`
9. Existing suites updated for wiring/schema expectations: `layers.test.ts`, `canvas-updater.test.ts`, `GameCanvas.test.ts`, `visual-config-schema.test.ts`, `visual-config-provider.test.ts`, `visual-config-files.test.ts`

### Invariants

1. Games without `tableOverlays` in their config see no overlays rendered (no regressions).
2. Overlay rendering is reactive: reflects current render model state, never mutates it.
3. Overlays are in world-space and transform correctly with viewport pan/zoom.
4. No engine/kernel/compiler code is modified.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` (new) — globalVar, perPlayerVar, marker rendering; reactivity; no-config fallback

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose test/canvas/renderers/table-overlay-renderer.test.ts`
2. `pnpm -F @ludoforge/runner typecheck && pnpm -F @ludoforge/runner lint && pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-02-20
- What changed:
  - Added `tableOverlays` schema/types and `getTableOverlays()` provider access.
  - Implemented `table-overlay-renderer.ts` for `globalVar`, `perPlayerVar`, and `marker` overlays in world space.
  - Added dedicated `tableOverlayLayer` in canvas layers and wired overlay renderer through `GameCanvas` and `canvas-updater`.
  - Updated Texas Hold'em `visual-config.yaml` with pot, street bet, and dealer marker overlays.
  - Added/updated tests for overlay renderer behavior, schema/provider coverage, layer wiring, updater reactivity, and Texas config expectations.
- Deviations from original plan:
  - Explicit `layers.ts` integration was used (instead of ad-hoc container wiring) to keep layer architecture centralized and extensible.
  - `canvas-updater` was refined so overlay-variable changes trigger overlay updates without forcing zone/token/adjacency redraws.
- Verification results:
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner test` passed.
