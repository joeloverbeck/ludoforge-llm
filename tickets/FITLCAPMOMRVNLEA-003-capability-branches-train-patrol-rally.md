# FITLCAPMOMRVNLEA-003 - Capability Conditional Branches: Train, Patrol, Rally

**Status**: Pending
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.2, partial)
**Depends on**: FITLCAPMOMRVNLEA-001, Spec 25c (GlobalMarkerLatticeDef), Spec 26 (operation profiles)

## Goal

Add per-side capability conditional branches to the **Train**, **Patrol**, and **Rally** operation profiles in the production spec.

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add conditional branches to Train, Patrol, Rally operation profiles
- `test/integration/fitl-capabilities-train-patrol-rally.test.ts` (new) — Integration tests

## Out of scope

- Sweep, Assault, Air Strike capability branches (FITLCAPMOMRVNLEA-002)
- March, Attack, Bombard, Transport, Govern, Ambush, Terror/Agitate capability branches (tickets 004-005)
- Momentum checks (FITLCAPMOMRVNLEA-007, 008)
- RVN Leader effects (FITLCAPMOMRVNLEA-009, 010)
- Kernel/compiler changes (Spec 25c)
- Event cards that grant capabilities (Spec 29)

## Capability branches to implement

### Train (3 checks)
- `cap_caps` unshaded: Train places +1 Police
- `cap_cords` unshaded: Train Pacify in 2 spaces
- `cap_cords` shaded: Train Pacify to Passive Support only

### Patrol (1 check)
- `cap_m48Patton` shaded: Patrol on roll 1-3 costs -1 moved cube

### Rally (3 checks)
- `cap_aaa` unshaded: Rally Trail improvement max 1 space
- `cap_sa2s` shaded: Rally improves Trail by 2
- `cap_cadres` shaded: Rally allows Agitate at 1 Base

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm test` — All existing tests pass
- `node --test dist/test/integration/fitl-capabilities-train-patrol-rally.test.js`

### Integration test coverage

For each capability-side check listed above, verify:
1. When capability is `inactive`: operation behaves normally (no modification)
2. When capability is on the relevant side: operation behaves as modified
3. When capability is on the opposite side: operation behaves normally

### Invariants that must remain true

- Each conditional branch checks the specific side (`unshaded` or `shaded`), never just "active"
- `inactive` state always means no capability effect
- No game-specific logic in engine/kernel/compiler
- Existing operation behavior unchanged when all capabilities are `inactive`
- Tests use `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`
