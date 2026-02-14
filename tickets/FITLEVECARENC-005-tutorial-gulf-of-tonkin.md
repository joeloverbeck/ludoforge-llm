# FITLEVECARENC-005: Tutorial Card — Gulf of Tonkin (#1)

**Status**: TODO
**Priority**: P1
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.1, Phase 1)
**Depends on**: FITLEVECARENC-001

## Description

Encode card #1 (Gulf of Tonkin), the highest-complexity tutorial card. This is the US escalation event with multi-step effects:

- **Unshaded**: "US free Air Strikes, then moves 6 US pieces from out-of-play to any Cities."
  - Free Air Strike operation
  - Move 6 pieces from out-of-play zone to Cities

- **Shaded**: "Congressional regrets: Aid -1 per Casualty. All Casualties out of play."
  - Dynamic calculation: Aid -= count of Casualty pieces
  - Move all Casualty pieces to out-of-play

This card is high-complexity because it references free operations, aggregate calculations, and bulk piece movement.

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add card-1 definition to the `eventDecks[0].cards` array.
- `test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts` — **New file**. Integration test for card 1.

## Out of Scope

- Implementing free Air Strike operation resolution.
- Any kernel/compiler changes.
- Other tutorial cards.

## Encoding Guidance

### Unshaded Side
The free Air Strike can be encoded as a `freeOp` effect or a directive-based reference. The "moves 6 US pieces from out-of-play to Cities" is a `moveAll` or series of `move` effects with a target selector for out-of-play US pieces and destination Cities. If either cannot be expressed, flag for Open Question #3.

### Shaded Side
"Aid -1 per Casualty" requires an `aggregate` count of pieces in the casualties zone, then `addVar` with a dynamic delta. This may require:
- `{ aggregate: { op: "count", query: { zone: "casualties-US" } } }` to count casualties
- `{ addVar: { scope: "global", var: "aid", delta: { negate: { aggregate: ... } } } }` for dynamic delta

If the current EffectAST does not support dynamic deltas, flag it.

"All Casualties out of play" is a `moveAll` from casualties to out-of-play.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`:
   - Card 1: compiles, `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `["US", "NVA", "ARVN", "VC"]`.
   - Unshaded has effects for free Air Strike and piece movement.
   - Shaded has effects for Aid reduction and Casualty movement.
   - `text` fields present on both sides.
2. `npm run build` passes.
3. `npm test` passes.
4. Any effects that cannot be expressed are documented in `NEEDS_PRIMITIVE.md` or flagged in card definition comments.

### Invariants That Must Remain True

- All existing cards unchanged.
- Production spec compiles without errors.
- Card ID is `card-1`.
