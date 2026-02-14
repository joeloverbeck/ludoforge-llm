# FITLCAPMOMRVNLEA-002 - Capability Conditional Branches: Sweep, Assault, Air Strike

**Status**: Pending
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.2, partial)
**Depends on**: FITLCAPMOMRVNLEA-001, Spec 25c (GlobalMarkerLatticeDef), Spec 26 (operation profiles)

## Goal

Add per-side capability conditional branches to the **Sweep**, **Assault**, and **Air Strike** operation profiles in the production spec. These three operations have the most capability interactions (12 capability-side checks across 8 capabilities).

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add conditional branches to Sweep, Assault, Air Strike operation profiles
- `test/integration/fitl-capabilities-sweep-assault-airstrike.test.ts` (new) — Integration tests

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

### Air Strike (7 checks)
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
