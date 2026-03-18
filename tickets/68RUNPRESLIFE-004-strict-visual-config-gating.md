# 68RUNPRESLIFE-004: Make Visual Config Validation Fail Closed at Runner Boundaries

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/RUNPRESLIFE/68RUNPRESLIFE-001-presentation-scene-contract.md, tickets/68RUNPRESLIFE-006-complete-scene-migration-for-tokens-and-announcements.md, archive/specs/42-per-game-visual-config.md, archive/tickets/FITLTOKLANLAY/67FITLTOKLANLAY-004-fitl-visual-config-migration.md

## Problem

The repo already has strict schema/ref validation helpers for visual config, but the main runtime loader still allows invalid YAML to degrade into `null` with a warning:

- `loadVisualConfig()` in `packages/runner/src/config/visual-config-loader.ts`
- bootstrap tests only assert schema success on imported YAML, not that the mounted runtime always uses strict validation

That means presentation-specific data can still silently disappear or degrade at runtime instead of failing before the canvas mounts. For a system that intentionally keeps presentation data in `visual-config.yaml`, this is the wrong contract.

## Assumption Reassessment (2026-03-18)

1. Strict parsing and ref validation already exist in `parseVisualConfigStrict()`, `validateVisualConfigRefs()`, and `validateAndCreateProvider()` — confirmed in `packages/runner/src/config/validate-visual-config-refs.ts`.
2. The live loader path still warns and falls back to defaults on invalid config instead of failing closed — confirmed in `packages/runner/src/config/visual-config-loader.ts`.
3. FITL production visual config already exercises real runner-only presentation concerns such as token lanes, stack badges, action labels, overlays, and region semantics, so silent fallback here would materially change behavior — confirmed in `data/games/fire-in-the-lake/visual-config.yaml` and its tests.
4. Archived ticket `68RUNPRESLIFE-001` only moved overlays and regions onto canonical scene nodes. Validation for token scene semantics and announcement scene semantics still needs an upstream owner, which is now covered by ticket `68RUNPRESLIFE-006`.

## Architecture Check

1. Failing closed is cleaner than warning and continuing. Presentation-only data belongs in `visual-config.yaml`; if it is invalid, the runner should refuse to present an ambiguous or partially defaulted game.
2. This reinforces the intended boundary: game-specific presentation stays in `visual-config.yaml`, while `GameDef` and simulation remain agnostic.
3. No backwards-compatibility shim should preserve the warn-and-default path for production runner entrypoints.

## What to Change

### 1. Replace permissive loader behavior with strict boundary validation

Update runner bootstrap/runtime entrypoints so they always use strict parse + schema + reference + semantic validation before creating a `VisualConfigProvider`.

If validation fails, surface a clear runner error and stop mounting the affected canvas.

### 2. Expand semantic validation

Add generic semantic checks beyond raw schema shape where needed for the new scene/text/runtime contracts, including:

- typography token references
- scene node references from overlays/announcements/cards
- token presentation lane/layout references that feed canonical token scene nodes
- card-template field source integrity
- satisfiable text/layout relationships used by the presentation scene

### 3. Make the quality gate explicit

Add a deterministic runner test or script that validates every production `data/games/*/visual-config.yaml` against the compiled `GameDef` it is meant to accompany. This should be easy to run in CI and locally.

## Files to Touch

- `packages/runner/src/config/visual-config-loader.ts` (modify)
- `packages/runner/src/bootstrap/bootstrap-registry.ts` (modify)
- `packages/runner/src/config/validate-visual-config-refs.ts` (modify)
- `packages/runner/test/bootstrap/bootstrap-registry.test.ts` (modify)
- `packages/runner/test/config/visual-config-files.test.ts` (modify)
- optional runner script for validating production visual configs against compiled game defs (new)

## Out of Scope

- rewriting the visual-config schema for unrelated features
- FITL-specific runtime branches
- non-runner engine/compiler changes

## Acceptance Criteria

### Tests That Must Pass

1. Invalid production visual config prevents runner/provider creation instead of warning and returning defaults.
2. Production visual-config validation covers schema, references, and semantic invariants against compiled game defs.
3. Existing suite: `pnpm -F @ludoforge/runner test`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Production runner entrypoints do not silently ignore invalid presentation config.
2. Presentation-specific data remains sourced from `visual-config.yaml`, not backfilled from `GameDef`.
3. Validation remains generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-files.test.ts` — production schema/ref/semantic validation
2. `packages/runner/test/bootstrap/bootstrap-registry.test.ts` — bootstrap uses strict provider creation semantics
3. optional `packages/runner/test/config/visual-config-loader.test.ts` — explicit fail-closed behavior

### Commands

1. `pnpm -F @ludoforge/runner test -- visual-config-files.test.ts bootstrap-registry.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
