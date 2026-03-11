# FITLEVENTARCH-017: Canonical FITL Event Branch Deduplication for Recurring Choice Matrices

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No — reassessment indicates the current engine/event architecture should remain unchanged for this ticket
**Deps**: tickets/README.md, archive/tickets/FITLEVENTARCH/FITLEVENTARCH-016-event-scoped-interrupts-and-branch-delta-composition.md, archive/tickets/FITLEVENTARCH-006-event-target-canonical-payload-ownership.md, archive/tickets/GAMESPECDOC-004-binding-and-param-semantics-spec.md, data/games/fire-in-the-lake/41-events/001-032.md, data/games/fire-in-the-lake/41-events/033-064.md, data/games/fire-in-the-lake/41-events/097-130.md

## Problem

Fire in the Lake event data contains some repeated branch authoring, but the important architecture question is whether that repetition is one coherent generic problem worth solving in engine/schema/compiler surfaces. If the repeated cards are actually different composition families, adding a new canonical branch DSL would increase long-term surface area without improving the core event architecture.

## Assumption Reassessment (2026-03-11)

1. Confirmed: the exact Honolulu pattern does not recur broadly. In current `data/games/*`, authored `pushInterruptPhase` appears only 5 times total, with 4 of those in Honolulu and 1 shared `commitment` interrupt on Great Society.
2. Confirmed: recurring duplicated branch matrices do exist in FITL event data even when no interrupt is involved. Current concrete candidates include card 43, card 50, card 63, card 64, and card 97.
3. Confirmed: these repetitions are authored-data duplication, not a missing runtime interrupt abstraction. The generic interrupt stack already exists and is not in scope here.
4. Confirmed: the ticket originally understated current test coverage. The live suite already contains focused integration coverage for `card-43`, `card-50`, `card-63`, `card-64`, and `card-97`, plus broader production-compilation/backfill coverage.
5. Mismatch correction: this ticket must not revisit event-scoped interrupts. Scope is limited to deciding whether current recurring branch duplication justifies a generic canonical authoring contract. The answer from reassessment is no.

## Architecture Check

1. The current candidate cards do not collapse into one shared abstraction:
   - `card-64` is a 2x2 cartesian delta matrix with a shared conditional interrupt tail.
   - `card-63` shaded and `card-97` unshaded each repeat a shared effect/target block with one varying tail delta.
   - `card-50` repeats branch-local `freeOperationGrants`, which is a grant-issuance reuse problem rather than a generic branch-delta problem.
   - `card-43` is explicit enough that a new composition layer would mostly compress YAML, not improve semantics.
2. The existing architecture is already clean on the execution side: `EventSideDef` and `EventBranchDef` carry explicit `effects`, `targets`, `freeOperationGrants`, `eligibilityOverrides`, and `lastingEffects`, with schema, compile, cross-validation, and behavior validation all aligned around that explicit shape.
3. Introducing a new canonical branch-composition contract now would either:
   - encode only one of the above families and become a narrow one-off abstraction, or
   - generalize across all of them with a more complex inheritance/composition surface that would be harder to validate, reason about, and evolve than today's explicit branches.
4. Decision: keep the current explicit event-side/branch architecture. Do not add aliasing, inheritance, shared-branch payload contracts, or event-side branch-composition DSL in this ticket.

## Decision

This ticket is a completed architecture review with no engine, schema, compiler, or FITL data migration changes.

The durable design choice is to preserve explicit event branch authoring until repeated cards converge on one genuinely shared generic composition model. If such convergence happens later, the ideal shape would need to improve semantics and validation for multiple cards at once, not merely shorten YAML.

## What to Change

### 1. Reassess the candidate cards against the live codebase

Document the concrete families in current FITL events:
- cartesian delta matrix with shared tail (`card-64`),
- shared target/effect block with a varying terminal delta (`card-63` shaded, `card-97` unshaded),
- repeated branch-local free-operation grants (`card-50`),
- plain explicit alternatives with limited payoff from abstraction (`card-43`).

### 2. Record the architecture decision

Update this ticket to state that no canonical branch-composition contract should be introduced now because the candidate cards do not represent one coherent reusable abstraction.

### 3. Verify the current architecture instead of migrating data

Run the existing relevant tests and lint/check commands to confirm the explicit branch model remains correct and adequately covered.

## Files to Touch

- `tickets/FITLEVENTARCH-017-canonical-fitl-event-branch-deduplication.md`

## Out of Scope

- Event-scoped interrupt or subphase architecture.
- Changing the generic interrupt stack mechanism.
- One-off YAML cleanup for a single card with no broader canonical payoff.
- Adding a branch-composition DSL that only compresses YAML while weakening explicitness.
- Game-specific engine branching for Fire in the Lake card IDs or faction semantics.

## Acceptance Criteria

### Tests That Must Pass

1. This ticket documents why the current explicit branch architecture is retained and why no generic canonical branch-composition contract is introduced.
2. Existing targeted FITL event coverage for `card-43`, `card-50`, `card-63`, `card-64`, and `card-97` remains green.
3. Existing suite: `pnpm -F @ludoforge/engine lint`
4. `pnpm run check:ticket-deps`

### Invariants

1. Game-specific values and follow-up behavior remain authored in `GameSpecDoc` data, not hardcoded in engine/runtime.
2. Any new branch-composition surface remains generic and does not encode FITL resources, factions, or event IDs.
3. No event-scoped interrupt declaration mechanism is introduced by this ticket.
4. No aliasing or fallback dual-shape contract is added merely to deduplicate a few authored branches.

## Test Plan

### New/Modified Tests

1. None planned. Reassessment found the architecture decision is to keep the current explicit branch model, and the relevant cards already have focused integration coverage.

### Commands

1. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-economic-aid.test.ts`
2. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-uncle-ho.test.ts`
3. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-fact-finding.test.ts`
4. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-honolulu-conference.test.ts`
5. `pnpm -F @ludoforge/engine test -- test/integration/fitl-events-brinks-hotel.test.ts`
6. `pnpm -F @ludoforge/engine lint`
7. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-11
- What actually changed: corrected the ticket assumptions and scope after validating the live FITL data, compiler/schema/runtime architecture, and existing test coverage; recorded a no-engine-change architecture decision.
- Deviation from original plan: did not add a canonical branch-composition contract, did not migrate FITL cards, and did not add tests because the candidate cards do not share one durable abstraction and the relevant integration coverage already exists.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-economic-aid.test.js packages/engine/dist/test/integration/fitl-events-uncle-ho.test.js packages/engine/dist/test/integration/fitl-events-fact-finding.test.js packages/engine/dist/test/integration/fitl-events-honolulu-conference.test.js packages/engine/dist/test/integration/fitl-events-brinks-hotel.test.js` passed.
  - `pnpm -F @ludoforge/engine lint` passed with pre-existing warnings only.
  - `pnpm run check:ticket-deps` passed.
