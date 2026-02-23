# FITLRULES2-006: RVN Leader Lingering Effects Verification (Rule 2.4.1)

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None expected (verification + targeted test hardening)
**Deps**: None

## Problem

Rule 2.4.1 defines lingering effects for each RVN Leader while active. This ticket originally assumed missing coverage and some file-path/mechanics details that no longer match the repository state.

Reassess and align scope to current architecture before any implementation.

References used for reassessment:
- `specs/00-fitl-implementation-order.md` (Spec 28 milestone expectation: marker-driven RVN leader effects)
- `reports/fire-in-the-lake-rules-section-2.md` (Rule 2.4.1 source text)

## Assumption Reassessment

| Topic | Original Assumption | Current Reality | Action |
|--------|---------------------|-----------------|--------|
| `activeLeader` definition location | In `40-content-data-assets.md` | Defined in `10-vocabulary.md` as a `globalMarkerLattice` with states `minh/khanh/youngTurks/ky/thieu` | Update ticket scope/docs |
| Khanh transport semantics | “`maxDepth: 2`” as standalone rule | Implemented in `transport-profile` as conditional connectivity with `maxDepth: 2` under restricted `via` constraints (loc/city uncontested path), matching “max 1 LoC space” card text intent | Keep architecture; add edge-case runtime guard |
| Leader coverage gap | Missing tests for lingering effects | `packages/engine/test/integration/fitl-rvn-leader.test.ts` already covers Minh/Khanh/Young Turks/Ky/Thieu and Failed Attempt structural checks | Narrow scope to gap-only hardening |
| Failed Attempt wiring | Macro should be used by cards 129-130 | Already encoded in `41-content-event-decks.md` and structurally asserted in tests | Keep and verify regression |

## Updated Verification Scope

1. Confirm data-driven architecture remains intact:
- Leader effects are encoded in FITL YAML assets/macros, not engine branches.
- Runtime checks rely on `globalMarkerState(activeLeader)` conditions.
2. Validate lingering effects/invariants remain correct:
- Minh: +5 Aid on ARVN Train only.
- Khanh: Transport restricted to routes with at most one LoC segment.
- Young Turks: +2 Patronage on Govern.
- Ky: Pacification cost 4 per Terror/level.
- Thieu: no additional gameplay branch.
3. Verify Failed Attempt card encoding:
- Cards `129` and `130` keep identical desertion behavior via `rvn-leader-failed-attempt-desertion`.
- No direct `activeLeader` mutation by Failed Attempt cards.
4. Close identified test gap:
- Add explicit runtime guard that Khanh restriction does not over-constrain legal near-route destinations.

## Invariants

1. When `activeLeader == minh`, Train ARVN must add +5 to Aid.
2. When `activeLeader == khanh`, Transport must allow destinations that require at most one LoC path segment and reject farther routes requiring more.
3. When `activeLeader == youngTurks`, Govern must add +2 to Patronage.
4. When `activeLeader == ky`, Pacification cost must be 4 instead of 3.
5. When `activeLeader == thieu`, no gameplay modification occurs.
6. Failed Attempt desertion macro must correctly remove ARVN troops.
7. All leader checks must use the `activeLeader` global var (not hardcoded faction checks).

## Tests

Existing coverage source of truth:
- `packages/engine/test/integration/fitl-rvn-leader.test.ts`
- `packages/engine/test/integration/fitl-events-coup-remaining.test.ts`
- `packages/engine/test/integration/fitl-modifiers-smoke.test.ts`

Required for this ticket:
1. Keep existing structural + runtime assertions for all five leaders.
2. Add runtime regression for Khanh near-route legality (one-LoC-allowed case).
3. Run relevant FITL integration tests and report pass/fail.

## Deliverables

- Updated ticket assumptions/scope aligned to current codebase.
- Test hardening for any uncovered invariant edge case.
- Verification results from relevant engine test execution.

## Outcome

- **Completion date**: 2026-02-23
- **Actually changed**:
  - Corrected stale assumptions in this ticket (notably `activeLeader` location and Khanh transport semantics details).
  - Added one integration runtime regression in `packages/engine/test/integration/fitl-rvn-leader.test.ts`:
    - `keeps Khanh Transport legal for destinations reachable via at most one LoC`
  - Re-verified existing leader and coup coverage rather than duplicating already-present tests.
- **Deviations from original plan**:
  - Original ticket expected broad missing coverage and potential data fixes.
  - Current code already implemented and tested most of the scope; no YAML/engine behavior changes were required.
  - Work focused on scope correction + one missing edge-case guard test.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
  - `node --test dist/test/integration/fitl-rvn-leader.test.js dist/test/integration/fitl-events-coup-remaining.test.js dist/test/integration/fitl-modifiers-smoke.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅ (256 passed, 0 failed)
