# FITLFOUINTTESANDTRA-003 - Event Card 82 and 27 Integration Coverage

**Status**: TODO  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-001`, `FITLFOUINTTESANDTRA-002`

## Goal
Add deterministic integration tests for representative campaign slices that execute cards 82 and 27 (both sides where applicable) through compiled FITL game specs.

## Implementation Tasks
1. Add/extend card-specific integration tests for card 82 and card 27 execution paths.
2. Cover both event sides where applicable and verify expected state deltas.
3. Ensure tests enter card windows via normal turn-flow mechanics.

## File list it expects to touch
- `test/integration/fitl-events-domino-theory.test.ts`
- `test/integration/fitl-events-phoenix-program.test.ts`
- `test/integration/fitl-card-lifecycle.test.ts`
- `test/fixtures/trace/fitl-events-initial-pack.golden.json` (only if fixture refresh is required)

## Out of scope
- Operation legality and limited-op matrix behavior not directly tied to event execution.
- Coup phase sequencing and victory recomputation.
- Generic determinism framework changes.
- Non-FITL regression additions.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-events-domino-theory.test.js`
- `node --test dist/test/integration/fitl-events-phoenix-program.test.js`
- `node --test dist/test/integration/fitl-card-lifecycle.test.js`

## Invariants that must remain true
- Event execution remains data-driven and routed through generic effect/runtime primitives.
- Same seed plus same move sequence yields identical event outcomes and trace ordering.
- Card lifecycle transitions remain valid before and after event execution.

