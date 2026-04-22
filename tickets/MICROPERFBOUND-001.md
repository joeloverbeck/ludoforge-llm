# MICROPERFBOUND-001: Rebound Spec-140 Microturn Frontier Cost and Repeated-Run Boundedness

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — microturn publication, policy-agent frontier evaluation, repeated-run simulation boundedness
**Deps**: `docs/FOUNDATIONS.md`, `archive/specs/140-microturn-native-decision-protocol.md`, `specs/141-runtime-cache-run-boundary.md`

## Problem

PR 224 also introduces a broader boundedness/performance regression across several CI lanes:

- `engine-memory` times out at 10 minutes
- `engine-performance` remains in progress past 20 minutes, and its local witness now fails
- `determinism`, `engine-fitl-rules`, and aggregate `ci` all remain in progress far longer than their earlier shape
- `engine-fitl-events` now completes, but it took `20m52s` in the current PR run

The common seam is the new Spec-140 microturn frontier path:

1. `packages/engine/src/agents/policy-agent.ts` now evaluates non-action microturn candidates by calling `applyPublishedDecision(...)` plus `evaluateState(...)` for each published candidate.
2. `packages/engine/src/kernel/microturn/publish.ts` now performs substantially more continuation/bridgeability filtering up front, including choose-one / choose-n candidate screening and suspended-frame continuation checks.
3. Local reproduction on `2026-04-22` shows:
   - `spec-140-compound-turn-overhead.test` now takes about 49s locally and produces `maxMicroturnsPerTurn=24` for the FITL witness, exceeding the current budget of `16`
   - a repeated-run FITL GC-shaped reproduction stalls after `seed=5000`, with the next run not completing within repeated 30s polls
   - a standalone FITL seeded-agent run for `seed=5001` does not complete within 30s locally

This is a Foundations issue, not a hardware-only slowdown. The current engine is publishing and/or traversing deeper decision sequences per turn, and repeated-run boundedness is no longer trustworthy.

## Assumption Reassessment (2026-04-22)

1. The slowdown is not primarily job queueing. The live Actions jobs all start their test step around `2026-04-22 06:38Z` and then spend the extra wall-clock time inside the test command itself.
2. The current performance failure is not just “budget too strict.” The local FITL overhead witness still stays under the total-decision and total-compound-turn ceilings, but `maxMicroturnsPerTurn` rises to `24`, which means the per-turn decision shape itself changed.
3. The memory timeout is not explained by the Texas seeded-choice batch alone. A direct local 20-game Texas seeded-choice loop finished in roughly `2.9s`, while the GC-shaped reproduction stalls in the FITL half. The repeated-run FITL path therefore needs its own boundedness fix.

## Architecture Check

1. The repair must reduce real frontier cost and repeated-run path length, not merely relax CI timeouts. Foundations `#8`, `#10`, `#15`, and `#16` require bounded deterministic execution, not CI-specific accommodation.
2. The solution must remain engine-generic. We may use FITL and Texas as witnesses, but the fix belongs in shared microturn publication / policy evaluation / runtime ownership seams, not in game-specific branching.
3. No backwards-compatibility aliasing or dual decision protocols are allowed. The shipped Spec-140 microturn contract stays authoritative; the work is to make that contract performant and bounded enough to serve all clients and regression lanes.

## What to Change

### 1. Bound the non-action frontier evaluation path in `PolicyAgent`

Audit the current frontier loop in `packages/engine/src/agents/policy-agent.ts` and remove gratuitous full-state application/evaluation for candidate classes that do not need it.

Possible repair directions:

- preserve the existing cheap structural fast path wherever it is semantically sufficient
- avoid per-candidate `applyPublishedDecision(...)` for frontiers whose ordering can be derived from local microturn structure
- cache or reuse publication-local information when a frontier still requires deeper evaluation

The final design must keep deterministic choice ordering while avoiding N-candidate full successor-state simulation for routine choose-one / choose-n microturns.

### 2. Re-audit microturn publication for per-turn sequence inflation

Audit the post-Spec-140 additions in `packages/engine/src/kernel/microturn/publish.ts` that now:

- pre-filter choose-one / choose-n candidates
- resume suspended frames during publication checks
- probe move viability and bridgeability for each candidate

The goal is to restore bounded publication cost and to prove that publication does not accidentally expand compound-turn microturn depth beyond the intended contract.

### 3. Re-establish repeated-run boundedness for shared-runtime and GC-shaped loops

Use the stalled FITL repeated-run reproduction as the witness for runtime-boundary and repeated-run safety:

- repeated seeded-agent runs with a reused shared runtime must remain bounded
- GC-shaped suites must complete within their existing CI budget without requiring workflow timeout inflation
- determinism/property/performance helpers must not silently traverse a slower or deeper protocol than the authoritative run path

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/kernel/microturn/publish.ts` (modify)
- `packages/engine/src/kernel/microturn/apply.ts` (modify, if frontier/application sharing is needed)
- `packages/engine/src/sim/simulator.ts` (modify, if repeated-run runtime handling still contributes)
- `packages/engine/test/performance/spec-140-compound-turn-overhead.test.ts` (modify only to sharpen proof after the engine fix)
- `packages/engine/test/memory/draft-state-gc-measurement.test.ts` (modify only if diagnostics need to better expose the boundedness witness)
- `packages/engine/test/determinism/**` (modify/add as needed)
- `packages/engine/test/integration/**` (modify/add as needed for FITL boundedness witnesses)

## Out of Scope

- Increasing `timeout-minutes` as the primary remedy
- Downgrading the performance and memory lanes to advisory-only
- Reintroducing a pre-Spec-140 parallel decision protocol or certificate path

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/performance/spec-140-compound-turn-overhead.test.ts` passes again with a truthful post-fix budget witness.
2. `packages/engine/test/memory/draft-state-gc-measurement.test.ts` completes within the existing `engine-memory` lane budget.
3. Existing suites: `pnpm -F @ludoforge/engine test:determinism`, `pnpm -F @ludoforge/engine test:integration:fitl-rules`, `pnpm -F @ludoforge/engine test:integration:fitl-events`, and aggregate `pnpm turbo test`

### Invariants

1. Published microturn decisions remain atomic, deterministic, and directly executable; no client-side search or hidden completion protocol is reintroduced.
2. Reusing shared runtime structure across repeated runs must not cause unbounded retained work, changed observable outcomes, or CI-only boundedness failures.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/performance/spec-140-compound-turn-overhead.test.ts` — preserve the FITL/Texas compound-turn budget witness and make the post-fix budget truthful.
2. `packages/engine/test/memory/draft-state-gc-measurement.test.ts` — keep the repeated-run GC witness that currently exposes the stall in the FITL half.
3. `packages/engine/test/determinism/**` or `packages/engine/test/integration/**` — add or refine a focused repeated-run FITL witness that reproduces the stalled seeds without requiring the full CI lane for diagnosis.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/performance/spec-140-compound-turn-overhead.test.js`
3. `pnpm -F @ludoforge/engine exec node --expose-gc --test dist/test/memory/draft-state-gc-measurement.test.js`
4. `pnpm -F @ludoforge/engine test:determinism`
5. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
6. `pnpm -F @ludoforge/engine test:integration:fitl-events`
7. `pnpm turbo test`
