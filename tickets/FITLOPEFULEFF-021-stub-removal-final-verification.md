# FITLOPEFULEFF-021: Stub Removal and Final Verification

**Status**: Pending
**Priority**: P1
**Estimated effort**: Small (1-2 hours)
**Spec reference**: Spec 26, Acceptance Criteria 1, 21-23
**Depends on**: ALL previous FITLOPEFULEFF tickets (001-020), FITLOPEFULEFF-022, FITLOPEFULEFF-023, FITLOPEFULEFF-024, FITLOPEFULEFF-025

## Summary

Final sweep to verify that:
1. All 8 stub operation profiles are fully replaced by the 16 faction-specific profiles
2. No stub YAML remains in any fixture or GameSpecDoc
3. All existing integration tests pass or have been properly updated
4. Build and typecheck pass cleanly
5. The spec's full acceptance criteria checklist is satisfied

This is a verification-only ticket. If issues are found, they should be addressed in the relevant profile ticket, not here.

## Verification Checklist

### Profile Count (Acceptance Criterion 1)
- [ ] `train-us-profile` exists and compiles
- [ ] `train-arvn-profile` exists and compiles
- [ ] `patrol-us-profile` exists and compiles
- [ ] `patrol-arvn-profile` exists and compiles
- [ ] `sweep-us-profile` exists and compiles
- [ ] `sweep-arvn-profile` exists and compiles
- [ ] `assault-us-profile` exists and compiles
- [ ] `assault-arvn-profile` exists and compiles
- [ ] `rally-nva-profile` exists and compiles
- [ ] `rally-vc-profile` exists and compiles
- [ ] `march-nva-profile` exists and compiles
- [ ] `march-vc-profile` exists and compiles
- [ ] `attack-nva-profile` exists and compiles
- [ ] `attack-vc-profile` exists and compiles
- [ ] `terror-nva-profile` exists and compiles
- [ ] `terror-vc-profile` exists and compiles
- [ ] No stub profiles remain (grep for `fallbackUsed` in operation profiles)

### Build Verification (Acceptance Criteria 22-23)
- [ ] `npm run build` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (all unit + integration)

### Architecture Hardening Verification (Post-021 dependency chain)
- [ ] Pipeline legal-move satisfiability guard present and validated (FITLOPEFULEFF-022)
- [ ] Typed zone-reference path is in use where required; no fragile string-concat zone-id construction remains in scoped FITL operation paths (FITLOPEFULEFF-023)
- [ ] Generic priority-removal primitive is in place and validated by tests (FITLOPEFULEFF-024)
- [ ] FITL removal macros are decomposed by responsibility and pass removal-ordering regressions (FITLOPEFULEFF-025)

## Files to Touch

- `data/games/fire-in-the-lake.md` — Verify all 16 profiles present, no stubs remain
- `test/integration/fitl-coin-operations.test.ts` — Verify updated for real profiles
- `test/integration/fitl-insurgent-operations.test.ts` — Verify updated for real profiles

## Out of Scope

- Creating new profiles (done in previous tickets)
- Kernel source code changes
- Compiler source code changes
- Any new feature work

## Acceptance Criteria

### Tests That Must Pass
1. ALL existing tests pass (`npm test`)
2. ALL new tests from tickets 001-020 pass
3. No compiler diagnostics from any FITL fixture

### Invariants
- This ticket makes NO code changes — only verification
- If verification fails, the fix goes in the relevant upstream ticket
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
