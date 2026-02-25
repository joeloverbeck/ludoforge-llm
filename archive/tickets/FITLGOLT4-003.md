# FITLGOLT4-003: Gulf of Tonkin and Aces Event Encoding Updates

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — game data + tests only
**Deps**: FITLGOLT4-002

## Problem

Card-1 (Gulf of Tonkin) and card-6 (Aces) unshaded events grant free operations whose effects must resolve BEFORE the event's own effects. With FITLGOLT4-002 providing the `effectTiming` primitive, these cards need to be updated to use `effectTiming: afterGrants`.

Additionally, Gulf of Tonkin's deployment currently uses `forEach limit: 6 over tokensInZone` which takes the **first** 6 US pieces from out-of-play. The playbook shows the US player **choosing** which 6 pieces to deploy (1 Base + 5 Troops). This requires changing to `chooseN n: 6` (player selects pieces) + `forEach over binding` (iterate over chosen pieces for placement). The `binding` query type already exists in the engine.

## Assumption Reassessment (2026-02-25)

1. **Card-1 encoding location** — confirmed at `data/games/fire-in-the-lake/41-content-event-decks.md` (~lines 701-742). Current unshaded has `freeOperationGrants` (Air Strike) and `effects` using `forEach ... limit: 6` over out-of-play US pieces.
2. **Card-6 encoding location** — confirmed at same file (~lines 894-909). Current unshaded has `freeOperationGrants` (Air Strike) and `effects` (`addVar trail -2`) without `effectTiming`.
3. **`binding` query type exists** — confirmed in compiler/runtime/schema surfaces. A `chooseN` result binding can be consumed by `forEach` via `{ query: 'binding', name: ... }`.
4. **`chooseN` effect exists** — confirmed in compiler/runtime behavior. Supports exact cardinality (`n`) and range cardinality (`min`/`max`).
5. **Existing Gulf test assumptions are stale for the proposed model** — `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` currently assumes first pending decision is `chooseOne`, exactly 6 decision params, and `<6` pieces still execute by moving all available. These assumptions conflict with `chooseN n: 6` and must be updated in this ticket.
6. **Scope confirmation for timing updates** — this ticket remains scoped to card-1 and card-6 corrections only, not a full audit of all free-operation cards.
7. **Workspace typecheck baseline discrepancy** — `pnpm turbo typecheck` currently fails in `packages/runner/src/model/translate-effect-trace.ts` (`TS2366`) independent of this ticket. Verification for this ticket is therefore engine-scoped.

## Architecture Check

1. **Game data + test change** — runtime/compiler architecture already supports required primitives; production game data and integration tests must be updated together.
2. **Game-specific data stays in game data** — `effectTiming` is a generic engine field being used in FITL event encoding. No kernel changes.
3. **No backwards-compatibility concerns** — these cards are being corrected, not aliased.
4. **Robustness invariant** — card-1 unshaded should use explicit player choice of which 6 pieces are moved, rather than implicit zone-order selection.

## What to Change

### 1. Card-1 (Gulf of Tonkin) unshaded — add `effectTiming`

Add `effectTiming: afterGrants` to the unshaded side so deployment effects fire after the free Air Strike resolves.

### 2. Card-1 (Gulf of Tonkin) unshaded — change deployment to `chooseN` + `forEach over binding`

Replace the current pattern:

```yaml
effects:
  - forEach:
      bind: $usOutOfPlayPiece
      over:
        query: tokensInZone
        zone: out-of-play-US:none
        filter:
          - { prop: faction, eq: US }
      limit: 6
      effects:
        - chooseOne: ...
        - moveToken: ...
```

This intentionally replaces implicit "first 6 in zone order" behavior with explicit player-selected pieces.

With:

```yaml
effects:
  - chooseN:
      bind: $selectedPieces
      n: 6
      options:
        query: tokensInZone
        zone: out-of-play-US:none
        filter:
          - { prop: faction, eq: US }
  - forEach:
      bind: $usOutOfPlayPiece
      over:
        query: binding
        name: $selectedPieces
      effects:
        - chooseOne:
            bind: '$targetCity@{$usOutOfPlayPiece}'
            options:
              query: mapSpaces
              filter:
                op: '=='
                left: { ref: zoneProp, zone: $zone, prop: category }
                right: 'city'
        - moveToken:
            token: $usOutOfPlayPiece
            from:
              zoneExpr: { ref: tokenZone, token: $usOutOfPlayPiece }
            to:
              zoneExpr: { ref: binding, name: '$targetCity@{$usOutOfPlayPiece}' }
```

### 3. Card-6 (Aces) unshaded — add `effectTiming`

Add `effectTiming: afterGrants` so trail degradation fires after the free Air Strike resolves.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify) — card-1 and card-6 unshaded encoding
- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` (modify) — align assertions with chooseN-first flow and exact-cardinality behavior
- `packages/engine/test/integration/fitl-events-1965-us.test.ts` (modify) — assert card-6 unshaded `effectTiming: afterGrants`

## Out of Scope

- Encoding any other event cards
- Engine code changes (handled by FITLGOLT4-002)
- The golden E2E test (handled by FITLGOLT4-004)
- Card-1 shaded side (no ordering issue)
- Card-6 shaded side (no ordering issue)

## Acceptance Criteria

### Tests That Must Pass

1. **Compilation**: `compileProductionSpec()` succeeds without errors after YAML changes.
2. **Schema validation**: compiled GameDef passes `assertValidatedGameDef`.
3. **Card-1 unshaded**: compiled event side has `effectTiming: 'afterGrants'` and effects use `chooseN` followed by `forEach` over `binding`.
4. **Card-1 decision model**: unshaded flow requires `chooseN` first, then per-piece city `chooseOne` decisions.
5. **Card-1 cardinality semantics**: unshaded side is legal only when enough out-of-play US pieces exist to satisfy `n: 6`.
6. **Card-6 unshaded**: compiled event side has `effectTiming: 'afterGrants'`.
7. Engine suite: `pnpm -F @ludoforge/engine test`
8. Engine checks: `pnpm -F @ludoforge/engine typecheck` and `pnpm -F @ludoforge/engine lint`

### Invariants

1. All existing tests pass — no regression from YAML changes.
2. Card-1 and card-6 compile to valid GameDef structures.
3. No engine code modified in this ticket.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`
   - assert compiled card-1 unshaded includes `effectTiming: 'afterGrants'`
   - assert first pending decision is `chooseN` (piece selection), not city `chooseOne`
   - assert completed move includes `chooseN` plus per-piece city decisions
   - update legacy `<6`/`0` behavior assertions to strict `n: 6` legality
2. `packages/engine/test/integration/fitl-events-1965-us.test.ts`
   - add explicit assertion that card-6 unshaded includes `effectTiming: 'afterGrants'`

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine typecheck`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-25
- **What actually changed**:
  - Updated `data/games/fire-in-the-lake/41-content-event-decks.md`:
    - card-1 unshaded now uses `effectTiming: afterGrants`
    - card-1 unshaded deployment now uses `chooseN n: 6` + `forEach` over `binding`
    - card-6 unshaded now uses `effectTiming: afterGrants`
  - Updated `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`:
    - added assertions for card-1 compiled `effectTiming` and `chooseN`/`binding` structure
    - updated decision-flow assertions to `chooseN`-first
    - replaced legacy `<6`/`0` “move all” expectations with strict exact-6 legality expectations
    - strengthened runtime coverage by isolating placement-behavior tests from free-grant sequencing
  - Updated `packages/engine/test/integration/fitl-events-1965-us.test.ts` to assert card-6 unshaded `effectTiming: afterGrants`
- **Deviations from original plan**:
  - Initial verification was temporarily engine-scoped due an unrelated runner typecheck failure; this was later fixed by handling `turnFlowDeferredEventLifecycle` exhaustively in `packages/runner/src/model/translate-effect-trace.ts`.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine typecheck` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
