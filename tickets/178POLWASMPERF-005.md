# 178POLWASMPERF-005: Split continued-deepening orchestration residual from unbucketed policy search work

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None expected - profiler/report helper instrumentation only unless live evidence proves a tiny policy-agent attribution hook is needed
**Deps**: `archive/tickets/178POLWASMPERF-004.md`, `reports/178-phase-3-same-run-attribution-counters.md`

## Problem

`reports/178-phase-3-same-run-attribution-counters.md` added the missing same-run attribution substrate and found that the terminal-boundary projected-state residual is expected boundary behavior, not missing projected-state support.

The remaining material owner is now narrower: `coupArvnRedeployPolice:chooseOne | continuedDeepening` has `7,743.6802 ms`, or `9.79%` of same-run slow-tier FITL ARVN agent-call wall time, with zero route/unsupported signal. Same-run hot-path buckets explain only `1,655.1061 ms`, or `2.09%` of slow-tier wall time. The unbucketed / continued-deepening orchestration / policy-search residual is still material at `6,088.5741 ms`, or `7.70%`, but it is not yet specific enough for an implementation spec.

Without splitting that residual, a new implementation spec would still guess whether the next owner is continued-deepening orchestration, policy search candidate preparation, policy scoring outside the current buckets, another missing hot-path bucket family, or residual measurement noise.

## Assumption Reassessment (2026-05-17)

1. `reports/178-phase-3-same-run-attribution-counters.md` ends with `create-investigation-ticket: Split continued-deepening orchestration residual from unbucketed policy search work`. **Confirmed.**
2. Same-run `tokenStateIndex:*`, `evalQuery:*`, and `zobrist:*` buckets are present on the no-counter rows, but none clears the `5%` slow-tier materiality bar. **Confirmed from the Phase 3 report.**
3. The unbucketed/orchestration residual remains material at `7.70%` of same-run slow-tier wall time. **Confirmed from the Phase 3 report.**
4. Terminal-boundary projected-state support is no longer a same-series implementation candidate unless future evidence contradicts the Phase 3 classification. **Confirmed from the Phase 3 terminal-boundary split.**

## Architecture Check

1. **Foundation #20 provenance.** Keep no-counter rows, same-run hot buckets, unbucketed orchestration time, and route/unsupported counters as separate carriers.
2. **Foundation #15 root ownership.** Select a concrete generic owner before creating an implementation spec.
3. **Foundation #1 engine agnosticism.** FITL ARVN remains the witness workload only. Any emitted attribution field must be generic policy-agent / preview-drive instrumentation.
4. **Foundation #14 no compatibility shim.** Extend current profiler/report surfaces in place; do not add legacy aliases or parallel report formats.

## What to Change

### 1. Split the unbucketed continued-deepening residual

Extend the smallest current profiler/report surface so no-counter `continuedDeepening` chooseOne rows can distinguish:

- continued-deepening orchestration overhead;
- policy search candidate preparation outside existing buckets;
- policy scoring/evaluation work that lacks a hot-path bucket;
- missing route/unsupported counter emission;
- residual noise or unsupported attribution.

Prefer same-run row fields or hot-path bucket families that can be aggregated from the existing decomposition CSV.

### 2. Produce a checked-in decision report

Create a checked-in report, tentatively `reports/178-phase-4-continued-deepening-orchestration-residual.md`, that records:

- exact commands and evidence inputs;
- no-counter axis wall time, row counts, and route/unsupported counters;
- new residual split rows, counts, wall time, and classification;
- whether any concrete owner clears the `5%` slow-tier materiality bar;
- one final recommendation.

The final recommendation must be exactly one of:

- `create-spec: <short title>` when a concrete generic owner has measured or tightly bounded ceiling of at least `5%` slow-tier FITL ARVN wall time, or a smaller critical-architecture rationale is explicit;
- `create-investigation-ticket: <short title>` when a narrower missing measurement remains;
- `stop: no-material-owner-found` when no evidence-backed next owner exists.

If `create-spec` is recommended, include the problem statement, materiality threshold, required proof lanes, and Foundation #20 / #14 constraints. Do not create the implementation spec in this ticket unless the user explicitly asks after reviewing the report.

## Files to Touch

- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (modify if needed for same-run row/counter capture)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` (modify if needed for report/CSV rendering)
- policy-agent source files under `packages/engine/src/agents/` (modify only if the residual split must be emitted at the source)
- `reports/178-phase-4-continued-deepening-orchestration-residual.md` (new)

## Out of Scope

- Implementing a WASM ABI, runtime, policy-profile, kernel, GameSpecDoc, runner, or performance optimization.
- Reopening the terminal-boundary projected-state residual without new contradictory same-run evidence.
- Treating same-run `tokenStateIndex:*`, `evalQuery:*`, or `zobrist:*` buckets as spec-ready material owners when the Phase 3 report keeps them below the `5%` bar.
- Creating an implementation spec before the residual split identifies a concrete material owner.

## Acceptance Criteria

### Tests That Must Pass

1. The same-run profiler/report surface can split the unbucketed continued-deepening residual into concrete attribution classes or explicitly records the remaining missing measurement.
2. The checked-in report exists and cites exact evidence inputs and commands.
3. The report preserves Foundation #20 provenance and FITL ARVN witness-workload limitations.
4. The report ends with exactly one recommendation: `create-spec`, `create-investigation-ticket`, or `stop`.
5. Existing active-ticket dependency integrity passes: `pnpm run check:ticket-deps`.

### Invariants

1. No runtime optimization lands in this ticket.
2. Any helper/script/source change is measurement-only and records why existing reports were insufficient.
3. Any future implementation recommendation must be generic engine or policy-agent work, with FITL ARVN framed as the witness workload only.

## Test Plan

### New/Modified Tests

1. Add or update the smallest focused script smoke or test that proves the new residual split output shape.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Run the focused script/test that proves the new attribution output.
3. `pnpm run check:ticket-deps`
4. `git diff --check`
