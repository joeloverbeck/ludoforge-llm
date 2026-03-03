# FITLENGINE-001: Simplify Claymores Using Existing Token-Aware `removeByPriority` Routing

**Status**: ✅ COMPLETED  
**Priority**: MEDIUM  
**Effort**: Small  
**Engine Changes**: No (reassessment found capability already present)  
**Deps**: specs/29-fitl-event-card-encoding.md, data/games/fire-in-the-lake/41-content-event-decks.md, packages/engine/test/unit/effects-control-flow.test.ts, packages/engine/test/integration/fitl-events-claymores.test.ts

## Problem

`card-17` (`Claymores`, shaded) is currently encoded with duplicated faction-specific `removeByPriority` groups for routing removed COIN Bases and Underground Insurgents. This works, but it is a data-level workaround pattern that is less declarative than necessary.

## Assumption Reassessment (2026-03-03)

1. `removeByPriority` already resolves destination `zoneExpr` in a context that includes the currently bound token, via `applyRemoveByPriority` delegating each selected token move through `moveToken` with per-iteration bindings.
2. Existing unit coverage already exercises token-aware destination routing in `removeByPriority` (`packages/engine/test/unit/effects-control-flow.test.ts`) using `{ ref: tokenProp, token: $tok, prop: faction }` inside destination expressions.
3. FITL data already uses this capability in other cards (for example `card-53`), confirming this is not a missing engine capability.
4. Therefore the original ticket assumption (“engine runtime gap requiring late-bound destination implementation”) is incorrect and scope must be corrected.

## Architecture Decision

1. Do not change kernel runtime for this ticket; current architecture already supports the required generic capability.
2. Replace duplicated Claymores shaded routing groups with a single token-aware declarative expression per removal target type.
3. Strengthen tests around Claymores behavior invariants and keep outcomes unchanged.

## What to Change

### 1. Re-encode Claymores shaded with token-aware routing

In `card-17` shaded effects:
- Collapse COIN Base removal to one group filtered on `faction in [US, ARVN]` + `type = base`.
- Use token-aware destination routing expression:
  - US base -> `casualties-US:none`
  - ARVN base -> `available-ARVN:none`
- Collapse Underground Insurgent removal to one group filtered on `faction in [VC, NVA]`, `type = guerrilla`, `activity = underground`.
- Route destination with token-aware expression to `available-<faction>:none`.

### 2. Keep/extend regression coverage

Ensure tests prove:
- Claymores shaded outcomes are unchanged after simplification.
- Routing remains correct for both US and ARVN base cases.
- One Underground Insurgent is still removed and routed to its faction Available zone.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-claymores.test.ts` (modify/add assertions if needed)

## Out of Scope

- Kernel/runtime changes to `removeByPriority` or `moveToken`.
- New effect primitives.
- Runner/UI changes.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-events-claymores.test.ts`
2. Relevant engine unit coverage for `removeByPriority` behavior remains green.
3. `pnpm turbo test`

### Invariants

1. Engine remains game-agnostic (no FITL/card-specific kernel branching).
2. Claymores shaded behavior remains equivalent:
   - remove exactly 1 COIN Base + 1 Underground Insurgent from selected valid space,
   - US Base removal goes to `casualties-US:none`,
   - ARVN Base removal goes to `available-ARVN:none`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-claymores.test.ts` — verify behavior invariants after declarative simplification.

### Commands

1. `pnpm turbo build`
2. `node --test "packages/engine/dist/test/integration/fitl-events-claymores.test.js"`
3. `node --test "packages/engine/dist/test/unit/effects-control-flow.test.js"`
4. `pnpm turbo test`

## Outcome

- **Completion date**: 2026-03-03
- **What changed**:
  - Reassessed and corrected the ticket scope: no kernel runtime change was needed because token-aware `removeByPriority` routing already existed and was already covered by unit tests.
  - Simplified FITL `card-17` (`Claymores`, shaded) in `data/games/fire-in-the-lake/41-content-event-decks.md` from duplicated faction-specific groups to single token-aware groups for COIN Base removal and Underground Insurgent removal.
- **Deviation from original plan**:
  - Original plan proposed kernel changes in `effects-token.ts`/`effects.ts`; this was intentionally dropped after code/test verification proved the capability already existed.
  - Integration test file did not require code changes because existing assertions already covered behavior invariants for both US and ARVN base routing.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test "packages/engine/dist/test/integration/fitl-events-claymores.test.js"` passed.
  - `node --test "packages/engine/dist/test/unit/effects-control-flow.test.js"` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
