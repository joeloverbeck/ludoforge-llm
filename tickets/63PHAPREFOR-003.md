# 63PHAPREFOR-003: Migrate determinism canaries and integration fixtures after Phase 1 runtime rollout

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — schemas, test fixtures
**Deps**: `archive/tickets/63PHAPREFOR-002.md`

## Problem

Ticket 002 changes `evaluatePolicyMoveCore()` to conditionally evaluate preview features when trusted moves are available. Ticket 001 already absorbed the schema-artifact and policy-golden fallout required to keep the repository green after the preview config shape expanded. This ticket now covers only the additional determinism and integration fixture fallout that may emerge once runtime Phase 1 preview behavior is enabled.

## Assumption Reassessment (2026-04-10)

1. Ticket 001 already regenerated `packages/engine/schemas/GameDef.schema.json`, `packages/engine/schemas/EvalReport.schema.json`, and `packages/engine/schemas/Trace.schema.json`, plus refreshed the FITL/Texas policy catalog goldens and Texas policy summary golden to match the expanded preview config shape.
2. `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` — determinism canary with seed-locked expected values. If ticket 002 enables `phase1: true` paths, RNG sequence changes may require new expected values.
3. `packages/engine/test/integration/fitl-policy-agent.test.ts` — integration tests with expected Phase 1/Phase 2 scores and action rankings. This remains the main expected-value fallout surface once runtime preview behavior changes.
4. `packages/engine/test/integration/event-preview-differentiation.test.ts` — preview margin differentiation assertions. Ticket 001 proved the current fixture still passes before runtime rollout.

## Architecture Check

1. Any remaining expected-value updates must come from the live runtime after ticket 002 lands; do not speculate ahead of that behavior change.
2. Canary and integration fixture regeneration must use the same compilation/runtime pipeline that produced the originals — deterministic and reproducible (Foundations 8, 13, 16).
3. No backwards-compatibility shims. Old expectations are overwritten, not preserved alongside new ones (Foundation 14).

## What to Change

### 1. Update determinism canary expected values

Run `fitl-policy-agent-canary.test.ts` with the new code. If expected hash or state values change (likely due to compiled GameDef shape change even with `phase1: false`), update the expected values in the test file. Document the reason: "compiled preview config shape expanded — hash changed but evaluation logic unchanged for phase1:false profiles."

### 2. Update integration test expected values

Run `fitl-policy-agent.test.ts` and `event-preview-differentiation.test.ts`. Update expected scores, rankings, or fixture references that changed due to:
- The runtime Phase 1 preview rollout from ticket 002
- Any RNG sequence shifts introduced by Phase 1 completion sampling

### 3. Verify all tests pass

Full suite run to confirm no regressions.

## Files to Touch

- `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` (modify — update expected values)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify — update expected values)
- `packages/engine/test/integration/event-preview-differentiation.test.ts` (modify — update expected values)

## Out of Scope

- Adding new Phase 1 preview test scenarios (ticket 004)
- Enabling `phase1: true` on any production FITL profile (ticket 004 tests this, production enablement is separate)
- Changing test logic — only expected values and generated artifacts are updated

## Acceptance Criteria

### Tests That Must Pass

1. Determinism canary passes with updated expected values if ticket 002 changes runtime selection traces
2. All integration tests pass with updated expected values
3. Full suite: `pnpm turbo test`

### Invariants

1. No backwards-compatibility wrappers or dual-schema paths
2. Canary expected values match the actual runtime behavior after ticket 002 — the canary remains a valid guard
3. Test logic is unchanged — only expected values are updated

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` — updated expected hash/state values
2. `packages/engine/test/integration/fitl-policy-agent.test.ts` — updated expected scores/rankings
3. `packages/engine/test/integration/event-preview-differentiation.test.ts` — updated expected margins

### Commands

1. `pnpm turbo build && pnpm turbo test --force`
2. `pnpm turbo typecheck`

## Series Note (2026-04-10)

Ticket 001 had to absorb schema regeneration plus the FITL/Texas policy catalog goldens and Texas policy summary golden because `pnpm -F @ludoforge/engine test` failed on those surfaces before any runtime Phase 1 rollout existed. This ticket now starts from that updated baseline and owns only the fallout that appears after ticket 002 changes policy evaluation behavior.
