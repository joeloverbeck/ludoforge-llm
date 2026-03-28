# GRANTOOLTIP-002: Extend runner model and visual config for breakdown display

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: GRANTOOLTIP-001

## Problem

The runner model passes victory components as flat `number[]` to the UI, losing the per-space breakdown detail computed by the kernel. The render model needs to carry breakdown data with resolved display names, and visual config needs a `detailTemplate` field so each game can control how formula details are formatted.

## Assumption Reassessment (2026-03-28)

1. `RenderVictoryStandingEntry` in `packages/runner/src/model/render-model.ts` has `components: readonly number[]` — verified.
2. `deriveVictoryStandings()` in `packages/runner/src/model/derive-victory-standings.ts` maps `result.components.values` to `components` — must switch to `breakdowns` after GRANTOOLTIP-001.
3. `VictoryTooltipComponent` in `packages/runner/src/config/visual-config-types.ts` has `label` and optional `description` — needs `detailTemplate` addition.
4. Zone display name resolution is available via visual config provider's zone display name lookup.
5. `VictoryStandingsBar.tsx` reads `entry.components[i]` as a number — must switch to `entry.components[i].aggregate` and use breakdown spaces for detail display.

## Architecture Check

1. Adding `RenderComponentBreakdown` and `RenderSpaceContribution` types follows the existing pattern of render model types that enrich kernel data with UI-friendly fields (like display names).
2. `detailTemplate` in visual config is per-game presentation data, aligning with Foundation 3 (visual separation). The kernel provides raw factors, visual config controls formatting.
3. No backwards-compatibility shims — `components: readonly number[]` is replaced entirely (Foundation 9).

## What to Change

### 1. New render model types (render-model.ts)

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

### 2. Update deriveVictoryStandings() (derive-victory-standings.ts)

Map kernel `ComponentBreakdown` to `RenderComponentBreakdown`:
- Copy `aggregate` and `factors` directly
- Resolve `spaceId` → `displayName` using visual config zone display name lookup
- Filter or pass through all spaces (zero-filtering is UI layer responsibility)

### 3. Extend VictoryTooltipComponent (visual-config-types.ts)

Add optional `detailTemplate?: string` field. Template syntax: `{key}` is replaced with the corresponding factor value or `{contribution}` for the space's contribution number.

### 4. Update FITL visual-config.yaml

Add `detailTemplate` to each tooltip component:
- Marker total components: `"(pop {population}) x{multiplier} = {contribution}"`
- Base count components: `"{contribution}"`
- Controlled population components: `"(pop {population}) = {contribution}"`
- Global var components: `"{contribution}"`

### 5. Update Texas Hold'em visual-config.yaml (if applicable)

Add `detailTemplate` to any existing tooltip components, or skip if no victory standings exist.

## Files to Touch

- `packages/runner/src/model/render-model.ts` (modify)
- `packages/runner/src/model/derive-victory-standings.ts` (modify)
- `packages/runner/src/config/visual-config-types.ts` (modify)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify)
- `data/games/texas-holdem/visual-config.yaml` (modify if applicable)
- `packages/runner/test/model/derive-victory-standings.test.ts` (modify)

## Out of Scope

- Kernel breakdown computation (GRANTOOLTIP-001)
- UI rendering and interaction (GRANTOOLTIP-003)
- Template engine implementation beyond simple string substitution

## Acceptance Criteria

### Tests That Must Pass

1. `deriveVictoryStandings()` maps kernel breakdowns to render breakdowns with correct display names
2. Space contributions carry resolved `displayName` (not just `spaceId`)
3. `detailTemplate` parsing validates at visual config load time (Zod schema)
4. FITL visual-config.yaml loads without validation errors
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `RenderComponentBreakdown.aggregate` equals the kernel's `ComponentBreakdown.aggregate` (no re-computation)
2. Display name resolution never crashes for unknown spaceIds (fallback to spaceId as display name)
3. Visual config schema accepts missing `detailTemplate` (optional field)

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/derive-victory-standings.test.ts` — update to verify breakdown structure and display name resolution
2. `packages/runner/test/config/visual-config-types.test.ts` — validate detailTemplate schema acceptance (if config schema tests exist)

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
