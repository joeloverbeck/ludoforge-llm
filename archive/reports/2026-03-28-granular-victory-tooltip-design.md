# Granular Victory Tooltip Breakdowns

**Date**: 2026-03-28
**Status**: Design approved

## Context

Victory scoring tooltips currently show aggregate component values (e.g., "Total Opposition: 20") without explaining which spaces contribute to that total. For COIN-series games like FITL, understanding the per-space breakdown is essential for strategic decision-making. This design adds expandable per-space breakdowns to victory tooltip components.

## Requirements

1. All summatory components (marker totals, base counts, controlled population) show per-space breakdowns
2. Breakdowns are click-to-expand inline within the tooltip (compact by default)
3. Zero-contribution spaces are hidden; summary line shows "N of M spaces contribute"
4. Marker total breakdowns show the formula: `(pop {population}) x{multiplier} = {contribution}`
5. Display templates are configured per component in visual-config.yaml (Foundation 3)
6. Breakdowns are computed in the kernel (Foundation 1, 5, 11)

## Architecture

### Data Flow

```
Kernel: computeVictoryComponents()
  -> ComponentBreakdown[] (aggregate + per-space SpaceContribution[])
     -> Runner: deriveVictoryStandings()
        -> RenderComponentBreakdown[] (with displayName resolution)
           -> UI: VictoryStandingsBar tooltip
              -> Visual config detailTemplate for formatting
```

### Kernel Types (derived-values.ts)

```typescript
interface SpaceContribution {
  readonly spaceId: string;
  readonly contribution: number;
  readonly factors: Readonly<Record<string, number>>;
}

interface ComponentBreakdown {
  readonly aggregate: number;
  readonly spaces: readonly SpaceContribution[];
}

interface VictoryComponents {
  readonly breakdowns: readonly ComponentBreakdown[];
  // replaces: readonly values: readonly number[]
}
```

### Breakdown Functions

Each existing helper gets a breakdown companion:

| Existing | Breakdown variant | Factors per space |
|----------|-------------------|-------------------|
| `computeMarkerTotal()` | `computeMarkerTotalBreakdown()` | `{ population, multiplier }` |
| `countBasesOnMap()` | `countBasesOnMapBreakdown()` | `{ count }` |
| `sumControlledPopulation()` | `sumControlledPopulationBreakdown()` | `{ population }` |
| `countTokensInZone()` | N/A (single zone, no space breakdown) | — |
| Global var | N/A (not space-based) | — |

### Runner Model (render-model.ts)

```typescript
interface RenderSpaceContribution {
  readonly spaceId: string;
  readonly displayName: string;
  readonly contribution: number;
  readonly factors: Readonly<Record<string, number>>;
}

interface RenderComponentBreakdown {
  readonly aggregate: number;
  readonly spaces: readonly RenderSpaceContribution[];
}
```

`deriveVictoryStandings()` resolves spaceId -> displayName via visual config zone display names.

### Visual Config Extension (visual-config-types.ts)

`VictoryTooltipComponent` gains optional `detailTemplate?: string`.

Template syntax: `{key}` substituted with factor values or `{contribution}` for the result.

Example in FITL `visual-config.yaml`:
```yaml
tooltipBreakdowns:
  - seat: vc
    components:
      - label: "Total Opposition"
        description: "Population-weighted opposition (active x2, passive x1)"
        detailTemplate: "(pop {population}) x{multiplier} = {contribution}"
      - label: "VC Bases on Map"
        description: "VC bases across all map spaces"
        detailTemplate: "{contribution}"
```

### UI Behavior (VictoryStandingsBar.tsx)

- Component rows have click-to-toggle expand (triangle indicator)
- Local React state tracks expanded indices
- Expanded section: contributing spaces sorted by contribution descending
- Each line formatted via detailTemplate (fallback: `-> {contribution}`)
- Summary line: `(N of M spaces contribute)`
- Zero-contribution spaces hidden

## Foundation Alignment

- F1 (Engine Agnosticism): Formula types are generic; factors are named generically
- F3 (Visual Separation): Display templates live in visual-config.yaml
- F5 (Determinism): Breakdowns computed deterministically in kernel
- F7 (Immutability): All new types are readonly
- F9 (No Backwards Compat): `values` replaced by `breakdowns`, all consumers updated
- F11 (Testing as Proof): Breakdown correctness proven through tests

## Files to Touch

| File | Change |
|------|--------|
| `packages/engine/src/kernel/derived-values.ts` | New types, breakdown functions, modify computeVictoryComponents |
| `packages/runner/src/model/render-model.ts` | Update RenderVictoryStandingEntry |
| `packages/runner/src/model/derive-victory-standings.ts` | Map breakdowns, resolve display names |
| `packages/runner/src/config/visual-config-types.ts` | Add detailTemplate to component schema |
| `packages/runner/src/ui/VictoryStandingsBar.tsx` | Expandable rows, template substitution |
| `data/games/fire-in-the-lake/visual-config.yaml` | Add detailTemplate per component |
| Engine + runner tests | New breakdown tests, update existing tests |
