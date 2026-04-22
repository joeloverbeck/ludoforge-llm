# AGENTSUNSET-004: Restore final-confirmed default engine test lane after test-agent migration

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test harness and proof-lane stability only
**Deps**: `archive/tickets/AGENTSUNSET-001.md`

## Problem

`AGENTSUNSET-001` landed the built-in-agent test migration, but the ticket's named acceptance lane `pnpm -F @ludoforge/engine test` did not return a final confirmed result during implementation review. The rerun surfaced and fixed owned witness drift, then remained harness-noisy in late `unit/property` / `unit/sim` tail files. Leaving that proof gap attached implicitly to the archived migration ticket would overstate completion.

## Assumption Reassessment (2026-04-22)

1. `packages/engine/test/unit/property/simulator.property.test.ts` and `packages/engine/test/unit/sim/simulator.test.ts` are both in the engine default lane and were the repeated quiet-progress tail during the post-implementation rerun.
2. `packages/engine/test/integration/compiled-effects-verification.test.ts` also behaved as a non-final focused witness during the same session, even after the Texas verification subcase was narrowed to policy agents.
3. `AGENTSUNSET-001` already records that `pnpm -F @ludoforge/engine test` was `harness-noisy / not final-confirmed`, so the remaining work is now proof-lane stabilization or truthful lane reassessment, not another built-in-agent migration pass.

## Architecture Check

1. Owning the non-final default-lane behavior in a dedicated follow-up is cleaner than silently treating `AGENTSUNSET-001` as fully accepted despite the missing named proof.
2. This keeps Foundations-aligned proof language truthful: engine behavior and acceptance evidence remain distinct, and the ticket series records which work item owns the remaining verification stability.
3. No compatibility shims or product-surface widening are introduced; the scope is strictly test-harness stability or truthful proof-boundary correction.

## What to Change

### 1. Reproduce the non-final engine default lane tail deterministically

Establish whether the late `unit/property` / `unit/sim` silence is legitimate heavy workload, a runner/reporter defect, or a regression introduced by the migrated helper-based witnesses.

### 2. Land the smallest truthful fix

Depending on live evidence, either:

- make the affected tests/lane complete cleanly under `pnpm -F @ludoforge/engine test`, or
- correct the lane/test ownership truthfully if the current default lane is carrying a stale proof expectation.

### 3. Re-close the AGENTSUNSET proof story

Once the lane is final-confirmed or truthfully narrowed, update the archived `AGENTSUNSET-001` outcome if needed so the series records one accurate proof story.

## Files to Touch

- `packages/engine/test/unit/property/simulator.property.test.ts` (modify if needed)
- `packages/engine/test/unit/sim/simulator.test.ts` (modify if needed)
- `packages/engine/test/integration/compiled-effects-verification.test.ts` (modify if needed)
- `packages/engine/scripts/run-tests.mjs` (modify if runner/reporting drift is proven)
- `archive/tickets/AGENTSUNSET-001.md` (modify only if closeout wording needs final proof amendment)

## Out of Scope

- Additional built-in-agent contract removal beyond `AGENTSUNSET-002`.
- Runner UI cleanup covered by `AGENTSUNSET-003`.
- Broad engine test-lane redesign without direct evidence from the reproduced noisy tail.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test` returns a final confirmed result, or the active/archived ticket artifacts are updated to record a truthful narrower proof substitution backed by direct evidence.
2. Any touched focused witness files return a final confirmed result when run directly.

### Invariants

1. `AGENTSUNSET-001` remains truthful about what landed versus what this follow-up still owns.
2. No new heavy-lane overlap or artifact-contention workaround is introduced just to mask runner noise.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/property/simulator.property.test.ts` — only if needed to keep the default lane final-confirmable.
2. `packages/engine/test/unit/sim/simulator.test.ts` — only if needed to keep the default lane final-confirmable.
3. `packages/engine/test/integration/compiled-effects-verification.test.ts` — only if needed to convert the current non-final focused witness into a final confirmed proof.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/integration/compiled-effects-verification.test.js`
3. `node --test dist/test/unit/property/simulator.property.test.js`
4. `node --test dist/test/unit/sim/simulator.test.js`
5. `pnpm -F @ludoforge/engine test`

## Outcome

- Completed: 2026-04-22

- Stabilized the default-lane simulator witnesses by adding turn-scoped action limits to the synthetic single-phase fixtures that otherwise looped forever under the current microturn-native `runGame` contract.
- Refreshed stale simulator assertions exposed once those files became final-confirmable: the property witness now checks `turnsCount <= maxTurns`, the two-phase witness records four decisions across two turns, and the illegal-move guard asserts the structured `LEGAL_CHOICES_UNKNOWN_ACTION` kernel error.
- `ticket corrections applied`: `runner-noise root cause unclear -> same-turn synthetic witnesses were stale after the live turn-count stop contract, with one additional stale simulator error/assertion surface`
- `verification set`: `pnpm -F @ludoforge/engine build`; `node --test dist/test/integration/compiled-effects-verification.test.js`; `node dist/test/unit/property/simulator.property.test.js`; `node dist/test/unit/sim/simulator.test.js`
- `subsumed proof`: `pnpm -F @ludoforge/engine test -> schema:artifacts:check plus the default-lane integration and simulator tranche returned cleanly, then the reporter remained in quiet-progress on dist/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.js for more than 6 minutes without a terminal summary`
- `proof gaps`: `no owned simulator/compiled-effects proof gap remains; tickets/AGENTSUNSET-005.md later closed the remaining broad-lane story for this series by removing policy-profile-quality convergence witnesses from the default blocking lane after direct reproduction showed stale non-blocking quality expectations, with later quiet-progress moving to unrelated dist/test/integration/spec-140-profile-migration.test.js outside this simulator-tail follow-up`
