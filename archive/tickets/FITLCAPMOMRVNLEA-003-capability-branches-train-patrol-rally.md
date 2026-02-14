# FITLCAPMOMRVNLEA-003 - Capability Conditional Branches: Train, Patrol, Rally

**Status**: ✅ COMPLETED
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.2, partial)
**Depends on**: FITLCAPMOMRVNLEA-001, Spec 25c (GlobalMarkerLatticeDef), Spec 26 (operation profiles)

## Goal

Add per-side capability conditional branches to the **Train**, **Patrol**, and **Rally** operation profiles in the production spec.

## Reassessed assumptions (2026-02-14)

- `data/games/fire-in-the-lake.md` is the authoritative production GameSpecDoc source (not YAML).
- `test/helpers/production-spec-helpers.ts` already compiles that markdown source and should remain the integration-test entrypoint.
- The targeted branches in this ticket are currently missing from the Train/Patrol/Rally profile logic:
  - Missing in Train: `cap_caps` unshaded, `cap_cords` unshaded, `cap_cords` shaded.
  - Missing in Patrol: `cap_m48Patton` shaded.
  - Missing in Rally: `cap_aaa` unshaded, `cap_sa2s` shaded, `cap_cadres` shaded.
- Some of these capability markers are already used in other profiles (for example Air Strike uses `cap_aaa` shaded and `cap_sa2s` unshaded), so this ticket must add only Train/Patrol/Rally behavior without regressing existing operation semantics.
- `test/integration/fitl-capabilities-train-patrol-rally.test.ts` does not yet exist and must be created by this ticket.

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

## Scope detail (profile-level)

- Train changes apply to `train-us-profile` and/or `train-arvn-profile` where the branch semantics are legal for that faction flow.
- Patrol changes apply to `patrol-us-profile` and `patrol-arvn-profile`.
- Rally changes apply to the faction-appropriate rally profile(s):
  - `rally-nva-profile` for `cap_aaa`/`cap_sa2s`.
  - `rally-vc-profile` for `cap_cadres`.

## Architecture intent

- Keep all capability behavior declarative in GameSpecDoc effects/macros.
- Prefer reusable effect macros over duplicated branch blocks when semantics are shared across profiles.
- No kernel/compiler special-casing, aliases, or backward-compat shims.

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

## Outcome

- Completion date: 2026-02-14
- What changed:
- Added Train capability branches in `train-us-profile` and `train-arvn-profile`:
  - `cap_caps` unshaded (+1 Police placement hook)
  - `cap_cords` unshaded (sub-action pacify selection up to 2 spaces)
  - `cap_cords` shaded (pacify capped at Passive Support behavior)
- Added Patrol capability branch via a shared macro used by both patrol profiles:
  - `cap_m48Patton` shaded (roll-gated moved-cube penalty)
- Added Rally capability branches:
  - `rally-nva-profile`: explicit trail-improvement space targeting with `cap_aaa` unshaded max-1-space constraint and `cap_sa2s` shaded (+2 trail-improvement branch with cap-safe delta)
  - `rally-vc-profile`: `cap_cadres` shaded stage enabling 1-space agitate-style support shift when VC base conditions are met
- Added `test/integration/fitl-capabilities-train-patrol-rally.test.ts` for side-specific branch coverage and profile/macro wiring checks.
- Deviations from original plan:
- Introduced an explicit Rally trail-improvement space binding (`$trailImproveSpaces`) only on the `$improveTrail: 'yes'` branch, so capability constraints apply to a concrete decision surface while keeping the `'no'` path minimal.
- Kept Train pacify cost logic inline in profiles (instead of macro extraction) to preserve existing invariant tests that assert direct pacify cost expressions.
- Verification:
  - `npm run build` passed
  - `node --test dist/test/integration/fitl-capabilities-train-patrol-rally.test.js` passed
  - `npm test` passed (all suites)
  - `npm run lint` passed
