# GRANTOOLTIP-004: Add semantic victory component IDs across runtime and tooltip metadata

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel victory breakdown contracts plus runner projection and tooltip metadata lookup
**Deps**: archive/tickets/GRANTOOLTIP/GRANTOOLTIP-003.md

## Problem

Victory tooltip rendering still relies on positional pairing between runtime component breakdowns and visual-config metadata. That is brittle: adding, reordering, or evolving victory components can silently mislabel tooltip rows even when totals are still numerically correct. The architecture needs stable semantic component identity threaded from the agnostic victory breakdown contract and consumed by tooltip metadata via the same identity, not inferred in the UI.

## Assumption Reassessment (2026-03-28)

1. `packages/engine/src/kernel/types-core.ts` still defines `VictoryStandingEntry` with `seat`, `formula`, and `threshold` only. That is a compiled standings definition, not the runtime breakdown contract that powers tooltip rows.
2. `packages/engine/src/kernel/derived-values.ts` is the real ownership boundary for tooltip semantics. `VictoryComponents.breakdowns` currently expose `aggregate` and `spaces` only; there is no stable `componentId`.
3. `packages/runner/src/model/derive-victory-standings.ts`, `packages/runner/src/model/runner-frame.ts`, `packages/runner/src/model/render-model.ts`, and `packages/runner/src/model/project-render-model.ts` preserve runtime breakdown arrays, but they preserve only order, not semantic identity.
4. `packages/runner/src/ui/VictoryStandingsBar.tsx` still matches tooltip labels to runtime components by array index and falls back to `Component N` when metadata length diverges. That fallback avoids crashes but confirms the architecture is still positional.
5. `packages/runner/src/config/visual-config-types.ts` and `packages/runner/src/config/visual-config-provider.ts` still model tooltip breakdown metadata as ordered `components` arrays with no ID field. Runtime `componentId` alone would therefore be insufficient; the visual-config contract must also target components semantically in the same change.
6. `packages/engine/src/cnl/compile-victory.ts` and `packages/engine/src/kernel/schemas-core.ts` do not currently participate in tooltip breakdown construction. They should be touched only if the final implementation deliberately moves component identity into compiled victory definitions, which is not required for the cleaner runtime-owned design.
7. FITL victory formulas currently use generic formula primitives such as `markerTotalPlusMapBases`, `controlledPopulationPlusMapBases`, and `controlledPopulationPlusGlobalVar`. Those primitives already imply stable generic component identities without introducing game-specific engine logic.

## Architecture Check

1. The clean architecture is to make component identity part of the agnostic runtime breakdown contract owned by the kernel. The runner and UI should transport and consume explicit `componentId` values instead of reconstructing identity from array position.
2. Runtime IDs alone do not solve the bug. Tooltip metadata must also carry the same semantic IDs so the runner/UI can match metadata to runtime breakdowns by identity rather than index.
3. Component IDs must remain generic and formula-derived, not display labels or game-authored engine identifiers. IDs such as `markerTotal`, `zoneCount`, `mapBases`, `controlledPopulation`, and `globalVar` fit Foundations 1 and 4.
4. This should be a single end-to-end contract change with no aliasing, positional fallback logic, or compatibility paths. Existing visual config and tests should be updated in the same change (Foundation 9).
5. Compiler changes are not justified unless runtime ownership proves insufficient. The current architecture is cleaner if compiled standings keep defining formulas while runtime breakdown builders assign component IDs from those formulas.

## What to Change

### 1. Add a generic victory component ID contract in kernel breakdown types

Introduce a generic `VictoryComponentId` type and add `componentId` to each runtime component breakdown item returned by the victory breakdown builder. The ID set should be derived from generic victory semantics, for example:

- `markerTotal`
- `zoneCount`
- `mapBases`
- `controlledPopulation`
- `globalVar`

### 2. Centralize component identity assignment in kernel victory breakdown construction

Update the shared victory-formula breakdown builder in `packages/engine/src/kernel/derived-values.ts` so each returned component carries its `componentId` alongside `aggregate` and `spaces`. The assignment logic should stay with formula semantics in the kernel, not move into runner/UI code.

### 3. Thread `componentId` through runner-frame and render-model contracts

Update runner-frame derivation and render projection so every `RunnerComponentBreakdown` and `RenderComponentBreakdown` preserves the engine-provided `componentId` unchanged.

### 4. Make tooltip metadata semantic instead of positional

Update visual-config tooltip component metadata to include `componentId`, update FITL visual config accordingly, and resolve tooltip rows by matching runtime `componentId` to metadata `componentId` instead of using array index.

### 5. Strengthen tests around semantic matching invariants

Replace positional-only assertions in engine and runner victory tests with assertions that expected `componentId` values are emitted, preserved through projection, and used for tooltip metadata lookup regardless of metadata order.

## Files to Touch

- `tickets/GRANTOOLTIP-004.md` (modify)
- `packages/engine/src/kernel/derived-values.ts` (modify)
- `packages/runner/src/model/runner-frame.ts` (modify)
- `packages/runner/src/model/render-model.ts` (modify)
- `packages/runner/src/model/derive-victory-standings.ts` (modify)
- `packages/runner/src/model/project-render-model.ts` (modify)
- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify if lookup helpers need adjustment)
- `packages/runner/src/ui/VictoryStandingsBar.tsx` (modify)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify)
- `packages/engine/test/unit/derived-values.test.ts` (modify)
- `packages/engine/test/integration/fitl-derived-values.test.ts` (modify)
- `packages/runner/test/model/derive-victory-standings.test.ts` (modify)
- `packages/runner/test/model/project-render-model-victory-standings.test.ts` (modify)
- `packages/runner/test/ui/VictoryStandingsBar.test.tsx` (modify)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)

## Out of Scope

- Redesigning victory formulas themselves
- UI styling or interaction changes unrelated to semantic component lookup
- Adding game-specific component IDs or display labels to engine code
- Large refactors outside the victory breakdown / tooltip path

## Acceptance Criteria

### Tests That Must Pass

1. Each supported victory formula variant emits deterministic generic `componentId` values for every component breakdown.
2. `computeAllVictoryStandings()` preserves those IDs in runtime results.
3. Runner-frame derivation preserves `componentId` without runner-generated inference.
4. Render projection preserves `componentId` while enriching space display names.
5. Tooltip metadata matches runtime components by `componentId`, not by array position.
6. Existing suite: `pnpm -F @ludoforge/engine test`
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Component identity is part of the agnostic victory runtime contract, not inferred in the UI.
2. Tooltip metadata is matched semantically by `componentId`, not by positional array pairing.
3. No game-specific IDs, aliases, or compatibility shims are introduced.
4. `componentId` remains stable for a given generic formula component across kernel, runner, render model, and tooltip metadata.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/derived-values.test.ts` — assert formula-specific `componentId` assignment and preservation in component breakdowns.
2. `packages/engine/test/integration/fitl-derived-values.test.ts` — assert FITL standings expose expected generic component IDs for compiled victory formulas.
3. `packages/runner/test/model/derive-victory-standings.test.ts` — assert runner-frame victory entries preserve `componentId`.
4. `packages/runner/test/model/project-render-model-victory-standings.test.ts` — assert render projection keeps `componentId` while enriching space display names.
5. `packages/runner/test/ui/VictoryStandingsBar.test.tsx` — assert tooltip labels are resolved by `componentId` even when metadata order differs from runtime order.
6. `packages/runner/test/config/visual-config-schema.test.ts` — assert victory tooltip component metadata requires semantic IDs and still accepts optional detail templates.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm turbo test`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Added generic runtime `componentId` ownership to kernel victory component breakdowns.
  - Threaded `componentId` through runner-frame and render-model victory contracts.
  - Updated tooltip metadata to declare `componentId` and changed `VictoryStandingsBar` to match metadata semantically instead of by array index.
  - Updated FITL visual config and strengthened engine/runner tests around component identity and semantic tooltip matching.
- Deviations from original plan:
  - Did not touch `packages/engine/src/cnl/compile-victory.ts`, `packages/engine/src/kernel/types-core.ts`, or `packages/engine/src/kernel/schemas-core.ts` because the clean ownership boundary is runtime breakdown construction, not compiled standings definitions.
  - Expanded scope to include visual-config semantic IDs in the same change because runtime IDs alone would not have removed positional coupling.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
