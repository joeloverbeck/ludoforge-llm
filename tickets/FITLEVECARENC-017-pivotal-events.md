# FITLEVECARENC-017: Pivotal Event Cards (#121-124)

**Status**: TODO
**Priority**: P3
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.6, Phase 5b)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 4 pivotal event cards. Each has:
- `sideMode: "single"` (no shaded side)
- `tags: ["pivotal", "{faction}"]`
- `playCondition` (precondition for playing)
- Complex multi-step effects
- Trumping chain: VC Tet Offensive > NVA Easter Offensive > ARVN Vietnamization > US Linebacker II

| # | Title | Faction | Play Condition |
|---|-------|---------|----------------|
| 121 | Linebacker II | US | 2+ cards in RVN Leader box AND Support + Available > 40 |
| 122 | Easter Offensive | NVA | 2+ cards in RVN Leader box AND more NVA Troops than US Troops on map |
| 123 | Vietnamization | ARVN | 2+ cards in RVN Leader box AND < 20 US Troops on map |
| 124 | Tet Offensive | VC | 2+ cards in RVN Leader box AND > 20 VC Guerrillas in South |

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 4 card definitions.
- `test/integration/fitl-events-pivotal.test.ts` — **New file**. Integration tests.

## Out of Scope

- Coup cards.
- Trumping chain resolution logic (handled by event execution / turn flow).
- Any kernel/compiler changes (cross-validation already warns on missing `playCondition`).

## Encoding Guidance

### playCondition Pattern
All pivotal events share the "2+ cards in RVN Leader box" precondition:

```yaml
playCondition:
  op: "and"
  args:
    - { op: ">=", left: { ref: "gvar", var: "leaderBoxCardCount" }, right: 2 }
    - # Faction-specific condition
```

### Card 124 (Tet Offensive) — Spec Example
The spec provides an exact example (lines 113-129). Follow that pattern.

### Trumping Chain Encoding
The trumping chain is metadata about which pivotal events can cancel others. Encode in `metadata`:
```yaml
metadata:
  trumps: ["pivotal-US"]  # or ["pivotal-ARVN", "pivotal-NVA", "pivotal-US"] for Tet
```

Or encode as tags: `["pivotal", "VC", "trumps-all"]`. Choose the convention that's most consistent with the existing metadata pattern.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-pivotal.test.ts`:
   - All 4 cards compile, `sideMode: "single"`, tags include `"pivotal"`.
   - Each card has a `playCondition` with the correct preconditions.
   - Card 121: `playCondition` checks `leaderBoxCardCount >= 2` AND support + available > 40.
   - Card 122: `playCondition` checks `leaderBoxCardCount >= 2` AND NVA troops > US troops.
   - Card 123: `playCondition` checks `leaderBoxCardCount >= 2` AND US troops < 20.
   - Card 124: `playCondition` checks `leaderBoxCardCount >= 2` AND VC guerrillas in south > 20.
   - Cross-validation produces no `CNL_XREF_PIVOTAL_PLAY_CONDITION_MISSING` warnings for these cards.
2. `npm run build` passes.
3. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique.
- Production spec compiles without errors.
- Cross-validation warnings for pivotal cards without `playCondition` remain active (tested by existing tests).
