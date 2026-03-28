# GRANTOOLTIP-004: Add stable generic component IDs to victory breakdown contracts

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler/kernel victory contracts plus runner projection types
**Deps**: archive/tickets/GRANTOOLTIP/GRANTOOLTIP-003.md

## Problem

Victory tooltip rendering still relies on positional pairing between runtime component breakdowns and visual-config metadata. That is brittle: adding, reordering, or evolving victory components can silently mislabel tooltip rows even when totals are still numerically correct. The architecture needs stable semantic component identity threaded from the agnostic victory contract itself, not inferred in the UI.

## Assumption Reassessment (2026-03-28)

1. `packages/engine/src/kernel/types-core.ts` still defines `VictoryStandingEntry` with `seat`, `formula`, and `threshold` only; there is no stable component-identity contract at the compiled victory-entry level.
2. `packages/engine/src/kernel/derived-values.ts` exposes `VictoryComponents.breakdowns`, but each `ComponentBreakdown` currently has `aggregate` and `spaces` only; there is no `componentId`.
3. `packages/runner/src/model/runner-frame.ts`, `packages/runner/src/model/render-model.ts`, and `packages/runner/src/model/project-render-model.ts` preserve runtime breakdowns, but all component matching in the runner is still positional.
4. `packages/runner/src/ui/VictoryStandingsBar.tsx` currently falls back to `Component N` when visual-config metadata length diverges from runtime component count. That prevents crashes, but it confirms the underlying architectural fragility.
5. `packages/runner/src/config/visual-config-types.ts` still models tooltip breakdown metadata as `components: VictoryTooltipComponent[]` with no ID field. That layout cannot robustly target runtime components unless both sides preserve identical order forever.
6. FITL victory formulas are currently encoded as formula variants such as `markerTotalPlusZoneCount` and `controlledPopulationPlusMapBases` in `data/games/fire-in-the-lake/91-victory-standings.md`; the component identities can therefore be assigned generically by formula slot without introducing game-specific IDs into engine code.

## Architecture Check

1. The clean architecture is to make component identity part of the agnostic victory contract itself. The kernel already owns the semantic meaning of each component; the UI should consume an explicit `componentId` instead of reconstructing identity from array position.
2. Component IDs must remain generic and formula-derived, not game-authored display labels. Generic IDs such as `markerTotal`, `zoneCount`, `mapBases`, `controlledPopulation`, and `globalVar` preserve Foundations 1 and 4 while remaining stable across runner/UI evolution.
3. This should be an end-to-end contract change with no compatibility aliasing. All consumers move from positional assumptions to `componentId` in one change (Foundation 9).
4. Visual-config changes should not be mixed into this ticket beyond what is necessary to thread IDs through the runtime contract. The first step is making runtime identity explicit; keyed visual-config lookup is a separate follow-up concern.

## What to Change

### 1. Add a generic victory component ID contract in engine types

Introduce a generic `VictoryComponentId` type and add `componentId` to each victory breakdown item. The ID set should be derived by formula slot, for example:

- `markerTotal`
- `zoneCount`
- `mapBases`
- `controlledPopulation`
- `globalVar`

The IDs must be deterministic and game-agnostic.

### 2. Centralize component identity assignment in the kernel/compiler path

Update the shared victory-formula breakdown builder so each returned component carries its `componentId` alongside `aggregate` and `spaces`. The assignment logic should live with the victory-formula semantics, not in the runner.

### 3. Thread `componentId` through runner-frame and render-model contracts

Update runner-frame derivation and render projection so every `RunnerComponentBreakdown` and `RenderComponentBreakdown` preserves the engine-provided `componentId`.

### 4. Update current tests and consumers to assert semantic IDs

Replace positional-only assertions in focused engine and runner victory tests with assertions that the expected `componentId` values are preserved in order and survive projection unchanged.

## Files to Touch

- `packages/engine/src/kernel/derived-values.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compile-victory.ts` (modify if required by the compiled contract)
- `packages/runner/src/model/runner-frame.ts` (modify)
- `packages/runner/src/model/render-model.ts` (modify)
- `packages/runner/src/model/derive-victory-standings.ts` (modify)
- `packages/runner/src/model/project-render-model.ts` (modify)
- `packages/engine/test/unit/derived-values.test.ts` (modify)
- `packages/engine/test/integration/fitl-derived-values.test.ts` (modify)
- `packages/runner/test/model/derive-victory-standings.test.ts` (modify)
- `packages/runner/test/model/project-render-model-victory-standings.test.ts` (modify)

## Out of Scope

- Replacing visual-config tooltip metadata arrays with keyed lookup
- UI interaction or styling changes in `VictoryStandingsBar`
- Adding game-specific component IDs or display labels to engine code

## Acceptance Criteria

### Tests That Must Pass

1. Each victory formula variant emits deterministic generic `componentId` values for every component breakdown.
2. `computeAllVictoryStandings()` preserves those IDs in runtime results.
3. Runner-frame derivation preserves `componentId` without runner-generated inference.
4. Render projection preserves `componentId` while adding display names.
5. Existing suite: `pnpm -F @ludoforge/engine test`
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Component identity is part of the agnostic victory contract, not inferred in the UI.
2. No game-specific IDs, aliases, or compatibility shims are introduced.
3. `componentId` remains stable for a given formula slot across compiler/kernel/runner layers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/derived-values.test.ts` — assert formula-specific `componentId` assignment and preservation in component breakdowns.
2. `packages/engine/test/integration/fitl-derived-values.test.ts` — assert compiled FITL standings expose the expected generic component IDs.
3. `packages/runner/test/model/derive-victory-standings.test.ts` — assert runner-frame victory entries preserve `componentId`.
4. `packages/runner/test/model/project-render-model-victory-standings.test.ts` — assert render projection keeps `componentId` while enriching space display names.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo test`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`
