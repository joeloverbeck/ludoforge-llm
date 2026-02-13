# ARCDECANDGEN-021: Event Deck Kernel Execution

**Status**: ✅ COMPLETED
**Phase**: 8B (Generic Event Deck Subsystem — kernel)
**Priority**: P2
**Complexity**: L
**Dependencies**: ARCDECANDGEN-020 (event deck types)
**Reference**: `specs/32-architecture-decomposition-and-generalization.md` (Problem 8, generic event subsystem execution)

## Goal (Corrected)

Reassess and correct this ticket so its assumptions match the current architecture and tests, then narrow scope to the remaining architectural gaps only.

## Reassessed Assumptions vs Current Code

1. The proposed new module/file path is incorrect.
- `src/kernel/event-execution.ts` does not exist.
- Runtime execution is implemented in:
  - `src/kernel/apply-move.ts` (`activateEventLastingEffects` integration point)
  - `src/kernel/event-lasting-effects.ts` (activation + expiry)
  - `src/kernel/phase-advance.ts` (boundary-driven expiry dispatch)

2. The planned standalone event execution pipeline is not how the engine currently executes events.
- Side/branch selection is currently encoded by action parameters and regular action effects.
- Lasting effects are a focused runtime layer, not a full draw/applicability/targeting engine in one module.

3. `activeLastingEffects` initialization assumption is incorrect.
- `GameState.activeLastingEffects` is optional and omitted when empty.
- `initialState` does not initialize `activeLastingEffects: []`, and `event-lasting-effects` intentionally removes the field when empty.

4. Zobrist hashing assumption is incorrect.
- `src/kernel/zobrist.ts` does not hash `activeLastingEffects`.
- Existing deterministic/hash tests do not assert lasting-effect-state hash participation.

5. Test file/path assumptions are outdated.
- There is no `test/unit/event-deck.test.ts`.
- Coverage exists in:
  - `test/unit/apply-move.test.ts`
  - `test/unit/phase-advance.test.ts`
  - `test/integration/fitl-events-domino-theory.test.ts`
  - `test/integration/fitl-events-phoenix-program.test.ts`

## Architecture Reassessment

Are the originally proposed changes more beneficial than current architecture? **Partially yes, with scope correction.**

Beneficial and aligned with Spec 32:
- Consolidating event semantics behind a single generic event execution boundary would improve cohesion and extensibility.
- Explicit invariants for lasting-effect lifecycle and deterministic hashing are valuable for long-term robustness.

Not beneficial as originally written:
- Forcing `activeLastingEffects` to always be `[]` is not inherently better than optional omission and creates extra state churn unless the project standardizes on non-optional collections globally.
- Introducing a new `event-execution.ts` while behavior already spans apply/advance flows risks duplication unless it replaces existing wiring, not aliases it.

Architectural concern observed:
- Event behavior is still partially coupled to `turnOrder.type === 'cardDriven'` resolution paths in `event-lasting-effects.ts`. This is a known extensibility pressure point relative to Spec 32's generic-kernel direction and should be addressed in a dedicated follow-up ticket.

## Updated Scope

### In Scope

1. Correct this ticket to reflect implemented architecture and test locations.
2. Preserve completed behavior as implemented:
- lasting-effect activation on event-class moves
- deterministic expiry at turn-flow boundaries
- teardown execution prior to removal
3. Identify remaining follow-up architecture work rather than duplicating existing implementation.

### Out of Scope

1. Rewriting event execution into a new file purely for naming parity.
2. Forcing `activeLastingEffects: []` initialization policy change in this ticket.
3. Backfilling Zobrist lasting-effect hashing without a dedicated determinism contract ticket.
4. Compiler/CNL changes.

## Corrected Acceptance Criteria

1. Ticket assumptions and file list match the real codebase.
2. Existing event lasting-effect activation/expiry tests remain green.
3. Integration event fixtures for FITL cards remain green.
4. `npm run typecheck` passes.
5. Relevant unit/integration suites pass.

## Verification Run for This Reassessment

- `npm run typecheck` passed.
- `npm run test:unit -- --coverage=false --test-name-pattern "lasting effects|event"` passed.
- `npm run test:integration -- --coverage=false --test-name-pattern "fitl-events"` passed.

## Outcome

**Completed on**: 2026-02-13

What was actually changed vs originally planned:
- Replaced stale implementation plan (new `event-execution.ts`, `event-deck.test.ts`, forced `activeLastingEffects: []`) with corrected architecture assumptions.
- Narrowed scope to reassessment/documentation fidelity and explicit follow-up boundaries.
- Captured the key remaining architecture risk: card-driven coupling in lasting-effect resolution.

What was intentionally not changed:
- No runtime code changes.
- No API aliasing/back-compat layers.
- No speculative refactor that would duplicate existing execution paths.
