# 149FITLEVNUMVM-022: Phase 4B final reprofile gate

**Status**: PENDING — unblocks ticket 016 only when Phase 4 budget is truthful
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Maybe — perf gate test/report helper only if the current harness cannot assert the owned metric
**Deps**: `archive/tickets/149FITLEVNUMVM-019.md`, `tickets/149FITLEVNUMVM-020.md`, `tickets/149FITLEVNUMVM-021.md`

## Problem

Tickets 019-021 split the remaining non-policy-VM preview-drive runtime closure into its proven hot buckets:

- kernel expression/query interpretation;
- preview state and token-index lifetime;
- preview hashing and verification strategy.

This ticket owns the final measured decision: whether those Phase 4B changes make the original Phase 4 `<=250 ms` one-card gate truthful and therefore unblock ticket 016 for the F14 default-flip/deletion cut.

## What to Change

1. Verify tickets 019-021 are complete or explicitly classified as no longer active owners.
2. Run the same-seam one-card profile with default `verifyIncrementalHash=true`:

```bash
timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-final
```

3. Create or update `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` only when the measured gate is green and the test can truthfully assert `<=250 ms`.
4. Record exact elapsed values, per-card row values, profile buckets, and pass/fail verdict in this ticket's Outcome.
5. If the gate is green, mark ticket 016 unblocked.
6. If the gate remains red, do not weaken the target. Use 1-3-1 to choose among more Phase 4B work, a Phase 5/WASM spec, or a user-approved target reset.

## Files to Touch

- `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` if and only if the gate is green enough to assert truthfully
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` only if the harness cannot expose the required metric
- `tickets/149FITLEVNUMVM-022.md`
- `tickets/149FITLEVNUMVM-016.md` if unblocking status is recorded

## Out of Scope

- Implementing the hot-path fixes from tickets 019-021.
- Default-flipping the policy VM or deleting closure-tree code; ticket 016 owns that.
- Remaining CI restoration; ticket 003 owns that after ticket 016 closes.
- Weakening the `<=250 ms` Phase 4 budget.

## Acceptance Criteria

1. Same-seam profile records `<=250 ms` under all 4 baseline profiles with `verifyIncrementalHash=true`, or records the exact red result and stops for a new decision.
2. If green, `fitl-per-card-cost.perf.test.ts` asserts the truthful `<=250 ms` budget.
3. If green, ticket 016 is updated as unblocked for default flip + closure-tree deletion.
4. If red, ticket 016 remains blocked and no F14 deletion occurs.

## Test Plan

1. `pnpm -F @ludoforge/engine build`.
2. `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-final`.
3. If the perf gate test is added or updated: `pnpm -F @ludoforge/engine test:perf`.
