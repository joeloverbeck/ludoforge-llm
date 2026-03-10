# FITL-PLYMEI-001: Add regression coverage for Plei Mei shaded viability and chained free-operation sequencing

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — tests only in engine package
**Deps**: `tickets/README.md`, `tickets/_TEMPLATE.md`, `packages/engine/test/integration/fitl-events-plei-mei.test.ts`, `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`

## Problem

The current Plei Mei coverage validates the implemented happy paths, but it does not yet lock down two critical regressions:
- shaded event suppression when `requireUsableForEventPlay` has no legal outside-South-Vietnam March,
- generic parity between surfaced free-operation windows and the pending-grant sequence that produced them.

Those gaps make it easier for future engine refactors to reintroduce card-play admission bugs or sequence-window drift without tripping tests.

## Assumption Reassessment (2026-03-11)

1. Current `fitl-events-plei-mei.test.ts` already covers unshaded execution, shaded legal March, pending grant counts across the March then Attack/Ambush chain, illegal South Vietnam March origins at execution time, and legal Ambush outside the March destination.
2. Current `fitl-event-free-operation-grants.test.ts` already covers the generic architecture contract for ordered same-faction and cross-faction free-operation sequencing, plus generic `requireUsableForEventPlay` suppression for unusable grants.
3. The actual uncovered gap is narrower: Plei Mei still lacks a card-specific regression proving the shaded event is not even offered when its first required March would only be legal from South Vietnam, and its existing sequence assertions can be tightened to verify that only the sequence-ready action family is surfaced at each step.
4. The corrected scope remains tests only unless the new regression exposes a real engine defect.

## Architecture Check

1. Keeping generic sequencing coverage in `fitl-event-free-operation-grants.test.ts` is cleaner than duplicating the same contract in a FITL card test.
2. Plei Mei should still carry the card-specific viability regression because the outside-South-Vietnam origin restriction is encoded in FITL data and is easiest to understand when tested against the real card.
3. The tests preserve architecture boundaries: FITL-specific behavior stays in GameSpecDoc data, while assertions target generic engine surfaces such as event availability, pending grants, and surfaced free-operation windows.
4. No backwards-compatibility shims are introduced. The tests should describe the intended contract directly.

## What to Change

### 1. Add a shaded-event viability suppression regression

Add a Plei Mei test where the shaded event would only be legal if March from South Vietnam were allowed. Assert that the event move is not surfaced because `requireUsableForEventPlay` must respect the outside-South-Vietnam restriction before card play.

### 2. Tighten the existing Plei Mei sequence-window assertions

Extend the existing shaded-event test to assert that:
- both grants are pending immediately after the event,
- only the step-0 free March family is surfaced before the March resolves,
- the step-1 Attack/Ambush family appears only after the March resolves,
- the March family no longer remains surfaced once the sequence advances.

## Files to Touch

- `packages/engine/test/integration/fitl-events-plei-mei.test.ts` (modify)

## Out of Scope

- Further engine refactors beyond what is needed to satisfy the new regressions.
- Visual configuration or simulator UI work.
- Re-encoding unrelated FITL cards.

## Acceptance Criteria

### Tests That Must Pass

1. Plei Mei shaded event is suppressed when no legal outside-South-Vietnam March exists.
2. Plei Mei’s ordered required free-operation grants expose only the current sequence-ready move window at each step.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `requireUsableForEventPlay` must reject event moves when the first required free operation is illegal under the same grant constraints enforced at execution time.
2. Pending ordered grants may exist ahead of time, but legal free moves may only surface for sequence-ready steps.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-plei-mei.test.ts` — add shaded suppression and explicit sequence-window assertions for the real card.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/dist/test/integration/fitl-events-plei-mei.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-11
- What actually changed: narrowed the ticket scope to the real uncovered gap, added a Plei Mei regression that suppresses shaded play when only South Vietnam March origins exist, and tightened the existing Plei Mei sequencing assertions so only the sequence-ready free-operation window is surfaced at each step.
- Deviations from original plan: no generic `fitl-event-free-operation-grants.test.ts` changes were needed because that file already covered the architecture-level ordered-grant and `requireUsableForEventPlay` contracts. The final Plei Mei assertions also reflect legality-based surfacing: after the March, only legal follow-up actions surface in that board state.
- Verification results: `pnpm -F @ludoforge/engine build`, `node packages/engine/dist/test/integration/fitl-events-plei-mei.test.js`, `pnpm -F @ludoforge/engine lint`, and `pnpm -F @ludoforge/engine test` all passed.
