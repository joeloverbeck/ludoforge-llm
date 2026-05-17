# 178CONTDEEPINNER-004: Phase 3 - Investigate residual driveOption wall time after failed Phase 2 gate

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None expected at investigation start - measure and localize first
**Deps**: `tickets/178CONTDEEPINNER-003.md`

## Problem

Spec 178 Phase 2 measured the post-optimization wall-time delta and found that Phase 1 did not satisfy the explicit measured gate. The primary `policyInnerPreviewSubroutine:driveOption` owner dropped only `6.19%` (`6,804.08 ms -> 6,382.68 ms`) instead of the required `>= 40%`, and the sister axis dropped only `9.34%` (`1,453.32 ms -> 1,317.64 ms`) instead of `>= 25%`.

The same owner remains material after Phase 2: `policyInnerPreviewSubroutine:driveOption` on `coupArvnRedeployPolice:chooseOne | continuedDeepening` is `6,382.68 ms`, or `7.0363%` of the Phase 2 slow-tier wall time. The next owner must explain what still dominates inside `driveOption` after the lazy draft-index optimization, then recommend either a narrower implementation spec or a stop decision.

## Assumption Reassessment (2026-05-17)

1. Phase 0 identified `policyInnerPreviewSubroutine:driveOption` as the named owner, with `6,804.08 ms` on the primary axis and `1,453.32 ms` on the sister axis.
2. Phase 1 landed the lazy draft-index optimization and outcome-parity test in `archive/tickets/178CONTDEEPINNER-002.md`.
3. Phase 2 (`tickets/178CONTDEEPINNER-003.md`) produced the decisive post-optimization witness and report at `reports/178-phase-2-post-optimization-wall-time.md`; the measured gate is red.
4. Route and unsupported counters remained stable (`1,299` routes, `751` unsupported counts), so the residual is not a Foundation #20 carrier-collapse symptom.

## Architecture Check

1. The investigation stays generic to the policy inner-preview `driveOption` seam. FITL ARVN is only the witness workload.
2. No production code should be changed until the residual sub-owner is measured. If an implementation candidate emerges, create or promote a spec/ticket that states the exact invariant and proof lane.
3. The investigation must preserve Foundation #14 by extending existing profiler/report surfaces in place when additional attribution is needed; no parallel report family or compatibility alias.

## What to Change

### 1. Localize the residual

Use the Phase 2 artifacts as the baseline and add the smallest measurement surface needed to split `policyInnerPreviewSubroutine:driveOption` after the Phase 1 optimization. Candidate sub-owners may include completion-policy driving, projected-state materialization, draft-token-index maintenance after the first option, or another measured subroutine discovered in live code.

### 2. Produce a recommendation report

Create a checked-in report under `reports/` that records:

- Phase 2 baseline artifact paths and values.
- The new residual split, including count, wall ms, and share of same-run slow-tier wall.
- Route/unsupported/advisory carrier preservation evidence.
- Exactly one recommendation: `create-spec`, `create-implementation-ticket`, or `stop`.

### 3. Update Spec 178

Update `specs/178-optimize-continued-deepening-inner-preview-orchestration.md` with the investigation outcome and the resulting next owner or stop decision.

## Files to Touch

- `reports/<new-spec-178-phase-3-report>.md` (new - exact name chosen by the investigation)
- `reports/fitl-arvn-15-seed-decomposition-<date>-spec-178-phase-3-*.csv` (new if a generated witness is required)
- `reports/fitl-arvn-15-seed-decomposition-<date>-spec-178-phase-3-*.md` (new if a generated witness is required)
- `specs/178-optimize-continued-deepening-inner-preview-orchestration.md` (modify)
- Any profiler/reporting source files required to expose the residual sub-owner, if live reassessment proves the existing report surface is insufficient.

## Out of Scope

- No same-ticket optimization without first recording a measured residual owner.
- No WASM route extension for `chooseOne | continuedDeepening`.
- No `chooseNStep` deep-pass orchestration work.
- No policy-profile parameter tuning or FITL-specific branch.

## Acceptance Criteria

### Tests That Must Pass

1. A checked-in report names the residual owner or records why no implementation-ready owner remains.
2. If new instrumentation is added, a focused report-rendering or profiler-shape test proves the output contract.
3. The decisive witness command completes the ticket-owned seed/corpus bound and writes any named artifacts.
4. `pnpm run check:ticket-deps` passes.

### Invariants

1. FITL ARVN remains only a witness workload; any proposed implementation owner is generic.
2. Foundation #20 carriers are preserved and remain visible in the report.
3. Nested/inclusive bucket math remains clearly labeled so nested rows are not summed as additive wall time.

## Test Plan

### New/Modified Tests

To be selected after live reassessment. If the investigation adds profiler/reporting output, extend the nearest existing report-rendering or profiler-shape test rather than creating a parallel format.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Decisive residual-split witness command selected during reassessment
3. Focused test for any new report/profiler output contract
4. `pnpm run check:ticket-deps`
