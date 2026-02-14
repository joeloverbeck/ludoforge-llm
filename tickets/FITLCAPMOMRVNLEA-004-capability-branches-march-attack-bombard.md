# FITLCAPMOMRVNLEA-004 - Capability Conditional Branches: March, Attack, Bombard

**Status**: Pending
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.2, partial)
**Depends on**: FITLCAPMOMRVNLEA-001, Spec 25c (GlobalMarkerLatticeDef), Spec 26 (operation profiles)

## Goal

Add per-side capability conditional branches to the **March**, **Attack**, and **Bombard** operation profiles in the production spec.

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add conditional branches to March, Attack, Bombard operation profiles
- `test/integration/fitl-capabilities-march-attack-bombard.test.ts` (new) — Integration tests

## Out of scope

- Sweep, Assault, Air Strike capability branches (FITLCAPMOMRVNLEA-002)
- Train, Patrol, Rally capability branches (FITLCAPMOMRVNLEA-003)
- Transport, Govern, Ambush, Terror/Agitate capability branches (FITLCAPMOMRVNLEA-005)
- Momentum checks (FITLCAPMOMRVNLEA-007, 008)
- RVN Leader effects (FITLCAPMOMRVNLEA-009, 010)
- Kernel/compiler changes (Spec 25c)

## Capability branches to implement

### March (1 check)
- `cap_mainForceBns` unshaded: March allows Activating more than 1 Guerrilla

### Attack (2 checks)
- `cap_pt76` unshaded: Attack costs -1 NVA Troop
- `cap_pt76` shaded: 1 Attack space removes -1 enemy per NVA Troop

### Bombard (2 checks)
- `cap_longRangeGuns` unshaded: Bombard max 1 space
- `cap_longRangeGuns` shaded: Bombard max 3 spaces

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm test` — All existing tests pass
- `node --test dist/test/integration/fitl-capabilities-march-attack-bombard.test.js`

### Integration test coverage

For each capability-side check listed above, verify:
1. When capability is `inactive`: operation behaves normally
2. When capability is on the relevant side: operation behaves as modified
3. When capability is on the opposite side: operation behaves normally

### Invariants that must remain true

- Each conditional branch checks the specific side (`unshaded` or `shaded`), never just "active"
- `inactive` state always means no capability effect
- No game-specific logic in engine/kernel/compiler
- Existing operation behavior unchanged when all capabilities are `inactive`
- Tests use `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`
