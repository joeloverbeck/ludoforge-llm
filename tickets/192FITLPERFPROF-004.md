# 192FITLPERFPROF-004: Findings categorisation + follow-up spec naming → `reports/fitl-perf-baseline-<date>.md`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — report only
**Deps**: `tickets/192FITLPERFPROF-003.md`

## Problem

Spec 192 §4.4, §4.5, and §5 Phase 3 require the campaign's findings to be categorised under the structural rubric (Inline-fix / Cache-warmup / Allocator-reduction / Dispatch-restructure / Hash/digest-optimization / Bytecode-VM expansion / WASM expansion / Spec-190-tune / Out-of-band-cost), with the §4.5 acceptance thresholds applied (5% per-finding floor, 50% aggregate target, 30% escalation trigger). The output is `reports/fitl-perf-baseline-<YYYY-MM-DD>.md` — the proof-of-where-the-cost-lives that names the follow-up specs the recovery campaign will spawn. Without this report, the campaign produces 12 JSONs (ticket -003 output) and no actionable next-steps; with it, ticket -004 closes Phase 3 and Spec 192 itself becomes archivable.

## Assumption Reassessment (2026-05-23)

1. Per-workload JSON summaries from ticket -003 are the authoritative input — verified that ticket -003's output schema (§5 of ticket -002) carries everything this ticket needs: cpu-prof top-30, alloc-prof top-N, per-decision medians by kind, cache stats, caveats.
2. The Spec 192 §4.4 category rubric is exhaustive for the kinds of findings the baseline can surface — verified by inspection of the rubric vs. the §3.2 partial profile's known hot paths (Error-throw constructor → Dispatch-restructure or Inline-fix; Zobrist hash → Hash/digest-optimization; preview cache → Cache-warmup; allocator hot paths → Allocator-reduction).
3. Foundation 20 (Preview Signal Integrity) was added to spec §10's alignment table during reassessment — this ticket MUST explicitly check Foundation 20 for any finding touching preview behavior before naming a follow-up spec.
4. The IMPLEMENTATION-ORDER precedent at `archive/specs/IMPLEMENTATION-ORDER-2026-05-23.md` is the model for a potential `IMPLEMENTATION-ORDER-fitl-perf-recovery-<date>.md` if ≥3 interdependent follow-up specs are named — verified during reassessment.

## Architecture Check

1. **No engine source changes**: This ticket produces a markdown report plus a possible IMPLEMENTATION-ORDER index. No code modifications.
2. **Evidence-led, not speculation-led (Foundation 15)**: Every finding in the report MUST cite specific measurements (workload, SHA, %-contribution, lane scope) from the ticket -003 JSONs. Findings without numeric backing are excluded.
3. **Spec sprawl prevention (Foundation 15)**: The §4.5 5% per-finding floor and the 50% aggregate target are encoded as hard rules in this ticket's What to Change. Findings below the floor go to the report's appendix but do NOT spawn follow-up specs.
4. **Foundation 8 acknowledgment per finding**: For each named follow-up category, the report explicitly states which Foundation principles the follow-up spec MUST respect (#8 for any change touching the kernel's RNG-driven path; #20 for any change touching preview-ref status semantics; #15 for any structural change).
5. **No premature remediation**: This ticket NAMES follow-up specs (number + Goal sentence); it does NOT write them. Per spec §2 Non-Goals, remediation is downstream work.

## What to Change

### 1. Ingest per-workload summaries

For each of the 12 JSONs in `reports/perf-baseline/` (6 workloads × 2 SHAs from ticket -003):
- Compute per-workload delta: `(HEAD median - pre-Spec-190 median) / pre-Spec-190 median` × 100%
- Compute cross-workload uniformity check: if all 6 workloads regressed by similar percentages, classify cost as per-decision (per-state spike); if regression is concentrated, classify as workload-specific
- Aggregate cpu-prof top-30 entries across workloads with cross-workload weighting by wall-clock contribution
- Aggregate alloc-prof top-N similarly

### 2. Per-finding classification

For each hot path identified (function × file × workload-or-cross-workload scope):

Apply spec §4.4 rubric to classify into ONE of:
- `Inline-fix` — single-file change, no architectural impact
- `Cache-warmup` — Spec-190-stripped side effect reachable via deliberate invocation
- `Allocator-reduction` — hoistable / poolable / eliminable allocation
- `Dispatch-restructure` — typed-error / paired-contract / fallback-ladder structural cost
- `Hash/digest-optimization` — Zobrist hot loop
- `Bytecode-VM expansion` — VM throw rate dominated by unsupported feature kind
- `WASM expansion` — marshalling-acceptable hot path
- `Spec-190-tune` — preview budget / beam width / depth cap / strategy knob
- `Out-of-band-cost` — non-engine code (test wrapper, instrumentation, runner)

For each:
- Lane scope: `all-six` / one or more workload keys / `instrumentation-only`
- Origin: `Pure intrinsic` (HEAD only) / `Pure inherited` (both SHAs, unchanged) / `Mixed` (both SHAs, worse at HEAD)
- %-of-workload contribution
- Foundation-respect annotation per finding (#8 / #15 / #20 as applicable)

### 3. Apply §4.5 thresholds

- **Per-finding floor (5%)**: Findings whose contribution to total workload wall-clock is < 5% (or < 2s absolute if heavy workload) → appendix, NO follow-up spec.
- **Aggregate per-workload projection**: Per workload, sum the projected gain if all above-floor follow-up specs land. Target is 50% wall-clock reduction (halfway back to pre-Spec-190).
- **Escalation trigger (30%)**: If projected aggregate gain < 30%, flag "insufficient simple-fix headroom" and explicitly recommend a `Bytecode-VM expansion` or `WASM expansion` follow-up spec.
- **Stop criterion**: Project when the campaign closes — either aggregate target hit OR 2 consecutive sub-10% specs.

### 4. Name follow-up specs

For each above-floor finding:
- Assign a candidate spec number (next available beyond 192 — coordinate by reading current `specs/` and `archive/specs/` for the highest extant number).
- Write a one-sentence Goal: "Spec NNN — <subsystem> <category-derived verb>" (e.g., "Spec 193 — Negative-cache the `PolicyBytecodeVmUnsupportedError` verdict per `(decisionKey, featureKind)` to fire the throw once per pair, not once per evaluation.").
- List Foundation respect requirements (e.g., "MUST preserve Spec 154's paired-contract guarantees per Foundation #15; MUST re-validate Foundation #20 for any preview-cache change").

### 5. Decide on IMPLEMENTATION-ORDER index

If the report names ≥ 3 follow-up specs with interdependencies (e.g., Cache-warmup must precede Allocator-reduction in the same code path; Dispatch-restructure changes the API consumed by a Bytecode-VM expansion follow-up), author `archive/specs/IMPLEMENTATION-ORDER-fitl-perf-recovery-<date>.md` modeled on `archive/specs/IMPLEMENTATION-ORDER-2026-05-23.md`. Sections: Prerequisites (Spec 192 itself), Order (sequenced follow-up specs with rationale per edge), Deferred (post-campaign work), Rejected (any audit findings explicitly declined).

If only 1–2 follow-up specs surface (or they're independent), skip the IMPLEMENTATION-ORDER — record the rationale in the report's Reassessment section.

### 6. Author the report

`reports/fitl-perf-baseline-<YYYY-MM-DD>.md`. Sections (per spec §5 Phase 3):

1. **Verdict / scope** — one-paragraph summary: total regression, dominant categories, recommended campaign shape.
2. **Methodology recap** — pin to spec §4.1–4.5; cite ticket -001/002/003 as the substrate.
3. **Per-workload measurement table** — workload × (HEAD wall-clock median+CV) × (pre-Spec-190 median+CV) × delta % × lockfile-drift caveat.
4. **Findings table** — finding × category × lane scope × %-contribution × Foundation-respect × candidate follow-up spec number + Goal sentence.
5. **Aggregate gain projection per workload** — sum of above-floor findings; comparison against 50% target.
6. **Stop-criterion + escalation-trigger evaluation** — explicit yes/no per criterion with numeric backing.
7. **Follow-up specs section** — for each named spec: candidate number, Goal sentence, Foundation-respect requirements, lane scope, rough complexity estimate (S/M/L).
8. **Reassessment / closing section** — measurement caveats (CV outliers, lockfile drift, per-decision-cost absence at pre-Spec-190 if applicable), scope boundaries, verification-artifact disposition (whether the worktree at `/tmp/perf-baseline-pre-190` is retained or torn down; whether the harness scripts persist in main; what archives at Phase 3 closure).

### 7. Mark Spec 192 archivable

Append to the report: "Spec 192 is COMPLETE as of this report's date. Remediation work moves to the named follow-up specs; Spec 192 itself is ready for archival per `docs/archival-workflow.md`."

This ticket does NOT archive Spec 192 itself — the user runs the archival workflow when they're satisfied with the report. But the report MUST declare the campaign methodology phase complete so the user has the explicit signal.

## Files to Touch

- `reports/fitl-perf-baseline-<YYYY-MM-DD>.md` (new — `<YYYY-MM-DD>` = report-authoring date)
- `archive/specs/IMPLEMENTATION-ORDER-fitl-perf-recovery-<YYYY-MM-DD>.md` (new — only if ≥3 interdependent follow-up specs)

## Out of Scope

- Writing the actual remediation specs (Phase 4+ — out of scope per spec §11; each candidate spec is its own future authoring session)
- Tightening lane budgets toward pre-Spec-190 values (per spec §11 — owned by per-remediation-spec acceptance criteria)
- Tearing down the worktree at `/tmp/perf-baseline-pre-190` (user discretion after consuming the report)
- Changing the §4.4 category rubric or §4.5 thresholds (spec-level; would require Spec 192 reassessment)
- Cross-game extension (FITL only per spec §2)

## Acceptance Criteria

### Tests That Must Pass

1. `reports/fitl-perf-baseline-<YYYY-MM-DD>.md` exists with all 8 required sections populated (§6 above).
2. Every above-floor finding cites a specific source JSON in `reports/perf-baseline/` (traceability check).
3. The §4.5 stop-criterion and escalation-trigger evaluations are numerically defended — not hand-waved.
4. If the escalation trigger fires (< 30% projected gain), the report explicitly names a `Bytecode-VM expansion` or `WASM expansion` follow-up spec.
5. If ≥3 follow-up specs are named with interdependencies, the IMPLEMENTATION-ORDER index exists at `archive/specs/IMPLEMENTATION-ORDER-fitl-perf-recovery-<YYYY-MM-DD>.md`.
6. Existing engine suite unaffected: `pnpm -F @ludoforge/engine test` passes.
7. Lint + typecheck: `pnpm turbo lint typecheck` passes.
8. `pnpm run check:ticket-deps` continues to pass.

### Invariants

1. **Foundation 15 (Architectural Completeness)**: Every named follow-up spec addresses a root cause per the §4.4 category rubric, not a symptom. No "patch X to make Y faster" without naming the structural category.
2. **Foundation 20 (Preview Signal Integrity)**: For any follow-up spec touching preview behavior, the report's Foundation-respect column MUST flag F#20 re-validation as required.
3. **Per-finding floor (§4.5)**: No follow-up spec is named for a finding contributing < 5% to its workload's wall-clock. Sub-floor findings go to the appendix only.
4. **Evidence traceability**: Every numeric claim in the report cites the workload JSON it derives from. The report stands alone but is reproducible from the ticket -003 artifacts.

## Test Plan

### New/Modified Tests

None — this ticket produces a report and (optionally) an IMPLEMENTATION-ORDER index. The proof that the report is correctly assembled lives in the traceability check (every finding cites a JSON).

### Commands

1. Inventory ticket -003 artifacts: `ls reports/perf-baseline/*.json`
2. Report authoring: `${EDITOR:-vim} reports/fitl-perf-baseline-$(date +%Y-%m-%d).md`
3. Lint + typecheck (sanity): `pnpm turbo lint typecheck`
4. Dep check: `pnpm run check:ticket-deps`
5. Manual review: cross-check every finding's %-contribution against the cited JSON's `runs` / `cpuProfTop30SelfTime` / `perDecisionByKind` fields.
