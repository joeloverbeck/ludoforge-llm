# 121TWOPHAPOL-005: Two-phase isolation and regression tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — test suites
**Deps**: `archive/tickets/121TWOPHAPOL-003.md`

## Problem

The core architectural property of Spec 121 — that completion-scope considerations cannot change which `actionId` is selected — must be proven through automated tests (Foundation 16). Without explicit isolation tests, the two-phase separation could regress silently. Additionally, FITL-specific regression tests must verify that the `fitl-arvn-agent-evolution` campaign's exp-009 failure mode (completion-scope consideration changing ARVN from `govern` to `sweep`) is eliminated.

## Assumption Reassessment (2026-04-09)

1. `preferPopulousTargets` consideration exists with `scopes: ['completion']` — confirmed in test fixtures and integration tests.
2. FITL policy agent integration tests exist at `packages/engine/test/integration/fitl-policy-agent.test.ts` — confirmed.
3. `arvn-baseline` profile references exist in game data — confirmed.
4. ~32 test files directly import affected modules — confirmed during spec reassessment.

## Architecture Check

1. Testing the isolation property is the architectural proof that the two-phase pipeline works as designed (Foundation 16: Testing as Proof).
2. No game-specific logic in engine code — FITL-specific regression tests use game data fixtures, not engine branching.
3. No backwards-compatibility shims — tests verify the new behavior, not a compatibility layer.

## What to Change

### 1. Unit test: Phase isolation property

Create a test that:
1. Constructs a policy profile with move-scope considerations only → records the selected `actionId`.
2. Adds completion-scope considerations to the same profile → records the selected `actionId`.
3. Asserts both runs select the same `actionId`.

This is the core property being enforced. The test should use a scenario where completion-scope considerations would have changed the `actionId` under the old single-pass pipeline (proving the fix works).

### 2. Unit test: Phase 1 determinism

Same input with different completion-scope considerations → same `actionId` ranking in Phase 1. Verify via the `phase1ActionRanking` trace field.

### 3. Unit test: Phase 2 quality

Verify that completion-scope considerations improve parameter selection within the winning `actionId`. Compare target zone selection quality with and without `preferPopulousTargets`.

### 4. Unit test: Backward compatibility

Profile with no completion-scope considerations produces identical move selection and trace output as the pre-restructure behavior. Use a deterministic seed and compare the full move output.

### 5. Unit test: Performance — completion count reduction

Verify that Phase 2 completes fewer templates than the old single-pass pipeline. Compare `completionStatistics` or `completionsByActionId` counts.

### 6. Integration test: FITL regression

Run the policy agent with the ARVN baseline profile + `preferPopulousTargets` and verify that ARVN selects `govern` (not `sweep`) as first action. This directly tests the exp-009 failure mode from the campaign.

### 7. Integration test: VC profile

Verify that `vc-baseline` (which uses `preferPopulousTargets` with `scopes: ['completion']`) produces the same or better results under the two-phase pipeline.

## Files to Touch

- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify — add isolation, determinism, backward compat, performance tests)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify — add FITL regression test)

## Out of Scope

- Changes to the pipeline implementation (ticket 003)
- Trace field population (ticket 004)
- Golden test updates (ticket 004)
- Changes to any agent other than PolicyAgent

## Acceptance Criteria

### Tests That Must Pass

1. **Isolation**: Adding completion-scope considerations does not change the selected `actionId`.
2. **Determinism**: Same input → same `phase1ActionRanking`, regardless of completion-scope considerations.
3. **Backward compat**: No completion-scope considerations → identical output to pre-restructure.
4. **Performance**: Phase 2 completes fewer templates than single-pass.
5. **FITL regression**: ARVN selects `govern` with `preferPopulousTargets` active.
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The isolation property holds for any profile configuration: completion-scope considerations never influence `actionId` selection.
2. All tests are deterministic — fixed seeds, no PRNG-dependent assertions without seed control.
3. Tests do not depend on specific numeric scores — they test structural properties (same `actionId`, fewer completions) not exact values.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-agent.test.ts` — isolation, determinism, backward compat, performance tests
2. `packages/engine/test/integration/fitl-policy-agent.test.ts` — FITL regression (exp-009 scenario), VC profile validation

### Commands

1. `node --test packages/engine/dist/test/unit/agents/policy-agent.test.js`
2. `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js`
3. `pnpm -F @ludoforge/engine test`
