# FITLEVECARENC-004: Tutorial Cards Batch 3 — Capability & Momentum Cards

**Status**: TODO
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.1, Phase 1)
**Depends on**: FITLEVECARENC-001

## Description

Encode the tutorial cards that grant capabilities or momentum markers. These cards require `lastingEffects` with proper `duration` values:

| # | Title | Type | Key Effects |
|---|-------|------|-------------|
| 101 | Booby Traps | VC Capability | Unshaded: VC/NVA Ambush max 1 space; Shaded: Sweep Troop removal on die roll |
| 17 | Claymores | Momentum | Unshaded: Stay eligible, no Ambush until Coup, remove marching Guerrillas; Shaded: remove COIN Base + Underground Insurgent |

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 2 card definitions to the `eventDecks[0].cards` array.
- `test/integration/fitl-events-tutorial-cap-momentum.test.ts` — **New file**. Integration tests for cards 101 and 17.

## Out of Scope

- Implementing capability effect resolution in the kernel (Spec 28 handles this).
- Coup card encoding (#125).
- Gulf of Tonkin (#1).
- Any kernel/compiler changes.

## Encoding Guidance

### Booby Traps (#101) — VC Capability

- **Unshaded (pro-COIN)**: Sets the `capBoobyTraps` variable to `"unshaded"`. This modifies Ambush to max 1 space. Encode as `setVar` targeting the capability variable from Spec 28.
- **Shaded (pro-Insurgent)**: Sets `capBoobyTraps` to `"shaded"`. This causes Sweep troop removal on die roll 1-3. Encode as `setVar`.
- **Tags**: `["capability", "VC"]`

### Claymores (#17) — Momentum

- **Unshaded**: Creates a `lastingEffect` with `duration: "round"` (= until Coup). The lasting effect should encode the "no Ambush" restriction and "remove 1 Guerrilla per marching group that Activates" as setup/teardown vars. Also grants "Stay Eligible" to executing faction.
- **Shaded**: Immediate effects — remove 1 COIN Base + 1 Underground Insurgent from a space with both.
- **Tags**: `["momentum"]`

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-tutorial-cap-momentum.test.ts`:
   - Card 101 (Booby Traps): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, tags include `"capability"`. Unshaded effects include `setVar` for `capBoobyTraps` to `"unshaded"`. Shaded effects include `setVar` for `capBoobyTraps` to `"shaded"`.
   - Card 17 (Claymores): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, tags include `"momentum"`. Unshaded has `lastingEffects` with `duration: "round"`. Shaded has immediate piece-removal effects.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged.
- Capability var IDs match those defined in Spec 28 (Task 28.1).
- Momentum lasting effects use `duration: "round"` (maps to FITL's "until Coup").
- Production spec compiles without errors.
