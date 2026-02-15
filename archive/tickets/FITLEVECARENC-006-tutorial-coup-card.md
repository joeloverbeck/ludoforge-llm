# FITLEVECARENC-006: Tutorial Coup Card — Nguyen Khanh (#125)

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.1, Phase 1)
**Depends on**: FITLEVECARENC-001

## Description

Encode the tutorial deck's sole coup card, #125 (Nguyen Khanh). Coup cards are `sideMode: "single"` with:
- RVN Leader change via `setGlobalMarker`
- Leader box card count increment
- Leader-specific behavior activated through shared engine logic (Transport restriction already keyed off `activeLeader: khanh`)
- Monsoon preview behavior handled by turn-flow lookahead/coup rules (not card-local effects)
- Tags: `["coup"]`

The spec provides an exact YAML example for this card (lines 133-152).

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add card-125 definition to the `eventDecks[0].cards` array.
- `test/integration/fitl-events-tutorial-coup.test.ts` — **New file**. Integration test for card 125.

## Out of Scope

- Other coup cards (#126-130).
- Coup round trigger mechanism (already in turn flow).
- Monsoon preview-card logic (turn flow handles "next card" effects).
- Any kernel/compiler changes.
- Introducing new transport-specific global vars (for example `transportLocMax`).

## Encoding Guidance

Per the spec example (lines 133-152), adapted to current architecture:

```yaml
- id: "125"
  title: "Nguyen Khanh"
  sideMode: "single"
  tags: ["coup"]
  metadata:
    flavorText: "Corps commanders ascendant."
  unshaded:
    text: "Transport uses max 1 LoC space."
    effects:
      - { setGlobalMarker: { marker: "activeLeader", state: "khanh" } }
      - { addVar: { scope: "global", var: "leaderBoxCardCount", delta: 1 } }
```

Use the `card-125` convention for `id` and include `order: 125` to stay consistent with deck entries. Include `metadata.flavorText`. Do not introduce `transportLocMax`; Khanh transport restriction is already enforced by action legality/pathing conditions keyed to `activeLeader`.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-tutorial-coup.test.ts`:
   - Card 125: compiles, `sideMode: "single"`, tags include `"coup"`.
   - Has `setGlobalMarker` effect for `activeLeader` → `"khanh"`.
   - Has `addVar` for `leaderBoxCardCount` +1.
   - `metadata.flavorText` is present.
   - Does **not** rely on card-local `transportLocMax` style vars/lasting effects for transport rules.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged.
- Production spec compiles without errors.
- Coup card uses `sideMode: "single"` (no shaded side).
- Monsoon restriction behavior remains sourced from turn-flow + lookahead coup detection, not per-card payloads.

## Outcome

- Completion date: 2026-02-15
- Changed:
  - Added `card-125` (`Nguyen Khanh`) to `data/games/fire-in-the-lake.md` as a single-side coup card with:
    - `tags: [coup]`
    - `setGlobalMarker` to `activeLeader: khanh`
    - `addVar` increment for `leaderBoxCardCount`
  - Added `test/integration/fitl-events-tutorial-coup.test.ts` to validate card structure and effects.
- Deviations from original plan:
  - Did not implement `transportLocMax`-based lasting effects. The current architecture already enforces Khanh transport behavior through shared `activeLeader`-based action logic, which is cleaner and avoids redundant state.
  - Monsoon behavior remains turn-flow/lookahead driven and is not encoded in the card payload.
- Verification:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-events-tutorial-coup.test.js` passed.
  - `npm test` passed.
  - `npm run lint` passed.
