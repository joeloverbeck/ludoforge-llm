# FITLCAPMOMRVNLEA-010 - RVN Leader Lingering Effect Branches

**Status**: Pending
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.5, effect branches)
**Depends on**: FITLCAPMOMRVNLEA-009, Spec 25c (GlobalMarkerLatticeDef), Spec 26/27 (operation/SA profiles)

## Goal

Add conditional branches to operation/SA profiles for the lingering effects of each RVN Leader. Also encode the Failed Attempt "Desertion" immediate effect pattern (to be wired into coup card effects in Spec 29).

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add leader-conditional branches to affected operation/SA profiles
- `test/integration/fitl-rvn-leader.test.ts` (new) — Integration tests

## Out of scope

- Leader data definitions (FITLCAPMOMRVNLEA-009 — already done)
- Coup card event encoding that triggers leader changes (Spec 29)
- Capability branches (FITLCAPMOMRVNLEA-001 through 005)
- Momentum checks (FITLCAPMOMRVNLEA-007, 008)
- Kernel/compiler changes for GlobalMarkerLatticeDef (Spec 25c)

## Leader effects to implement

### Duong Van Minh (`activeLeader == 'minh'`)
- **ARVN Train**: Each ARVN Train Operation adds +5 bonus Aid
- Conditional: check `activeLeader == 'minh'` AND `operatingFaction == 'ARVN'`
- Effect: `{ addVar: { scope: 'global', var: 'aid', delta: 5 } }`

### Nguyen Khanh (`activeLeader == 'khanh'`)
- **Transport**: Transport uses max 1 LoC space
- Conditional: check `activeLeader == 'khanh'`
- Effect: Limit Transport LoC targeting to 1 space

### Young Turks (`activeLeader == 'youngTurks'`)
- **ARVN Govern SA**: Each ARVN Govern adds +2 Patronage
- Conditional: check `activeLeader == 'youngTurks'` AND `operatingFaction == 'ARVN'`
- Effect: `{ addVar: { scope: 'global', var: 'patronage', delta: 2 } }`

### Nguyen Cao Ky (`activeLeader == 'ky'`)
- **Pacification (Coup Round Support Phase)**: Pacification costs 4 Resources per Terror or level
- Conditional: check `activeLeader == 'ky'`
- Effect: Override pacification cost to 4 per step/Terror
- Note: Effect starts from the Coup Round when Ky is placed (rule 2.4.1)

### Nguyen Van Thieu (`activeLeader == 'thieu'`)
- **No effect**: "Stabilizer" — no conditional branch needed

### Failed Attempt (Cards 129-130) — Immediate Effect Pattern
- **Desertion**: ARVN removes 1 in 3 of its cubes per space (round down)
- This is an immediate effect encoded as part of the coup card's event effects (Spec 29 will wire it)
- Encode the effect pattern: forEach space with ARVN cubes → remove floor(count/3) cubes
- **Important**: Failed Attempt does NOT change `activeLeader`. It increments `leaderBoxCardCount`.

## Key rule clarifications to test

1. Failed Attempts cancel only Minh's effect (if Minh is active). If another leader is active, Failed Attempt has no leader effect (only Desertion).
2. Failed Attempts increment `leaderBoxCardCount` but do not change `activeLeader`.
3. Leader replacement (cards 125-128): set `activeLeader` to new leader AND increment `leaderBoxCardCount`.
4. Thieu has no lingering effect — operations/SAs are unmodified when Thieu is active.

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm test` — All existing tests pass
- `node --test dist/test/integration/fitl-rvn-leader.test.js`

### Integration test coverage

1. **Minh active + ARVN Train**: verify +5 Aid
2. **Minh active + US Train**: verify NO bonus (wrong faction)
3. **Khanh active + Transport**: verify max 1 LoC space
4. **Young Turks active + ARVN Govern**: verify +2 Patronage
5. **Ky active + Pacification**: verify cost = 4 per step/Terror
6. **Thieu active**: verify no modification to any operation/SA
7. **Leader change**: verify old leader effect stops, new leader effect starts
8. **Failed Attempt with Minh active**: verify Desertion AND Minh bonus cancelled
9. **Failed Attempt with non-Minh leader**: verify Desertion only, leader unchanged
10. **leaderBoxCardCount**: verify increments on leader change and Failed Attempt

### Invariants that must remain true

- Leader effect branches check `activeLeader` global marker state, not a gvar
- Each leader check is specific to the leader state value
- Minh's bonus only applies to ARVN faction, not US or other factions
- Young Turks' bonus only applies to ARVN faction
- Thieu requires no conditional branch (no-op)
- Failed Attempt never changes `activeLeader`
- No game-specific logic in engine/kernel/compiler
- Tests use `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`
