# FITLSPEACTFULEFF-006 - SA Integration: Monsoon, Interleaving, and Regression Coverage

**Status**: TODO  
**Spec**: `specs/27-fitl-special-activities-full-effects.md` (Monsoon Handling, Testing Requirements, Acceptance Criteria)  
**Reference**: `brainstorming/implementing-fire-in-the-lake-game-spec-doc.md` (testing gaps and determinism goals)  
**Depends on**: `FITLSPEACTFULEFF-002`, `FITLSPEACTFULEFF-003`, `FITLSPEACTFULEFF-004`, `FITLSPEACTFULEFF-005`

## Goal
Add focused integration coverage proving all corrected SA rules work together under real FITL turn-flow conditions:
- Monsoon SA restrictions.
- Interleaving timing (before/during/after operation) behavior.
- Accompanying-op legality rejection.
- Casualty routing, removal ordering, and deterministic execution invariants.

## Scope
- Add or expand integration tests that exercise full SA behavior under production data.
- Replace old stub-era assertions (resource-spend counters, minimal targeting metadata checks) with rules-correct assertions.
- Add regression checks for no-die-roll paths (Air Strike, Bombard) and LoC-adjacent Ambush removal.

## File list it expects to touch
- `test/integration/fitl-us-arvn-special-activities.test.ts`
- `test/integration/fitl-nva-vc-special-activities.test.ts`
- `test/integration/fitl-monsoon-pivotal-windows.test.ts`
- `test/integration/fitl-turn-flow-golden.test.ts`
- `test/integration/fitl-removal-ordering.test.ts`
- `test/integration/fitl-card-flow-determinism.test.ts`
- `test/fixtures/trace/fitl-turn-flow.golden.json` (only if expected trace structure changes)

## Out of scope
- New event-card implementations.
- Coup plan redesign or non-SA victory-metric changes.
- Bot/non-player SA decision policy.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `npm run test:integration`
- `node --test dist/test/integration/fitl-us-arvn-special-activities.test.js`
- `node --test dist/test/integration/fitl-nva-vc-special-activities.test.js`
- `node --test dist/test/integration/fitl-monsoon-pivotal-windows.test.js`
- `node --test dist/test/integration/fitl-removal-ordering.test.js`
- `node --test dist/test/integration/fitl-turn-flow-golden.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`

## Invariants that must remain true
- Same seed plus same moves yields deterministic state/trace outcomes.
- No SA introduces hidden hardcoded game-specific engine branches.
- Turn-flow option matrix and eligibility windows remain valid after SA updates.
- Existing non-SA FITL integration suites continue passing unchanged.

