# FITLOPEFULEFF-029: Attack Regression Matrix (NVA + VC)

**Status**: Pending
**Priority**: P1
**Estimated effort**: Medium (3-5 hours)
**Spec reference**: Spec 26 Task 26.9, Task 26.10 integration edge-cases
**Depends on**: FITLOPEFULEFF-017, FITLOPEFULEFF-026, FITLOPEFULEFF-028

## Summary

Harden Attack operation coverage with behavior-level assertions (not only structure/determinism checks).

Current tests verify key pieces, but coverage is incomplete for hit/miss, damage formulas, attrition counts, free-op, and LimOp constraints.

Add explicit matrix coverage for:
- NVA guerrilla mode: miss and hit outcomes
- NVA troops mode: floor division damage behavior
- Attrition exactness: attacker losses equal US removed
- Free operation cost skip
- Limited operation max-one-space enforcement
- VC Attack parity checks once `attack-vc-profile` exists (guerrilla-only path)

## Files to Touch

- `test/integration/fitl-attack-die-roll.test.ts` — expand behavioral assertions
- `test/integration/fitl-insurgent-operations.test.ts` — add legality/selection constraints
- `test/integration/fitl-limited-ops.test.ts` (or create if missing) — assert Attack-specific LimOp behavior

## Out of Scope

- Rewriting unrelated operation test suites
- Non-Attack operation balancing/rule updates

## Acceptance Criteria

### Tests That Must Pass
1. Behavioral assertions cover both attack modes and deterministic outcomes.
2. Attack cost behavior covered for normal and free operation.
3. Attack LimOp constraints covered and enforced.
4. VC Attack coverage included after VC profile is present.
5. `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` pass.

### Invariants
- Tests assert game behavior, not internal implementation details.
- No reliance on fallback action effects for Attack validation.
