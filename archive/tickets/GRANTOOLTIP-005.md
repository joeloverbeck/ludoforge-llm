# GRANTOOLTIP-005: Replace positional victory tooltip metadata with componentId-keyed config lookup

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner/config only after `componentId` lands
**Deps**: archive/tickets/GRANTOOLTIP-004.md, archive/tickets/GRANTOOLTIP/GRANTOOLTIP-003.md

## Problem

Runtime victory components already carry stable `componentId` values, but visual-config metadata is still authored as a seat-level `components[]` array and exposed through a provider API that returns the whole seat breakdown. `VictoryStandingsBar.tsx` then rebuilds its own `componentId -> metadata` map inside the UI. That avoids direct index matching, but it still leaves lookup policy split across config, provider, and component code. The runner should render runtime component order and resolve labels, descriptions, and templates through a stable provider lookup keyed by `seat + componentId`.

## Assumption Reassessment (2026-03-28)

1. `packages/runner/src/config/visual-config-types.ts` still defines victory tooltip metadata as `{ seat, components: VictoryTooltipComponent[] }`. The shape is still array-based even though each element now has a required `componentId`.
2. `packages/runner/src/config/visual-config-provider.ts` currently returns the whole seat-level breakdown object and leaves `componentId` lookup to `VictoryStandingsBar.tsx`.
3. `packages/runner/src/ui/VictoryStandingsBar.tsx` already renders in runtime order and rebuilds a local `Map(componentId -> metadata)` from config before rendering rows. The current contract is no longer index-based in the UI, but the keyed lookup is not owned by the provider where it belongs.
4. FITL `data/games/fire-in-the-lake/visual-config.yaml` still authors per-seat ordered component arrays. Authoring is more stable than before because each entry carries `componentId`, but order still appears in a place where it has no semantic meaning.
5. `GRANTOOLTIP-004` is already satisfied in the current codebase: runtime victory components carry generic `componentId` values. The remaining work is runner/config refactoring only.

## Architecture Check

1. The cleaner architecture is runtime-order plus keyed metadata lookup. Runtime data owns semantic order; visual config owns presentation fields keyed by semantic ID. That removes meaningless ordering from config and centralizes metadata resolution in the provider.
2. Presentation metadata remains fully inside `visual-config.yaml`, preserving Foundation 3. The runner only resolves `componentId -> visual metadata`; it does not invent labels or templates for game-specific content.
3. No backwards compatibility layer should be kept. Once keyed metadata lands, the old positional `components[]` config shape should be removed and all game configs updated in the same change (Foundation 9).
4. The provider surface should become narrower and cleaner: the UI should request metadata by seat and `componentId`, instead of receiving a whole seat payload and coordinating lookup itself.

## What to Change

### 1. Replace the visual-config schema shape

Change the victory tooltip config from `components: VictoryTooltipComponent[]` to a keyed structure indexed by `componentId`, for example:

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

Update `VisualConfigProvider` to expose a per-seat, per-`componentId` metadata lookup API rather than returning a full seat-level payload for the UI to coordinate.

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
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `packages/runner/test/ui/VictoryStandingsBar.test.tsx` (modify)

## Out of Scope

- Introducing runtime `componentId` itself (`GRANTOOLTIP-004`)
- Kernel victory-formula changes beyond what `GRANTOOLTIP-004` delivers
- New tooltip interaction features unrelated to metadata lookup

## Acceptance Criteria

### Tests That Must Pass

1. Visual-config schema accepts keyed `componentsById` metadata and rejects the removed `components[]` shape.
2. `VisualConfigProvider` resolves victory tooltip metadata by `seat` and `componentId`.
3. `VictoryStandingsBar` renders runtime component order correctly while delegating metadata lookup to the provider.
4. Missing metadata for one `componentId` degrades locally for that component only and does not affect other rows.
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Presentation metadata stays in visual config; runtime semantic order stays in victory breakdown data.
2. No array-order coupling remains between runtime victory components and tooltip metadata.
3. No legacy alias path for `components[]` remains after the migration.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` — verify keyed victory tooltip metadata shape and rejection of the removed array form.
2. `packages/runner/test/config/visual-config-provider.test.ts` — verify provider lookup by `seat + componentId` and local null fallback for missing metadata.
3. `packages/runner/test/config/visual-config-files.test.ts` — verify FITL visual config still validates after migration.
4. `packages/runner/test/ui/VictoryStandingsBar.test.tsx` — verify runtime-order rendering still works when metadata is resolved through the provider and that fallback remains local to the missing component.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo test`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Replaced victory tooltip `components[]` config with keyed `componentsById` metadata in the runner schema and FITL visual config.
  - Replaced the provider's seat-level breakdown return value with direct `seat + componentId` metadata lookup.
  - Simplified `VictoryStandingsBar.tsx` to render runtime component order directly and resolve metadata through the provider.
  - Fixed a deeper fallback gap uncovered during reassessment: when seat metadata is absent, the tooltip now still renders runtime component rows with per-component fallback labels instead of collapsing to a score-only view.
  - Strengthened schema, provider, FITL config, and UI tests around the new contract.
- Deviations from original plan:
  - The ticket originally assumed the UI was still matching metadata by array index. In the current codebase it had already switched to local `componentId` mapping, so the implementation focused on removing the remaining array-shaped config and broad provider contract.
  - No new provider test file was needed; the existing `visual-config-provider.test.ts` file was extended instead.
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
