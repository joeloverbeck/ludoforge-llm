# GRANTOOLTIP-001: Add per-space breakdown to VictoryComponents in kernel

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel `derived-values.ts` types and computation functions
**Deps**: None

## Problem

Victory scoring components currently expose only aggregate numbers. That is enough to compute standings, but not enough to explain them. The kernel should expose per-space contribution data for space-based victory components so the runner/UI can present granular scoring details without re-deriving game logic outside the kernel.

## Assumption Reassessment (2026-03-28)

1. `VictoryComponents` is currently defined in `packages/engine/src/kernel/derived-values.ts` as `{ readonly values: readonly number[] }` — verified.
2. `computeVictoryComponents()` dispatches on four formula types: `markerTotalPlusZoneCount`, `markerTotalPlusMapBases`, `controlledPopulationPlusMapBases`, and `controlledPopulationPlusGlobalVar` — verified.
3. `computeMarkerTotal()`, `countBasesOnMap()`, `sumControlledPopulation()`, and `countTokensInZone()` currently return aggregates only — verified.
4. `VictoryStandingResult.components` is typed as `VictoryComponents`, and `computeAllVictoryStandings()` forwards that structure unchanged — verified.
5. Real compile-time consumers exist outside the engine. `packages/runner/src/model/derive-victory-standings.ts` currently reads `result.components.values` and maps them into the runner render model. This ticket must update that consumer in the same change (Foundation 9), even if richer runner rendering is deferred.
6. The original ticket listed the wrong engine unit-test path. Existing engine unit coverage is in `packages/engine/test/unit/derived-values.test.ts`, not `packages/engine/test/unit/kernel/derived-values.test.ts`.
7. Existing FITL integration coverage also asserts `components.values` in `packages/engine/test/integration/fitl-derived-values.test.ts`. That file is part of this ticket's real blast radius.
8. `VictoryTooltipComponent.detailTemplate` does not exist yet in `packages/runner/src/config/visual-config-types.ts`. Visual-config formatting remains follow-up work and is not part of this kernel ticket.
9. There is a real behavior mismatch today: `computeVictoryMarker()` throws `DERIVED_VALUE_FORMULA_NON_NUMERIC_VAR` for a non-numeric global var, while `computeVictoryComponents()` silently returns `0` for that same input. This ticket should fix that inconsistency rather than preserve it.

## Architecture Check

1. This change is more beneficial than the current architecture because it keeps victory semantics in the deterministic kernel. Reconstructing per-space scoring in the runner would duplicate logic, risk drift, and violate Foundations 1, 5, 9, and 11.
2. The kernel should return semantic scoring data, not presentation data. Per-space contributions and raw numeric factors belong here; display names, zero-row filtering, templates, and expand/collapse behavior belong in the runner/UI.
3. `VictoryComponents.values` should be replaced, not aliased. All consumers move in one change (Foundation 9).
4. `computeVictoryMarker()` and `computeVictoryComponents()` currently duplicate the same formula dispatch in separate switch statements. This ticket should consolidate them onto a single internal formula-breakdown path so aggregate scores and breakdowns cannot diverge.
5. Long-term, semantic component identifiers could further reduce positional coupling. That refinement is not required to land this ticket cleanly because each `VictoryFormula` variant already defines stable component order. Follow-up runner/UI work should avoid adding unnecessary new positional coupling on top.

## What to Change

### 1. New types in `derived-values.ts`

Add `SpaceContribution` and `ComponentBreakdown`. Replace `VictoryComponents.values` with `breakdowns: readonly ComponentBreakdown[]`.

```typescript
export interface SpaceContribution {
  readonly spaceId: string;
  readonly contribution: number;
  readonly factors: Readonly<Record<string, number>>;
}

export interface ComponentBreakdown {
  readonly aggregate: number;
  readonly spaces: readonly SpaceContribution[];
}

export interface VictoryComponents {
  readonly breakdowns: readonly ComponentBreakdown[];
}
```

### 2. Breakdown companion functions

Create breakdown variants for each helper:

- `computeMarkerTotalBreakdown()`: iterates spaces and returns per-space `{ spaceId, contribution: population * multiplier, factors: { population, multiplier } }`. Keep all board spaces, including zero-contribution rows, so the kernel provides a faithful explanation of the aggregate and the UI can choose its own filtering policy.
- `countBasesOnMapBreakdown()`: iterates spaces and returns per-space `{ spaceId, contribution: baseCount, factors: { count: baseCount } }` for spaces with one or more matching bases.
- `sumControlledPopulationBreakdown()`: iterates spaces and returns per-space `{ spaceId, contribution: population, factors: { population } }` for controlled spaces only.

Non-space-based components (`countTokensInZone`, global var) return `{ aggregate: N, spaces: [] }`.

### 3. Update `computeVictoryComponents()`

Switch from aggregate-only helpers to the new breakdown helpers and return `breakdowns[]`.

### 4. Share formula evaluation between aggregate scoring and breakdowns

Refactor the victory-formula computation so `computeVictoryMarker()` and `computeVictoryComponents()` use the same internal breakdown builder. `computeVictoryMarker()` should derive its total from the shared component aggregates instead of re-implementing the formula switch separately.

### 5. Update all consumers of `VictoryComponents.values`

Any code reading `.values` must move to `.breakdowns[i].aggregate` or equivalent. `computeVictoryMarker()` does not consume `VictoryComponents` today and does not need to change. This ticket does need to update compile-time consumers and tests that currently reference `.values`, including the runner's temporary aggregate mapping.

## Files to Touch

- `packages/engine/src/kernel/derived-values.ts`
- `packages/engine/test/unit/derived-values.test.ts`
- `packages/engine/test/integration/fitl-derived-values.test.ts`
- `packages/runner/src/model/derive-victory-standings.ts`

## Out of Scope

- Rich runner model changes that carry space-level breakdowns (GRANTOOLTIP-002)
- UI rendering and interaction changes (GRANTOOLTIP-003)
- Visual-config template additions (GRANTOOLTIP-002)

## Acceptance Criteria

### Tests That Must Pass

1. `computeMarkerTotalBreakdown()` returns correct per-space contributions for a known multi-space setup with mixed active/passive/neutral markers.
2. `countBasesOnMapBreakdown()` returns per-space base counts whose aggregate matches `countBasesOnMap()`.
3. `sumControlledPopulationBreakdown()` returns per-space population for controlled spaces only.
4. `computeVictoryComponents()` returns `breakdowns` with correct aggregates and space details for each formula type.
5. Non-space-based components (zone count, global var) return empty `spaces` arrays.
6. `computeVictoryComponents()` throws the same typed error as `computeVictoryMarker()` when a formula references a non-numeric global var.
7. The runner mapping still exposes aggregate numeric components using `breakdowns[i].aggregate`.
8. `pnpm -F @ludoforge/engine test` passes.
9. `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. For space-based components, `breakdowns[i].aggregate` equals the sum of `breakdowns[i].spaces.map((space) => space.contribution)`.
2. All new types are readonly (Foundation 7).
3. No game-specific identifiers are introduced into kernel code (Foundation 1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/derived-values.test.ts`: add direct unit coverage for the new breakdown helpers and update victory-component assertions to the `breakdowns` shape.
2. `packages/engine/test/integration/fitl-derived-values.test.ts`: update FITL integration assertions to read `breakdowns[*].aggregate`.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm turbo test`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Replaced `VictoryComponents.values` with typed `breakdowns`.
  - Added kernel breakdown helpers for marker totals, controlled population, and map-base counts.
  - Consolidated victory-formula evaluation so `computeVictoryMarker()` and `computeVictoryComponents()` share one breakdown computation path.
  - Fixed the pre-existing inconsistency where non-numeric global vars threw in `computeVictoryMarker()` but silently became `0` in `computeVictoryComponents()`.
  - Kept the runner bridge aggregate-only for now by mapping `breakdowns[i].aggregate` back to `number[]`, leaving richer runner/UI changes to follow-up tickets.
  - Updated unit and FITL integration coverage to assert the new shape and invariants.
- Deviations from original plan:
  - No separate `victory-breakdown.test.ts` file was added; the existing `packages/engine/test/unit/derived-values.test.ts` suite was extended instead, which better matches the current test layout.
  - `packages/runner/src/model/derive-victory-standings.ts` was updated in this ticket because it is a real compile-time consumer of `VictoryComponents`, even though the richer runner-model redesign remains in GRANTOOLTIP-002.
- Verification results:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/unit/derived-values.test.js packages/engine/dist/test/integration/fitl-derived-values.test.js`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
