# 67FITLTOKLANLAY-004: Fire in the Lake Production Visual Config Migration to Token Lanes and Badge Styling

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None unless the FITL migration exposes a real runner bug
**Deps**: 67FITLTOKLANLAY-001, 67FITLTOKLANLAY-002, 67FITLTOKLANLAY-003

## Problem

Spec 67 is only valuable once a real production game consumes the generic lane/presentation/badge primitives that the runner now supports. FITL is the intended first consumer, but [`data/games/fire-in-the-lake/visual-config.yaml`](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/visual-config.yaml) still stops at token shape/color metadata. It does not yet opt map spaces into lane layouts, does not classify force tokens into `regular` vs `base` presentation lanes, and does not configure the stronger FITL stack badge styling.

That leaves the architecture in an awkward halfway state: the generic runtime support exists, but the production FITL config and real-config regression tests do not yet exercise it.

## Assumption Reassessment (2026-03-18)

1. Ticket `001` already landed the runner visual-config schema/types for token presentation, stack badge styling, and zone token layouts — confirmed in [`packages/runner/src/config/visual-config-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-types.ts) and [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts).
2. Ticket `002` already landed normalized provider APIs and `GameDef`-aware ref validation for those primitives — confirmed in [`packages/runner/src/config/visual-config-provider.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-provider.ts), [`packages/runner/src/config/validate-visual-config-refs.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/validate-visual-config-refs.ts), and their focused tests.
3. Ticket `003` already landed generic renderer consumption of zone token layouts, token presentation scale, and provider-driven stack badge styling — confirmed in [`packages/runner/src/canvas/renderers/token-renderer.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/canvas/renderers/token-renderer.ts) and [`packages/runner/test/canvas/renderers/token-renderer.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/canvas/renderers/token-renderer.test.ts).
4. The remaining production gap is FITL authoring plus real-FITL regression coverage, not missing generic runner architecture — discrepancy corrected.
5. FITL already declares the force-piece token types this migration needs in the production game data and in `visual-config.yaml`: `us-troops`, `us-bases`, `us-irregulars`, `arvn-troops`, `arvn-police`, `arvn-rangers`, `arvn-bases`, `nva-troops`, `nva-guerrillas`, `nva-bases`, `vc-guerrillas`, and `vc-bases` — confirmed.
6. [`packages/runner/test/config/visual-config-files.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-files.test.ts) currently checks real FITL production config content, but only around the older shape/color/action expectations — confirmed.
7. [`packages/runner/test/config/visual-config-provider.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-provider.test.ts) currently covers the generic provider APIs with synthetic configs, but does not yet prove the real FITL production file resolves the intended layout/presentation/badge metadata — confirmed.

## Architecture Check

1. The clean architecture is already in place: generic runner primitives in schema/provider/renderer, game-specific consumption in `visual-config.yaml`. This ticket should strengthen that architecture by moving FITL onto the existing contract, not by adding more runtime branching.
2. FITL lane membership and token scaling remain presentation-only metadata. They must stay encoded in runner visual config and must not leak into engine/compiler/kernel semantics.
3. No backward-compatibility shim is desirable here. FITL should adopt the canonical `zones.tokenLayouts`, `tokenTypes.*.presentation`, and `tokens.stackBadge` contract directly.
4. Runtime code changes are only justified if the FITL migration exposes a real invariant gap in the existing architecture. If that happens, fix the minimal generic issue and add tests for the invariant rather than adding FITL-specific handling.

## What to Change

### 1. Migrate FITL production visual config to the Spec 67 contract

Modify [`data/games/fire-in-the-lake/visual-config.yaml`](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/visual-config.yaml) so it explicitly defines:

- a two-lane token layout preset for FITL map spaces
- category assignment of `city` and `province` to that preset
- presentation metadata for every FITL on-map force token type
- FITL stack badge styling

Required mapping:

- `us-bases`, `arvn-bases`, `nva-bases`, `vc-bases` => `presentation.lane: base`, `presentation.scale: 1.5`
- `us-troops`, `us-irregulars`, `arvn-troops`, `arvn-police`, `arvn-rangers`, `nva-troops`, `nva-guerrillas`, `vc-guerrillas` => `presentation.lane: regular`, `presentation.scale: 1`

Required layout intent:

- preset id may be implementation-chosen, but it should clearly represent FITL map spaces
- `city` and `province` opt into that preset
- `loc` remains on existing behavior unless explicitly configured in a later ticket

Required badge intent:

- larger text than the provider default
- black outline / positive `strokeWidth`
- offsets that bias the badge farther toward the top-right corner than the old default inset

### 2. Upgrade real-FITL production config assertions

Extend [`packages/runner/test/config/visual-config-files.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-files.test.ts) so the real FITL file is asserted against the new production contract, not only the pre-migration token shape/color facts.

That coverage should verify at least:

- `zones.tokenLayouts` contains the FITL map-space preset and `city`/`province` assignments
- all FITL force token types above now carry explicit `presentation` metadata
- FITL stack badge styling is present and materially different from the old default inset/no-outline behavior
- `loc` is not silently assigned to the FITL map-space preset

### 3. Add real-FITL provider resolution coverage

Add or extend [`packages/runner/test/config/visual-config-provider.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-provider.test.ts) so it loads the real FITL production config and verifies resolved behavior, not just synthetic examples.

That coverage should verify at least:

- a representative `city` and `province` resolve to the FITL lane layout preset
- representative base tokens resolve to `lane: base`, `scale: 1.5`
- representative non-base force tokens resolve to `lane: regular`, `scale: 1`
- the configured FITL stack badge resolves through `getStackBadgeStyle()`

### 4. Only touch runtime code if the migration exposes a real bug

If the production FITL migration exposes a missing invariant in provider/renderer/ref-validation behavior, fix that generic issue and add the smallest robust regression test for it. Do not expand scope into speculative runtime refactors if the existing architecture already supports the desired FITL config cleanly.

## Files to Touch

- `data/games/fire-in-the-lake/visual-config.yaml` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- runner source/test files only if a concrete migration bug is exposed

## Out of Scope

- new schema/provider/renderer feature work that tickets `001`-`003` already delivered
- FITL screenshot capture/artifact refresh
- non-FITL game visual configs
- engine/runtime/compiler/kernel/simulation changes unrelated to a migration-exposed generic bug
- adding new FITL token types not already present in production game data

## Acceptance Criteria

### Tests That Must Pass

1. [`packages/runner/test/config/visual-config-files.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-files.test.ts) verifies the production FITL file now includes the lane preset/assignments, explicit presentation metadata, and FITL stack badge styling.
2. [`packages/runner/test/config/visual-config-provider.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-provider.test.ts) verifies the real FITL config resolves map-space lane layouts, base scaling, regular-lane tokens, and stack badge style.
3. If the migration exposes a runtime/config invariant bug, the relevant focused regression test is added and passes.
4. Existing suite: `pnpm -F @ludoforge/runner test -- visual-config-files.test.ts visual-config-provider.test.ts`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`
6. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. FITL becomes a declarative consumer of the existing generic lane/presentation/badge architecture; no FITL-specific runtime branches are introduced.
2. `loc` zones do not silently opt into the FITL map-space lane preset.
3. Every FITL on-map force token type listed above has explicit production presentation metadata after the migration.
4. If runtime code changes are needed, they remain generic and justified by a concrete invariant exposed by the FITL migration.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-files.test.ts` — production FITL file assertions for token layouts, presentation metadata, and badge styling
2. `packages/runner/test/config/visual-config-provider.test.ts` — real FITL provider resolution checks
3. additional focused regression coverage only if the migration reveals a real generic bug

### Commands

1. `pnpm -F @ludoforge/runner test -- visual-config-files.test.ts visual-config-provider.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - Migrated the production FITL visual config onto the already-landed Spec 67 runner contract by adding `zones.tokenLayouts` assignment for `city`/`province`, explicit `presentation` metadata for all FITL on-map force tokens, and FITL-specific `tokens.stackBadge` styling.
  - Updated the production FITL visual-config file test so it asserts the real lane layout preset, category assignments, explicit presentation metadata, stack badge styling, and the invariant that `loc` is not assigned to the FITL map-space preset.
  - Extended provider coverage to load the real FITL YAML and verify resolved map-space lane layouts, representative base-vs-regular token presentation, and resolved stack badge style.
- Deviations from original plan:
  - After reassessment, no runner runtime/schema/renderer feature work was needed. Tickets `001`-`003` had already delivered the generic architecture, so this ticket was correctly narrowed to production FITL adoption plus real-config regression coverage.
  - No extra runtime bug was exposed by the FITL migration, so no generic source changes beyond FITL config/test consumption were required.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- visual-config-files.test.ts visual-config-provider.test.ts`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
