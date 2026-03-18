# 67FITLTOKLANLAY-001: Runner Visual Config Schema for Token Lanes, Presentation, and Stack Badges

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner schema/types only
**Deps**: Spec 67, Spec 42

## Problem

Spec 67 requires FITL token lanes, per-token presentation metadata, and configurable stack badge styling, but the current runner visual-config contract cannot express any of those concepts. `visual-config-types.ts` only supports token shape/color/size/symbol and basic zone styles, so FITL would otherwise force new hardcoded branches into the renderer.

## Assumption Reassessment (2026-03-18)

1. `packages/runner/src/config/visual-config-types.ts` currently has no `presentation`, `stackBadge`, or zone token layout schemas — confirmed.
2. `packages/runner/test/config/visual-config-schema.test.ts` already acts as the focused schema contract suite for new visual-config surface area — confirmed.
3. Cross-reference checks such as “token lane exists in assigned preset” are not pure Zod shape validation and should not be forced into this ticket unless they can be expressed cleanly without runtime context.

## Architecture Check

1. Adding the declarative config surface first keeps later tickets honest: the provider and renderer can consume a stable contract instead of inventing ad hoc interim objects.
2. The new schema remains runner-owned presentation metadata; nothing in `GameSpecDoc`, engine runtime, kernel, or compiler becomes FITL-specific.
3. This ticket should define the clean-break contract directly. Do not add aliases, deprecated keys, or compatibility shims for the old renderer constants.

## What to Change

### 1. Add token presentation and stack badge schema/types

Extend [`packages/runner/src/config/visual-config-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-types.ts) with:

- `TokenPresentationSchema` with at least `lane` and `scale`
- `StackBadgeStyleSchema` with font, fill/stroke, anchor, and offset fields
- `TokenTypeVisualStyleSchema.presentation`
- a top-level or token-scoped `stackBadge` config block, matching the Spec 67 contract chosen by the implementer

Numeric validation in this ticket must reject non-positive values for `scale`, `fontSize`, `strokeWidth`, `spacingX`, `spacingY`, and `laneGap`.

### 2. Add zone token layout schema/types

Extend the zones config contract with a declarative token-layout section that can express:

- default grid behavior
- preset-based lane layouts
- category assignment to a preset
- lane ordering and per-lane packing/spacing metadata

The schema must reject malformed lane presets such as:

- preset lanes missing from `laneOrder`
- `laneOrder` entries missing lane definitions
- invalid layout modes or pack/anchor values

### 3. Lock the contract with schema tests

Extend [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts) with focused positive and negative cases for the new surface area, including one valid Spec 67-shaped example.

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)

## Out of Scope

- `VisualConfigProvider` resolution APIs
- cross-reference validation against real zone/token ids
- renderer layout behavior
- FITL `visual-config.yaml`
- screenshot or visual-regression artifacts
- any engine, compiler, kernel, or simulation files

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/config/visual-config-schema.test.ts` includes a passing case for a two-lane map-space preset, token presentation metadata, and stack badge styling.
2. `packages/runner/test/config/visual-config-schema.test.ts` includes failing cases for invalid lane references inside a preset and non-positive numeric values for `scale`, `laneGap`, `fontSize`, and `strokeWidth`.
3. Existing suite: `pnpm -F @ludoforge/runner test -- visual-config-schema.test.ts`
4. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. The new contract remains presentation-only and lives entirely under the runner visual-config schema.
2. No FITL-specific token ids, faction ids, or zone ids are hardcoded into the schema/types layer.
3. Existing non-Spec-67 visual-config areas continue to parse unchanged.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` — valid token-lane config, valid stack badge config, invalid preset/lane definitions, invalid non-positive numbers

### Commands

1. `pnpm -F @ludoforge/runner test -- visual-config-schema.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`

