# 71OPSTOOCOM-001: Add `appendTooltipFrom` to synthesize rule schema and FITL config

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (first ticket in series)

## Problem

The visual config synthesize rule (`actionGroupPolicy.synthesize[].`) has no way to declare which hidden action classes should appear as supplementary tooltip content for a synthesized group. This ticket adds the `appendTooltipFrom` optional field to the schema and updates the FITL visual config to use it.

## Assumption Reassessment (2026-03-21)

1. `ActionGroupSynthesizeEntrySchema` is defined in `packages/runner/src/config/visual-config-types.ts` at lines 472-475 with fields `{fromClass, intoGroup}` — confirmed.
2. `ActionGroupSynthesizeEntry` type alias is inferred from the schema at line 574 — confirmed.
3. FITL `visual-config.yaml` has `actionGroupPolicy` at lines 476-481 with `synthesize: [{fromClass: operation, intoGroup: operationPlusSpecialActivity}]` and `hide: [specialActivity]` — confirmed.
4. No other game currently uses `synthesize` — Texas Hold'em has no `actionGroupPolicy` — confirmed.

## Architecture Check

1. Adding an optional field to an existing Zod schema is backwards-compatible — existing configs without the field continue to validate.
2. This is a visual-config-only change. No GameSpecDoc, GameDef, or kernel types are touched.
3. No backwards-compatibility shims needed — the field is optional and new.

## What to Change

### 1. Extend `ActionGroupSynthesizeEntrySchema` — `visual-config-types.ts`

Add `appendTooltipFrom: z.array(z.string()).optional()` to the Zod object schema at lines 472-475. The inferred type `ActionGroupSynthesizeEntry` will automatically include the new field.

### 2. Update FITL visual config — `visual-config.yaml`

Add `appendTooltipFrom: [specialActivity]` to the existing synthesize rule entry (after `intoGroup`).

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify)

## Out of Scope

- Any changes to `visual-config-provider.ts` (the provider reads the parsed type; no method changes needed for this ticket)
- Any changes to `render-model.ts`, `project-render-model.ts`, or UI components
- Any changes to the engine, kernel, or compiler
- Texas Hold'em visual config (it has no synthesize rules)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes — the schema change compiles cleanly
2. `pnpm turbo build` passes — no build errors from the new optional field
3. `pnpm -F @ludoforge/runner test` — all existing runner tests pass (no regressions from adding an optional field)
4. FITL visual config loads without validation errors (existing config-loading tests cover this)

### Invariants

1. Existing configs without `appendTooltipFrom` must continue to parse and validate identically (field is optional)
2. The `ActionGroupSynthesizeEntry` type must be a Zod-inferred type (no manual interface)
3. The FITL visual-config.yaml must remain valid YAML and pass schema validation

## Test Plan

### New/Modified Tests

1. No new test file needed — the field is optional and tested via existing config-loading paths. The next ticket (002) tests that the field is correctly consumed.

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo build`
3. `pnpm -F @ludoforge/runner test`
