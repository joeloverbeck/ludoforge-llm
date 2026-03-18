# 67FITLTOKLANLAY-004: Fire in the Lake Visual Config Migration to Token Lanes and Badge Styling

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — FITL visual-config and runner config tests only
**Deps**: 67FITLTOKLANLAY-001, 67FITLTOKLANLAY-002

## Problem

Spec 67 is only valuable if FITL actually opts into the new generic primitives. Right now [`data/games/fire-in-the-lake/visual-config.yaml`](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/visual-config.yaml) defines token shapes and colors but no lane metadata, no base scaling, and no stack badge styling. Without an explicit FITL migration, later renderer work has nothing real to consume.

## Assumption Reassessment (2026-03-18)

1. FITL already declares every relevant on-map token type in `visual-config.yaml` — confirmed.
2. `packages/runner/test/config/visual-config-files.test.ts` already validates production visual-config files, including exact expectations for FITL token shapes and action metadata — confirmed.
3. `packages/runner/test/config/visual-config-provider.test.ts` is the right place for one or two integration-level checks that the real FITL config resolves the intended lane/scale metadata.

## Architecture Check

1. This ticket is where FITL becomes a consumer of the generic runner primitives; no new runtime hardcoding should be needed after it lands.
2. Lane assignment stays visual-only. FITL rules meaning remains encoded in game data and engine semantics, not in runner source branches.
3. `loc` zones remain on existing behavior unless explicitly configured later, matching Spec 67 non-goals.

## What to Change

### 1. Update FITL visual-config.yaml to opt into Spec 67

Modify [`data/games/fire-in-the-lake/visual-config.yaml`](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/visual-config.yaml) so it defines:

- a two-lane token layout preset for `city` and `province`
- presentation metadata for every FITL token type
- base token scale `1.5`
- a FITL stack badge style with larger text, black outline, and top-right-biased offsets

Required token mapping:

- `us-bases`, `arvn-bases`, `nva-bases`, `vc-bases` => `lane: base`, `scale: 1.5`
- `us-troops`, `us-irregulars`, `arvn-troops`, `arvn-police`, `arvn-rangers`, `nva-troops`, `nva-guerrillas`, `vc-guerrillas` => `lane: regular`, `scale: 1`

### 2. Update production config-file expectations

Extend [`packages/runner/test/config/visual-config-files.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-files.test.ts) so the real FITL file is checked for the new lane preset, lane assignments, and stack badge styling instead of only shape/color assertions.

### 3. Add real-FITL provider resolution coverage

Add or extend a provider test so the parsed FITL file resolves:

- `city`/`province` to the FITL map-space layout preset
- `*-bases` to `lane: base`, `scale: 1.5`
- representative non-base force tokens to `lane: regular`
- the configured stack badge style

## Files to Touch

- `data/games/fire-in-the-lake/visual-config.yaml` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)

## Out of Scope

- renderer implementation details
- screenshot capture and screenshot artifact changes
- non-FITL game visual configs
- any engine/runtime/compiler/kernel changes
- adding new FITL token types not already present in the production game data

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/config/visual-config-files.test.ts` verifies the production FITL config parses and includes the two-lane map-space preset, explicit base-vs-regular presentation metadata, and stack badge styling.
2. `packages/runner/test/config/visual-config-provider.test.ts` verifies the real FITL config resolves base tokens to `lane: base` and `scale: 1.5`.
3. `packages/runner/test/config/visual-config-provider.test.ts` verifies representative non-base FITL tokens resolve to `lane: regular`.
4. Existing suite: `pnpm -F @ludoforge/runner test -- visual-config-files.test.ts visual-config-provider.test.ts`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Only FITL visual configuration changes; no game rules or runtime execution semantics change.
2. `loc` zones do not silently opt into the new lane preset.
3. Every FITL on-map force token type has explicit presentation metadata after the migration.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-files.test.ts` — production FITL file assertions for token layouts/presentation/badge style
2. `packages/runner/test/config/visual-config-provider.test.ts` — real FITL provider resolution checks

### Commands

1. `pnpm -F @ludoforge/runner test -- visual-config-files.test.ts visual-config-provider.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`

