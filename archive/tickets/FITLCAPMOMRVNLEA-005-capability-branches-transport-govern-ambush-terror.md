# FITLCAPMOMRVNLEA-005 - Capability Conditional Branches: Transport, Govern, Ambush, Terror/Agitate, Reset

**Status**: ✅ COMPLETED
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.2, partial)
**Depends on**: FITLCAPMOMRVNLEA-001, Spec 25c (GlobalMarkerLatticeDef), Spec 26/27 (operation/SA profiles)

## Goal

Add per-side capability conditional branches to the **Transport**, **Govern**, **Ambush**, and **Terror** operation/SA profiles in the production spec, using only GameSpecDoc/YAML data-plane changes.

## Reassessed assumptions and scope (2026-02-14)

1. Production FITL currently declares only `turnStructure.phases: [main]` in `data/games/fire-in-the-lake.md`; there is no production `reset` action/profile/phase trigger to attach a `cap_migs` unshaded Reset effect.
2. `Agitate` is currently encoded within Rally behavior (not a standalone operation/action pipeline). There is no separate `agitate-*` profile to branch in this ticket.
3. Existing production profile behavior already includes prior capability branches from tickets 002-004. This ticket should only add missing branches for the targeted profiles/macros and keep engine/compiler generic.

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add conditional branches to Transport, Govern, Ambush, and Terror profiles/macros
- `test/integration/fitl-capabilities-transport-govern-ambush-terror.test.ts` (new) — Integration tests

## Out of scope

- Sweep, Assault, Air Strike capability branches (FITLCAPMOMRVNLEA-002)
- Train, Patrol, Rally capability branches (FITLCAPMOMRVNLEA-003)
- March, Attack, Bombard capability branches (FITLCAPMOMRVNLEA-004)
- Momentum checks (FITLCAPMOMRVNLEA-007, 008)
- RVN Leader effects (FITLCAPMOMRVNLEA-009, 010)
- Kernel/compiler changes (Spec 25c)
- `Reset (Coup Round)` `cap_migs` unshaded branch (blocked until production Coup/Reset flow exists)
- Standalone `Agitate` branching (blocked until Agitate is modeled as explicit profile/action)

## Capability branches to implement

### Transport (2 checks)
- `cap_armoredCavalry` unshaded: Transport allows Assault in 1 destination space
- `cap_armoredCavalry` shaded: Transport can move Rangers

### Govern (2 checks)
- `cap_mandateOfHeaven` unshaded: 1 Govern space does not shift Support/Opposition
- `cap_mandateOfHeaven` shaded: Govern max 1 space

### Ambush (2 checks)
- `cap_boobyTraps` unshaded: Ambush max 1 space
- `cap_mainForceBns` shaded: VC Ambush removes 2 enemy pieces

### Terror (1 check)
- `cap_cadres` unshaded: VC Terror guerrilla activation cost reduction is represented in the current Terror abstraction

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

## Outcome

- **Completion date**: 2026-02-14
- **Implemented changes**:
  - Added capability branches in `data/games/fire-in-the-lake.md` for:
    - Transport: `cap_armoredCavalry` unshaded/shaded behavior
    - Govern: `cap_mandateOfHeaven` unshaded/shaded behavior
    - Ambush: `cap_boobyTraps` unshaded selector cap and `cap_mainForceBns` shaded VC removal budget
    - Terror: `cap_cadres` unshaded VC activation-cost representation in the current Terror abstraction
  - Added integration coverage in `test/integration/fitl-capabilities-transport-govern-ambush-terror.test.ts`.
  - Updated `test/integration/fitl-us-arvn-special-activities.test.ts` baseline Transport expectation to match capability-gated Ranger movement.
- **Deviations from original plan**:
  - `Reset (Coup Round)` `cap_migs` unshaded was not implemented because the production spec currently has no Reset-phase action/profile hook (`turnStructure` remains `main`-only).
  - Standalone `Agitate` branch was not implemented because Agitate is not currently modeled as a standalone operation/action pipeline.
- **Verification**:
  - `npm run build` passed
  - `npm test` passed
  - `node --test dist/test/integration/fitl-capabilities-transport-govern-ambush-terror.test.js` passed
  - `npm run lint` passed
