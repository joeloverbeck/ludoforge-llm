# 178POLWASMPERF-003: Split terminal-boundary and no-counter policy-agent residual owners

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None expected - measurement/report helper changes only unless live evidence proves a tiny profiler attribution gap
**Deps**: `archive/tickets/178POLWASMPERF-002.md`, `reports/178-phase-1-fallback-wall-time-attribution.md`

## Problem

`reports/178-phase-1-fallback-wall-time-attribution.md` found two material but not implementation-ready residual families:

1. `production-deep-choosenstep-continuation.projectedState` has `17,716.9522 ms` attributed wall time, or `24.13%` of slow-tier FITL ARVN agent-call wall time, but the unsupported reason may be an expected terminal-boundary semantic exit rather than missing WASM projected-state support.
2. `coupArvnRedeployPolice:chooseOne | continuedDeepening` has `7,041.9350 ms`, or `9.59%` of slow-tier wall time, with no route or unsupported counter signal, so the current artifacts cannot identify whether the owner is preview-drive support, TS-only hash/index/query work, policy search shape, or another outside-WASM path.

Without splitting these two owners, a new implementation spec would either overfit terminal-boundary unsupported rows or ignore the material no-counter axis.

## Assumption Reassessment (2026-05-17)

1. `reports/178-phase-1-fallback-wall-time-attribution.md` ends with `create-investigation-ticket: Split terminal-boundary projected-state unsupported time from no-counter continued-deepening chooseOne policy work`. **Confirmed.**
2. Before this ticket was created, no active ticket owned this split; `178POLWASMPERF-002` is archived as the attribution-report owner and this ticket is the active continuation. **Confirmed by active ticket scan and archive rewrite.**
3. The top unsupported owner is material by attributed wall time, but current evidence does not distinguish expected terminal exits from missing projected-state materialization. **Confirmed from the Phase 1 report.**
4. The top no-counter axis independently clears the `5%` slow-tier materiality bar, but current route and unsupported counters do not explain it. **Confirmed from the Phase 1 report.**
5. The Phase 2 `--profile-buckets --no-wasm` artifact shows material TS-only `zobrist:*` and `tokenStateIndex:*` families, but it is not a same-run attribution over the WASM-on fallback/no-signal rows. **Confirmed from the Phase 1 report.**

## Architecture Check

1. **Foundation #20 provenance.** Terminal-boundary unsupported rows, no-counter axes, TS-only buckets, and noisy outside-WASM residuals must remain separate carriers until evidence proves a shared owner.
2. **Foundation #15 root ownership.** The investigation must select a root owner before an implementation spec is honest; it must not convert ambiguous residual wall time into a guessed optimization target.
3. **Foundation #1 engine agnosticism.** FITL ARVN remains the witness workload only. Any eventual implementation recommendation must be generic engine or policy-agent work.
4. **Foundation #14 no compatibility shim.** Do not add a legacy route, lower bar, or compatibility path to make ambiguous rows look supported.

## What to Change

### 1. Classify terminal-boundary projected-state unsupported rows

Using the existing Phase 0/Phase 1 artifacts as the starting point, produce bounded evidence that splits `production-deep-choosenstep-continuation.projectedState` rows into:

- expected terminal-boundary exits where no projected state should be materialized;
- missing materialization/support cases that could become a generic implementation owner;
- still-ambiguous rows that need narrower instrumentation before implementation.

Prefer a report-only classification if existing artifacts are sufficient. Add tiny measurement-only counters or report-helper support only if the existing artifacts cannot make the split reproducible.

### 2. Attribute the largest no-counter continued-deepening chooseOne axis

For `coupArvnRedeployPolice:chooseOne | continuedDeepening`, identify why the current counters are absent and whether the wall time is best explained by:

- unsupported preview-drive routing that should have emitted a counter;
- TS-only policy search/hash/index/query work, including overlap with `zobrist:*` and `tokenStateIndex:*` buckets;
- policy search shape or continued-deepening orchestration outside the WASM route;
- another outside-WASM path or noisy run-to-run residual.

Keep this attribution tied to the same slow-tier FITL ARVN witness workload and label any cross-run comparison as noisy unless the same command can attribute it.

### 3. Produce a checked-in decision report

Create a checked-in report, tentatively `reports/178-phase-2-terminal-boundary-no-counter-split.md`, that records:

- exact evidence inputs and commands;
- terminal-boundary split rows, counts, wall time, and classification;
- no-counter axis attribution, counters or absence of counters, wall time, and classification;
- whether TS-only `zobrist:*`, `tokenStateIndex:*`, or `evalQuery:*` buckets are implicated in the no-counter axis;
- one final recommendation.

The final recommendation must be exactly one of:

- `create-spec: <short title>` when a concrete generic owner has measured or tightly bounded ceiling of at least `5%` slow-tier FITL ARVN wall time, or a smaller critical-architecture rationale is explicit;
- `create-investigation-ticket: <short title>` when a narrower missing measurement remains;
- `stop: no-material-owner-found` when no evidence-backed next owner exists.

If `create-spec` is recommended, include the problem statement, materiality threshold, required proof lanes, and Foundation #20 / #14 constraints. Do not create the implementation spec in this ticket unless the user explicitly asks after reviewing the report.

## Files to Touch

- `reports/178-phase-2-terminal-boundary-no-counter-split.md` (new)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (modify only if a tiny attribution gap is proven)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` (modify only if a tiny report-rendering gap is proven)
- `reports/178-phase-1-fallback-wall-time-attribution.md` (modify only if a dated interpretation amendment is needed)

## Out of Scope

- Implementing a WASM ABI, runtime, policy-profile, kernel, GameSpecDoc, or runner optimization.
- Treating terminal-boundary unsupported rows as missing support without evidence.
- Collapsing no-counter axes into unsupported preview-drive counts without proving the counter gap.
- Reopening Spec 177 transfer reduction or lowering the materiality bar.
- Creating an implementation spec before the split identifies a concrete material owner.

## Acceptance Criteria

### Tests That Must Pass

1. The split report exists and cites exact evidence inputs and commands.
2. The report classifies terminal-boundary projected-state unsupported rows as expected exits, missing support, or still ambiguous.
3. The report attributes the `coupArvnRedeployPolice:chooseOne | continuedDeepening` no-counter axis or explicitly marks the remaining missing measurement.
4. The report preserves Foundation #20 provenance and FITL ARVN witness-workload limitations.
5. The report ends with exactly one recommendation: `create-spec`, `create-investigation-ticket`, or `stop`.
6. Existing active-ticket dependency integrity passes: `pnpm run check:ticket-deps`.

### Invariants

1. No runtime optimization lands in this ticket.
2. Any helper/script change is measurement-only and records why existing reports were insufficient.
3. Any future implementation recommendation must be generic engine work, with FITL ARVN framed as the witness workload only.

## Test Plan

### New/Modified Tests

No automated tests are expected if this remains report-only. If a profiler/report helper changes, add or update the smallest focused test or smoke command covering the new attribution output.

### Commands

1. `pnpm run check:ticket-deps`
2. `git diff --check`
3. If a profiler/report helper changes: `pnpm -F @ludoforge/engine build`
4. If a profiler/report helper changes: run the focused script/test that proves the new attribution output

## Outcome (2026-05-17)

**Completion date:** 2026-05-17.

**Durable state:** `COMPLETED` as a report-only investigation ticket. The recommendation is a narrower follow-up investigation, not an implementation spec.

**Landed scope:** `reports/178-phase-2-terminal-boundary-no-counter-split.md` classifies the two Phase 1 residual owners using existing checked-in Phase 0 and Phase 2 CSV artifacts plus source inspection of the current counter emitters. No runtime, WASM ABI, policy profile, GameSpecDoc, runner, profiler helper, or report-rendering helper changed.

**Deliverable ledger:**

- `reports/178-phase-2-terminal-boundary-no-counter-split.md` — done; checked-in report artifact.
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` — verified-no-edit; existing row fields expose route/unsupported deltas, preview branch, microturn class, unsupported-reason JSON, hot buckets, and selected move metadata, which are enough to classify the current evidence limit.
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` — verified-no-edit; this ticket's durable artifact is the checked-in split report, and no generated report section was needed.
- `reports/178-phase-1-fallback-wall-time-attribution.md` — verified-no-edit; Phase 2 refines the next investigation owner without changing the Phase 1 interpretation.

**Decision:** `create-investigation-ticket: Add same-run terminal-boundary and no-counter attribution counters`. The report found no implementation-ready owner: the `projectedState` unsupported reason remains a material but collapsed terminal-boundary carrier, and the no-counter `coupArvnRedeployPolice:chooseOne | continuedDeepening` axis remains material but lacks same-run attribution. Cross-run TS-only buckets implicate `tokenStateIndex:*` at `1,365.2646 ms`, or `1.86%` of slow-tier wall time, below the `5%` spec-ready materiality bar.

**Post-review follow-up:** Created `tickets/178POLWASMPERF-004.md` to own the recommended same-run terminal-boundary and no-counter attribution counters before archiving this report-only ticket. The follow-up is non-overlapping: this ticket produced the Phase 2 split report; `178POLWASMPERF-004` must add the missing same-run attribution substrate and produce the next decision report.

**Generated/schema fallout:** none. This is markdown/report-only; no source, schema, generated JSON, GameSpecDoc, or visual config changed.

**Verification:**

- `pnpm run check:ticket-deps` — passed before terminal status; checked 1 active ticket and 2387 archived tickets.
- `git diff --check` — passed before terminal status.
- `git diff --no-index --check /dev/null reports/178-phase-2-terminal-boundary-no-counter-split.md` — whitespace-clean for the new untracked report; command exited with ordinary no-index diff status and no diagnostics.
- `pnpm run check:ticket-deps` — passed after terminal status; checked 1 active ticket and 2387 archived tickets.

**Late-edit proof validity:** terminal status/proof transcription only after the report and outcome were already truthful; no source, test, schema, generated artifact, command semantics, dependency ownership, acceptance boundary, or touched-file scope changed. Post-status dependency integrity passed; the post-status result transcription is clerical and does not change scope, status, deps, sibling ownership, or command semantics.

**Runtime surface breadth:** no runtime surface change; report-only planning/evidence surface.
