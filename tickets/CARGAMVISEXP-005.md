# CARGAMVISEXP-005: Table overlays (pot, bets, dealer button)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: CARGAMVISEXP-003 (needs zone positions from table layout for playerSeat-relative placement)

## Problem

Pot, bets, and dealer seat are only visible as raw text in the scoreboard panel. There is no on-table visual representation. Card games need variable-driven overlays positioned relative to the table center or individual player seats.

## Assumption Reassessment (2026-02-20)

1. `VisualConfigSchema` at `visual-config-types.ts:195-206` does NOT have a `tableOverlays` field — confirmed.
2. `canvas-updater.ts` exists and handles per-frame rendering updates — confirmed. Does not wire an overlay renderer.
3. `GameCanvas.tsx` exists and creates/wires renderers — confirmed. Does not wire overlay renderer.
4. Render model provides `globalVariables` and per-player `variables` — the overlay renderer needs to read these values.
5. Layout result provides zone positions including player seat positions — needed for `playerSeat`-relative overlays.

## Architecture Check

1. `TableOverlaysSchema` is a generic visual config feature: any game can define variable-driven overlays at table center or player seats. No game-specific branching.
2. Overlay rendering reads variable values from the render model at update time — purely reactive, no game logic.
3. Three overlay kinds (`globalVar`, `perPlayerVar`, `marker`) are generic patterns that cover common board game needs beyond poker.
4. No backwards-compatibility shims: `tableOverlays` is optional. Games without it see no overlays.

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
  - `perPlayerVar` at `playerSeat`: renders per each active player near their seat + offset
  - `marker` at `playerSeat`: renders a marker badge at the seat whose index equals the variable's value
- In world-space (pans/zooms with viewport)

### 4. Wire into canvas-updater.ts and GameCanvas.tsx

- `GameCanvas.tsx`: create overlay renderer, add overlay container to layer hierarchy (on top of zones, below UI)
- `canvas-updater.ts`: call overlay update on each render cycle with current render model and layout positions

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
- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts` (new)
- `packages/runner/src/canvas/canvas-updater.ts` (modify)
- `packages/runner/src/canvas/GameCanvas.tsx` (modify)
- `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` (new)
- `data/games/texas-holdem/visual-config.yaml` (modify)

## Out of Scope

- Token type matching or card template rendering — that's CARGAMVISEXP-001/002
- Zone layout or promotion logic — that's CARGAMVISEXP-003
- Table background — that's CARGAMVISEXP-004
- Hand panel UI — that's CARGAMVISEXP-006
- Engine/kernel changes of any kind
- FITL visual config changes
- `layers.ts` changes (overlay container is added directly in GameCanvas, or via a minor layers.ts addition if needed — but that's scoped to this ticket only if required)

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
