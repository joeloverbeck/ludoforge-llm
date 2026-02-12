# FITLFOUINTTESANDTRA-006 - Golden Trace Contracts and Determinism Gate

**Status**: ✅ COMPLETED  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-003`, `FITLFOUINTTESANDTRA-004`, `FITLFOUINTTESANDTRA-005`

## Goal
Establish and enforce FITL golden `GameTrace` fixtures for representative foundation flows, including a deterministic replay gate and explicit fixture-update policy.

## Assumptions Reassessment (2026-02-12)
- Existing coverage is split across multiple integration tests, not a single all-in-one golden trace.
- `test/integration/fitl-turn-flow-golden.test.ts` currently validates pass/event sequencing plus coup lifecycle boundary trace behavior.
- `test/integration/fitl-card-flow-determinism.test.ts` already provides deterministic replay checks (including 20 repeated runs) and operation/special-activity determinism across FITL fixtures.
- Victory recomputation determinism is validated in dedicated coup/victory integration coverage (`test/integration/fitl-coup-victory.test.ts`) rather than this ticket's golden fixture files.

## Implementation Tasks
1. Keep at least one golden trace fixture that contracts event execution and coup lifecycle trace behavior.
2. Keep integration checks for byte-identical replay under same seed and move sequence, including repeated-run determinism gate.
3. Document and enforce trace fixture update policy in test assertions or comments near fixture usage.

## File list it expects to touch
- `test/integration/fitl-turn-flow-golden.test.ts`
- `test/integration/fitl-card-flow-determinism.test.ts`
- `test/integration/determinism-full.test.ts`
- `test/fixtures/trace/fitl-turn-flow.golden.json`
- `test/fixtures/trace/fitl-foundation-initial-state.golden.json` (optional if scenario baseline changes)
- `test/integration/fitl-coup-victory.test.ts` (reference-only validation scope; optional touch)

## Out of scope
- New gameplay semantics unrelated to trace determinism.
- Architecture audit coverage for FITL hardcoding.
- Non-FITL regression additions.
- Benchmark/performance tuning.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-turn-flow-golden.test.js`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
- `node --test dist/test/integration/determinism-full.test.js`
- `node --test dist/test/integration/fitl-coup-victory.test.js`
- Repeat deterministic target 20 times with byte-identical trace output

## Invariants that must remain true
- Same seed and identical move inputs produce byte-identical trace artifacts.
- Golden fixtures are intentional contracts, not opportunistic snapshots.
- Trace emission order remains stable and deterministic for non-choice execution paths.
- Scope split remains explicit: turn-flow golden fixture covers lifecycle contract; coup/victory recomputation remains validated in dedicated FITL coup/victory tests.

## Outcome
- Completion date: 2026-02-12
- Actually changed:
  - Reassessed and corrected ticket assumptions to match current Spec 21 FITL test architecture (scope split between golden turn-flow and dedicated coup/victory coverage).
  - Added explicit golden fixture update-policy comments near FITL fixture usage in determinism integration tests.
  - Strengthened turn-flow golden test to assert `operationPlusSpecialActivity` remains a legal opening option in the contracted fixture state.
- Deviations from original plan:
  - Did not force victory recomputation into the turn-flow golden fixture; preserved existing split where victory recomputation remains covered in dedicated FITL coup/victory tests.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-turn-flow-golden.test.js` passed.
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js` passed.
  - `node --test dist/test/integration/determinism-full.test.js` passed.
  - `node --test dist/test/integration/fitl-coup-victory.test.js` passed.
  - Determinism replay loop (20x) passed with no failures.
  - `npm test` passed.
