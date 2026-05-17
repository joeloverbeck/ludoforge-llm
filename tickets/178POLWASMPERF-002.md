# 178POLWASMPERF-002: Attribute fallback and outside-WASM policy-agent wall time

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None expected - measurement/report helper changes only unless live evidence proves a tiny profiler attribution gap
**Deps**: `archive/tickets/178POLWASMPERF-001.md`, `reports/178-policy-agent-bottleneck-discovery.md`, `reports/176-phase-3-cheap-vs-expensive-coverage.md`

## Problem

`reports/178-policy-agent-bottleneck-discovery.md` found that Spec 177's rejected transfer-reduction shape is not the next material owner. The largest remaining known class is TS-fallback / no-WASM-signal plus outside-WASM policy-agent work: Phase 3 measured `38,521.2183 ms`, or `52.4665%`, of slow-tier agent-call time in that broad class.

That class is material, but it is not implementation-ready. The current reports do not tightly attribute wall time by unsupported preview-drive owner, no-counter axis, and TS-only hot-bucket family. Without that attribution, a new implementation spec would either replay a rejected route-local WASM optimization or guess which fallback/no-signal family owns enough wall time to clear a materiality gate.

## Assumption Reassessment (2026-05-17)

1. `reports/178-policy-agent-bottleneck-discovery.md` ends with `create-investigation-ticket: Attribute TS-fallback/no-WASM-signal and outside-WASM policy-agent wall time by unsupported owner, no-counter axis, and TS-only hot-bucket family`. **Confirmed.**
2. Phase 3 already measured the broad residual: `38,521.2183 ms` TS-fallback / no-WASM-signal wall time out of `73,420.5845 ms` slow-tier agent-call time. **Confirmed.**
3. The existing Phase 0 CSV includes per-row route counts, unsupported counts, unsupported-reason JSON, hot-axis fields, and selected move metadata, but it does not directly report wall-time attribution grouped by unsupported owner plus no-counter axis plus TS-only hot-bucket family in one same-command artifact. **Confirmed by `reports/178-policy-agent-bottleneck-discovery.md` and script/report surface inspection.**
4. Existing script surfaces near the likely seam are `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` and `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs`; they already emit unsupported reasons and optional hot-path buckets. **Confirmed.**
5. No other active ticket currently owns this attribution gap. **Confirmed during post-ticket review of `178POLWASMPERF-001`.**

## Architecture Check

1. **Measurement before architecture.** Foundation #15 favors identifying the root owner before authoring another implementation spec. This ticket is the evidence gate that prevents laundering the rejected Spec 177 batching shape into a new ticket.
2. **Preview signal integrity.** Foundation #20 requires preserving unsupported/no-signal provenance. This ticket must group and report unsupported owners, reasons, no-counter axes, and advisory/no-signal statuses explicitly rather than converting them into one scalar.
3. **Engine agnosticism.** FITL ARVN remains the witness workload. Any eventual implementation hypothesis must be generic; this ticket only attributes the witness workload's policy-agent wall time.
4. **No backwards-compatibility surface.** If a tiny profiler/report helper change is needed, it should extend the current report surface in place with no parallel legacy report format or compatibility shim.

## What to Change

### 1. Build a same-command attribution report

Create a checked-in report, tentatively `reports/178-phase-1-fallback-wall-time-attribution.md`, that attributes the material fallback/no-signal residual across these groups:

- unsupported preview-drive owner/reason, with wall-time contribution and count;
- no-counter axes, including axis label, decisions, wall time, and why current counters do not explain them;
- TS-only hot-bucket families visible under `--profile-buckets`, especially `zobrist:*`, `tokenStateIndex:*`, and `evalQuery:*`;
- outside-WASM / run-to-run residual evidence, explicitly labeled noisy unless the same command can attribute it.

Use the same slow-tier seed set as the existing Phase 3 witness unless live reassessment proves a narrower or stronger same-command witness is required.

### 2. Add tiny profiler/report support only if needed

Start from existing reports and CSVs. Add or modify a profiler/report helper only if the existing artifact set cannot answer the attribution question reproducibly.

If helper changes are needed:

- keep them measurement-only;
- append columns or add a new report section rather than changing existing column meaning;
- keep progress and metadata reproducible, including command, seed range, timeout, and relevant flags;
- add or update the smallest focused test or smoke proof for the helper.

### 3. Decide the next material owner

The report must end with exactly one recommendation:

- `create-spec: <short title>` only when one concrete owner has a measured or tightly bounded ceiling of at least `5%` slow-tier FITL ARVN wall time, or a smaller critical-architecture rationale is explicit;
- `create-investigation-ticket: <short title>` when a narrower missing measurement remains before an implementation spec is honest;
- `stop: no-material-owner-found` when no evidence-backed next owner exists.

If `create-spec` is recommended, include the proposed problem statement, materiality threshold, required proof lanes, and Foundation #20 / #14 constraints. Do not create the implementation spec in this ticket unless the user explicitly asks after reviewing the report.

### 4. Update prior report context if needed

If this ticket materially changes how `reports/178-policy-agent-bottleneck-discovery.md`, `reports/176-phase-3-cheap-vs-expensive-coverage.md`, or `reports/176-phase-6-decision-and-rationale.md` should be interpreted, add a short dated amendment note to the relevant report. Do not rewrite archived ticket history unless dependency integrity requires a path correction.

## Files to Touch

- `reports/178-phase-1-fallback-wall-time-attribution.md` (new)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (modify only if a tiny attribution gap is proven)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` (modify only if a tiny report-rendering gap is proven)
- `reports/178-policy-agent-bottleneck-discovery.md` (modify only if a dated interpretation amendment is needed)
- `reports/176-phase-3-cheap-vs-expensive-coverage.md` (modify only if a dated interpretation amendment is needed)
- `reports/176-phase-6-decision-and-rationale.md` (modify only if a dated interpretation amendment is needed)

## Out of Scope

- Implementing a WASM ABI, runtime, policy-profile, kernel, GameSpecDoc, or runner optimization.
- Reopening Spec 177 transfer reduction or lowering its materiality bar.
- Collapsing Foundation #20 unsupported/no-signal provenance into a single scalar.
- Treating FITL ARVN attribution as cross-game proof without explicitly labeling that limitation.
- Creating an implementation spec before the attribution report identifies a concrete material owner.

## Acceptance Criteria

### Tests That Must Pass

1. The attribution report exists and cites the exact evidence inputs and command(s) used.
2. The report attributes fallback/no-signal wall time by unsupported owner/reason, no-counter axis, and TS-only hot-bucket family, or explicitly marks any group as not currently measurable.
3. The report preserves Foundation #20 provenance in its grouping and wording.
4. The report ends with exactly one recommendation: `create-spec`, `create-investigation-ticket`, or `stop`.
5. Existing active-ticket dependency integrity passes: `pnpm run check:ticket-deps`.

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

**Landed scope:** `reports/178-phase-1-fallback-wall-time-attribution.md` attributes the fallback/no-WASM-signal residual using existing checked-in Phase 0/2/3/178 artifacts. No engine runtime, WASM ABI, policy profile, GameSpecDoc, runner, profiler helper, or report-rendering helper changed.

**Deliverable ledger:**

- `reports/178-phase-1-fallback-wall-time-attribution.md` — done; checked-in report artifact.
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` — verified-no-edit; existing CSV fields already expose route counts, unsupported counts, unsupported-reason JSON, hot buckets, seed/profile metadata, and selected move metadata.
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` — verified-no-edit; no new generated report section was required because this ticket's durable artifact is the checked-in attribution report.
- `reports/178-policy-agent-bottleneck-discovery.md` — verified-no-edit; this Phase 1 report refines the next investigation target without changing the prior interpretation.
- `reports/176-phase-3-cheap-vs-expensive-coverage.md` — verified-no-edit; reused as the authoritative Phase 3 fallback/no-signal aggregate.
- `reports/176-phase-6-decision-and-rationale.md` — verified-no-edit; Spec 176's acceleration decision and Spec 177 rejection context remain intact.

**Decision:** `create-investigation-ticket: Split terminal-boundary projected-state unsupported time from no-counter continued-deepening chooseOne policy work`. The report found material evidence, but not an implementation-ready owner: `production-deep-choosenstep-continuation.projectedState` is large but may be a terminal-boundary semantic exit, and `coupArvnRedeployPolice:chooseOne | continuedDeepening` is large but has no route or unsupported counter signal.

**Generated/schema fallout:** none. This was markdown/report-only; no source, schema, generated JSON, GameSpecDoc, or visual config changed.

**Verification:**

- `pnpm run check:ticket-deps` — pass before terminal status; checked 1 active ticket and 2386 archived tickets.
- `git diff --check` — pass before terminal status.
- `git diff --no-index --check /dev/null reports/178-phase-1-fallback-wall-time-attribution.md` — whitespace-clean for the new untracked report; command exited with ordinary no-index diff status and no diagnostics.

**Late-edit proof validity:** terminal status/proof transcription only after the report and outcome were already truthful; no source, test, schema, generated artifact, command semantics, dependency ownership, acceptance boundary, or touched-file scope changed. Post-status dependency integrity is required because the ticket status changed.
