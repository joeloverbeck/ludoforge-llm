# FITLCAPMOMRVNLEA-009 - RVN Leader Marker and GVar Definitions

**Status**: Pending
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.5, definitions)
**Depends on**: Spec 25c (GlobalMarkerLatticeDef kernel primitive)

## Goal

Define the RVN Leader data model in the FITL production GameSpecDoc: an `activeLeader` global marker lattice with 5 leader states, and a `leaderBoxCardCount` integer gvar tracking how many coup cards are in the leader box. This ticket adds the data declarations only — leader effect conditional branches are in ticket 010.

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add `activeLeader` global marker lattice and `leaderBoxCardCount` gvar

## Out of scope

- Leader lingering effect conditional branches on operations (FITLCAPMOMRVNLEA-010)
- Failed Attempt immediate effects (FITLCAPMOMRVNLEA-010)
- Coup card event encoding that sets leader and increments count (Spec 29)
- Capability definitions and branches (FITLCAPMOMRVNLEA-001 through 005)
- Momentum markers (FITLCAPMOMRVNLEA-006 through 008)
- Kernel/compiler changes for GlobalMarkerLatticeDef (Spec 25c)

## Deliverables

### 1. `activeLeader` global marker lattice

Add to `globalMarkerLattices:` section:
```yaml
- id: "activeLeader"
  states: ["minh", "khanh", "youngTurks", "ky", "thieu"]
  defaultState: "minh"
```

Leader mapping:
| State | Leader | Card # | Notes |
|---|---|---|---|
| `minh` | Duong Van Minh | (map) | Default. Not a card. Not counted in leader box. |
| `khanh` | Nguyen Khanh | 125 | |
| `youngTurks` | Young Turks | 126 | |
| `ky` | Nguyen Cao Ky | 127 | |
| `thieu` | Nguyen Van Thieu | 128 | |

### 2. `leaderBoxCardCount` integer gvar

Add to `globalVars:` section:
```yaml
- { name: leaderBoxCardCount, type: int, init: 0, min: 0, max: 8 }
```

Notes:
- Starts at 0 (Minh is printed on map, not a card)
- Incremented by 1 each time a leader coup card (125-128) or Failed Attempt card (129-130) is placed in the box
- Max 8 covers all 6 possible coup cards (4 leaders + 2 Failed Attempts) with margin
- Used by Pivotal Event preconditions: `leaderBoxCardCount >= 2`

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm test` — All existing tests pass
- Verify via `compileProductionSpec()` that:
  - `activeLeader` global marker lattice exists with 5 states and default `"minh"`
  - `leaderBoxCardCount` gvar exists with default `0`

### Invariants that must remain true

- `activeLeader` states are exactly `["minh", "khanh", "youngTurks", "ky", "thieu"]`
- Default state is `"minh"` (Duong Van Minh, printed on map)
- `leaderBoxCardCount` defaults to 0 (Minh is not a card)
- No existing sections of the production spec are modified — only additive changes
- No game-specific logic in engine/kernel/compiler
