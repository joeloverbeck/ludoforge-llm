# FITLEVENT-074: Rework Lam Son 719 after generic required-grant architecture lands

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No direct new architecture in this ticket; consumes generic engine work from dependent tickets
**Deps**: `tickets/README.md`, `tickets/ENGINEARCH-160-first-class-required-cross-seat-free-operation-resolution-windows.md`, `tickets/ENGINEARCH-161-unify-target-bound-free-operation-viability-and-issuance-contracts.md`, `reports/fire-in-the-lake-rules-section-5.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `packages/engine/test/integration/fitl-events-lam-son-719.test.ts`

## Problem

Lam Son 719 is currently implemented with a deliberate workaround: the ARVN follow-up LimOp is queued as a non-required pending grant, and the card data contains explicit gating to suppress the grant when the engine cannot generically prove usability. That is not the intended end-state. Once the generic engine contracts exist, this card needs to be reviewed and re-authored so it expresses the rules directly rather than compensating for runtime gaps.

## Assumption Reassessment (2026-03-12)

1. Current Lam Son 719 data in `data/games/fire-in-the-lake/41-events/065-096.md` correctly handles troop placement, Trail degradation, and shaded resource gain, but it does not yet encode the ARVN follow-up as an immediate required LimOp because the engine stalls on that contract today.
2. Current Lam Son 719 regression coverage in `packages/engine/test/integration/fitl-events-lam-son-719.test.ts` intentionally tests the workaround behavior, including suppression logic that should become unnecessary after the engine architecture tickets land.
3. The rules/playbook requirement that ARVN decides the LimOp details is compatible with a generic cross-seat required free-operation handoff. Corrected scope: rework the card only after the generic engine contracts are in place, not before.

## Architecture Check

1. The cleanest Lam Son 719 implementation is plain `GameSpecDoc` authoring that states the required ARVN limited operation and lets the generic runtime handle seat handoff, target binding, and usability.
2. This ticket preserves the boundary between game-specific rules data and game-agnostic engine behavior by consuming generic engine capabilities instead of introducing FITL-specific runtime logic.
3. No backwards-compatibility shim should preserve the current workaround once the generic architecture exists. The card and its tests should be updated to the canonical rules-faithful encoding.

## What to Change

### 1. Reassess the card against the landed engine contracts

Review Lam Son 719 after `ENGINEARCH-160` and `ENGINEARCH-161` are complete, then remove any card-local workaround that was only compensating for missing generic engine behavior.

### 2. Re-author the ARVN follow-up as full-fidelity game data

Update the card so it encodes:
- up to 6 ARVN Troops placed in a Laos space
- ARVN immediately executes the free LimOp there
- ARVN retains the LimOp decision detail
- Trail degrades by 2

Use the new generic contracts for required handoff and viability instead of explicit card-local suppression logic.

### 3. Rewrite regressions around the final semantics

Replace workaround-focused assertions with full-fidelity assertions covering:
- immediate ARVN handoff
- Laos-space binding
- no extra or missing advancement
- edge cases where placement count and pre-existing ARVN presence affect whether the LimOp is usable under the new generic contract

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify)
- `packages/engine/test/integration/fitl-events-lam-son-719.test.ts` (modify)

## Out of Scope

- Generic engine/runtime changes already covered by dependent architecture tickets
- Reworking unrelated Fire in the Lake cards
- Presentation or visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Lam Son 719 uses the generic required cross-seat free-operation contract rather than the current non-required workaround.
2. The ARVN LimOp is constrained to the selected Laos space and resolved through the generic engine handoff.
3. The card no longer relies on manual author-side gating to suppress unusable grants when the generic viability contract can determine that outcome.
4. Existing suite: `node --test packages/engine/dist/test/integration/fitl-events-lam-son-719.test.js`
5. Existing suite: `pnpm -F @ludoforge/engine test:integration`

### Invariants

1. Lam Son 719 remains pure game data; no FITL-specific engine branching is introduced.
2. Card behavior is rules-faithful and expressed through generic free-operation semantics available to any title.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-lam-son-719.test.ts` — replace workaround assertions with full-fidelity required-handoff and target-bound viability coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-lam-son-719.test.js`
3. `pnpm -F @ludoforge/engine test:integration`
4. `pnpm run check:ticket-deps`
