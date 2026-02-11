# FITLFOUINTTESANDTRA-003 - Event Card 82 and 27 Integration Coverage

**Status**: ✅ COMPLETED  
**Spec**: `specs/21-fitl-foundation-integration-tests-and-traces.md`  
**Depends on**: `FITLFOUINTTESANDTRA-001`, `FITLFOUINTTESANDTRA-002`

## Goal
Add deterministic integration coverage for cards 82 and 27 payloads (both sides where applicable) through compiled FITL specs, while validating turn-flow card-window lifecycle behavior in existing runtime integration tests.

## Assumption Reassessment (updated)
- `test/fixtures/cnl/compiler/fitl-events-initial-card-pack.md` is a compiler-path fixture and currently defines only a `pass` action; it does not define executable event/operation actions or operation profiles.
- Given the fixture shape above, `fitl-events-domino-theory` and `fitl-events-phoenix-program` can validate compiled event-card payload lowering/deterministic ordering, but cannot directly execute card effects via `applyMove`.
- Runtime turn-flow card-window mechanics are already covered in `test/integration/fitl-card-lifecycle.test.ts`, which remains the appropriate integration surface in this ticket for lifecycle assertions.
- Full campaign-slice execution that combines event + operation/special activity + coup/victory recomputation is covered by later Spec 21 tickets (`-004`, `-005`, `-006`) and is out of scope for this ticket.

## Implementation Tasks
1. Add/extend card-specific integration tests for cards 82 and 27 compiler-lowered payloads, including deterministic card/branch ordering and side payload invariants.
2. Keep/confirm both event sides are covered in integration assertions for each card payload.
3. Keep/confirm normal turn-flow card-window lifecycle coverage via `fitl-card-lifecycle` integration tests.

## File list it expects to touch
- `test/integration/fitl-events-domino-theory.test.ts`
- `test/integration/fitl-events-phoenix-program.test.ts`
- `test/integration/fitl-card-lifecycle.test.ts`
- `tickets/FITLFOUINTTESANDTRA-003-event-cards-82-and-27-integration.md`

## Out of scope
- Operation legality and limited-op matrix behavior.
- Direct runtime execution of card 82/27 effects through this compiler fixture (fixture currently has no executable event action path).
- Coup phase sequencing and victory recomputation.
- Golden trace refresh/generation work.
- Non-FITL regression additions.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/integration/fitl-events-domino-theory.test.js`
- `node --test dist/test/integration/fitl-events-phoenix-program.test.js`
- `node --test dist/test/integration/fitl-card-lifecycle.test.js`
- `npm test`

## Invariants that must remain true
- Event-card payload lowering remains deterministic and data-driven from YAML assets.
- Compiler-path event fixtures stay runtime-independent from `data/fitl/...` filesystem assets.
- Card lifecycle transitions remain valid before and after turn-flow lifecycle steps.

## Outcome
- Completion date: 2026-02-11
- What changed:
  - Reassessed and corrected ticket assumptions/scope to match current fixture/runtime reality.
  - Strengthened event integration tests for cards 82 and 27 with additional deterministic compiler-path assertions.
  - Confirmed turn-flow lifecycle coverage remains in `fitl-card-lifecycle` integration tests.
- Deviations from original plan:
  - Did not implement direct runtime execution of cards 82/27 from `fitl-events-initial-card-pack.md` because the fixture intentionally defines compiler-path event-card payload data plus only a `pass` action (no executable event action/profile path).
  - Scoped this ticket to deterministic payload-lowering and lifecycle integration checks; campaign-slice runtime execution remains in later Spec 21 tickets.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/integration/fitl-events-domino-theory.test.js` passed.
  - `node --test dist/test/integration/fitl-events-phoenix-program.test.js` passed.
  - `node --test dist/test/integration/fitl-card-lifecycle.test.js` passed.
  - `npm test` passed.
