# 178CONTDEEPINNER-003: Phase 2 — End-to-end witness validation + wall-time delta report

**Status**: BLOCKED by failed measured gate
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — measurement and report only
**Deps**: `archive/tickets/178CONTDEEPINNER-002.md`

## Problem

Phase 1 (`178CONTDEEPINNER-002`) lands a targeted optimization on the Phase 0 named subroutine owner and proves outcome parity, but does not measure end-to-end wall-time impact on the target axes. Without a checked-in post-optimization witness, the spec cannot close — Foundation #16 (Testing as Proof) requires wall-time wins to be demonstrated by measured artifacts, not asserted in prose. Phase 2 also confirms the fix amortizes across the sister axis (`coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening`, 2.17% per the Phase 4 evidence), which spec §6 acceptance #5 requires as proof that the optimization is generic and not coincidentally aligned to the primary axis.

## Assumption Reassessment (2026-05-17)

1. **Phase 1 has landed.** `178CONTDEEPINNER-002` is COMPLETED before this ticket starts; its outcome-parity test passes and its optimization is in the main branch.
2. **The witness command is unchanged** from `178POLWASMPERF-005` and Phase 0 (`178CONTDEEPINNER-001`). Verified at `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`; reuse the seeds `1005,1011,1008,1013,1009`, the `600000 ms` timeout, and the `--profile-buckets` flag.
3. **The renderer's `Continued-Deepening No-Counter Residual Split` section** emits per-classification rows for both target axes. Verified at `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs:585-`. The post-optimization run's rendered Markdown will show the new wall ms for the named subroutine owner and the inclusive bucket; no renderer change is needed for Phase 2.
4. **The 40% / 25% acceptance thresholds** (spec §6 #5) are denominated as share of the Phase 0 named-owner wall ms, not raw absolute ms. This absorbs slow-tier wall-time drift between Phase 0 and Phase 2 runs.
5. **No engine source change in Phase 2.** Per spec §5 Phase 2 effort estimate and per §6 acceptance #6, this ticket is measurement-and-report only.

## Architecture Check

1. **No engine code change.** This ticket re-runs the witness command, inspects the new artifact, and authors a report. Foundation alignment work has already been demonstrated by Phase 0 (instrumentation) and Phase 1 (optimization + parity test).
2. **Witness substrate reused, not duplicated.** Per Foundation #14, no parallel report format is created; the existing `Continued-Deepening No-Counter Residual Split` section is consumed as-is.
3. **The Phase 2 report records a forward-recommendation.** Per the post-Spec-176 discipline (every measurement report ends with exactly one of `create-spec` / `create-investigation-ticket` / `stop`), this report names whether the post-178 owner inventory leaves any residual material owner worth pursuing.

## What to Change

### 1. Run the post-optimization witness command

```
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1005,1011,1008,1013,1009 \
  --timeout-ms 600000 \
  --date 2026-MM-DD-spec-178-phase-2-post-optimization-wall-time \
  --profile-buckets
```

This writes `reports/fitl-arvn-15-seed-decomposition-2026-MM-DD-spec-178-phase-2-post-optimization-wall-time.csv` and `.md`.

### 2. Author the Phase 2 validation report

Create `reports/178-phase-2-post-optimization-wall-time.md` recording:

- **Evidence inputs** table: the Phase 2 CSV/MD artifact paths, the Phase 0 witness for baseline comparison, the Phase 1 ticket reference.
- **Wall-time delta on the primary axis**: pre-optimization (Phase 0) and post-optimization (Phase 2) wall ms for `continued-deepening-orchestration-inclusive` on `coupArvnRedeployPolice:chooseOne | continuedDeepening`, plus the per-subroutine breakdown showing the named owner's reduction.
- **Wall-time delta on the sister axis**: same comparison for `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening`.
- **Acceptance verdict** against spec §6 #5:
  - Named subroutine owner's wall ms drops `≥ 40%` of its Phase 0 share — pass/fail.
  - Primary-axis inclusive bucket shows the same directional drop — pass/fail.
  - Sister axis shows `≥ 25%` reduction of its share of the same owner — pass/fail.
- **Foundation #20 carrier preservation**: pre/post comparison of route counters, unsupported reason counts, advisory totals on the witness corpus. Counter parity within noise — pass/fail.
- **Foundation alignment table** (#1, #14, #15, #16, #20).
- **Final recommendation**, exactly one of:
  - `stop: post-178 follow-up not warranted` — if no residual axis clears the 5% bar after this optimization, and the post-178 owner inventory is exhausted.
  - `create-spec: <next owner>` — if a new owner emerges or a previously-deferred owner now clears the bar relative to the new total.
  - `create-investigation-ticket: <next gap>` — if a residual is material but lacks attribution detail for a spec-ready owner.

### 3. Append Outcome to Spec 178

After the report is checked in and the acceptance verdict is recorded, edit `specs/178-optimize-continued-deepening-inner-preview-orchestration.md` §13 Outcome with:

- Completion date.
- Phase 2 report path.
- The acceptance verdict summary (one line per #5 sub-criterion).
- The final recommendation copied from the Phase 2 report.

This appends to the existing `## 13. Outcome` placeholder, replacing the `(Recorded at completion.)` line.

## Files to Touch

- `reports/178-phase-2-post-optimization-wall-time.md` (new — Phase 2 validation report)
- `reports/fitl-arvn-15-seed-decomposition-2026-MM-DD-spec-178-phase-2-post-optimization-wall-time.csv` (new — generated witness CSV)
- `reports/fitl-arvn-15-seed-decomposition-2026-MM-DD-spec-178-phase-2-post-optimization-wall-time.md` (new — generated witness Markdown)
- `specs/178-optimize-continued-deepening-inner-preview-orchestration.md` (modify — append §13 Outcome)

## Out of Scope

- No engine source change. If the Phase 2 verdict fails an acceptance criterion, the spec stays open and a follow-up ticket attacks the gap — this ticket does not silently land a corrective patch.
- No additional optimization. The Phase 1 optimization is the sole behavioral change in spec 178; Phase 2 measures it.
- No CI integration of the wall-time gate. The witness report remains a manual artifact.
- No revisit of the `chooseNStep` deep-pass orchestration axis family (spec §9 Out of Scope).
- No instrumentation cleanup. Phase 0 brackets remain in place as evidence-gathering infrastructure for any future spec.
- No update of the Phase 4 trigger report's `Follow-up` breadcrumb — that link was added during spec authoring and remains accurate.

## Acceptance Criteria

### Tests That Must Pass

1. The Phase 2 witness command completes 5/5 seeds and writes both CSV and Markdown artifacts.
2. The post-optimization wall ms for the Phase 0 named subroutine owner on `coupArvnRedeployPolice:chooseOne | continuedDeepening` is `≤ 60%` of its Phase 0 value (i.e., drops `≥ 40%` of its share).
3. The `continued-deepening-orchestration-inclusive` wall ms on the primary axis shows the same directional drop (post-optimization < Phase 0).
4. The sister axis `coupArvnRedeployOptionalTroops:chooseOne | continuedDeepening` shows `≥ 25%` reduction of its share of the same owner.
5. Route counters and unsupported reason counts on the witness corpus are unchanged within noise (no new advisory category, no carrier collapse).
6. Existing suite: `pnpm turbo test` passes at workspace root (no test should fail post-optimization since `178CONTDEEPINNER-002`'s outcome-parity test already gates behavior).
7. `pnpm run check:ticket-deps` passes.

### Invariants

1. The Phase 2 report ends with exactly one recommendation: `stop` / `create-spec` / `create-investigation-ticket`.
2. Foundation #20 carriers (route, unsupported, advisory, hidden/stochastic/depthCap distinctions) on the witness corpus are unchanged within noise.
3. Spec 178 §13 Outcome is populated with completion date, report path, verdict summary, and final recommendation.

## Test Plan

### New/Modified Tests

None (this is a measurement-and-report ticket).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-MM-DD-spec-178-phase-2-post-optimization-wall-time --profile-buckets`
3. `pnpm turbo test` (regression sanity)
4. `pnpm run check:ticket-deps`
5. `git diff --check`

## Outcome

**Result date**: 2026-05-17

- **Landed scope**: measurement/report/spec closeout only. No engine source, schema, GameSpecDoc, visual config, or policy-profile data changed in this ticket.
- **Generated witness artifacts**:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-2-post-optimization-wall-time.csv`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-2-post-optimization-wall-time.md`
- **Validation report**: `reports/178-phase-2-post-optimization-wall-time.md`.
- **Spec update**: `specs/178-optimize-continued-deepening-inner-preview-orchestration.md` §13 records the Phase 2 red gate and adds `archive/tickets/178CONTDEEPINNER-004.md` as the residual owner.
- **Measured verdict**:
  - Witness command completed 5/5 seeds and wrote both generated artifacts.
  - Primary `policyInnerPreviewSubroutine:driveOption` dropped `6.19%` (`6,804.08 ms -> 6,382.68 ms`), failing the required `>= 40%` reduction.
  - Primary `continued-deepening-orchestration-inclusive` dropped `6.13%` (`7,578.43 ms -> 7,114.21 ms`), passing the directional-drop sub-criterion.
  - Sister-axis `policyInnerPreviewSubroutine:driveOption` dropped `9.34%` (`1,453.32 ms -> 1,317.64 ms`), failing the required `>= 25%` reduction.
  - Route and unsupported counters remained unchanged (`1,299` routes, `751` unsupported counts); unsupported reason rows were unchanged. Advisory parity remains covered by the Phase 1 outcome-parity test because this profiler artifact does not emit a separate advisory-total column.
- **Residual owner**: `archive/tickets/178CONTDEEPINNER-004.md` investigates the still-material `driveOption` residual before any further optimization.
- **Archive status**: blocked and not archive-ready until the residual owner resolves or the measured gate is explicitly re-scoped.
- **Verification**:
  - `pnpm -F @ludoforge/engine build` passed before the decisive witness.
  - `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-spec-178-phase-2-post-optimization-wall-time --profile-buckets` passed and wrote the generated CSV/Markdown artifacts.
  - `pnpm turbo test` passed as a full Turbo cache replay (`5/5` tasks cached); classified as cache-covered/supplemental because this ticket changed only reports/spec/tickets after the fresh witness.
  - `pnpm run check:ticket-deps` passed (`2` active tickets and `2392` archived tickets checked).
  - `git diff --check` passed for tracked edits; targeted untracked whitespace checks for the new Phase 2 report, generated Markdown, generated CSV, and `archive/tickets/178CONTDEEPINNER-004.md` emitted no whitespace diagnostics.
- **Late-edit proof validity**: final edits after the witness were report/spec/ticket transcription and residual-owner graph updates only; no engine source, test, schema, generated runtime artifact, command semantics, or witness artifact content changed after the decisive measurement. The post-transcription `pnpm turbo test`, `pnpm run check:ticket-deps`, and hygiene checks cover the remaining closeout surface.
