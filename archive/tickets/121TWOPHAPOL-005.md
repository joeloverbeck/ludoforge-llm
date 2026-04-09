# 121TWOPHAPOL-005: Two-phase isolation and regression tests

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — test suites
**Deps**: `archive/tickets/121TWOPHAPOL-003.md`

## Problem

The core architectural property of Spec 121 — that completion-scope considerations cannot change which `actionId` is selected — must be proven through automated tests (Foundation 16). Without explicit isolation tests, the two-phase separation could regress silently. This ticket owns stable proof of that property in synthetic unit fixtures plus a production-informed FITL overlay scenario that does not depend on evolving production profile contents.

## Assumption Reassessment (2026-04-09)

1. `preferPopulousTargets` consideration exists with `scopes: ['completion']` — confirmed in test fixtures and integration tests.
2. FITL policy agent integration tests exist at `packages/engine/test/integration/fitl-policy-agent.test.ts` — confirmed.
3. The current repo no longer contains the pre-restructure single-pass pipeline, so literal "identical to pre-restructure" output comparisons are not mechanically testable without adding a shadow historical harness.
4. Production seat bindings evolve over time (`arvn-evolved` is currently bound), so this ticket must not rely on current production ARVN profile contents for its proofs.
5. The existing unit policy-agent test surface already contains a synthetic two-action isolation proof and winning-action completion-count assertions, so this ticket should extend that live proof surface rather than duplicate it elsewhere.

## Architecture Check

1. Testing the isolation property is the architectural proof that the two-phase pipeline works as designed (Foundation 16: Testing as Proof).
2. Stable proof should target live invariants, not mutable production profile behavior. FITL-specific coverage therefore uses production-informed game state plus a test-authored overlay profile, not current shipped ARVN policy contents.
3. No backwards-compatibility shims — tests verify current architecture directly and do not recreate the retired single-pass pipeline.

## What to Change

### 1. Unit tests: synthetic two-phase proofs

Extend the existing synthetic policy-agent fixture coverage to prove:
1. Constructs a policy profile with move-scope considerations only → records the selected `actionId`.
2. Adds completion-scope considerations to the same profile → records the selected `actionId`.
3. Asserts both runs select the same `actionId`.
4. Asserts guided and unguided runs produce the same `phase1ActionRanking`.
5. Asserts completion guidance improves parameter choice within the winning `actionId`.
6. Asserts only winning-action templates are completed, with completion counts strictly below the synthetic "complete every template" upper bound.

### 2. Integration test: production-informed FITL overlay regression

Use a deterministic FITL state and a test-authored overlay profile bound to that seat. The overlay must:
1. Add a move-scope action preference.
2. Add a completion-scope zone/option preference.
3. Prove that guided vs unguided runs keep the same selected `actionId` and `phase1ActionRanking`.

The state and overlay should be derived from production FITL data, but the assertions must not depend on current production ARVN profile contents or on subjective "same or better" profile outcomes.

## Files to Touch

- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify — add isolation, determinism, backward compat, performance tests)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify — add FITL overlay regression test)

## Out of Scope

- Changes to the pipeline implementation (ticket 003)
- Trace field population (ticket 004)
- Golden test updates (ticket 004)
- Changes to any agent other than PolicyAgent

## Acceptance Criteria

### Tests That Must Pass

1. **Isolation**: Adding completion-scope considerations does not change the selected `actionId`.
2. **Determinism**: Same input → same `phase1ActionRanking`, regardless of completion-scope considerations.
3. **Phase 2 quality**: Completion guidance improves parameter selection within the winning `actionId`.
4. **Performance**: Phase 2 completes fewer templates than the synthetic "complete every template" upper bound.
5. **FITL regression**: In a production-informed FITL overlay scenario, adding completion-scope guidance does not change the selected `actionId` or `phase1ActionRanking`.
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The isolation property holds for any profile configuration: completion-scope considerations never influence `actionId` selection.
2. All tests are deterministic — fixed seeds, no PRNG-dependent assertions without seed control.
3. Tests do not depend on mutable production profile contents — production-informed integration coverage must use test-authored overlays.
4. Tests do not depend on specific numeric scores — they test structural properties (same `actionId`, stable ranking, fewer completions) not exact values.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-agent.test.ts` — isolation, ranking determinism, phase-2 quality, reduced completion-count proofs
2. `packages/engine/test/integration/fitl-policy-agent.test.ts` — production-informed FITL overlay regression that avoids coupling to evolving production policy profiles

### Commands

1. `node --test packages/engine/dist/test/unit/agents/policy-agent.test.js`
2. `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completed: 2026-04-09
- Changed:
  - Extended `packages/engine/test/unit/agents/policy-agent.test.ts` to prove the synthetic two-phase invariants directly in the live isolation fixture: guided and unguided runs keep the same selected `actionId`, preserve the same `phase1ActionRanking`, and complete strictly fewer templates than the synthetic "complete every template" upper bound.
  - Added a production-informed FITL overlay regression in `packages/engine/test/integration/fitl-policy-agent.test.ts` that binds a test-authored VC overlay profile with move-scope and completion-scope considerations, proving that adding completion guidance does not change the selected `actionId` or `phase1ActionRanking`.
  - Updated nearby FITL preview assertions in `packages/engine/test/integration/fitl-policy-agent.test.ts` to the current phase-1 template semantics introduced by the two-phase pipeline: unresolved preview outcomes are now expected before completion, while action-type score differentiation remains the guarded invariant.
- Deviations from original plan:
  - The original ticket boundary was rewritten before implementation. Literal "identical to pre-restructure" and "VC same or better" claims were removed because the live repo no longer contains the old single-pass pipeline and those claims were not mechanically testable under `docs/FOUNDATIONS.md`.
  - The FITL regression proof intentionally avoids depending on evolving production ARVN profile contents. It uses production-derived state plus a test-authored overlay profile instead.
  - `packages/engine/test/unit/agents/policy-agent.test.ts` already contained part of the synthetic isolation/performance proof surface, so this ticket extended that existing coverage rather than creating duplicate tests elsewhere.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/agents/policy-agent.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js`
  - `pnpm -F @ludoforge/engine test`
