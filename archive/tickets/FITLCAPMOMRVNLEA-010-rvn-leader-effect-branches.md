# FITLCAPMOMRVNLEA-010 - RVN Leader Lingering Effect Branches

**Status**: ✅ COMPLETED
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.5, effect branches)
**Depends on**: FITLCAPMOMRVNLEA-009, Spec 25c (GlobalMarkerLatticeDef), Spec 26/27 (operation/SA profiles)

## Goal

Add conditional branches to operation/SA profiles for the lingering effects of each RVN Leader. Add reusable data-level effect helpers needed by RVN Leader cards, but defer card wiring and card lifecycle behavior until Spec 29 event-card expansion is in place.

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add leader-conditional branches to affected operation/SA profiles
- `test/integration/fitl-rvn-leader.test.ts` (new) — Integration tests
- `tickets/FITLCAPMOMRVNLEA-010-rvn-leader-effect-branches.md` — Assumption and scope correction (this update)

## Out of scope

- Leader data definitions (FITLCAPMOMRVNLEA-009 — already done)
- Coup card event encoding that triggers leader changes (Spec 29)
- Runtime handling of cards 125-130 (leader changes, Failed Attempt lifecycle, leader box stacking order)
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
- In this ticket, encode this only as a reusable effect macro helper in game data (no event-card branch wiring yet)
- Spec 29 will wire this helper into cards 129-130
- **Important for future wiring**: Failed Attempt does NOT change `activeLeader`. It increments `leaderBoxCardCount`.

## Key rule clarifications to test

1. `activeLeader` gates lingering profile behavior only (no engine code branching).
2. Minh bonus applies only to ARVN Train operation profile.
3. Khanh Transport constraint is implemented data-side in transport destination connectivity constraints.
4. Young Turks bonus applies only to ARVN Govern SA.
5. Ky modifies ARVN pacification cost logic in both US Train and ARVN Train sub-actions.
6. Thieu has no lingering effect branch (no-op).
7. Failed Attempt lifecycle behaviors are deferred to Spec 29 and are not executable acceptance tests in this ticket.

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
6. **Thieu active**: verify no leader-specific modification branch is applied
7. **Desertion helper macro**: verify helper compiles and encodes floor(cubes/3) removal pattern for later card wiring

### Invariants that must remain true

- Leader effect branches check `activeLeader` global marker state, not a gvar
- Each leader check is specific to the leader state value
- Minh's bonus only applies to ARVN faction, not US or other factions
- Young Turks' bonus only applies to ARVN faction
- Thieu requires no conditional branch (no-op)
- Failed Attempt wiring is deferred; this ticket only introduces reusable data helper for later wiring
- No game-specific logic in engine/kernel/compiler
- Tests use `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`

## Assumption corrections applied

1. **Event card availability mismatch**:
   - Current production event deck only encodes cards `27` and `82`.
   - Cards `125-130` are not yet represented in executable event branches.
   - Therefore leader-change and Failed Attempt runtime tests are not executable in this ticket.

2. **Transport constraint feasibility**:
   - The DSL already supports path-depth limiting through `connected.maxDepth`.
   - Khanh's "max 1 LoC" should be implemented as data-level transport destination constraint branching, not engine changes.

3. **Pacification duplication risk**:
   - Ky affects duplicated pacification cost paths in both US Train and ARVN Train sub-actions.
   - Implementation should prefer a shared macro/value pattern to avoid divergent future behavior.

## Outcome

- **Completion date**: 2026-02-14
- **What was changed**:
  - Added lingering leader effect branches in `data/games/fire-in-the-lake.md`:
    - Minh: +5 Aid on ARVN Train (`train-arvn-profile` operation-level stage).
    - Khanh: Transport destination constraint now branches by leader and enforces `connected.maxDepth: 2`.
    - Young Turks: +2 Patronage on Govern (`govern-profile` telemetry stage).
    - Ky: Pacification resource cost is centralized and leader-aware via shared macro.
  - Added reusable helper macros:
    - `rvn-leader-pacification-cost` (shared by US/ARVN Train pacification branches).
    - `rvn-leader-failed-attempt-desertion` (deferred helper for Spec 29 card wiring).
  - Added integration coverage:
    - `test/integration/fitl-rvn-leader.test.ts`.
  - Updated impacted existing integration expectations:
    - `test/integration/fitl-coin-operations.test.ts`.
    - `test/integration/fitl-faction-costs.test.ts`.
- **Deviations from original plan**:
  - Runtime leader-card lifecycle (`125-130`) and `leaderBoxCardCount` transition behavior were **not** implemented in this ticket because the production event deck does not yet encode those cards; this remains correctly deferred to Spec 29 wiring.
  - Desertion was implemented as a reusable macro pattern only (not wired to card branches yet), matching corrected scope.
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-rvn-leader.test.js` passed.
  - `npm test` passed.
  - `npm run lint` passed.
