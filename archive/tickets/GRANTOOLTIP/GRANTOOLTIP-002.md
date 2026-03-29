# GRANTOOLTIP-002: Extend runner model and visual config for breakdown display

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: GRANTOOLTIP-001

## Problem

The runner pipeline currently collapses kernel victory breakdowns into flat component aggregates before the UI sees them. That loses the per-space detail now computed by the kernel. The fix must preserve raw breakdown data through the runner frame, then enrich it with display names during render projection, while adding a per-component `detailTemplate` field in visual config for presentation formatting.

## Assumption Reassessment (2026-03-28)

1. `RenderVictoryStandingEntry` in `packages/runner/src/model/render-model.ts` still has `components: readonly number[]` — verified.
2. `RunnerVictoryStandingEntry` in `packages/runner/src/model/runner-frame.ts` also still has `components: readonly number[]` — verified. The ticket originally missed this intermediate projection layer.
3. `deriveVictoryStandings()` in `packages/runner/src/model/derive-victory-standings.ts` already reads kernel `result.components.breakdowns`, but immediately flattens each breakdown to `aggregate` — verified.
4. `VictoryTooltipComponent` in `packages/runner/src/config/visual-config-types.ts` has `label` and optional `description` only — verified. It needs an optional `detailTemplate`.
5. Zone display-name lookup is not exposed as a dedicated “display name resolver”; the current visual-config API exposes `getZoneLabel(zoneId)`, and runner projection already falls back to `formatIdAsDisplayName(zoneId)` — verified.
6. `VictoryStandingsBar.tsx` still reads `entry.components[i]` as a number — verified.
7. The ticket’s original test target `packages/runner/test/model/derive-victory-standings.test.ts` does not exist — verified. New focused tests must be added.
8. `data/games/texas-holdem/visual-config.yaml` does not define `victoryStandings`, so this ticket should not touch it unless victory standings are introduced separately — verified.

## Architecture Check

1. The cleaner architecture is a two-stage model:
   - `RunnerFrame` preserves raw breakdown data from the engine (`spaceId`, `contribution`, `factors`, `aggregate`) without any visual-config dependency.
   - `RenderModel` enriches those breakdowns with UI-facing `displayName`, because render projection already owns visual-config lookups for zones, factions, and actions.
2. Resolving space display names inside `deriveVictoryStandings()` would be the wrong layer boundary: that function currently runs during runner-frame derivation and does not receive `VisualConfigProvider`. Forcing visual-config concerns into that layer would weaken the architecture.
3. `detailTemplate` in visual config is per-game presentation data, aligning with Foundation 3 (visual separation). The kernel/runner supply structured factors; visual config controls formatting.
4. No backwards-compatibility shims — both runner and render victory entry types should move off flat `number[]` in the same change (Foundation 9).

## What to Change

### 1. Add raw breakdown types to runner-frame.ts

```typescript
export interface RunnerSpaceContribution {
  readonly spaceId: string;
  readonly contribution: number;
  readonly factors: Readonly<Record<string, number>>;
}

export interface RunnerComponentBreakdown {
  readonly aggregate: number;
  readonly spaces: readonly RunnerSpaceContribution[];
}
```

Replace `components: readonly number[]` with `components: readonly RunnerComponentBreakdown[]` in `RunnerVictoryStandingEntry`.

### 2. Add enriched breakdown types to render-model.ts

```typescript
export interface RenderSpaceContribution {
  readonly spaceId: string;
  readonly displayName: string;
  readonly contribution: number;
  readonly factors: Readonly<Record<string, number>>;
}

export interface RenderComponentBreakdown {
  readonly aggregate: number;
  readonly spaces: readonly RenderSpaceContribution[];
}
```

Replace `components: readonly number[]` with `components: readonly RenderComponentBreakdown[]` in `RenderVictoryStandingEntry`.

### 3. Update deriveVictoryStandings() (derive-victory-standings.ts)

Map kernel `ComponentBreakdown` to runner breakdown data only:
- Copy `aggregate`, `spaceId`, `contribution`, and `factors` directly
- Do not resolve display names here
- Do not filter spaces here; the UI decides what to hide/show

### 4. Update render projection

In `project-render-model.ts`, project runner victory breakdowns into render victory breakdowns:
- Resolve `spaceId` to `displayName` via `visualConfigProvider.getZoneLabel(zoneId) ?? formatIdAsDisplayName(zoneId)`
- Preserve `aggregate`, `contribution`, and `factors` unchanged

### 5. Extend VictoryTooltipComponent (visual-config-types.ts)

Add optional `detailTemplate?: string` field. Template syntax: `{key}` is replaced with the corresponding factor value or `{contribution}` for the space's contribution number.

### 6. Update FITL visual-config.yaml

Add `detailTemplate` to each tooltip component:
- Marker total components: `"(pop {population}) x{multiplier} = {contribution}"`
- Base count components: `"{contribution}"`
- Controlled population components: `"(pop {population}) = {contribution}"`
- Global var components: `"{contribution}"`

### 7. Update VictoryStandingsBar.tsx

- Read `entry.components[i].aggregate` for the summary row
- Prepare the component detail data needed by GRANTOOLTIP-003 without regressing the current tooltip
- Keep detailed formatting logic minimal and aligned with the ticket dependency split; this ticket should make the richer data available and wire `detailTemplate`, not overreach into interaction behavior reserved for GRANTOOLTIP-003

## Files to Touch

- `packages/runner/src/model/runner-frame.ts` (modify)
- `packages/runner/src/model/render-model.ts` (modify)
- `packages/runner/src/model/derive-victory-standings.ts` (modify)
- `packages/runner/src/model/project-render-model.ts` (modify)
- `packages/runner/src/config/visual-config-types.ts` (modify)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify)
- `packages/runner/src/ui/VictoryStandingsBar.tsx` (modify)
- `packages/runner/test/model/derive-victory-standings.test.ts` (new)
- `packages/runner/test/model/project-render-model-victory-standings.test.ts` (new or equivalent focused model test)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify if needed for FITL assertions)

## Out of Scope

- Kernel breakdown computation (GRANTOOLTIP-001)
- UI rendering and interaction (GRANTOOLTIP-003)
- Template engine implementation beyond simple string substitution
- Any Texas Hold'em visual-config change, because that game currently has no victory standings config surface to extend

## Acceptance Criteria

### Tests That Must Pass

1. `deriveVictoryStandings()` preserves kernel breakdowns in runner-frame shape without flattening to aggregate-only numbers
2. Render projection resolves `spaceId` to `displayName` with `getZoneLabel(...) ?? formatIdAsDisplayName(...)`
3. Space contributions carry resolved `displayName` in the render model, not merely `spaceId`
4. `detailTemplate` is accepted by the Zod visual-config schema and remains optional
5. FITL `visual-config.yaml` loads without validation errors after adding `detailTemplate`
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `RenderComponentBreakdown.aggregate` equals the kernel's `ComponentBreakdown.aggregate` (no re-computation)
2. `RunnerComponentBreakdown` and `RunnerSpaceContribution` remain presentation-agnostic and do not depend on `VisualConfigProvider`
3. Display name resolution never crashes for unknown spaceIds (fallback to formatted spaceId display name)
4. Visual config schema accepts missing `detailTemplate` (optional field)

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/derive-victory-standings.test.ts` — new focused test for raw runner-frame breakdown preservation
2. `packages/runner/test/model/project-render-model-victory-standings.test.ts` — new focused test for display-name enrichment and fallback
3. `packages/runner/test/config/visual-config-schema.test.ts` — validate `detailTemplate` schema acceptance and optionality
4. `packages/runner/test/config/visual-config-files.test.ts` — ensure FITL config still parses with the new field if targeted coverage is warranted

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo build`
3. `pnpm turbo test`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-28
- **What actually changed**:
  - Preserved full kernel victory breakdowns in `RunnerVictoryStandingEntry` instead of flattening them to `number[]`.
  - Projected those raw breakdowns into render-model breakdowns with per-space `displayName` enrichment in `project-render-model.ts`.
  - Added optional `detailTemplate` support to the runner visual-config schema.
  - Added FITL `detailTemplate` entries for all configured victory tooltip components.
  - Updated `VictoryStandingsBar.tsx` to read component aggregates from the new breakdown shape.
  - Added focused runner tests for raw breakdown preservation, render-layer display-name enrichment, and schema acceptance of `detailTemplate`.
- **Deviations from original plan**:
  - The original ticket incorrectly placed zone display-name resolution inside `deriveVictoryStandings()`. The implementation moved that enrichment to render projection, which is the cleaner long-term architecture because visual-config concerns stay out of runner-frame derivation.
  - `RunnerVictoryStandingEntry` also required a contract update; the original ticket only called out `RenderVictoryStandingEntry`.
  - Texas Hold'em visual config was intentionally left unchanged because it does not define `victoryStandings`.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm turbo build`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
