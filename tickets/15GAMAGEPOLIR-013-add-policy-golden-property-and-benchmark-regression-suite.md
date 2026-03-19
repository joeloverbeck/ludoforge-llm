# 15GAMAGEPOLIR-013: Add Policy Golden, Property, and Benchmark Regression Suite

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — verification and performance gating only
**Deps**: specs/15-gamespec-agent-policy-ir.md, tickets/15GAMAGEPOLIR-011-author-baseline-fitl-policy-library-profiles-and-bindings.md, tickets/15GAMAGEPOLIR-012-author-baseline-texas-holdem-policy-library-profiles-and-bindings.md, tickets/15GAMAGEPOLIR-017-add-explicit-policy-visibility-ownership-for-preview-safe-runtime-surfaces.md

## Problem

Spec 15 requires not only correctness but also determinism, explainability, and bounded performance. Those guarantees are incomplete until the repo has dedicated golden/property/benchmark suites that lock the behavior down.

## Assumption Reassessment (2026-03-19)

1. The repo already has unit, integration, performance, and fixture areas, but policy-specific regression coverage does not exist yet.
2. Spec 15 explicitly calls for compiled IR goldens, trace goldens, property tests, and fixed benchmark corpora for FITL and Texas Hold'em.
3. Archived ticket 007 added a safe but conservative preview-masking runtime; that behavior should be regression-covered today, but it is not the final architectural target for per-ref preview visibility ownership.
4. Corrected scope: this ticket should add the verification harness and gating against the architecture delivered by its dependencies, not redesign policy runtime behavior itself.

## Architecture Check

1. A dedicated regression suite is cleaner than burying policy guarantees in ad hoc integration assertions because determinism/performance regressions need their own visibility.
2. Using authored FITL and Texas fixtures keeps the verification data-driven and game-agnostic at the runtime layer.
3. The suite should lock whatever shared visibility contract the runtime actually owns; it must not let coarse temporary masking accidentally become the de facto long-term architecture by lack of explicit dependency ownership.
4. No benchmark should silently truncate work or hide emergency fallbacks to “pass” the suite.

## What to Change

### 1. Add compiled IR and trace goldens

Record fixed-seed expected outputs for:

- compiled `GameDef.agents`
- policy summary traces
- curated verbose candidate reasoning traces where useful

### 2. Add property-level policy invariants

Cover:

- legal-move-only returns
- legal-move permutation invariance
- deterministic replay by seed
- emergency fallback legality

### 3. Add fixed benchmark corpus and regression thresholds

Measure and report for FITL and Texas Hold'em:

- candidate counts
- preview counts
- p50/p95 decision times
- emergency fallback count

Fail the suite on major regressions or non-zero fallback counts in the benchmark corpus.

## File List

- `packages/engine/test/unit/property/policy-determinism.test.ts` (modify)
- `packages/engine/test/unit/property/policy-visibility.test.ts` (modify)
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` (new)
- `packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json` (new)
- `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` (new)
- `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json` (new)
- `packages/engine/test/performance/policy-agent.bench.ts` (new)

## Out of Scope

- changing policy semantics to hit benchmark numbers unless a regression is proven
- runner browser-performance work
- evolution mutation loops
- new game-specific heuristic authoring outside FITL and Texas baseline data

## Acceptance Criteria

### Tests That Must Pass

1. Goldens prove baseline FITL and Texas authored policies lower to the expected compiled `GameDef.agents` and emit the expected fixed-seed summary traces.
2. Property tests prove policy evaluation never returns a move outside `legalMoves`, preserves deterministic replay, and remains invariant to legal-move input order except through canonical RNG with the same seed.
3. `packages/engine/test/performance/policy-agent.bench.ts` reports candidate counts, preview counts, p50/p95 decision times, and fails on major regressions or any emergency fallback in the benchmark corpus.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Policy determinism, visibility safety, and performance constraints are enforced by machine-readable regression suites.
2. Benchmark corpora remain fixed and reproducible for review.
3. Emergency fallback is treated as a failure signal in benchmark scenarios, not a success path.

## Test Plan

### New/Modified Tests

1. Golden fixtures under `packages/engine/test/fixtures/gamedef` and `packages/engine/test/fixtures/trace` — compiled catalog and trace regression baselines.
2. `packages/engine/test/unit/property/policy-determinism.test.ts` and `packages/engine/test/unit/property/policy-visibility.test.ts` — repo-level invariant enforcement.
3. `packages/engine/test/performance/policy-agent.bench.ts` — fixed-corpus performance regression gate.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`
