# 91FIRDECDOMCOM-005: Performance benchmark

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — tests only
**Deps**: archive/tickets/91FIRDECDOMCOM/91FIRDECDOMCOM-004.md

## Problem

Spec 91 estimates a 10-25% reduction in total benchmark time from the
first-decision domain compilation optimization. The current codebase already
implements a narrower architecture than the original ticket assumed:
runtime-owned compiled first-decision rejection guards are used only as
additive early rejections for plain-action feasibility probing and matched
pipeline profile admission, while event-card admission remains on the
canonical interpreter path.

This ticket should benchmark that real architecture instead of proposing a
different one. The goal is to measure `legalMoves` throughput with compiled
first-decision guards enabled versus disabled on a deterministic FITL corpus,
using the existing runtime seam and helper surfaces.

## Assumption Reassessment (2026-03-28)

1. Performance benchmarks in this repo live under
   `packages/engine/test/performance/`, and the closest existing patterns are:
   - `packages/engine/test/performance/compiled-condition-benchmark.test.ts`
   - `packages/engine/test/performance/compiled-vs-interpreted-benchmark.test.ts`
2. FITL production compilation and deterministic progressed-state corpus
   helpers already exist and should be reused rather than duplicated:
   - `compileFitlValidatedGameDef()`
   - `buildDeterministicFitlStateCorpus(def)`
   - `summarizeFirstDecisionCoverage(def)`
   - `createRuntimeWithDisabledFirstDecisionGuards(runtime)`
3. The current first-decision compiler surface is
   `FirstDecisionDomainResult = { compilable, check(ReadContext), description }`.
   It does not expose `domain`, `isSingleDecision`, or any synthesized
   `ChoiceOption[]`.
4. The real A/B benchmark boundary is `legalMoves(...)` with:
   - a normal `GameDefRuntime` whose `firstDecisionDomains` are populated
   - a derived runtime whose `firstDecisionDomains` maps are empty
5. Event-card admission is intentionally out of scope for compiled
   first-decision guards. Current unit tests explicitly enforce that event
   admission stays on the interpreter path.
6. Coverage from the existing parity fixture is the right benchmark guard:
   report descriptive action/pipeline compiled coverage and assert non-zero
   compiled coverage, not a brittle percentage threshold.

## Architecture Check

1. A benchmark at the observable `legalMoves` boundary is more beneficial than
   the original proposal to add per-path counting proxies around internal
   helpers. It measures the architecture users actually run, without coupling
   tests to private control flow.
2. The current runtime-owned design is cleaner than introducing test-driven
   instrumentation hooks into production code. `GameDefRuntime.firstDecisionDomains`
   already provides the explicit seam needed for A/B measurement.
3. Adding path counters for "fast rejection", "bypass", and "fallback" is not
   justified by the current architecture:
   - there is no single-decision bypass path today
   - "fallback" is just the normal interpreter path
   - counting internal branch decisions would create brittle test coupling
4. The long-term architectural direction, if future work justifies it, would be
   a structurally complete plan compiler for the first pending decision.
   That is a separate design problem. This ticket should not imply that such a
   bypass layer already exists.
5. This ticket remains test-only unless the benchmark exposes a real defect in
   existing helpers or test surfaces.

## What to Change

### 1. Create benchmark test

```typescript
// first-decision-benchmark.test.ts
// 1. Reuse compileFitlValidatedGameDef() and buildDeterministicFitlStateCorpus(def)
// 2. Create:
//    a. compiledRuntime = createGameDefRuntime(def)
//    b. disabledRuntime = createRuntimeWithDisabledFirstDecisionGuards(compiledRuntime)
// 3. Measure repeated legalMoves(...) timing across the deterministic corpus:
//    a. default enumeration with compiledRuntime
//    b. default enumeration with disabledRuntime
//    c. probePlainActionFeasibility enumeration with compiledRuntime
//    d. probePlainActionFeasibility enumeration with disabledRuntime
// 4. Log structured benchmark output for human review
// 5. Assert benchmark setup is meaningful:
//    - compiled plain-action coverage > 0
//    - compiled pipeline coverage > 0
//    - corpus contains multiple states
//    - timing values are finite
```

### 2. Reuse existing first-decision helper surfaces

Prefer reusing `packages/engine/test/helpers/first-decision-production-helpers.ts`
instead of adding new benchmark-only duplication. Only extend that helper if
the benchmark reveals a missing reusable capability.

Do not add benchmark-specific instrumentation to production code.

## Files to Touch

- `packages/engine/test/performance/first-decision-benchmark.test.ts` (new)
- `packages/engine/test/helpers/first-decision-production-helpers.ts` only if
  a small reusable helper addition is actually needed
- `packages/engine/src/kernel/*.ts` only if the benchmark exposes a verified bug

## Out of Scope

- Event-card first-decision benchmarking as if events used compiled guards.
- Adding counter/probe hooks to production code.
- Synthesizing `ChoiceOption[]` domains or single-decision full bypass.
- Enforcing specific speedup thresholds in assertions.
- Optimizing the compiler/runtime implementation itself.
- Comparing against Spec 90 compiled-condition numbers.

## Acceptance Criteria

### Tests That Must Pass

1. The ticket assumptions are corrected before implementation to match the
   live runtime/test architecture.
2. Benchmark completes without errors across a deterministic FITL state corpus.
3. Structured benchmark output is logged for:
   - compiled vs disabled runtime, default enumeration
   - compiled vs disabled runtime, `probePlainActionFeasibility`
   - action/pipeline compiled coverage
   - corpus size and iteration count
4. The benchmark proves the optimization is exercised by asserting:
   - compiled plain-action coverage > 0
   - compiled pipeline coverage > 0
5. No hardware-dependent speed threshold is asserted.
6. Relevant engine tests, lint, and typecheck pass.

### Invariants

1. Benchmark proof stays at the observable `legalMoves` boundary.
2. Benchmark uses deterministic seed — results are reproducible.
3. No production instrumentation hooks are introduced.
4. Event admission remains on the canonical interpreter path.
5. The benchmark does NOT assert specific timing thresholds.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/performance/first-decision-benchmark.test.ts` —
   FITL benchmark measuring `legalMoves` timing with runtime first-decision
   guards enabled vs disabled across a deterministic corpus.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:performance`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Corrected the ticket assumptions before implementation so they match the
    live architecture: runtime-owned first-decision rejection guards at the
    `legalMoves` boundary, with event admission explicitly left on the
    interpreter path.
  - Added `packages/engine/test/performance/first-decision-benchmark.test.ts`
    to benchmark FITL `legalMoves` timings with compiled first-decision guards
    enabled vs disabled across the deterministic production corpus, for both
    default enumeration and `probePlainActionFeasibility`.
  - Reused the existing first-decision FITL parity fixture/helper surface
    instead of adding benchmark-only instrumentation or production hooks.
- Deviations from original plan:
  - The original ticket proposed internal diagnostic counters and implied a
    broader architecture than the codebase implements. That plan was corrected
    and narrowed before coding.
  - No production code changes were needed; the completed work stayed test-only.
- Verification results:
  - Passed `pnpm -F @ludoforge/engine build`
  - Passed `node --test dist/test/performance/first-decision-benchmark.test.js`
  - Passed `pnpm -F @ludoforge/engine test`
  - Passed `pnpm turbo lint`
  - Passed `pnpm turbo typecheck`
