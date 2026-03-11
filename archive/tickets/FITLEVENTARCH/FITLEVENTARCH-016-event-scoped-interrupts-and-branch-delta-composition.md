# FITLEVENTARCH-016: Reassess Event-Scoped Interrupts and Branch Delta Composition for Card Mini-Phases

**Status**: ❌ REJECTED
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: No
**Deps**: tickets/README.md, archive/tickets/FITLEVENTARCH-006-event-target-canonical-payload-ownership.md, archive/tickets/GAMESPECDOC-004-binding-and-param-semantics-spec.md, data/games/fire-in-the-lake/30-rules-actions.md, data/games/fire-in-the-lake/41-events/033-064.md, packages/engine/src/kernel/effects-turn-flow.ts, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/test/integration/fitl-events-honolulu-conference.test.ts, packages/engine/test/unit/interrupt-phase-stack.test.ts

## Problem

This ticket originally assumed Honolulu Conference exposed a missing generic engine/runtime abstraction for event-scoped interrupts and branch-delta composition. That assumption is too broad for the current codebase. The actual code already has a generic interrupt stack, and the remaining Honolulu-specific duplication is confined to FITL-authored data plus one FITL-named interrupt/action bundle.

## Assumption Reassessment (2026-03-11)

1. Confirmed: interrupt push/pop is already generic engine behavior via `pushInterruptPhase` / `popInterruptPhase`, with dedicated unit coverage in `packages/engine/test/unit/interrupt-phase-stack.test.ts`.
2. Confirmed: event execution already generically supports branch-local effects; Honolulu's four branches are plain authored data, not a missing runtime feature.
3. Confirmed: `pushInterruptPhase` currently validates against globally declared phases in `turnStructure.interrupts`, and turn-flow logic, phase lookup, validation, and hashing all treat interrupt phases as predeclared turn-structure entities.
4. Confirmed: Honolulu is the only current FITL card using `honoluluPacify`, and existing integration/text-only tests already pin that exact authored shape.
5. Discrepancy: the original ticket treated a one-card data-shape annoyance as evidence for adding new engine DSL/runtime primitives. The codebase evidence does not justify that conclusion.

## Architecture Check

1. Adding event-scoped inline interrupts would not be a narrow cleanup. It would require redesign across phase declaration, action availability, validation, legal-move filtering, interrupt lookup, and state hashing because interrupts are currently canonical turn-structure objects, not event-local payload fragments.
2. Adding a new branch-delta composition primitive for a single 4-way matrix would increase authored DSL surface without demonstrated reuse. Current explicit branches are repetitive, but they are simple, transparent, and already covered by tests.
3. The cleaner long-term architecture, if repetition like this becomes common, is a broader event-composition design that introduces shared post-choice effects and localized action bundles together. Doing only a Honolulu-specific slice now would be premature and less robust than the current explicit representation.
4. No backwards-compatibility aliasing should be introduced. Since the proposed redesign is not a net architectural improvement today, the correct action is to reject it rather than half-adopt a narrower aliasing layer.

## Decision

Reject the proposed implementation in this ticket.

Keep the current Honolulu implementation unchanged for now:
- the existing generic interrupt stack remains the canonical engine mechanism,
- FITL may continue to declare reusable interrupt phases in shared rules data when a card needs a mini-phase,
- explicit event branches remain the canonical authored representation until multiple cards justify a broader event-composition contract.

## Files to Touch

- `tickets/FITLEVENTARCH-016-event-scoped-interrupts-and-branch-delta-composition.md` (modify)

## Out of Scope

- Engine/compiler/runtime changes for event-scoped inline interrupts.
- New event DSL for branch delta composition.
- Honolulu data rewrites done solely to reduce repetition.
- Renaming `honoluluPacify` unless a future broader FITL interrupt taxonomy ticket proves that change useful across multiple cards.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/interrupt-phase-stack.test.ts`
2. `packages/engine/test/integration/fitl-events-honolulu-conference.test.ts`
3. `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts`
4. `pnpm -F @ludoforge/engine lint`

### Invariants

1. Interrupt phases remain canonical `turnStructure.interrupts` entities.
2. Event-card branches remain explicit authored data unless and until a broader generic composition design is justified by multiple use cases.
3. No game-specific logic is added to engine/runtime to special-case Honolulu.

## Test Plan

### New/Modified Tests

1. None. Existing coverage already exercises the generic interrupt stack and Honolulu's authored/runtime behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/interrupt-phase-stack.test.js`
3. `node --test dist/test/integration/fitl-events-honolulu-conference.test.js`
4. `node --test dist/test/integration/fitl-events-text-only-behavior-backfill.test.js`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-11
- What actually changed:
  - Reassessed the ticket against the current engine/runtime/event architecture and corrected its assumptions.
  - Rejected the proposed engine/compiler/runtime redesign as not more beneficial than the current architecture at this time.
  - Kept implementation scope at ticket correction plus verification only.
- Deviations from original plan:
  - No engine, schema, FITL data, or test code changes were implemented.
  - The original proposal was closed instead of executed because the current generic interrupt mechanism already exists and the remaining duplication does not justify new DSL/runtime surface.
- Verification results:
  - `pnpm -F @ludoforge/engine build` (pass)
  - `node --test dist/test/unit/interrupt-phase-stack.test.js` (pass)
  - `node --test dist/test/integration/fitl-events-honolulu-conference.test.js` (pass)
  - `node --test dist/test/integration/fitl-events-text-only-behavior-backfill.test.js` (pass)
  - `pnpm -F @ludoforge/engine test` (pass)
  - `pnpm -F @ludoforge/engine lint` (pass with pre-existing warnings only)
