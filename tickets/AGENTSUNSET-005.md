# AGENTSUNSET-005: Re-close the default engine test lane after policy-only engine contract removal

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None required by default — policy-profile-quality witness or proof-boundary only unless live evidence says otherwise
**Deps**: `archive/tickets/AGENTSUNSET-004.md`, `archive/tickets/AGENTSUNSET-002.md`

## Problem

`AGENTSUNSET-002` landed the policy-only shipped engine contract, but its named broad acceptance lane `pnpm -F @ludoforge/engine test` still did not return a final confirmed result in-session. After `AGENTSUNSET-004` resolved the earlier simulator-tail witness drift, the remaining non-final tail moved to `dist/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.js`. Leaving that proof gap attached implicitly to `AGENTSUNSET-002` would overstate completion of the engine-contract ticket.

## Assumption Reassessment (2026-04-22)

1. `packages/engine/scripts/run-tests.mjs` includes `ALL_POLICY_PROFILE_QUALITY_TESTS` in the default engine lane, so `pnpm -F @ludoforge/engine test` currently owns policy-profile-quality witnesses as part of its final result surface.
2. `packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts` is the live remaining tail witness after `AGENTSUNSET-004`; during the `AGENTSUNSET-002` proof run it emitted heartbeat progress for more than 20 minutes without a terminal pass/fail summary.
3. `archive/tickets/AGENTSUNSET-004.md` already records that the earlier noisy simulator/compiled-effects ownership was resolved and that the remaining non-final broad-lane tail had moved to policy-profile-quality witness runtime.
4. `docs/FOUNDATIONS.md` requires truthful proof language and clean contract boundaries. If the policy-only engine-contract implementation is acceptable but the named broad lane still lacks a final result, that remainder should have its own proof-oriented owner instead of keeping `AGENTSUNSET-002` open indefinitely.

## Architecture Check

1. Owning the remaining broad-lane proof gap in a dedicated follow-up is cleaner than leaving `AGENTSUNSET-002` blocked after its implementation slice has already landed.
2. This preserves Foundations-aligned proof truthfulness: policy-only contract removal remains separate from policy-profile-quality runtime or proof-boundary work.
3. No compatibility shims or product-surface widening are introduced; the scope is either final-confirming the default lane or truthfully narrowing its ownership story.

## What to Change

### 1. Reproduce the live policy-profile-quality tail directly

Confirm whether `fitl-variant-all-baselines-convergence.test.ts` is simply a long deterministic workload, a non-final harness/reporter behavior, or a stale proof expectation that should no longer block the default lane.

### 2. Land the smallest truthful resolution

Depending on live evidence, either:

- make the policy-profile-quality tail return a final confirmed result under the default lane, or
- correct the proof boundary truthfully so `pnpm -F @ludoforge/engine test` is no longer overstated as the required acceptance surface for this series slice.

### 3. Re-close the AGENTSUNSET proof story

Once the tail is final-confirmed or truthfully narrowed, update archived `AGENTSUNSET-002` (and `AGENTSUNSET-004` if needed) so the series records one accurate ownership chain for the remaining broad-lane proof.

## Files to Touch

- `packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts` (modify if live evidence says the witness itself is stale)
- `packages/engine/scripts/run-tests.mjs` (modify only if proof-lane ownership or reporting drift is proven)
- `archive/tickets/AGENTSUNSET-002.md` (modify if closeout wording needs final proof amendment)
- `archive/tickets/AGENTSUNSET-004.md` (modify only if closeout wording needs final proof amendment)

## Out of Scope

- Additional policy-only engine contract removal beyond `AGENTSUNSET-002`.
- Runner UI cleanup owned by `AGENTSUNSET-003`.
- Broad engine test-lane redesign without direct evidence from the reproduced policy-profile-quality tail.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test` returns a final confirmed result, or the active/archived ticket artifacts are updated to record a truthful narrower proof substitution backed by direct evidence.
2. `packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts` returns a final confirmed result when run directly, unless live evidence proves that a truthful proof-boundary correction is the right resolution.

### Invariants

1. `AGENTSUNSET-002` remains truthful about what landed versus what this follow-up still owns.
2. No new artifact-contention or hidden fallback workaround is introduced just to mask the policy-profile-quality tail.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts` — only if needed to keep the default lane final-confirmable or to correct a stale witness expectation.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.js`
3. `pnpm -F @ludoforge/engine test`
