# 67FITLTOKLANLAY-001: Runner Visual Config Schema for Token Lanes, Presentation, and Stack Badges

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner schema/types only
**Deps**: Spec 67, Spec 42

## Problem

Spec 67 requires FITL token lanes, per-token presentation metadata, and configurable stack badge styling, but the current runner visual-config contract cannot express any of those concepts. [`packages/runner/src/config/visual-config-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-types.ts) only supports token shape/color/size/symbol and basic zone styles, while the provider and renderer still hardcode the runtime behavior that later tickets will replace.

## Assumption Reassessment (2026-03-18)

1. [`packages/runner/src/config/visual-config-types.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/visual-config-types.ts) currently has no `presentation`, `stackBadge`, or zone token layout schemas — confirmed.
2. [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts) is the right focused suite for pure schema-contract checks — confirmed.
3. [`packages/runner/src/config/validate-visual-config-refs.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/src/config/validate-visual-config-refs.ts) already owns runtime-context reference checks, so ticket `002` remains the right place for lane-to-preset and token-to-lane cross-reference validation that needs real `GameDef` ids/categories — confirmed.
4. The current FITL YAML and renderer/provider tests are intentionally out of scope for this ticket because this ticket should define the contract first, not partially consume it.

## Architecture Check

1. Adding the declarative config surface first keeps later tickets honest: the provider and renderer can consume a stable contract instead of inventing ad hoc interim objects.
2. The new schema remains runner-owned presentation metadata; nothing in `GameSpecDoc`, engine runtime, kernel, or compiler becomes FITL-specific.
3. This ticket should define the clean-break contract directly. Do not add aliases, deprecated keys, or compatibility shims for the old renderer constants.
4. Keep cross-field validation here limited to what Zod can validate from the config document itself. Validation that depends on real zone ids, zone categories, or compiled token types belongs in ticket `002`.

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

This ticket only needs config-local structural validation. It does not need to prove that a given game's token types or zone categories reference the right presets yet.

### 3. Lock the contract with schema tests

Extend [`packages/runner/test/config/visual-config-schema.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/runner/test/config/visual-config-schema.test.ts) with focused positive and negative cases for the new surface area, including one valid Spec 67-shaped example.

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)

## Out of Scope

- `VisualConfigProvider` resolution APIs
- `validate-visual-config-refs.ts` cross-reference logic
- cross-reference validation against real zone/token ids
- renderer layout behavior
- FITL `visual-config.yaml`
- `packages/runner/test/config/visual-config-files.test.ts`
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
4. Ticket `001` does not add runtime reference validation or provider APIs; it only defines the contract those later layers will consume.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` — valid token-lane config, valid stack badge config, invalid preset/lane definitions, invalid non-positive numbers

### Commands

1. `pnpm -F @ludoforge/runner test -- visual-config-schema.test.ts`
2. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-03-18
- What actually changed:
  - Added runner visual-config schema/types for token `presentation`, top-level `tokens.stackBadge`, and declarative `zones.tokenLayouts` with defaults, presets, and category assignments.
  - Added schema-level structural validation for malformed lane presets, unknown preset references inside `assignments.byCategory`, and non-positive numeric values required by Spec 67.
  - Extended `packages/runner/test/config/visual-config-schema.test.ts` with positive and negative coverage for the new contract surface.
- Deviations from original plan:
  - Kept this ticket strictly schema-local after reassessing the codebase. Provider resolution APIs and runtime-context reference validation remain deferred to tickets `002` and `003`, which matches the existing ticket split more cleanly than partially mixing those layers here.
  - Chose a top-level `tokens.stackBadge` block, aligned with Spec 67's recommended shape, instead of a token-scoped badge contract.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- visual-config-schema.test.ts` passed and exercised the full runner Vitest suite in this repo configuration.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
