# FITLEVECARENC-006: Tutorial Coup Card — Nguyen Khanh (#125)

**Status**: TODO
**Priority**: P1
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.1, Phase 1)
**Depends on**: FITLEVECARENC-001

## Description

Encode the tutorial deck's sole coup card, #125 (Nguyen Khanh). Coup cards are `sideMode: "single"` with:
- RVN Leader change via `setGlobalMarker`
- Leader box card count increment
- Leader-specific lasting effects (Transport restriction for Khanh)
- Monsoon lasting effect (if this card is "next", no Sweep/March, Air Lift & Air Strike max 2)
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

## Encoding Guidance

Per the spec example (lines 133-152):

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
    lastingEffects:
      - id: "khanh-transport-restriction"
        duration: "round"
        setupEffects:
          - { setVar: { scope: "global", var: "transportLocMax", value: 1 } }
        teardownEffects:
          - { setVar: { scope: "global", var: "transportLocMax", value: 999 } }
```

Adapt the `id` to follow the `card-125` convention. The `metadata` should also include a `factionOrder` if applicable (coup cards don't have a standard faction order in the same way — follow the spec's card data).

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-tutorial-coup.test.ts`:
   - Card 125: compiles, `sideMode: "single"`, tags include `"coup"`.
   - Has `setGlobalMarker` effect for `activeLeader` → `"khanh"`.
   - Has `addVar` for `leaderBoxCardCount` +1.
   - Has `lastingEffects` with id `"khanh-transport-restriction"`, `duration: "round"`.
   - `setupEffects` sets `transportLocMax` to 1.
   - `teardownEffects` sets `transportLocMax` to 999.
   - `metadata.flavorText` is present.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged.
- Production spec compiles without errors.
- Coup card uses `sideMode: "single"` (no shaded side).
- Lasting effects use `duration: "round"`.
