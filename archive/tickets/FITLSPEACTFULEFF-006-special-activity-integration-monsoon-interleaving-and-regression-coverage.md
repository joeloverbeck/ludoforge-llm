# FITLSPEACTFULEFF-006 - SA Integration: Monsoon, Interleaving, and Regression Coverage

**Status**: ✅ COMPLETED
**Completed on**: 2026-02-14
**Spec**: `specs/27-fitl-special-activities-full-effects.md` (Monsoon Handling, Testing Requirements, Acceptance Criteria)
**Reference**: `brainstorming/implementing-fire-in-the-lake-game-spec-doc.md` (testing gaps and determinism goals)
**Depends on**: `FITLSPEACTFULEFF-002`, `FITLSPEACTFULEFF-003`, `FITLSPEACTFULEFF-004`, `FITLSPEACTFULEFF-005`

## Goal
Add focused integration coverage proving corrected SA rules work together under FITL turn-flow conditions:
- Monsoon SA restrictions.
- Interleaving timing (before/during/after operation) behavior.
- Accompanying-op legality rejection.
- Casualty routing, removal ordering, and deterministic execution invariants.

## Assumption Reassessment (2026-02-14)
- The expected test files all exist and are active.
- SA rule-correct production-data integration coverage already exists in:
  - `test/integration/fitl-us-arvn-special-activities.test.ts`
  - `test/integration/fitl-nva-vc-special-activities.test.ts`
  - `test/integration/fitl-removal-ordering.test.ts`
- Monsoon/turn-flow/determinism suites in this ticket are intentionally kernel-level fixture tests (mini GameDefs), not production-data fixtures:
  - `test/integration/fitl-monsoon-pivotal-windows.test.ts`
  - `test/integration/fitl-turn-flow-golden.test.ts`
  - `test/integration/fitl-card-flow-determinism.test.ts`
- Regression checks called out by this ticket are already present:
  - No-die-roll paths for Air Strike/Bombard are asserted.
  - LoC-adjacent Ambush removal behavior is asserted.

## Scope (Corrected)
- Validate and keep the current split architecture:
  - Production FITL SA semantics validated in production-data integration tests.
  - Generic turn-flow/monsoon/determinism invariants validated in fixture-based kernel integration tests.
- Do not force synthetic turn-flow tests into production-data tests when the existing layering is cleaner and more extensible.
- Preserve generic engine behavior and YAML-driven FITL behavior (no game-specific engine branching).

## File list touched
- `tickets/FITLSPEACTFULEFF-006-special-activity-integration-monsoon-interleaving-and-regression-coverage.md`
- `specs/27-fitl-special-activities-full-effects.md`

## Out of scope
- New event-card implementations.
- Coup plan redesign or non-SA victory-metric changes.
- Bot/non-player SA decision policy.

## Verification
- `npm run build`
- `npm run lint`
- `npm run test:integration`
- `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
- `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
- `node --test dist/test/integration/fitl-monsoon-pivotal-windows.test.js`
- `node --test dist/test/integration/fitl-removal-ordering.test.js`
- `node --test dist/test/integration/fitl-turn-flow-golden.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Architecture Reassessment
The proposed direction (stronger SA + turn-flow regression guarantees) is beneficial versus weaker stub-era coverage, and the current implementation shape is already aligned with clean architecture:
- FITL-specific rule content stays in production YAML/spec assets.
- Engine turn-flow invariants are tested through generic fixture definitions.
- No alias/back-compat layers were introduced.

No additional code changes were required for this ticket after reassessment because the intended behaviors and invariants are already covered and passing.

## Outcome
- Completion date: 2026-02-14
- Actually changed:
  - Reassessed and corrected ticket assumptions and scope to match real test architecture.
  - Verified required build/lint/integration suites and named hard checks all pass.
  - Marked ticket as completed and prepared it for archiving.
- Deviations from original plan:
  - No test/code edits were necessary; the required coverage already existed.
- Verification results:
  - All required commands passed, including full integration and all listed targeted tests.
