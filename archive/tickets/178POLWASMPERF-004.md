# 178POLWASMPERF-004: Add same-run terminal-boundary and no-counter attribution counters

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None expected - profiler/report helper instrumentation only unless live evidence proves a tiny policy-agent attribution hook is needed
**Deps**: `archive/tickets/178POLWASMPERF-003.md`, `reports/178-phase-2-terminal-boundary-no-counter-split.md`

## Problem

`reports/178-phase-2-terminal-boundary-no-counter-split.md` found that the remaining material Spec 178 residuals are still not implementation-ready:

1. `production-deep-choosenstep-continuation.projectedState` has `17,716.9522 ms`, or `24.13%` of slow-tier FITL ARVN agent-call wall time, but the current CSV row shape collapses expected terminal/outcome/depth/stochastic exits and missing projected-state support into one unsupported reason.
2. `coupArvnRedeployPolice:chooseOne | continuedDeepening` has `7,041.9350 ms`, or `9.59%` of slow-tier wall time, with zero route/unsupported signal in the same WASM-on artifact. Cross-run TS-only buckets implicate `tokenStateIndex:*` at only `1,365.2646 ms`, or `1.86%` of slow-tier wall time, so the material no-counter residual remains unattributed.

Without same-run attribution counters, a new implementation spec would still guess whether the next owner is terminal-boundary semantics, missing projected-state materialization, preview-drive route coverage, policy search orchestration, token-state indexing, or another outside-WASM path.

## Assumption Reassessment (2026-05-17)

1. `reports/178-phase-2-terminal-boundary-no-counter-split.md` ends with `create-investigation-ticket: Add same-run terminal-boundary and no-counter attribution counters`. **Confirmed.**
2. Existing Phase 0 WASM-on rows contain unsupported-reason JSON, route/unsupported deltas, preview branch, microturn class, and selected move metadata, but do not serialize terminal boundary kind or expected-vs-missing projected-state classification. **Confirmed from the Phase 2 report and `packages/engine/src/agents/policy-preview-inner-deepening.ts`.**
3. Existing Phase 2 `--profile-buckets --no-wasm` rows expose TS-only hot buckets for the matching no-counter axis, but they are cross-run evidence and do not explain the same WASM-on no-counter rows. **Confirmed from the Phase 2 report.**
4. No other active ticket owns this missing same-run attribution substrate. **Confirmed by active ticket scan during post-ticket review of `178POLWASMPERF-003`.**

## Architecture Check

1. **Foundation #20 provenance.** Add counters or row fields that preserve terminal-boundary, unsupported, no-counter, and TS-only attribution as separate carriers; do not coerce unavailable preview evidence into a scalar.
2. **Foundation #15 root ownership.** The goal is to make the root owner measurable before creating an implementation spec.
3. **Foundation #1 engine agnosticism.** FITL ARVN remains the witness workload only. Any emitted attribution field must be generic to policy-agent / preview-drive instrumentation.
4. **Foundation #14 no compatibility shim.** Do not add legacy aliases or parallel report formats; extend the current profiler/report surfaces in place.

## What to Change

### 1. Add terminal-boundary attribution for projected-state unsupported rows

Extend the smallest current profiler/report surface so `production-deep-choosenstep-continuation.projectedState` rows can be split into:

- expected terminal/outcome/stochastic/depth/seat-turn boundary exits where no projected state should be materialized;
- missing materialization/support cases where a generic implementation owner could exist;
- still-ambiguous rows with enough evidence to explain why they remain ambiguous.

Prefer a same-run CSV row field or unsupported-reason detail that can be aggregated without rerunning a separate probe.

### 2. Add same-run attribution for no-counter continued-deepening chooseOne rows

For `coupArvnRedeployPolice:chooseOne | continuedDeepening`, make the same WASM-on profiler artifact explain why route/unsupported counters are absent and where the wall time is going:

- unsupported preview-drive routing that should emit a counter;
- TS-only policy search/hash/index/query bucket families, including `tokenStateIndex:*`, `zobrist:*`, and `evalQuery:*`;
- continued-deepening orchestration or policy search outside the WASM route;
- another outside-WASM path or noisy residual.

Keep cross-run `--no-wasm` comparisons labeled as diagnostic unless the same command can attribute the row.

### 3. Produce a checked-in attribution report

Create a checked-in report, tentatively `reports/178-phase-3-same-run-attribution-counters.md`, that records:

- exact commands and evidence inputs;
- terminal-boundary projected-state split rows, counts, wall time, and classification;
- no-counter axis same-run attribution, counters or absence of counters, wall time, and classification;
- whether any concrete owner now clears the `5%` slow-tier materiality bar;
- one final recommendation.

The final recommendation must be exactly one of:

- `create-spec: <short title>` when a concrete generic owner has measured or tightly bounded ceiling of at least `5%` slow-tier FITL ARVN wall time, or a smaller critical-architecture rationale is explicit;
- `create-investigation-ticket: <short title>` when a narrower missing measurement remains;
- `stop: no-material-owner-found` when no evidence-backed next owner exists.

If `create-spec` is recommended, include the problem statement, materiality threshold, required proof lanes, and Foundation #20 / #14 constraints. Do not create the implementation spec in this ticket unless the user explicitly asks after reviewing the report.

## Files to Touch

- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (modify if needed for same-run row/counter capture)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` (modify if needed for report/CSV rendering)
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` (modify only if the terminal-boundary detail must be emitted at the source)
- `packages/engine/src/agents/policy-wasm-runtime-counters.ts` (modify if the unsupported-reason detail shape needs structured attribution fields)
- `packages/engine/test/unit/agents/policy-wasm-runtime-preview-drive-counters.test.ts` (modify if counter detail shape changes)
- `packages/engine/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.ts` (new, if report/CSV rendering shape changes)
- `reports/178-phase-3-same-run-attribution-counters.md` (new)
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-same-run-attribution-counters.csv` (new decisive same-run raw artifact)
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-same-run-attribution-counters.md` (new decisive same-run rendered artifact)
- `tickets/178POLWASMPERF-005.md` (new only if the report recommends another investigation ticket)

## Out of Scope

- Implementing a WASM ABI, runtime, policy-profile, kernel, GameSpecDoc, runner, or performance optimization.
- Treating terminal-boundary unsupported rows as missing support without same-run evidence.
- Treating cross-run `--no-wasm` buckets as same-run attribution.
- Creating an implementation spec before the same-run attribution identifies a concrete material owner.

## Acceptance Criteria

### Tests That Must Pass

1. The same-run profiler/report surface can split projected-state terminal-boundary rows into expected exits, missing support, or still ambiguous.
2. The same-run profiler/report surface attributes the `coupArvnRedeployPolice:chooseOne | continuedDeepening` no-counter axis or explicitly records the remaining missing measurement.
3. The checked-in report exists and cites exact evidence inputs and commands.
4. The report preserves Foundation #20 provenance and FITL ARVN witness-workload limitations.
5. The report ends with exactly one recommendation: `create-spec`, `create-investigation-ticket`, or `stop`.
6. Existing active-ticket dependency integrity passes: `pnpm run check:ticket-deps`.

### Invariants

1. No runtime optimization lands in this ticket.
2. Any helper/script/source change is measurement-only and records why existing reports were insufficient.
3. Any future implementation recommendation must be generic engine or policy-agent work, with FITL ARVN framed as the witness workload only.

## Test Plan

### New/Modified Tests

1. Add or update the smallest focused script smoke or test that proves the new attribution output shape.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Run the focused script/test that proves the new attribution output.
3. `pnpm run check:ticket-deps`
4. `git diff --check`

## Outcome (2026-05-17)

**Completion date:** 2026-05-17.

**Durable state:** `COMPLETED`. The recommendation is a narrower follow-up investigation, not an implementation spec.

**Landed scope:**

- Added structured projected-state unsupported detail fields: `projectedStateBoundaryKind` and `projectedStateClassification`.
- Extended the FITL ARVN decomposition CSV with `hotPathBucketFamilies`, `sameRunNoCounterAttribution`, and `terminalBoundaryProjectionSplit`.
- Added a rendered `Terminal-Boundary Projected-State Split` report section.
- Produced the decisive same-run slow-tier artifacts:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-same-run-attribution-counters.csv`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-same-run-attribution-counters.md`
- Produced `reports/178-phase-3-same-run-attribution-counters.md`.
- Created `tickets/178POLWASMPERF-005.md` as the non-overlapping follow-up for the remaining material unbucketed/orchestration residual.

**Post-review correction:** Replaced the new hot-path bucket family tie-breaker in `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` with codepoint ordering instead of ambient `localeCompare`, and added a focused regression assertion in `packages/engine/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.ts`.

**Decision:** `create-investigation-ticket: Split continued-deepening orchestration residual from unbucketed policy search work`. The terminal-boundary projected-state residual is no longer an implementation candidate in this witness: all `241` same-run unsupported reasons were classified as expected `seat-or-turn-boundary` exits. The no-counter `coupArvnRedeployPolice:chooseOne | continuedDeepening` axis remains material at `7,743.6802 ms`, or `9.79%` of same-run slow-tier wall time, but same-run `tokenStateIndex:*`, `evalQuery:*`, and `zobrist:*` buckets explain only `1,655.1061 ms`, or `2.09%`; the remaining `6,088.5741 ms`, or `7.70%`, needs a narrower residual split before an implementation spec is honest.

**Deliverable ledger:**

- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` — done; preserves projected-state reason detail fields across per-decision deltas and aggregate rollups.
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` — done; adds CSV attribution fields and terminal-boundary split rendering.
- `packages/engine/src/agents/policy-preview-inner-deepening.ts` — done; emits expected terminal-boundary projected-state classification at the source.
- `packages/engine/src/agents/policy-wasm-runtime-counters.ts` — done; structured unsupported detail fields are part of the counter row shape.
- `packages/engine/test/unit/agents/policy-wasm-runtime-preview-drive-counters.test.ts` — done; proves counter detail preservation.
- `packages/engine/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.ts` — done; proves the CSV/report output shape.
- `reports/178-phase-3-same-run-attribution-counters.md` — done; checked-in decision report.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-same-run-attribution-counters.csv` — done; checked-in decisive raw artifact.
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-same-run-attribution-counters.md` — done; checked-in decisive rendered artifact.
- `tickets/178POLWASMPERF-005.md` — done; follow-up investigation owner for the remaining residual.

**Command ledger:**

| Ticket command | Final citation |
|---|---|
| `pnpm -F @ludoforge/engine build` | passed after post-review cleanup |
| focused script/test proving attribution output | `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-wasm-runtime-preview-drive-counters.test.js dist/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.js` passed with 4 tests after post-review cleanup |
| decisive profiler command | `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-phase-3-same-run-attribution-counters --profile-buckets` passed after sandbox escalation; wrote the checked-in CSV and Markdown artifacts |
| `pnpm run check:ticket-deps` | passed before terminal status; checked 2 active tickets and 2388 archived tickets |
| `pnpm run check:ticket-deps` after terminal status | passed; checked 2 active tickets and 2388 archived tickets |
| `git diff --check` | passed |
| untracked artifact whitespace | passed via `git diff --no-index --check /dev/null <path>` for the new test, decision report, raw CSV/Markdown artifacts, and follow-up ticket; each emitted no diagnostics |

**Generated/schema fallout:** no schema, generated JSON, GameSpecDoc, visual config, or WASM ABI artifact changed. The new generated evidence artifacts are checked-in report/CSV files under `reports/`.

**Source-size ledger:** `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs | before 780 | after 796 | crossed cap? no | active growth 16 lines | extraction/defer rationale: compact in-place preservation of existing aggregate helpers kept the near-cap script under the 800-line cap; no successor needed`.

**Runtime surface breadth:** policy/agent measurement-only. No runtime optimization or game-specific behavior changed.

**Late-edit proof validity:** terminal status/proof transcription only after the source, test, report, raw artifacts, and follow-up ticket were already truthful and the final build, focused tests, decisive profiler command, and pre-status dependency integrity had passed. Post-review cleanup changed only deterministic report-family ordering for equal-time hot-path family ties plus its focused test; it does not change schema, generated runtime artifacts, acceptance boundary, dependency edges, or the measured Phase 3 materiality decision. The engine package rebuild and focused Node test command passed after the cleanup.
