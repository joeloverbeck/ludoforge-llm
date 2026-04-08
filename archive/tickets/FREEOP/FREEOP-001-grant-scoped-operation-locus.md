# FREEOP-001: Reassess grant-scoped operation locus proposal

**Status**: ❌ REJECTED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: No
**Deps**: `data/games/fire-in-the-lake/41-content-event-decks.md`, `rules/fire-in-the-lake/fire-in-the-lake-rules-section-5.md`, `rules/fire-in-the-lake/fire-in-the-lake-rules-section-6.md`, `archive/tickets/FREEOP-001-grant-scoped-action-context.md`

## Problem Reassessment

This ticket proposed two new engine-level changes:

1. a first-class agnostic "operation locus" contract for exact-space free-operation authorization, and
2. an explicit authored/runtime contract for effect-issued sequence-batch identity.

After reassessing the current code and tests on 2026-03-10, the ticket's core assumption is no longer accurate. The present engine already models the intended card-56 behavior through a cleaner generic stack than the ticket assumed:

1. generic grant-scoped `executionContext` payloads are already available and exposed as `grantContext`,
2. exact-space follow-up legality is already enforced through generic `zoneFilter` plus `grantContext`,
3. move-zone capture/require sequencing is already validated and enforced through `sequenceContext`,
4. card 56 already has focused compile-shape and behavioral integration coverage proving exact-space follow-up enforcement.

The remaining asymmetry is narrower: declarative event grants get deterministic batch IDs during turn-flow extraction, while effect-issued grants still derive `sequenceBatchId` from runtime provenance (`grant.id` or `traceContext.effectPathRoot`) in `packages/engine/src/kernel/effects-turn-flow.ts`.

That gap does not justify the broader contract this ticket proposed.

## Assumption Reassessment (2026-03-10)

1. The active ticket was stale about the current engine surface. `executionContext` and `grantContext` already exist in shared free-operation contracts and runtime transport. Confirmed in `packages/engine/src/kernel/types-ast.ts`, `packages/engine/src/kernel/types-turn-flow.ts`, `packages/engine/src/kernel/effects-turn-flow.ts`, and `archive/tickets/FREEOP-001-grant-scoped-action-context.md`.
2. Card 56 is not limited to brittle generic move-param inference anymore. Its March grant captures selected spaces, threads them through `executionContext.selectedSpaces`, and constrains follow-up legality with `zoneFilter` against `grantContext.selectedSpaces`. Confirmed in `data/games/fire-in-the-lake/41-content-event-decks.md`, `packages/engine/test/integration/fitl-events-1965-nva.test.ts`, and `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts`.
3. The codebase already validates many sequence-context and overlap ambiguities for both declarative and effect-issued grants at GameDef validation time. Confirmed in `packages/engine/src/kernel/validate-gamedef-behavior.ts` and the corresponding validation tests.
4. The only still-plausible improvement is a smaller follow-up ticket focused strictly on making effect-issued batch identity explicit instead of provenance-derived. That is a different architectural problem from "operation locus".

## Architecture Decision

Reject the proposed engine change.

The proposed "operation locus" contract is not more beneficial than the current architecture:

1. It would push action-semantic concepts such as initiation-space, affected-space, or destination-space into shared kernel contracts, which is less agnostic and less extensible than the current generic `grantContext` plus authored `zoneFilter` model.
2. It would create a second way to express exact-space authorization even though the current architecture already expresses it cleanly and is covered by production FITL tests.
3. It would risk coupling free-operation authorization to engine knowledge of action pipeline semantics, which is the opposite of the repo's agnostic-engine rule.

If future work is needed, it should be a narrowly scoped ticket for explicit effect-issued batch identity only. It should not introduce a new locus abstraction unless the action system later gains a canonical, engine-wide notion of action-space roles.

## Corrected Scope

No implementation work should proceed under this ticket.

This ticket is closed because:

1. the broad proposal is no longer justified by the current architecture,
2. the intended card-56 behavior is already implemented and tested through the existing generic contracts,
3. any remaining improvement belongs in a new, smaller ticket with a different problem statement.

## Verification

Relevant current coverage for the rejected proposal:

1. `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts` already proves Monsoon March allowance, exact-space follow-up enforcement, and one-follow-up-per-marched-space behavior.
2. `packages/engine/test/integration/fitl-events-1965-nva.test.ts` already pins card-56 compile shape, including `executionContext`, `grantContext`, and sequence-context wiring.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` and `packages/engine/test/unit/validate-gamedef.test.ts` already cover sequence-context validation, overlap ambiguity, and effect-issued/declarative grant parity.

## Outcome

- Outcome amended: 2026-03-10
- Closure date: 2026-03-10
- What actually changed:
  - Reassessed the ticket against the current code and tests.
  - Closed the ticket without code changes because the proposed locus contract is not architecturally superior to the current generic free-operation model.
- Deviations from original plan:
  - No new engine contract was added.
  - No FITL data rewrites were needed.
  - The remaining possible improvement was narrowed to a separate future concern: explicit effect-issued batch identity.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/integration/fitl-events-vo-nguyen-giap.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-1965-nva.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
  - `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
