# FITLCAPMOMRVNLEA-011 - Cross-System Integration and Smoke Tests

**Status**: Pending
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Acceptance Criteria items 6-10)
**Depends on**: FITLCAPMOMRVNLEA-001 through 010 (all previous tickets)

## Goal

Verify that all three modifier systems (capabilities, momentum, RVN Leader) interact correctly and that the combined production spec compiles, builds, and passes all tests. This is the final validation ticket for Spec 28.

## File list it expects to touch

- `test/integration/fitl-modifiers-smoke.test.ts` (new) — Cross-system smoke tests

## Out of scope

- Adding any new capability/momentum/leader definitions (already in tickets 001, 006, 009)
- Adding any new conditional branches (already in tickets 002-005, 007-008, 010)
- Kernel/compiler changes
- Event card encoding (Spec 29)
- Capability flip mechanic full wiring (Spec 29, Card #52 RAND)

## Test scenarios

### Combined capability + momentum interactions
1. **Capability active + prohibiting momentum active**: Verify the prohibition takes priority (e.g., `cap_arcLight` unshaded modifies Air Strike, but `mom_rollingThunder` prohibits Air Strike entirely — prohibition wins)
2. **Multiple capabilities on same operation**: Verify stacking (e.g., Assault with both `cap_abrams` unshaded and `cap_m48Patton` unshaded — both effects apply)
3. **Multiple momentum markers on same SA**: Verify combined prohibitions (e.g., Typhoon Kate prohibits Air Lift AND Medevac Shaded also prohibits Air Lift)

### Combined capability + RVN Leader interactions
4. **Minh active + CAPS unshaded + ARVN Train**: Verify both Minh's +5 Aid AND CAPS's +1 Police apply
5. **Ky active + capability affecting Pacification**: Verify Ky's cost override interacts correctly with capability effects

### Full production spec validation
6. `npm run build` — Build passes
7. `npm test` — All existing tests pass (no regressions)
8. `compileProductionSpec()` returns no errors and includes all 19 capability markers, 15 momentum gvars, `activeLeader` lattice, `leaderBoxCardCount` gvar

### Determinism check
9. Same seed + same operations + same modifier state = identical state hash (verify Zobrist hashing includes global markers)

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm test` — All existing tests pass
- `node --test dist/test/integration/fitl-modifiers-smoke.test.js`

### Invariants that must remain true

- All 19 capabilities, 15 momentum markers, and RVN Leader encoded in production spec
- Production spec compiles without errors
- No game-specific logic in engine/kernel/compiler
- Deterministic: same inputs produce same outputs
- All modifier systems operate purely through declarative YAML conditions and effects
- Tests use `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`
