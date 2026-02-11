# FITLFOUINTTESANDTRA-006 - Golden Trace Contracts and Determinism Gate

**Status**: TODO  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-003`, `FITLFOUINTTESANDTRA-004`, `FITLFOUINTTESANDTRA-005`

## Goal
Establish and enforce FITL golden `GameTrace` fixtures for representative foundation flows, including a deterministic replay gate and explicit fixture-update policy.

## Implementation Tasks
1. Add at least one golden trace fixture containing event execution, op+special activity, coup updates, and victory recomputation.
2. Add integration checks for byte-identical replay under same seed and move sequence.
3. Document and enforce trace fixture update policy in test assertions or comments near fixture usage.

## File list it expects to touch
- `test/integration/fitl-turn-flow-golden.test.ts`
- `test/integration/fitl-card-flow-determinism.test.ts`
- `test/integration/determinism-full.test.ts`
- `test/fixtures/trace/fitl-turn-flow.golden.json`
- `test/fixtures/trace/fitl-foundation-initial-state.golden.json` (optional if scenario baseline changes)

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
- Repeat deterministic target 20 times with byte-identical trace output

## Invariants that must remain true
- Same seed and identical move inputs produce byte-identical trace artifacts.
- Golden fixtures are intentional contracts, not opportunistic snapshots.
- Trace emission order remains stable and deterministic for non-choice execution paths.

