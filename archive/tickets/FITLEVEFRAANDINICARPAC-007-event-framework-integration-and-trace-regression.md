# FITLEVEFRAANDINICARPAC-007 - Event Framework Integration and Trace Regression

**Status**: ✅ COMPLETED  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `FITLEVEFRAANDINICARPAC-006`

## Goal
Lock end-to-end behavior for the event framework and initial card pack with integration and trace regression tests in normal eligible-faction sequence execution.

## Reassessed assumptions (2026-02-11)
- Runtime event-card payloads are compiled into `GameDef.eventCards`, but direct execution still flows through declared `event` actions/params and generic effect paths.
- Existing coverage already validates card-pack compilation (`fitl-events-domino-theory`, `fitl-events-phoenix-program`) and generic determinism paths, so this ticket should focus on runtime trace/regression behavior when events execute in turn-flow sequencing.
- `src/kernel/schemas.ts` already allows `turnFlowLifecycle` and `turnFlowEligibility` trace entries plus `turnFlow` in serialized state, but `schemas/Trace.schema.json` is behind that runtime contract and must be aligned.
- The original expected file list included `test/integration/game-loop.test.ts`; current regression risk is in FITL/event trace coverage and schema artifact parity, not generic game-loop progression logic.

## Scope
- Add integration tests where event cards execute inside normal turn-flow/eligibility sequencing.
- Add/refresh deterministic golden traces that capture side choice, branch choice, targets, skipped steps, and lasting-effect/eligibility deltas.
- Verify regression safety for compile+simulate canonical flow.

## Implementation tasks
1. Add scenario-driven integration test that executes initial-pack-shaped `event` selections during normal eligible-faction play.
2. Add trace assertions for required event metadata fields and deterministic ordering.
3. Add/update golden trace fixture(s) for event-card execution.
4. Ensure integration coverage includes one partial-resolution trace path.

## File list it expects to touch
- `test/integration/fitl-card-flow-determinism.test.ts`
- `test/fixtures/trace/fitl-events-initial-pack.golden.json` (new)
- `schemas/Trace.schema.json`
- `test/unit/json-schema.test.ts`

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
- Event execution traces include selected side/branch/target metadata and skipped-step reasons where partial execution occurs.
- Golden traces remain deterministic across repeated runs with same seed/input.
- No runtime dependency is introduced on filesystem FITL card files for execution.

## Outcome
- Completion date: 2026-02-11.
- What changed:
  - Added an integration regression in `test/integration/fitl-card-flow-determinism.test.ts` that executes a turn-flow `event` move with deterministic side/branch/target selections, verifies eligibility override sequencing, and locks a partial-resolution (`operationPartial`) trace path.
  - Added `test/fixtures/trace/fitl-events-initial-pack.golden.json` to lock deterministic legal-move ordering, selected move metadata, trigger trace ordering, and post-state turn-flow deltas.
  - Aligned `schemas/Trace.schema.json` with the runtime trace contract by adding `turnFlowLifecycle` and `turnFlowEligibility` trace entries and serialized `turnFlow` runtime state.
  - Strengthened `test/unit/json-schema.test.ts` with a known-good serialized trace containing turn-flow trace entries/state to prevent schema drift regressions.
- Deviations from original plan:
  - Did not modify `test/integration/fitl-turn-flow-golden.test.ts` or `test/integration/game-loop.test.ts`; existing coverage there already passed and was not the active regression surface.
  - Runtime still executes generic `event` action params rather than directly executing `GameDef.eventCards` objects by card id.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-card-flow-determinism.test.js` passed.
  - `node --test dist/test/integration/fitl-turn-flow-golden.test.js` passed.
  - `node --test dist/test/integration/game-loop.test.js` passed.
  - `node --test dist/test/unit/json-schema.test.js` passed.
  - Hard test: `npm test` passed.
