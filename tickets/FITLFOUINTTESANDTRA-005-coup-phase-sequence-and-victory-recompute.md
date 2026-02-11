# FITLFOUINTTESANDTRA-005 - Coup Phase Sequence and Victory Recompute Integration

**Status**: TODO  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-001`, `FITLFOUINTTESANDTRA-002`, `FITLFOUINTTESANDTRA-004`

## Goal
Add deterministic multi-step integration coverage for coup sequencing and victory metric recomputation after event/op/special activity execution windows.

## Implementation Tasks
1. Extend coup integration tests to assert phase ordering and phase-entry checkpoints.
2. Assert state deltas for support, opposition, control, resources, patronage, and trail across coup-related transitions.
3. Assert victory metric recomputation checkpoints and resulting values.

## File list it expects to touch
- `test/integration/fitl-coup-resources-phase.test.ts`
- `test/integration/fitl-coup-support-phase.test.ts`
- `test/integration/fitl-coup-redeploy-commit-reset.test.ts`
- `test/integration/fitl-coup-victory.test.ts`

## Out of scope
- New operation-profile primitives.
- Card 82/27 side-specific assertions unless needed to set up coup entry state.
- Golden trace fixture update policy mechanics.
- Architecture static audit assertions.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-coup-resources-phase.test.js`
- `node --test dist/test/integration/fitl-coup-support-phase.test.js`
- `node --test dist/test/integration/fitl-coup-redeploy-commit-reset.test.js`
- `node --test dist/test/integration/fitl-coup-victory.test.js`

## Invariants that must remain true
- Coup phase ordering is deterministic for non-choice paths.
- Victory recomputation is data-driven and stable for equivalent state snapshots.
- No FITL-specific branch logic is added to generic kernel/compiler execution paths.

