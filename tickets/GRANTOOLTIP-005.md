# GRANTOOLTIP-005: Replace positional victory tooltip metadata with componentId-keyed config lookup

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner/config only after `componentId` lands
**Deps**: tickets/GRANTOOLTIP-004.md, archive/tickets/GRANTOOLTIP/GRANTOOLTIP-003.md

## Problem

Even with the current tooltip behavior improvements, visual-config metadata is still authored as an ordered `components[]` array and matched against runtime breakdowns by index. That duplicates ordering knowledge in presentation config and makes authoring fragile. The runner should render runtime component order and look up labels, descriptions, and templates by stable `componentId`, not by parallel array position.

## Assumption Reassessment (2026-03-28)

1. `packages/runner/src/config/visual-config-types.ts` still defines `VictoryTooltipBreakdown` as `{ seat, components: VictoryTooltipComponent[] }`, so metadata lookup remains positional.
2. `packages/runner/src/config/visual-config-provider.ts` currently returns the whole seat-level breakdown object and leaves row matching to `VictoryStandingsBar.tsx`.
3. `packages/runner/src/ui/VictoryStandingsBar.tsx` still maps `entry.components` and reads metadata from `breakdown.components[index]`, confirming the runner/UI contract is still positional.
4. FITL `data/games/fire-in-the-lake/visual-config.yaml` still authors ordered component arrays per seat. That means authoring currently has to stay synchronized with kernel formula order manually.
5. `GRANTOOLTIP-004` is the required prerequisite because the runner cannot perform keyed lookup until runtime components carry stable generic IDs.

## Architecture Check

1. The cleaner architecture is runtime-order plus keyed metadata lookup. Runtime data owns semantic order; visual config owns presentation fields keyed by semantic ID. That removes duplicated order contracts and eliminates the current index-coupling failure mode.
2. Presentation metadata remains fully inside `visual-config.yaml`, preserving Foundation 3. The runner only resolves `componentId -> visual metadata`; it does not invent labels or templates for game-specific content.
3. No backwards compatibility layer should be kept. Once keyed metadata lands, the old positional `components[]` config shape should be removed and all game configs updated in the same change (Foundation 9).
4. The provider surface should become narrower and cleaner: the UI should request metadata by seat and `componentId`, instead of receiving a whole parallel array and coordinating it itself.

## What to Change

### 1. Replace the visual-config schema shape

Change the victory tooltip config from positional `components: VictoryTooltipComponent[]` to a keyed structure indexed by `componentId`, for example:

```yaml
victoryStandings:
  tooltipBreakdowns:
    - seat: vc
      componentsById:
        markerTotal:
          label: "Total Opposition"
          description: "Population-weighted opposition (active x2, passive x1)"
          detailTemplate: "(pop {population}) x{multiplier} = {contribution}"
        mapBases:
          label: "VC Bases on Map"
          description: "VC bases across all map spaces"
          detailTemplate: "{contribution}"
```

The runtime component order should come from `entry.components`, not from config ordering.

### 2. Tighten the provider lookup API

Update `VisualConfigProvider` to expose a per-seat, per-`componentId` metadata lookup API rather than returning a full positional array for the UI to coordinate.

### 3. Update `VictoryStandingsBar.tsx` to render by runtime order

For each runtime component:

- read `component.componentId`
- resolve metadata by `seat + componentId`
- render label/description/template from the keyed lookup
- fall back only when metadata for that specific `componentId` is absent

### 4. Update FITL config and validation coverage

Rewrite FITL victory tooltip config to the keyed shape and add tests that assert the new schema and provider behavior.

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/ui/VictoryStandingsBar.tsx` (modify)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)
- `packages/runner/test/ui/VictoryStandingsBar.test.tsx` (modify)

## Out of Scope

- Introducing runtime `componentId` itself (`GRANTOOLTIP-004`)
- Kernel victory-formula changes beyond what `GRANTOOLTIP-004` delivers
- New tooltip interaction features unrelated to metadata lookup

## Acceptance Criteria

### Tests That Must Pass

1. Visual-config schema accepts keyed `componentsById` metadata and rejects the removed positional shape.
2. `VisualConfigProvider` resolves victory tooltip metadata by `seat` and `componentId`.
3. `VictoryStandingsBar` renders runtime component order correctly without index-based metadata pairing.
4. Missing metadata for one `componentId` degrades locally for that component only and does not affect other rows.
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Presentation metadata stays in visual config; runtime semantic order stays in victory breakdown data.
2. No positional coupling remains between runtime victory components and tooltip metadata.
3. No legacy alias path for `components[]` remains after the migration.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` — verify keyed victory tooltip metadata shape and rejection of the removed positional form.
2. `packages/runner/test/config/visual-config-files.test.ts` — verify FITL visual config still validates after migration.
3. `packages/runner/test/ui/VictoryStandingsBar.test.tsx` — verify metadata lookup is by `componentId`, not by array index, and that local fallback only applies to the missing component.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo test`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`
