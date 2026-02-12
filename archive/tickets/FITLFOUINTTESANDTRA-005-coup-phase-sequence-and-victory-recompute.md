# FITLFOUINTTESANDTRA-005 - Coup Phase Sequence and Victory Recompute Integration

**Status**: ✅ COMPLETED  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-001`, `FITLFOUINTTESANDTRA-002`, `FITLFOUINTTESANDTRA-004`

## Goal
Add deterministic multi-step integration coverage for coup sequencing and victory metric recomputation after event/op/special activity execution windows.

## Reassessed assumptions and scope (2026-02-12)
- The expected test files already exist and already cover deterministic state-delta checkpoints for resources, support/agitation budgets, redeploy/commitment/reset outcomes, and during/final-coup victory recomputation.
- No engine/kernel bug was observed from this ticket's acceptance commands; all listed tests are currently green.
- Remaining gap versus Goal Task 1 is explicit phase-enter trigger ordering assertions across the redeploy -> commitment -> reset sequence.
- Scope is narrowed to minimal test-only updates in existing coup integration coverage; no runtime/compiler API or behavior changes are required.

## Implementation Tasks
1. Extend coup integration tests to assert phase ordering and phase-entry checkpoints.
2. Assert state deltas for support, opposition, control, resources, patronage, and trail across coup-related transitions.
3. Assert victory metric recomputation checkpoints and resulting values.

## File list it expects to touch
- `test/integration/fitl-coup-redeploy-commit-reset.test.ts`
- `tickets/FITLFOUINTTESANDTRA-005-coup-phase-sequence-and-victory-recompute.md`

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

## Outcome
- **Completion date**: 2026-02-12
- **What changed**:
- Reassessed ticket assumptions against current tests and narrowed scope to the only uncovered checkpoint: explicit phase-enter trigger ordering across redeploy -> commitment -> reset.
- Added deterministic trigger-order assertions in `test/integration/fitl-coup-redeploy-commit-reset.test.ts`.
- **Deviation from original plan**:
- Original task list implied broader extensions across all four coup files; reassessment showed those areas were already covered, so no runtime/compiler changes and no broad test rewrites were necessary.
- **Verification results**:
- `npm run build` passed.
- `node --test dist/test/integration/fitl-coup-resources-phase.test.js` passed.
- `node --test dist/test/integration/fitl-coup-support-phase.test.js` passed.
- `node --test dist/test/integration/fitl-coup-redeploy-commit-reset.test.js` passed.
- `node --test dist/test/integration/fitl-coup-victory.test.js` passed.
- `npm run test:integration -- --test-name-pattern='FITL coup'` passed.
