# FITLEVENT-069: Rework MACV to full rule-5.1.3 fidelity after sequence-batch redesign

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None directly in this ticket — blocked on `tickets/FREEOP-002-partially-implementable-sequence-batches.md`
**Deps**: `tickets/README.md`, `tickets/FREEOP-002-partially-implementable-sequence-batches.md`, `reports/fire-in-the-lake-rules-section-5.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `packages/engine/test/integration/fitl-events-macv.test.ts`

## Problem

Card 69 ("MACV") is now authored with generic ordered free Special Activity branches and tested for the normal `US -> ARVN` and `NVA -> VC` paths. However, it is not yet fully implemented to the minute details of rule 5.1.3 because the engine cannot currently continue an ordered grant pair when the first faction has no usable Special Activity but the second faction does.

This follow-up ticket exists so the card is revisited and tightened immediately after the generic engine redesign lands. The card should not remain "good enough" once the missing kernel capability exists.

## Assumption Reassessment (2026-03-12)

1. Current card data already uses a generic branch-based authoring shape with ordered free `specialActivity` grants and an active-seat remain-eligible override. Confirmed in `data/games/fire-in-the-lake/41-events/065-096.md`.
2. Current regression coverage proves the normal execution paths and exact compile shape, but does not yet prove the rules-mandated partial-implementability case. Confirmed in `packages/engine/test/integration/fitl-events-macv.test.ts`.
3. The remaining gap is not due to card data expressiveness; it is blocked by the batch progression limitation tracked in `tickets/FREEOP-002-partially-implementable-sequence-batches.md`.

## Architecture Check

1. MACV should stay authored as pure game data. Once the engine supports partial ordered batches correctly, the card should be reworked only within `GameSpecDoc` and tests, not via kernel-side FITL exceptions.
2. This keeps the architecture clean: the kernel handles generic ordered free-operation semantics, while the card data expresses the game-specific pairing and faction order.
3. No backwards-compatibility aliases or workaround branches should survive after the engine fix lands. The final MACV implementation should represent literal rules behavior with no compromise comments or omitted edge cases.

## What to Change

### 1. Reassess MACV data after FREEOP-002 lands

Review the final batch semantics from `FREEOP-002` and confirm whether the current authoring remains the cleanest expression of:

- either `US then ARVN`
- or `NVA then VC`
- each executing any 1 free Special Activity
- executing faction stays eligible
- implement what can in order

If a cleaner generic authoring surface exists after the redesign, adopt it. If the current branch shape is still best, keep it and only expand tests.

### 2. Add full edge-case runtime coverage

Extend the MACV integration tests to cover all materially distinct cases:

- `US -> ARVN`, both usable
- `NVA -> VC`, both usable
- `US` unusable but `ARVN` usable
- `NVA` unusable but `VC` usable
- both unusable in a chosen branch, with no illicit pending grants emitted
- stay-eligible override still applying only to the event executor

### 3. Audit exact rules/playbook fidelity

Confirm and pin the details called out by rules and playbook notes:

- each faction decides its own Special Activity details
- "1 free Special Activity" still means usual maximum spaces for that activity
- event text precedence over Typhoon Kate style restrictions remains driven by the generic free-grant model, not card-local hacks

## Files to Touch

- `tickets/FITLEVENT-069-macv-full-fidelity-rework.md` (new)
- `data/games/fire-in-the-lake/41-events/065-096.md` (modify if needed)
- `packages/engine/test/integration/fitl-events-macv.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` (modify if compile-shape assertions change)
- `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` (modify if compile-shape assertions change)

## Out of Scope

- Generic free-operation sequencing redesign itself
- Reworking unrelated FITL event cards unless the new engine semantics reveal a genuine shared authoring simplification

## Acceptance Criteria

### Tests That Must Pass

1. MACV proves full rule-5.1.3 fidelity for ordered partial implementability after FREEOP-002 lands.
2. MACV tests prove the executor stay-eligible override still applies correctly across all branch outcomes.
3. Existing suite: `pnpm -F @ludoforge/engine test:integration`

### Invariants

1. MACV remains represented entirely in game data and tests; no FITL-specific kernel path is introduced.
2. Final MACV behavior has no known rules compromises left in ordered grant sequencing.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-macv.test.ts` — add the blocked partial-implementability cases and any no-op/fully-unusable branch assertions required by the redesigned engine.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — keep generic batch semantics covered so MACV does not become the only proof point.
3. `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` — keep compile-shape assertions aligned with the final data model.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine typecheck`
3. `node --test packages/engine/dist/test/integration/fitl-events-macv.test.js`
4. `pnpm -F @ludoforge/engine test:integration`
5. `pnpm run check:ticket-deps`
