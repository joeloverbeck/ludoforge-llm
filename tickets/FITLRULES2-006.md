# FITLRULES2-006: RVN Leader Lingering Effects Verification (Rule 2.4.1)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — verification and test coverage only
**Deps**: None

## Problem

Rule 2.4.1 defines lingering effects for each RVN Leader that modify game behavior while the leader is active. Need to verify all 5 leader lingering effects are correctly encoded in the GameSpecDoc and covered by tests.

## What to Verify

### Leader Effects (from exploration)

| Leader | Effect | Expected Location | What to Check |
|--------|--------|-------------------|---------------|
| **Minh** | +5 Aid on Train ARVN | `train-arvn-profile` has `rvn-leader-minh-aid-bonus` | Condition: `activeLeader == minh` → Aid +5 |
| **Khanh** | Transport restricted to depth 2 | `transport-profile` has `maxDepth: 2` | Condition: `activeLeader == khanh` → maxDepth 2 (vs normal depth) |
| **Young Turks** | +2 Patronage on Govern | `govern-profile` has `govern-telemetry` | Condition: `activeLeader == youngTurks` → Patronage +2 |
| **Ky** | Pacification costs 4 (instead of 3) | `rvn-leader-pacification-cost` macro | Condition: `activeLeader == ky` → cost 4 vs 3 |
| **Thieu** | No gameplay effect (just sets marker) | N/A | Verify no erroneous logic is gated on `activeLeader == thieu` |

### Additional Mechanics

- **Failed Attempt desertion**: `rvn-leader-failed-attempt-desertion` macro used by cards 129-130. Verify it triggers ARVN troop removal when a coup card failed attempt occurs.

### Files to Check

- `data/games/fire-in-the-lake/30-rules-actions.md` — action profiles for Train-ARVN, Transport, Govern, Pacify
- `data/games/fire-in-the-lake/20-macros.md` — `rvn-leader-pacification-cost`, `rvn-leader-failed-attempt-desertion` macros
- `data/games/fire-in-the-lake/40-content-data-assets.md` — `activeLeader` variable definition

## Invariants

1. When `activeLeader == minh`, Train ARVN must add +5 to Aid.
2. When `activeLeader == khanh`, Transport must restrict movement depth to 2.
3. When `activeLeader == youngTurks`, Govern must add +2 to Patronage.
4. When `activeLeader == ky`, Pacification cost must be 4 instead of 3.
5. When `activeLeader == thieu`, no gameplay modification occurs.
6. Failed Attempt desertion macro must correctly remove ARVN troops.
7. All leader checks must use the `activeLeader` global var (not hardcoded faction checks).

## Tests

1. **Structural test — Minh**: Verify `train-arvn-profile` compiled output contains `activeLeader == minh` conditional with Aid +5 effect.
2. **Structural test — Khanh**: Verify Transport profile compiled output contains `activeLeader == khanh` conditional with depth restriction.
3. **Structural test — Young Turks**: Verify Govern profile compiled output contains `activeLeader == youngTurks` conditional with Patronage +2 effect.
4. **Structural test — Ky**: Verify pacification cost macro compiled output contains `activeLeader == ky` conditional with cost 4.
5. **Integration runtime — Minh**: Set `activeLeader = minh`, execute Train ARVN, verify Aid increases by 5 more than baseline.
6. **Integration runtime — Ky**: Set `activeLeader = ky`, execute Pacification, verify cost is 4 (not 3).
7. **Negative test — Thieu**: Set `activeLeader = thieu`, verify no leader-specific gameplay modifications occur.
8. **Regression**: Existing FITL leader and operation tests still pass.

## Deliverables

- Investigation report documenting each leader effect's location and correctness.
- Test file(s) covering all 5 leader lingering effects.
- If gaps are found: data changes to fix incorrect or missing leader effect encoding.
