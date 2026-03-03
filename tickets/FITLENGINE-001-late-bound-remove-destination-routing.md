# FITLENGINE-001: Late-Bound Destination Routing For `removeByPriority`

**Status**: PENDING  
**Priority**: MEDIUM  
**Effort**: Medium  
**Engine Changes**: Yes — kernel effect execution for `removeByPriority`/`moveToken` destination resolution, effect-eval tests  
**Deps**: specs/29-fitl-event-card-encoding.md, data/games/fire-in-the-lake/41-content-event-decks.md, packages/engine/src/kernel/effects-token.ts, packages/engine/src/kernel/effects.ts

## Problem

`removeByPriority` currently cannot safely use destination `zoneExpr` values that depend on the selected/bound token (for example `{ ref: tokenProp, token: $boundToken, ... }`). In practice, this forces event authors to encode behavior with duplicated faction-specific groups instead of a single declarative rule.  

This is an engine capability gap (not a FITL-only rule gap): destination routing should be able to reference the token being moved inside the removal step.

## Assumption Reassessment (2026-03-03)

1. Checked current FITL `Claymores` card implementation and tests: behavior is now correct, but encoded with duplicated groups to avoid bound-token routing in destination expressions.
2. Checked current engine behavior by attempting token-bound routing in event effects: execution fails with missing binding errors during destination resolution for `removeByPriority`.
3. Mismatch found: data model implies expressive token-aware routing is allowed, but runtime resolution timing does not support it in this path. Scope corrected to add explicit late-bound destination evaluation in engine runtime.

## Architecture Check

1. Adding late-bound destination resolution in the generic effect executor is cleaner than faction/card-specific YAML workarounds and avoids repeated rules encoding.
2. This keeps game-specific logic in `GameSpecDoc` while improving agnostic engine capability; no FITL hardcoding is introduced in kernel/simulator/GameDef.
3. No backwards-compatibility aliases/shims are required; this is a direct capability improvement in existing effect semantics.

## What to Change

### 1. Add late-bound destination resolution support in `removeByPriority`

Ensure each moved token resolves destination `zoneExpr` in a context where the selected token binding is guaranteed to exist for that move operation.

Details:
- Preserve existing semantics for static destinations.
- Support token-aware expressions like:
  - `{ ref: tokenProp, token: $boundToken, prop: faction }`
  - conditionals using token props for per-token routing.
- Ensure deterministic behavior remains unchanged.

### 2. Add kernel-level regression coverage for token-bound routing

Add/extend effect execution tests to prove:
- bound token can be referenced in destination expressions during `removeByPriority`.
- mixed-token removals route each token correctly according to its own props.
- no regressions for existing static `removeByPriority` behavior.

### 3. Re-encode `Claymores` shaded using the new capability

After the engine functionality exists, simplify card-17 shaded back to a single declarative removal expression that routes US Base to `casualties-US` and ARVN Base to `available-ARVN` via token-aware destination logic.

Note:
- This card correction is required only if/when the new capability is implemented.
- Behavior must remain exactly equivalent to current tested outcomes.

## Files to Touch

- `packages/engine/src/kernel/effects-token.ts` (modify)
- `packages/engine/src/kernel/effects.ts` (modify, if needed for context plumbing)
- `packages/engine/test/unit/` (modify/add kernel effect tests)
- `packages/engine/test/integration/fitl-events-claymores.test.ts` (modify, if assertion updates needed after simplification)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify: simplify `card-17` shaded encoding once capability exists)

## Out of Scope

- Any game-specific new effect primitives for FITL only.
- Changing `GameDef` card semantics or introducing compatibility branches.
- Visual config or runner UI behavior changes.

## Acceptance Criteria

### Tests That Must Pass

1. New kernel regression tests proving token-bound destination routing works in `removeByPriority`.
2. `packages/engine/test/integration/fitl-events-claymores.test.ts` passes with card behavior unchanged.
3. Existing suite: `pnpm turbo test`.

### Invariants

1. Engine/runtime remains game-agnostic; no FITL/card-specific branching in kernel logic.
2. `GameSpecDoc` can express token-aware destination routing declaratively without duplicated faction-specific groups.
3. `Claymores` shaded outcomes remain invariant:
   - remove exactly 1 COIN Base + 1 Underground Insurgent from selected valid space,
   - US Base removal goes to `casualties-US:none`,
   - ARVN Base removal goes to `available-ARVN:none`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/<new-or-existing-effects-test>.test.ts` — validates late-bound token destination resolution in `removeByPriority`.
2. `packages/engine/test/integration/fitl-events-claymores.test.ts` — verifies no behavior regression after simplifying YAML to use new capability.

### Commands

1. `pnpm turbo build`
2. `node --test "packages/engine/dist/test/unit/**/*.test.js"` (or targeted built unit tests for effect execution)
3. `node --test "packages/engine/dist/test/integration/fitl-events-claymores.test.js"`
4. `pnpm turbo test`
