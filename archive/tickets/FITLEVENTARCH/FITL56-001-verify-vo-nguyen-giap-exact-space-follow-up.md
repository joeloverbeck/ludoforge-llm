# FITL56-001: Verify and close Vo Nguyen Giap exact-space follow-up encoding

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No — current generic `grantContext` plus explicit `sequence.batch` already provides the right agnostic contract
**Deps**: `data/games/fire-in-the-lake/41-content-event-decks.md`, `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts`, `packages/engine/test/integration/fitl-events-1965-nva.test.ts`, `archive/tickets/FREEOP/FREEOP-001-grant-scoped-operation-locus.md`, `archive/tickets/FREEOP-001-grant-scoped-action-context.md`

## Problem

This ticket originally assumed card 56 still needed to be reworked onto a future engine-level "grant-locus" contract. That assumption is now stale.

The current code already encodes card 56 shaded on the cleaner long-term generic model:

1. the free March is constrained to the selected event spaces through grant-scoped `executionContext` and `zoneFilter`,
2. follow-up grants are issued per selected space,
3. the follow-up authorization is tied to the marched-space batch through `sequenceContext`,
4. the authored sequence contract now uses explicit `sequence.batch` rather than the older overloaded `sequence.chain`.

The remaining useful work for this ticket is therefore not another FITL data rewrite. It is to verify that the current architecture is the right one, strengthen the focused regression surface, and close the ticket.

## Assumption Reassessment (2026-03-10)

1. The proposed new "grant-locus" contract was rejected in `archive/tickets/FREEOP/FREEOP-001-grant-scoped-operation-locus.md` because it would push action-semantic space roles into the kernel and would be less agnostic than the current generic model.
2. Card 56 shaded already uses `executionContext.selectedSpaces`, `grantContext.selectedSpaces`, authored `zoneFilter`, and `sequenceContext` to enforce exact-space follow-up behavior in `data/games/fire-in-the-lake/41-content-event-decks.md`.
3. The dedicated compile-shape and runtime suites already cover the core Rally path and Monsoon March allowance.
4. The missing high-signal regression was one deterministic non-Rally follow-up path, to prove the current generic model is not Rally-specific.

## Architecture Check

1. The current architecture is better than the original ticket proposal. Exact-space follow-up behavior is encoded entirely in GameSpecDoc data through generic free-operation surfaces rather than through engine knowledge of "locus" semantics.
2. The recent `sequence.batch` rename is also cleaner than the earlier `sequence.chain` contract because it separates authored batch identity from unrelated concepts and leaves runtime issuance isolation as an engine-owned concern.
3. No additional FITL-specific engine logic is justified here. Card 56 should remain a data-authored consumer of the generic free-operation system.

## What Changed

### 1. Keep the current card-56 data model

No further production data rewrite was needed beyond the already-landed canonical sequence contract update to `sequence.batch`.

### 2. Strengthen focused behavior coverage

Added a dedicated card-56 regression proving that, after the free March, the shaded event can execute an exact-space free `Attack` follow-up, not just `Rally`.

This closes the main remaining confidence gap in the ticket's original acceptance criteria.

## Files Touched

- `tickets/FITL56-001-rework-vo-nguyen-giap-on-locus-contract.md` (modify)
- `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts` (modify)

## Out of Scope

- Introducing a new engine-level locus contract.
- Reworking unrelated FITL events.
- Adding FITL-specific branches to GameDef or simulator code.

## Acceptance Criteria

### Tests That Must Pass

1. Card 56 shaded remains encoded on the generic free-operation model using authored grant context, zone filters, and sequence batching.
2. Focused card-56 tests prove:
   - Monsoon March allowance,
   - exact-space follow-up enforcement,
   - one follow-up per marched space,
   - at least one deterministic non-Rally follow-up path.
3. `pnpm -F @ludoforge/engine build`
4. `node packages/engine/dist/test/integration/fitl-events-vo-nguyen-giap.test.js`
5. `node packages/engine/dist/test/integration/fitl-events-1965-nva.test.js`
6. `pnpm turbo lint`
7. `pnpm run check:ticket-deps`

### Invariants

1. Card-56 behavior remains fully data-authored in GameSpecDoc.
2. GameDef and simulator remain game-agnostic.
3. No legacy `sequence.chain` authoring path remains active for free-operation sequences.

## Tests

1. Keep the compile-shape assertions in `packages/engine/test/integration/fitl-events-1965-nva.test.ts` that pin card 56 to the current generic declarative form.
2. Extend `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts` with a non-Rally exact-space follow-up regression using free `Attack`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-vo-nguyen-giap.test.ts` — add deterministic free `Attack` follow-up coverage so card 56 proves the exact-space model works beyond Rally.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/fitl-events-vo-nguyen-giap.test.js`
3. `node packages/engine/dist/test/integration/fitl-events-1965-nva.test.js`
4. `pnpm turbo lint`
5. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-10
- What actually changed:
  - Rewrote the ticket so its assumptions match the current architecture instead of the rejected "grant-locus" proposal.
  - Kept card 56 on the current generic free-operation model.
  - Added focused runtime coverage for a non-Rally exact-space free `Attack` follow-up.
- Deviations from original plan:
  - No new engine contract was added.
  - No further FITL card-data rewrite was needed beyond the already-landed canonical `sequence.batch` authoring change.
  - The ticket closed as a verification-and-hardening pass, not as a new architecture rollout.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/integration/fitl-events-vo-nguyen-giap.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-1965-nva.test.js`
  - `pnpm turbo lint`
  - `pnpm run check:ticket-deps`
