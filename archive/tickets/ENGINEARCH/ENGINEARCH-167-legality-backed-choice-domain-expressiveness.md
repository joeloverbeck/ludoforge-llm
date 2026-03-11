# ENGINEARCH-167: Verify existing dependent chooseN legality propagation

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No — current runtime already satisfies the intended architecture; this ticket hardens coverage and closes stale assumptions
**Deps**: archive/tickets/FITLEVECARENC-022-enable-dependent-target-selectors-in-event-card-compilation.md, archive/tickets/ENG-220-align-event-target-selector-validation-with-canonical-choice-contracts.md

## Problem

This ticket was created under the assumption that the engine could not mark dependent `chooseN` source options illegal from downstream destination satisfiability. That assumption is incorrect.

Direct runtime verification against current `legalChoicesEvaluate()` shows the engine already marks an out-of-play US Base illegal at the card-65 source-choice step when every map space is Base-full and the Base therefore has zero legal destinations. The real gap is missing regression coverage and stale ticket scope, not missing engine architecture.

## Assumption Reassessment (2026-03-11)

1. The current compiler/query stack already supports the declarative downstream legality needed by card-65: destination queries express map-space legality, and the event data lowers and executes correctly.
2. The current runtime already propagates downstream satisfiability back into pending `chooseN` option legality for this pattern.
3. The actual discrepancy is in ticket/test coverage: no direct unit or production regression currently proves that dependent-source illegality remains enforced for card-65-style flows.

## Architecture Check

1. Adding a new existential source-domain/query DSL would be strictly worse than the current architecture. It would duplicate downstream legality intent in authoring and spread the same rule across more surfaces.
2. The existing architecture is the correct one: `GameSpecDoc` declares the dependent flow, and the kernel derives source-option legality from downstream satisfiability.
3. The right action is to codify that behavior with regression coverage and retire the stale ticket scope.

## What to Change

### 1. Add a generic unit regression

Cover a `chooseN` flow whose source-option legality depends on a later dependent destination choice so the existing runtime behavior is locked in explicitly.

### 2. Add a production integration regression

Add a card-65 test that constructs a state where an out-of-play US Base has zero legal destinations and assert that the Base is illegal at the source-choice step while deliverable US pieces remain legal.

### 3. Update dependent ticket assumptions

Adjust downstream ticket references so they no longer treat this ticket as a pending engine capability gap.

## Files to Touch

- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-international-forces.test.ts` (modify)
- `tickets/FITLEVECARENC-025-card-65-remove-engine-workarounds.md` (modify)

## Out of Scope

- Engine/kernel/compiler changes
- Reworking card-65 data in this ticket
- Introducing new query/filter AST syntax for existential source-option tests
- UI changes to how large option domains are displayed

## Acceptance Criteria

### Tests That Must Pass

1. A generic unit regression proves the current runtime marks a `chooseN` option illegal when every continuation containing that option is unsatisfiable because a later dependent destination choice is empty.
2. Card-65 unshaded marks an undeliverable out-of-play US Base illegal at the source-choice step while leaving deliverable pieces legal.
3. Dependent tickets no longer describe this capability as missing.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Source-option legality stays game-agnostic and is derived from the canonical downstream effect flow, not duplicated in authoring.
2. No new runtime or compiler branch is introduced.
3. The ticket closes by verifying the current architecture, not by replacing it.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — generic dependent `chooseN` source option becomes illegal when all downstream continuations containing it are unsatisfiable.
2. `packages/engine/test/integration/fitl-events-international-forces.test.ts` — card-65 unshaded marks undeliverable Bases illegal at the source-choice step.
3. `tickets/FITLEVECARENC-025-card-65-remove-engine-workarounds.md` — dependency/assumption wording reflects that this capability already exists.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js packages/engine/dist/test/integration/fitl-events-international-forces.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-11
- What actually changed:
  - Confirmed the current legality architecture already handles dependent `chooseN` source-option illegality for card-65-style flows.
  - Added a generic kernel regression in `packages/engine/test/unit/kernel/legal-choices.test.ts`.
  - Added a production regression in `packages/engine/test/integration/fitl-events-international-forces.test.ts`.
  - Updated dependent ticket assumptions in `tickets/FITLEVECARENC-025-card-65-remove-engine-workarounds.md`.
- Deviations from original plan:
  - No engine/compiler/query implementation was needed.
  - The ticket was closed as a stale-architecture correction plus coverage backfill, not as a new capability delivery.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js packages/engine/dist/test/integration/fitl-events-international-forces.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint` completed with existing warnings and no errors
  - `pnpm run check:ticket-deps`
