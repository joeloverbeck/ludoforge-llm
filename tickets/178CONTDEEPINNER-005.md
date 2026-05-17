# 178CONTDEEPINNER-005: Phase 4 - Optimize publishMicroturn inside driveOption

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes - generic policy inner-preview publication path
**Deps**: `archive/tickets/178CONTDEEPINNER-004.md`

## Problem

Phase 3 split the residual `policyInnerPreviewSubroutine:driveOption` wall time after the Phase 1 lazy draft-index optimization failed the Phase 2 measured gate. The largest measured child owner is `policyInnerPreviewDriveOption:publishMicroturn` on `coupArvnRedeployPolice:chooseOne | continuedDeepening`: `3,056.07 ms`, or `47.0558%` of the still-material `driveOption` wrapper. The sister axis also reports `publishMicroturn` as the largest child row (`357.82 ms`, `26.4895%` of its `driveOption` wrapper).

This ticket owns the next implementation attempt against that generic publication sub-owner. It must preserve the one-rules protocol, constructibility, bounded preview, and Foundation #20 provenance carriers.

## Assumption Reassessment (2026-05-17)

1. Phase 3 (`archive/tickets/178CONTDEEPINNER-004.md`) produced the decisive report at `reports/178-phase-3-residual-drive-option-investigation.md`.
2. The report identifies `policyInnerPreviewDriveOption:publishMicroturn` as the only measured child large enough to plausibly satisfy the original Spec 178 Phase 2 `>= 40%` owner-reduction target if optimized successfully.
3. The Phase 3 witness preserved route and unsupported counters exactly (`1,299` routes and `751` unsupported counts), so the next implementation must preserve those carriers and must not treat unavailable preview refs as numeric evidence.
4. The measured owner is generic to `driveOption` publication. FITL ARVN remains only the witness workload.

## Architecture Check

1. Any optimization must remain inside the generic policy inner-preview/publication seam. No GameSpecDoc, visual-config, profile tuning, or FITL-specific branch is in scope.
2. The implementation must preserve Foundation #5 and #18: published microturns are the legality/constructibility contract, and no client-side search or synthetic shortcut may replace the kernel publication contract.
3. Foundation #14 forbids compatibility aliases or parallel publication paths. If a helper is extracted, migrate the owned call site directly and prove parity.

## What to Change

### 1. Optimize the publication child owner

Investigate and implement the smallest generic change that reduces repeated `publishMicroturnFromPreviewStateNoHash` work inside `driveOption`. Candidate shapes include narrowing publication inputs after preview-state application, reusing publication-derived data that is immutable for a single drive, or reducing avoidable recomputation around the draft-token-state index.

### 2. Preserve behavior and carriers

Add or extend focused tests proving selected option outcomes, preview-drive outcomes, and Foundation #20 carrier fields remain stable on the Phase 3 witness seam. Preserve the existing `policyInnerPreviewDriveOption:*` profiler buckets so Phase 4 can measure the same owner after the implementation.

### 3. Produce the post-implementation witness

Run the same five-seed decomposition command after the implementation and record the result in a checked-in report. The report must compare Phase 3 baseline values against the post-implementation values for:

- primary-axis `policyInnerPreviewDriveOption:publishMicroturn`
- primary-axis `policyInnerPreviewSubroutine:driveOption`
- sister-axis `policyInnerPreviewDriveOption:publishMicroturn`
- route and unsupported counters

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner.ts` (modify - likely implementation site)
- `packages/engine/test/...` (modify or add - outcome/carrier parity proof selected during reassessment)
- `reports/<new-spec-178-phase-4-report>.md` (new - exact name chosen by implementation)
- `reports/fitl-arvn-15-seed-decomposition-<date>-spec-178-phase-4-*.csv` (new if generated witness is required)
- `reports/fitl-arvn-15-seed-decomposition-<date>-spec-178-phase-4-*.md` (new if generated witness is required)
- `specs/178-optimize-continued-deepening-inner-preview-orchestration.md` (modify - append Phase 4 outcome)

## Out of Scope

- No WASM route extension.
- No `chooseNStep` deep-pass orchestration work.
- No policy-profile parameter tuning or FITL-specific branch.
- No same-ticket rewrite of the publication/legality contract. If the live optimization would change the one-rules protocol, stop for a new spec/boundary decision first.

## Acceptance Criteria

### Tests That Must Pass

1. A focused behavior/parity test proves selected option outcomes and preview-drive carrier fields are unchanged for the optimized seam.
2. The post-implementation witness command completes the ticket-owned seed/corpus bound and writes the named artifacts.
3. The primary-axis `policyInnerPreviewDriveOption:publishMicroturn` wall ms drops materially from the Phase 3 baseline (`3,056.07 ms`) and the report classifies whether it reaches the threshold needed to close Spec 178.
4. Route counters and unsupported reason counts on the witness corpus remain unchanged within noise; no new advisory category or carrier collapse is introduced.
5. `pnpm run check:ticket-deps` passes.

### Invariants

1. FITL ARVN remains only a witness workload; implementation is generic to policy inner-preview publication.
2. Foundation #20 carriers remain visible in the report.
3. Nested/inclusive bucket math remains labeled so `policyInnerPreviewDriveOption:*` rows are never summed as additive wall time with their parent wrappers.

## Test Plan

### New/Modified Tests

To be selected after live reassessment. Prefer extending existing policy inner-preview or report/profiler tests over creating parallel harnesses.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused behavior/parity test selected during reassessment
3. `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-MM-DD-spec-178-phase-4-publish-microturn-optimization --profile-buckets`
4. `pnpm run check:ticket-deps`
