# FITLOPEFULEFF-029: Attack Regression Matrix (NVA + VC)

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Medium (3-5 hours)
**Spec reference**: Spec 26 Task 26.9, Task 26.10 integration edge-cases
**Depends on**: FITLOPEFULEFF-017, FITLOPEFULEFF-026, FITLOPEFULEFF-028

## Summary

Harden Attack operation coverage with behavior-level assertions (not only structure/determinism checks), while keeping engine logic generic and validating behavior through production `GameSpecDoc` YAML.

Current tests verify key pieces, but coverage is incomplete for hit/miss, damage formulas, attrition counts, free-op, and LimOp constraints.

Add explicit matrix coverage for:
- NVA guerrilla mode: miss and hit outcomes
- NVA troops mode: floor division damage behavior
- Attrition exactness: attacker losses equal US removed
- Free operation cost skip
- Limited operation max-one-space enforcement
- VC Attack parity checks once `attack-vc-profile` exists (guerrilla-only path)

## Assumption Reassessment (2026-02-14)

1. `attack-vc-profile` is **not** present in the current production spec (`data/games/fire-in-the-lake.md`) and therefore cannot be integration-tested yet.
2. `test/integration/fitl-limited-ops.test.ts` does **not** currently exist; LimOp behavior is covered in other tests but not Attack-focused.
3. Attrition behavior is already covered at macro runtime level in `test/integration/fitl-removal-ordering.test.ts`, but Attack-specific end-to-end assertions are still thin.
4. Existing `fitl-attack-die-roll` and `fitl-insurgent-operations` tests are valid but currently emphasize structure/determinism and legality over full behavioral outcomes.

## Updated Scope

- In scope now:
  - Add Attack-focused behavioral integration tests for NVA hit/miss, troop damage formula semantics, free-op cost bypass, and Attack LimOp one-space cap.
  - Strengthen or add tests that bind Attack operation outcomes to observable state transitions.
- Deferred (blocked by missing production profile):
  - VC parity integration assertions requiring production `attack-vc-profile`.

## Files to Touch

- `test/integration/fitl-attack-die-roll.test.ts` — expand behavioral assertions
- `test/integration/fitl-insurgent-operations.test.ts` — add legality/selection/cost constraints
- `test/integration/fitl-limited-ops.test.ts` (or create if missing) — assert Attack-specific LimOp behavior

## Out of Scope

- Rewriting unrelated operation test suites
- Non-Attack operation balancing/rule updates
- Introducing game-specific engine branching or schema specialization

## Acceptance Criteria

### Tests That Must Pass
1. Behavioral assertions cover both attack modes and deterministic outcomes.
2. Attack cost behavior covered for normal and free operation.
3. Attack LimOp constraints covered and enforced.
4. VC Attack coverage ticketed separately or added here only once production `attack-vc-profile` exists.
5. `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` pass.

### Invariants
- Tests assert game behavior, not internal implementation details.
- No reliance on fallback action effects for Attack validation.

## Outcome

- Completion date: 2026-02-14
- Actually changed:
  - Reassessed and corrected ticket assumptions/scope before implementation.
  - Expanded `test/integration/fitl-attack-die-roll.test.ts` with deterministic hit/miss matrix coverage and attacker/defender invariants.
  - Expanded `test/integration/fitl-insurgent-operations.test.ts` with:
    - troops-mode floor-division damage assertion,
    - integrated attrition exactness assertion (NVA losses match US removed),
    - `freeOperation` cost-skip assertion for Attack.
  - Added `test/integration/fitl-limited-ops.test.ts` to enforce Attack LimOp max-one-space behavior.
- Deviations from original plan:
  - VC parity integration was deferred because production `attack-vc-profile` is not present in `data/games/fire-in-the-lake.md`.
  - Kept architecture unchanged (YAML-driven operation logic); work focused on behavioral coverage only.
- Verification:
  - `npm run build` passed.
  - `npm run typecheck` passed.
  - `npm test` passed.
  - `npm run lint` passed.
