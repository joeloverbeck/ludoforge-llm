# 15GAMAGEPOLIR-013: Add Policy Golden, Property, and Benchmark Regression Suite

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — verification and performance gating only
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-011-author-baseline-fitl-policy-library-profiles-and-bindings.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-012-author-baseline-texas-holdem-policy-library-profiles-and-bindings.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-017-add-explicit-policy-visibility-ownership-for-preview-safe-runtime-surfaces.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-020-split-policy-surface-refs-into-discriminated-current-and-preview-ir-variants.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-023-separate-policy-binding-roles-from-runtime-player-identity-for-symmetric-games.md

## Problem

Spec 15 requires not only correctness but also determinism, explainability, and bounded performance. Those guarantees are incomplete until the repo has dedicated golden/property/benchmark suites that lock the behavior down.

## Assumption Reassessment (2026-03-20)

1. The repo already has policy-specific unit, integration, property, and trace coverage:
   - `packages/engine/test/unit/property/policy-determinism.test.ts`
   - `packages/engine/test/unit/property/policy-visibility.test.ts`
   - `packages/engine/test/unit/trace/policy-trace-events.test.ts`
   - `packages/engine/test/integration/fitl-policy-agent.test.ts`
   - `packages/engine/test/integration/texas-holdem-policy-agent.test.ts`
2. The missing gap is narrower than the original ticket claimed: there is no production-policy golden fixture coverage for compiled `GameDef.agents`, no fixed-seed production policy summary-trace goldens, and no dedicated policy performance regression gate in the existing `packages/engine/test/performance/*.test.ts` lane.
3. Tickets 017, 020, and 023 are already completed and archived. Their architecture is now the current baseline this ticket should freeze:
   - shared compiled `surfaceVisibility`
   - discriminated `currentSurface` / `previewSurface` refs
   - canonical role-based `bindingsBySeat` plus explicit player-scoped per-player refs where needed
4. Texas Hold'em still intentionally binds one authored profile under canonical role `neutral`. That is no longer an architectural blocker; it is the intended reusable binding contract after ticket 023.
5. The engine performance lane runs Node test files under `packages/engine/test/performance/**/*.test.ts`. A new policy regression test belongs there; a standalone `.bench.ts` file would not be executed by the existing scripts.
6. Corrected scope: add regression fixtures and tests against the current architecture, strengthen the remaining invariant gaps, and add fixed-corpus performance gating. Do not redesign policy runtime semantics or identity contracts in this ticket.

## Architecture Check

1. A dedicated regression suite is cleaner than burying policy guarantees in ad hoc integration assertions because determinism/performance regressions need their own visibility.
2. Using authored FITL and Texas fixtures keeps the verification data-driven and game-agnostic at the runtime layer.
3. The suite should lock the current shared visibility and identity contracts the runtime actually owns; it must not reintroduce compatibility aliases or freeze ad hoc intermediate shapes outside `GameDef.agents`.
4. Goldens should capture stable, reviewer-meaningful outputs:
   - compiled `GameDef.agents`
   - fixed-seed summary policy traces
   They should avoid gratuitously large or redundant snapshots when an existing unit/integration test already owns the finer-grained behavior.
5. Benchmark gating belongs in the existing test lane and should consume the same production-spec helpers as integration tests so the corpus stays data-driven and game-agnostic at the engine layer.
6. No benchmark should silently truncate work or hide emergency fallbacks to “pass” the suite.

## What to Change

### 1. Add compiled IR and trace goldens

Record fixed-seed expected outputs for:

- compiled `GameDef.agents`
- policy summary traces

Use the existing FITL/Texas production spec helpers and serialize only the stable policy-facing outputs needed for regression review.

### 2. Add property-level policy invariants

Strengthen policy property coverage where it is still missing. Cover:

- legal-move-only returns
- legal-move permutation invariance
- deterministic replay by seed
- emergency fallback legality

### 3. Add fixed performance-regression corpus and thresholds

Measure and report for FITL and Texas Hold'em:

- candidate counts
- preview counts
- p50/p95 decision times
- emergency fallback count

Fail the suite on major regressions or non-zero fallback counts in the benchmark corpus.

## File List

- `packages/engine/test/unit/policy-production-golden.test.ts` (new)
- `packages/engine/test/unit/property/policy-determinism.test.ts` (modify)
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` (new)
- `packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json` (new)
- `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` (new)
- `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json` (new)
- `packages/engine/test/performance/policy-agent.perf.test.ts` (new)

## Out of Scope

- changing policy semantics to hit benchmark numbers unless a regression is proven
- runner browser-performance work
- evolution mutation loops
- new game-specific heuristic authoring outside FITL and Texas baseline data

## Acceptance Criteria

### Tests That Must Pass

1. Goldens prove baseline FITL and Texas authored policies lower to the expected compiled `GameDef.agents` and emit the expected fixed-seed summary traces.
2. Property tests prove policy evaluation never returns a move outside `legalMoves`, preserves deterministic replay, and remains invariant to legal-move input order except through canonical RNG with the same seed.
3. `packages/engine/test/performance/policy-agent.perf.test.ts` reports candidate counts, preview counts, p50/p95 decision times, and fails on major regressions or any emergency fallback in the benchmark corpus.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Policy determinism, visibility safety, and performance constraints are enforced by machine-readable regression suites.
2. Benchmark corpora remain fixed and reproducible for review.
3. Emergency fallback is treated as a failure signal in benchmark scenarios, not a success path.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/policy-production-golden.test.ts` plus golden fixtures under `packages/engine/test/fixtures/gamedef` and `packages/engine/test/fixtures/trace` — production compiled-catalog and fixed-seed summary-trace regression baselines.
2. `packages/engine/test/unit/property/policy-determinism.test.ts` — repo-level invariant enforcement for legality, replay determinism, permutation invariance, and fallback legality.
3. `packages/engine/test/performance/policy-agent.perf.test.ts` — fixed-corpus performance regression gate in the existing performance lane.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine lint`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-20
- What actually changed:
  - Added production policy golden coverage for compiled FITL and Texas `GameDef.agents` catalogs.
  - Added fixed-seed FITL and Texas policy summary-trace goldens that lock the real runtime trace shape, including structured agent descriptors.
  - Strengthened `packages/engine/test/unit/property/policy-determinism.test.ts` to cover legal-move-only selection, replay determinism, and emergency-fallback legality in addition to permutation invariance.
  - Added `packages/engine/test/performance/policy-agent.perf.test.ts` in the existing performance lane to gate candidate counts, preview counts, fallback usage, and bounded decision latency on a fixed FITL/Texas corpus.
- Deviations from original plan:
  - Added `packages/engine/test/unit/policy-production-golden.test.ts` as the owning regression harness instead of scattering the new golden assertions across existing integration tests.
  - Did not modify `packages/engine/test/unit/property/policy-visibility.test.ts` because the current architecture gap was determinism/fixture/perf coverage, and existing visibility coverage remained accurate.
  - Used the existing `*.test.ts` performance lane rather than introducing a standalone `.bench.ts` file, because the repo would not execute that file in normal verification.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm run check:ticket-deps` passed.
