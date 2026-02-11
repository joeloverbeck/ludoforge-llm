# FITLEVEFRAANDINICARPAC-007 - Event Framework Integration and Trace Regression

**Status**: Proposed  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `FITLEVEFRAANDINICARPAC-006`

## Goal
Lock end-to-end behavior for the event framework and initial card pack with integration and trace regression tests in normal eligible-faction sequence execution.

## Scope
- Add integration tests where event cards execute inside normal turn-flow/eligibility sequencing.
- Add/refresh deterministic golden traces that capture side choice, branch choice, targets, skipped steps, and lasting-effect/eligibility deltas.
- Verify regression safety for compile+simulate canonical flow.

## Implementation tasks
1. Add scenario-driven integration test that fires one of the initial cards during normal eligible-faction play.
2. Add trace assertions for required event metadata fields and deterministic ordering.
3. Add/update golden trace fixture(s) for event-card execution.
4. Ensure integration coverage includes one partial-resolution trace path.

## File list it expects to touch
- `test/integration/fitl-card-flow-determinism.test.ts`
- `test/integration/fitl-turn-flow-golden.test.ts`
- `test/integration/game-loop.test.ts`
- `test/fixtures/trace/fitl-turn-flow.golden.json`
- `test/fixtures/trace/fitl-events-initial-pack.golden.json` (new)
- `schemas/Trace.schema.json`

## Out of scope
- Adding new generic runtime features not required for event-card integration.
- Expanding the FITL card pack beyond cards 82 and 27.
- CLI UX/reporting changes unrelated to trace content correctness.
- Performance tuning work.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-card-flow-determinism.test.js`
- `node --test dist/test/integration/fitl-turn-flow-golden.test.js`
- `node --test dist/test/integration/game-loop.test.js`
- `npm test`

### Invariants that must remain true
- Canonical execution path remains `GameSpecDoc` YAML -> `GameDef` -> simulation.
- Event execution traces include card id/title, side, branch, targets, and skipped-step reasons when applicable.
- Golden traces remain deterministic across repeated runs with same seed/input.
- No runtime dependency is introduced on filesystem FITL card files for execution.

