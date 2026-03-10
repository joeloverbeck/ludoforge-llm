# OPSAGRP-002: Data-driven action group policy via visual-config.yaml

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`deriveActionGroups` in the render model derivation layer hardcodes COIN-specific action class semantics:
- `operation` moves are synthesized into both `operation` and `operationPlusSpecialActivity` groups
- `specialActivity` moves are silently filtered out
- `operationPlusSpecialActivity` is treated as a known group name

This breaks the Agnostic Engine Rule at the runner level. A non-COIN game (e.g. Texas Hold'em) that uses `actionClass: 'operation'` for a different purpose would get unexpected synthetic Op+SA groups. The grouping policy should be declared in `visual-config.yaml` (game-specific visual presentation data), not baked into generic renderer code.

## Assumption Reassessment (2026-03-10)

1. `deriveActionGroups` in `packages/runner/src/model/derive-render-model.ts` lines 1115-1166 contains three hardcoded `actionClass` string checks (`operation`, `specialActivity`, `operationPlusSpecialActivity`) — confirmed.
2. `visual-config.yaml` already exists as the game-specific visual configuration layer — confirmed via `ResolvedZoneVisual` import in `render-model.ts`.
3. Texas Hold'em does not currently use `actionClass` on its moves, so this is not yet a runtime bug — but it is a design violation that will surface when any new game uses these class names for non-COIN purposes.

## Architecture Check

1. Moving the grouping policy into `visual-config.yaml` keeps game-specific UI behavior where it belongs — in game data, not in generic derivation code. `deriveActionGroups` becomes a generic grouper that reads policy declarations.
2. This preserves the GameSpecDoc (game behavior) vs visual-config (visual presentation) boundary: action grouping in the toolbar is a presentation concern, not a game rule.
3. No backwards-compatibility shims — the hardcoded logic is replaced, not wrapped.

## What to Change

### 1. Define action group policy schema in visual-config

Add an optional `actionGroupPolicy` section to the visual config schema. Example shape:

```yaml
actionGroupPolicy:
  synthesize:
    - fromClass: operation
      intoGroup: operationPlusSpecialActivity
  hide:
    - specialActivity
```

If `actionGroupPolicy` is absent, the default behavior is simple grouping by `actionClass` with no synthesis or hiding (backwards-compatible for games that don't declare a policy).

### 2. Expose policy via `VisualConfigProvider`

Add a method or property on the visual config provider that returns the parsed action group policy (or a default no-op policy).

### 3. Refactor `deriveActionGroups` to be policy-driven

Replace the three hardcoded `if/else` branches with a generic loop:
- For each move, check if its `actionClass` is in the `hide` set → skip
- Check if its `actionClass` has `synthesize` entries → add to both original group and synthesized group(s)
- Otherwise → add to the group keyed by `actionClass` (or `"Actions"` if null)

### 4. Add FITL visual-config entry

Add the `actionGroupPolicy` to the FITL visual-config.yaml declaring the COIN-specific synthesis/hide rules.

## Files to Touch

- `packages/runner/src/config/visual-config-provider.ts` (modify — add policy accessor)
- `packages/runner/src/config/visual-config-schema.ts` or equivalent (modify — add schema)
- `packages/runner/src/model/derive-render-model.ts` (modify — refactor `deriveActionGroups`)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify — add policy)
- `packages/runner/test/model/derive-render-model-state.test.ts` (modify)

## Out of Scope

- Changing how `actionClass` is set on `Move` objects in the engine
- Modifying the kernel or compiler
- Handling nested or recursive group synthesis

## Acceptance Criteria

### Tests That Must Pass

1. FITL-specific test: operation moves appear in both `operation` and `operationPlusSpecialActivity` groups when policy declares synthesis
2. Generic test: without policy, all action classes are grouped directly with no synthesis or hiding
3. Test: `specialActivity` moves are hidden only when policy declares them hidden
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `deriveActionGroups` contains zero hardcoded action class string literals
2. Games without `actionGroupPolicy` in visual-config get simple one-group-per-class behavior
3. The runner layer remains game-agnostic — all COIN-specific behavior is in FITL's visual-config.yaml

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/derive-render-model-state.test.ts` — parameterized tests for policy-driven grouping (with policy, without policy, multiple synthesis targets)

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

**Completed**: 2026-03-10

**What changed**:
- Added `ActionGroupPolicy` Zod schema (`synthesize` + `hide` arrays) to `visual-config-types.ts`
- Added `getActionGroupPolicy()` accessor to `VisualConfigProvider`
- Refactored `deriveActionGroups` from hardcoded COIN logic to generic policy-driven loop — zero hardcoded action class literals remain
- Added `actionGroupPolicy` section to FITL `visual-config.yaml` declaring COIN-specific synthesis/hide rules
- Replaced 1 hardcoded test with 3 policy-driven tests (no policy, COIN policy, multi-synthesis)

**Deviations**: None — implemented exactly as specified.

**Verification**: 150 test files, 1497 tests pass. Typecheck clean. Lint clean.
