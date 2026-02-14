# FITLEVECARENC-003: Tutorial Cards Batch 2 — Medium Complexity Cards

**Status**: TODO
**Priority**: P1
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.1, Phase 1)
**Depends on**: FITLEVECARENC-001

## Description

Encode the medium-complexity tutorial cards that involve piece movement, free operations, conditional logic, and die rolls:

| # | Title | Key Effects |
|---|-------|-------------|
| 55 | Trucks | Trail degrade; NVA removes pieces from Laos/Cambodia; shaded: resources + base movement |
| 97 | Brinks Hotel | Aid +10 or Patronage transfer; flip RVN leader; shaded: shift city + Terror |
| 75 | Sihanouk | Free Sweep/Assault in Cambodia; shaded: free Rally + March for VC then NVA |
| 51 | 301st Supply Bn | Remove non-base Insurgents outside South; shaded: Trail improve + die roll Resources |

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 4 card definitions to the `eventDecks[0].cards` array.
- `test/integration/fitl-events-tutorial-medium.test.ts` — **New file**. Integration tests for cards 55, 97, 75, 51.

## Out of Scope

- Capability-granting cards (Booby Traps #101).
- Momentum-granting cards (Claymores #17).
- Coup cards (#125).
- Gulf of Tonkin (#1) — handled separately due to high complexity.
- Any kernel/compiler changes.
- Implementing free operation resolution (we encode the `effects` array; the operation resolution is handled by existing kernel infrastructure).

## Notes on Effect Encoding

- **Die rolls**: Encode as `{ dieRoll: { ... } }` effect or use the `random` value expression if supported. If the current EffectAST cannot express a die roll, **flag it** in a comment and add it to the "needs new primitive" tracking list per Open Question #3.
- **Free operations**: Encode as `{ freeOp: { ... } }` or use the existing free operation grant mechanism. Document any expressiveness gaps.
- **RVN Leader flip** (Brinks Hotel): Uses `{ setGlobalMarker: { marker: "activeLeader", ... } }` or similar. If no mechanism exists, flag it.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-tutorial-medium.test.ts`:
   - Card 55 (Trucks): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `["NVA", "VC", "US", "ARVN"]`. Has effects for Trail degrade and piece removal.
   - Card 97 (Brinks Hotel): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `["VC", "US", "ARVN", "NVA"]`. Has branches for Aid/Patronage options + leader flip.
   - Card 75 (Sihanouk): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `["ARVN", "NVA", "US", "VC"]`. Has free operation effects for Cambodia.
   - Card 51 (301st Supply Bn): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `["NVA", "VC", "US", "ARVN"]`. Has piece removal + resource effects.
2. `npm run build` passes.
3. `npm test` passes.
4. Any effects that cannot be expressed with the current EffectAST are documented in a `NEEDS_PRIMITIVE.md` tracking file (or comments in the card definition).

### Invariants That Must Remain True

- All existing cards unchanged.
- Card IDs follow `card-{number}` convention.
- All faction orders are exactly 4 factions, each appearing once.
- Production spec compiles without errors.
