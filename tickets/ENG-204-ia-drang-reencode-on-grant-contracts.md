# ENG-204: Re-encode Ia Drang on New Grant Contracts (No Workarounds)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — data/test migration on top of new engine capabilities
**Deps**: archive/tickets/FITLEVENTARCH/ENG-201-free-op-grant-viability-gating.md, archive/tickets/ENG/ENG-202-free-op-sequence-bound-space-context.md, tickets/ENG-203-mandatory-grant-and-action-outcome-contracts.md, data/games/fire-in-the-lake/41-content-event-decks.md

## Problem

`card-44 Ia Drang` is currently encoded with partial approximations. After new grant contracts land, Ia Drang must be re-encoded to rely only on canonical mechanisms and remove all workaround assumptions.

## Assumption Reassessment (2026-03-08)

1. Current card-44 encoding uses ordered grants and zone filter but does not bind Sweep/Assault to exact Air Lift context space.
2. Current tests include workaround-friendly expectations (for example relaxed pending-grant completion assertions).
3. Mismatch: requested minute-detail semantics require strict “there” and mandatory execution behavior. Correction: migrate card-44 to new contracts and tighten tests.

## Architecture Check

1. Card data should express all game-specific behavior via `GameSpecDoc` only; no runtime card-id conditionals.
2. Re-encoding on common contracts improves consistency for future FITL cards with chained location-bound grants.
3. No backwards-compatibility layer: remove workaround assertions and encode only final semantics.

## What to Change

### 1. Re-encode card-44 unshaded grants

Use new viability/sequence context/mandatory outcome fields to express:
- US must execute Air Lift, then Sweep and Assault
- Sweep can occur during Monsoon
- Sweep and Assault must be constrained to the same space context (“there”)
- ARVN follow-up remains cost 0 via existing free-op behavior

### 2. Tighten Ia Drang tests

Replace workaround assertions with strict expected outcomes for full chain completion and constrained zones.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-1965-nva.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-ia-drang.test.ts` (modify)

## Out of Scope

- New engine contract design work (completed in dependency tickets).

## Acceptance Criteria

### Tests That Must Pass

1. Ia Drang unshaded is legal only when mandatory chain can be satisfied under new policies.
2. Free Sweep and free Assault are legal only in the Air Lift context space.
3. Ia Drang chain leaves no pending required grants after successful completion.

### Invariants

1. Card-44 behavior is fully data-driven from `GameSpecDoc`.
2. No Ia Drang-specific branch logic in engine/runtime code.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-ia-drang.test.ts` — strict playbook semantics (no workaround expectations).
2. `packages/engine/test/integration/fitl-events-1965-nva.test.ts` — assert new grant-contract fields on card-44.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-ia-drang.test.js packages/engine/dist/test/integration/fitl-events-1965-nva.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
