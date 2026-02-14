# FITLCAPMOMRVNLEA-005 - Capability Conditional Branches: Transport, Govern, Ambush, Terror/Agitate, Reset

**Status**: Pending
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.2, partial)
**Depends on**: FITLCAPMOMRVNLEA-001, Spec 25c (GlobalMarkerLatticeDef), Spec 26/27 (operation/SA profiles)

## Goal

Add per-side capability conditional branches to the **Transport**, **Govern**, **Ambush**, **Terror/Agitate**, and **Reset (Coup Round)** operation/SA profiles in the production spec. This is the final batch of capability branches, completing Task 28.2.

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add conditional branches to Transport, Govern, Ambush, Terror/Agitate, and Reset profiles
- `test/integration/fitl-capabilities-transport-govern-ambush-terror.test.ts` (new) — Integration tests

## Out of scope

- Sweep, Assault, Air Strike capability branches (FITLCAPMOMRVNLEA-002)
- Train, Patrol, Rally capability branches (FITLCAPMOMRVNLEA-003)
- March, Attack, Bombard capability branches (FITLCAPMOMRVNLEA-004)
- Momentum checks (FITLCAPMOMRVNLEA-007, 008)
- RVN Leader effects (FITLCAPMOMRVNLEA-009, 010)
- Kernel/compiler changes (Spec 25c)

## Capability branches to implement

### Transport (2 checks)
- `cap_armoredCavalry` unshaded: Transport allows Assault in 1 destination space
- `cap_armoredCavalry` shaded: Transport can move Rangers

### Govern (2 checks)
- `cap_mandateOfHeaven` unshaded: 1 Govern space does not shift Support/Opposition
- `cap_mandateOfHeaven` shaded: Pacify and Govern max 1 space

### Ambush (2 checks)
- `cap_boobyTraps` unshaded: Ambush max 1 space
- `cap_mainForceBns` shaded: VC 1 Ambush removes 2 enemy pieces

### Terror/Agitate (1 check)
- `cap_cadres` unshaded: VC Terror and Agitate cost 2 fewer Guerrillas

### Reset — Coup Round (1 check)
- `cap_migs` unshaded: Reset costs -6 NVA Resources

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm test` — All existing tests pass
- `node --test dist/test/integration/fitl-capabilities-transport-govern-ambush-terror.test.js`

### Integration test coverage

For each capability-side check listed above, verify:
1. When capability is `inactive`: operation/SA behaves normally
2. When capability is on the relevant side: operation/SA behaves as modified
3. When capability is on the opposite side: operation/SA behaves normally

### Invariants that must remain true

- Each conditional branch checks the specific side (`unshaded` or `shaded`), never just "active"
- `inactive` state always means no capability effect
- No game-specific logic in engine/kernel/compiler
- Existing operation/SA behavior unchanged when all capabilities are `inactive`
- Tests use `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`
