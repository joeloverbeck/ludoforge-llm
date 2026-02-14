# FITLCAPMOMRVNLEA-002 - Capability Conditional Branches: Sweep, Assault, Air Strike

**Status**: ✅ COMPLETED
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.2, partial)
**Depends on**: FITLCAPMOMRVNLEA-001, Spec 25c (GlobalMarkerLatticeDef), Spec 26 (operation profiles)

## Goal

Add per-side capability conditional branches to the **Sweep** and **Assault** operation profiles, plus the **Air Strike** US special-activity profile, in the production spec. These three profiles currently carry the highest capability interaction density in Task 28.2.

## Reassessed assumptions (2026-02-14)

- At implementation start, `data/games/fire-in-the-lake.md` had baseline Sweep/Assault/Air Strike behavior without these capability-conditional branches. It now includes all ticketed capability-side branches.
- In this codebase, Air Strike is implemented as `air-strike-profile` in US special activities (not as a main operation profile). Scope and tests must target that profile directly.
- Existing integration tests for these areas live in domain suites (`fitl-coin-operations`, `fitl-us-arvn-special-activities`) rather than dedicated capability files.
- The original capability/check counts in this ticket were inconsistent. Correct totals for this ticket are:
  - Sweep: 3 checks
  - Assault: 6 checks
  - Air Strike: 9 checks
  - Total: 18 capability-side checks across 11 capabilities

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add conditional branches to Sweep, Assault, Air Strike operation profiles
- `test/integration/fitl-capabilities-sweep-assault-airstrike.test.ts` (new) — Capability-focused integration checks (compile + runtime)
- `test/integration/fitl-coin-operations.test.ts` (optional) — Only if existing Sweep/Assault assertions need extension
- `test/integration/fitl-us-arvn-special-activities.test.ts` (optional) — Only if existing Air Strike assertions need extension

## Out of scope

- Capabilities affecting Train, Patrol, Rally, March, Attack, Bombard, Transport, Govern, Ambush, Terror/Agitate (tickets 003-005)
- Momentum checks (FITLCAPMOMRVNLEA-007, 008)
- RVN Leader effects (FITLCAPMOMRVNLEA-009, 010)
- Kernel/compiler changes (Spec 25c)
- Event cards that grant capabilities (Spec 29)

## Capability branches to implement

### Sweep (3 checks)
- `cap_cobras` unshaded: 2 Sweep spaces each remove 1 Active unTunneled enemy
- `cap_caps` shaded: Sweep max 2 spaces
- `cap_boobyTraps` shaded: Sweep 1:3 ratio costs -1 Troop

### Assault (6 checks)
- `cap_abrams` unshaded: 1 Assault space targets Base first
- `cap_abrams` shaded: Assault max 2 spaces
- `cap_cobras` shaded: Assault spaces on roll 1-3 cost -1 US Troop
- `cap_m48Patton` unshaded: 2 Assault spaces remove 2 extra
- `cap_searchAndDestroy` unshaded: Assault removes 1 Underground Guerrilla
- `cap_searchAndDestroy` shaded: Assault adds +1 Active Opposition

### Air Strike (9 checks)
- `cap_topGun` unshaded: No MiGs; Degrade 2 levels
- `cap_topGun` shaded: Degrade only on die roll 4-6
- `cap_arcLight` unshaded: 1 Air Strike space, no COIN pieces affected
- `cap_arcLight` shaded: Air Strike >1 space shifts Support/Opposition by 2
- `cap_lgbs` unshaded: Air Strike does not shift if removing only 1 piece
- `cap_lgbs` shaded: Air Strike removes max 4 pieces
- `cap_aaa` shaded: Air Strike Degrade limited to 2 levels only
- `cap_migs` shaded: Air Strike vs Trail costs -1 US Troop
- `cap_sa2s` unshaded: Air Strike on Trail costs -1 NVA piece

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm test` — All existing tests pass
- `node --test dist/test/integration/fitl-capabilities-sweep-assault-airstrike.test.js`

### Integration test coverage

For each capability-side check listed above, verify:
1. When capability is `inactive`: operation behaves normally (no modification)
2. When capability is on the relevant side (`unshaded` or `shaded`): operation behaves as modified
3. When capability is on the *opposite* side: operation behaves normally (opposite side does not trigger this branch)

### Invariants that must remain true

- Each conditional branch checks the specific side (`unshaded` or `shaded`), never just "active"
- `inactive` state always means no capability effect (operation behaves as baseline)
- No game-specific logic in engine/kernel/compiler — all branches are declarative in GameSpecDoc YAML
- Existing operation behavior unchanged when all capabilities are `inactive`
- Tests use `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`

## Outcome

- **Completion date**: 2026-02-14
- **What actually changed**:
  - Added capability-conditional branches in `data/games/fire-in-the-lake.md` for Sweep US/ARVN, Assault US/ARVN, and Air Strike profile logic.
  - Follow-up architecture hardening removed duplicated M48 Assault bonus blocks by introducing shared macro `cap-assault-m48-unshaded-bonus-removal` used by both US and ARVN Assault profiles.
  - Strengthened macro contracts by making Assault removal `space` params binding-aware (`zoneSelector`) to preserve macro hygiene through nested macro expansion.
  - Added new integration suite `test/integration/fitl-capabilities-sweep-assault-airstrike.test.ts` covering side-specific branch wiring and key Air Strike runtime behavior.
  - Updated impacted existing integration tests in `test/integration/fitl-coin-operations.test.ts` and `test/integration/fitl-us-arvn-special-activities.test.ts` to align with the expanded stage graph and conditional-roll architecture.
- **Deviations from original plan**:
  - Kept test coverage split between a new capability-focused suite and existing domain suites (instead of exclusively one new file), matching current repository test architecture.
  - Corrected ticket assumptions before implementation (counts, profile classification, and expected test touchpoints).
- **Verification**:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `node --test dist/test/integration/fitl-capabilities-sweep-assault-airstrike.test.js` passed.
  - `node --test dist/test/integration/fitl-removal-ordering.test.js` passed.
  - `node --test dist/test/integration/fitl-coin-operations.test.js` passed.
  - `npm test` passed (151/151).
