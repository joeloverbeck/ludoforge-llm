# FITLCAPMOMRVNLEA-004 - Capability Conditional Branches: March, Attack, Bombard

**Status**: ✅ COMPLETED
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.2, partial)
**Depends on**: FITLCAPMOMRVNLEA-001, Spec 25c (GlobalMarkerLatticeDef), Spec 26 (operation profiles)

## Goal

Add per-side capability conditional branches to the **March**, **Attack**, and **Bombard** operation profiles in the production spec.

## Reassessed assumptions (2026-02-14)

- `data/games/fire-in-the-lake.md` is the authoritative production GameSpecDoc source (markdown, not standalone YAML).
- `test/helpers/production-spec-helpers.ts` is the required compile entrypoint for production-spec integration tests.
- The targeted branch checks are currently missing from runtime profile logic:
  - `march-vc-profile`: no `cap_mainForceBns` side check currently gates guerrilla activation count.
  - `attack-nva-profile`: no `cap_pt76` side checks currently alter Attack resource/payment or troops-mode damage formula.
  - `bombard-profile`: no `cap_longRangeGuns` side checks currently alter selected-space max.
- Bombard is implemented as an NVA special-activity profile (`bombard-profile`) in action pipelines; this ticket must target that profile directly even though the capability matrix labels it under operations.
- Existing integration coverage for March/Attack/Bombard baseline behavior already lives in:
  - `test/integration/fitl-insurgent-operations.test.ts`
  - `test/integration/fitl-nva-vc-special-activities.test.ts`
  A capability-focused integration suite is still required for this ticket.

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add conditional branches to March, Attack, Bombard operation profiles
- `test/integration/fitl-capabilities-march-attack-bombard.test.ts` (new) — Integration tests
- `test/integration/fitl-insurgent-operations.test.ts` (optional) — only if baseline assertions need adjustment for capability-conditioned defaults
- `test/integration/fitl-nva-vc-special-activities.test.ts` (optional) — only if Bombard baseline assertions need adjustment for capability-conditioned defaults

## Out of scope

- Sweep, Assault, Air Strike capability branches (FITLCAPMOMRVNLEA-002)
- Train, Patrol, Rally capability branches (FITLCAPMOMRVNLEA-003)
- Transport, Govern, Ambush, Terror/Agitate capability branches (FITLCAPMOMRVNLEA-005)
- Momentum checks (FITLCAPMOMRVNLEA-007, 008)
- RVN Leader effects (FITLCAPMOMRVNLEA-009, 010)
- Kernel/compiler changes (Spec 25c)

## Capability branches to implement

### March (1 check)
- `cap_mainForceBns` unshaded: **VC March** allows Activating more than 1 Guerrilla

### Attack (2 checks)
- `cap_pt76` unshaded: **NVA Attack** costs -1 NVA Troop (instead of spending 1 NVA resource)
- `cap_pt76` shaded: **NVA troops-attack mode** removes 1 enemy per NVA Troop (instead of floor(NVA Troops / 2))

### Bombard (2 checks)
- `cap_longRangeGuns` unshaded: Bombard max 1 space
- `cap_longRangeGuns` shaded: Bombard max 3 spaces

## Scope detail (profile-level)

- March branch applies to `march-vc-profile` (capability faction = VC).
- Attack branches apply to `attack-nva-profile` (capability faction = NVA).
- Bombard branches apply to `bombard-profile` (NVA special activity profile).

## Architecture intent

- Keep capability behavior declarative in GameSpecDoc pipeline logic/macros only.
- Prefer localized capability guards at decision/cost/damage points instead of introducing new engine/kernel branching.
- Maintain generic compiler/runtime contracts (no game-specific aliases, compatibility shims, or hardcoded FITL branches in kernel/compiler).

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

## Outcome

- Completion date: 2026-02-14
- What changed:
- Added `cap_mainForceBns` unshaded branch for VC March activation count by extending shared March destination macro with `maxActivatedGuerrillas` and wiring `march-vc-profile` to `1` (inactive/shaded) vs `99` (unshaded).
- Added `cap_pt76` branches in `attack-nva-profile`:
  - Unshaded replaces baseline per-space NVA resource spend with a per-space NVA troop payment.
  - Shaded changes troops-attack damage from `floor(nvaTroops/2)` to `nvaTroops`.
- Added `cap_longRangeGuns` branches in `bombard-profile` with side-specific max spaces (`1`, `2`, `3`) via a shared `bombard-select-spaces` macro to avoid duplicated selector logic.
- Added new integration suite `test/integration/fitl-capabilities-march-attack-bombard.test.ts` covering compile-time marker wiring and runtime branch behavior for `inactive` / relevant side / opposite side.
- Deviations from original plan:
- Clarified scope to `march-vc-profile` and `attack-nva-profile` (capability-owner profiles) rather than blanket all insurgent March/Attack profiles.
- Treated Bombard as an NVA special-activity profile implementation detail while preserving the ticket’s capability semantics.
- Verification:
  - `npm run build` passed
  - `node --test dist/test/integration/fitl-capabilities-march-attack-bombard.test.js` passed
  - `node --test dist/test/integration/fitl-insurgent-operations.test.js` passed
  - `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js` passed
  - `npm run lint` passed
  - `npm test` passed (153/153)
