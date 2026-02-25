# FITLGOLT4-003: Gulf of Tonkin and Aces Event Encoding Updates

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — game data only
**Deps**: FITLGOLT4-002

## Problem

Card-1 (Gulf of Tonkin) and card-6 (Aces) unshaded events grant free operations whose effects must resolve BEFORE the event's own effects. With FITLGOLT4-002 providing the `effectTiming` primitive, these cards need to be updated to use `effectTiming: afterGrants`.

Additionally, Gulf of Tonkin's deployment currently uses `forEach limit: 6 over tokensInZone` which takes the **first** 6 US pieces from out-of-play. The playbook shows the US player **choosing** which 6 pieces to deploy (1 Base + 5 Troops). This requires changing to `chooseN n: 6` (player selects pieces) + `forEach over binding` (iterate over chosen pieces for placement). The `binding` query type already exists in the engine.

## Assumption Reassessment (2026-02-25)

1. **Card-1 encoding location** — confirmed at `data/games/fire-in-the-lake/41-content-event-decks.md` lines 700-742. Current unshaded has `freeOperationGrants` (Air Strike) and `effects` (forEach over tokensInZone with limit 6).
2. **Card-6 encoding location** — confirmed at same file lines 893-910. Current unshaded has `freeOperationGrants` (Air Strike) and `effects` (addVar trail −2).
3. **`binding` query type exists** — confirmed in `types-ast.ts:198`, `eval-query.ts:779`, `GameDef.schema.json:5695`. A `chooseN` result bound to a name can be iterated via `{ query: 'binding', name: ... }`.
4. **`chooseN` effect exists** — confirmed in `types-ast.ts:369`. Supports `n` (exact count) and `min/max` (range).
5. **No other cards in the tutorial deck need `effectTiming: afterGrants`** — verified by checking all tutorial cards with `freeOperationGrants`. Only card-1 and card-6 have both grants and effects that need ordering.

## Architecture Check

1. **YAML-only change** — all modifications are in the game data YAML. No engine code changes.
2. **Game-specific data stays in game data** — `effectTiming` is a generic engine field being used in FITL event encoding. No kernel changes.
3. **No backwards-compatibility concerns** — these cards are being corrected, not aliased.

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
4. **Card-6 unshaded**: compiled event side has `effectTiming: 'afterGrants'`.
5. Existing suite: `pnpm turbo test --force`

### Invariants

1. All existing tests pass — no regression from YAML changes.
2. Card-1 and card-6 compile to valid GameDef structures.
3. No engine code modified in this ticket.

## Test Plan

### New/Modified Tests

1. Existing `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` — may need assertion updates if it checks effect structure. Verify it still passes or update expected values.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
