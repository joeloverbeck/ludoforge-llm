# 63PHAPREFOR-003: Refresh remaining FITL policy-agent integration assertions after Phase 1 preview rollout

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — integration tests
**Deps**: `archive/tickets/63PHAPREFOR-002.md`

## Problem

Ticket 002 changed `evaluatePolicyMoveCore()` to conditionally evaluate preview features when trusted moves are available. Ticket 001 already absorbed the schema-artifact and policy-golden fallout required to keep the repository green after the preview config shape expanded. Reassessment on 2026-04-10 showed that the determinism canary and `event-preview-differentiation` integration already pass unchanged; the remaining live fallout is narrower and confined to stale assertions inside `packages/engine/test/integration/fitl-policy-agent.test.ts`.

## Assumption Reassessment (2026-04-10)

1. Ticket 001 already regenerated `packages/engine/schemas/GameDef.schema.json`, `packages/engine/schemas/EvalReport.schema.json`, and `packages/engine/schemas/Trace.schema.json`, plus refreshed the FITL/Texas policy catalog goldens and Texas policy summary golden to match the expanded preview config shape.
2. `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` currently asserts replay determinism and terminal completion, not seed-locked fixture literals. It passes unchanged after ticket 002.
3. `packages/engine/test/integration/event-preview-differentiation.test.ts` also passes unchanged after ticket 002.
4. `packages/engine/test/integration/fitl-policy-agent.test.ts` is the remaining live fallout surface. Two assertions are stale:
   - the compiled `vc-baseline` preview config assertion still expects only `{ mode: 'tolerateStochastic' }`, but the compiled profile now includes the explicit Phase 1 fields introduced by the preview rollout.
   - the aggregation-threshold test authors synthetic VC bases with stale assumptions: it mutates `zones` without refreshing `stateHash`, and it injects base tokens using the numeric active-player index rather than the authored seat id that the `seat: self` token filter resolves against.

## Architecture Check

1. Any remaining assertion updates must come from the live runtime after ticket 002 lands; do not speculate ahead of that behavior change.
2. Tests that manually author post-mutation states must keep `stateHash` coherent with the mutated state so runtime caches remain valid (Foundations 8, 16).
3. No backwards-compatibility shims. Old expectations are overwritten, not preserved alongside new ones (Foundation 14).

## What to Change

### 1. Refresh the authored preview-config assertion

Update the `vc-baseline` preview-config expectation in `fitl-policy-agent.test.ts` so it matches the live compiled production profile, including the explicit Phase 1 fields introduced by the rollout.

### 2. Repair the stale aggregation-threshold test setup

Keep the test’s intent unchanged: when VC has few bases, prefer `rally`; when VC reaches the threshold, prefer `tax`. Update the manually authored "many bases" state so its `stateHash` is recomputed after mutating token placement, and ensure the injected base tokens use the authored VC seat id expected by the policy token filter. This preserves deterministic cache correctness instead of relying on stale hash metadata or stale seat encoding assumptions.

### 3. Verify the FITL policy-agent integration surface

Run the targeted `fitl-policy-agent.test.ts` integration file, then run the engine test/build/typecheck sequence needed to confirm the repo is green.

## Files to Touch

- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)

## Out of Scope

- Adding new Phase 1 preview test scenarios (ticket 004)
- Enabling `phase1: true` on any production FITL profile (ticket 004 tests this, production enablement is separate)
- Touching the already-green determinism canary or `event-preview-differentiation` integration file without new evidence

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` passes with the refreshed live assertions
2. The engine test suite passes after the stale assertions are corrected
3. Broad verification passes for the touched engine package

### Invariants

1. No backwards-compatibility wrappers or dual-schema paths
2. The aggregation-threshold test remains a valid guard for the intended VC base-count behavior
3. Manual test-state mutations keep hash metadata and authored seat identifiers coherent with the mutated state

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-policy-agent.test.ts` — refreshed preview-config assertion and repaired aggregation-threshold setup

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/fitl-policy-agent.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`

## Series Note (2026-04-10)

Ticket 001 had to absorb schema regeneration plus the FITL/Texas policy catalog goldens and Texas policy summary golden because `pnpm -F @ludoforge/engine test` failed on those surfaces before any runtime Phase 1 rollout existed. Ticket 002 then landed the runtime preview behavior. Reassessment confirmed that this ticket’s residual ownership is now limited to the remaining `fitl-policy-agent.test.ts` fallout.

## Outcome

- **Completed**: 2026-04-10
- **What changed**:
  - Refreshed the FITL `vc-baseline` preview-config assertion in `packages/engine/test/integration/fitl-policy-agent.test.ts` to match the current compiled production profile, including explicit `phase1` fields.
  - Repaired the aggregation-threshold integration fixture by authoring injected VC bases with the correct seat id and recomputing `stateHash` / `_runningHash` after manual state mutation.
- **Deviations from original plan**:
  - The original ticket boundary was stale. Reassessment showed the determinism canary and `event-preview-differentiation` integration were already green, so the ticket was rewritten to the remaining live `fitl-policy-agent.test.ts` scope before implementation.
- **Verification**:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/integration/fitl-policy-agent.test.ts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
