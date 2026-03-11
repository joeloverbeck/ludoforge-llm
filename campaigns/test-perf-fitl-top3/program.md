# Campaign: test-perf-fitl-top3

## Objective

Minimize the combined wall-clock time of the 3 slowest FITL integration test suites.

## Primary Metric

`combined_duration_ms` — lower is better. Measurements within 1% of each other are considered equal (noise tolerance).

## Secondary Metric

`lines_delta` — net lines-of-code change across mutable files. Negative = simplification = good.

## Mutable System (files the agent MAY modify)

- `packages/engine/test/integration/fitl-events-plei-mei.test.ts`
- `packages/engine/test/integration/fitl-events-tutorial-gulf-of-tonkin.test.ts`
- `packages/engine/test/integration/fitl-coup-support-production.test.ts`
- `packages/engine/test/helpers/production-spec-helpers.ts`
- `packages/engine/test/helpers/isolated-state-helpers.ts`
- `packages/engine/test/helpers/decision-param-helpers.ts`
- `packages/engine/test/helpers/turn-order-helpers.ts`

## Immutable System (files the agent MUST NOT modify)

- `campaigns/test-perf-fitl-top3/harness.sh`
- Everything under `packages/engine/src/`
- Everything under `data/`
- All other test files not listed above
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, and all build config

## Constraints

1. All tests must pass (0 failures). The harness enforces this.
2. No weakened assertions — do not remove, loosen, or skip any existing assertion.
3. No breaking changes to helpers used by other test files. If a helper is imported elsewhere, its public API must remain compatible.
4. No new runtime dependencies.
5. No changes to engine source code (`src/`).

## Accept/Reject Logic

```
IF harness fails (crash, test failures, no metric):
    REJECT (allow up to 3 trivial-fix retries per experiment)

IF combined_duration_ms improved by >1%:
    IF improvement <2% AND lines_delta > +20:
        REJECT (not worth the complexity)
    ELSE:
        ACCEPT

IF combined_duration_ms within 1% (equal):
    IF lines_delta < 0 (fewer lines):
        ACCEPT (simplification)
    ELSE:
        REJECT

IF combined_duration_ms worsened by >1%:
    REJECT
```

## Root Causes to Seed (starting hypotheses)

1. **Per-test `compileDef` calls**: Multiple tests compile the same game spec independently. Caching or hoisting compilation to `before()` hooks could eliminate redundant work.
2. **Repeated `clearAllZones` + `initialState`**: Tests that reset state from scratch instead of cloning a pre-built baseline.
3. **Deep object spreads**: Spreading large GameDef/GameState objects in tight loops.
4. **Decision loop iterations**: `advanceToPhase`/`advanceToRound` helpers that loop through many game decisions to reach a target state.
5. **Sequential test execution**: Tests within a suite that could share setup but don't.

## Autonomy Directive

Once the loop begins, run indefinitely. Do NOT ask for permission to continue. Do NOT stop when easy ideas run out — re-read files, combine near-misses, try radical alternatives. The loop runs until externally interrupted.
