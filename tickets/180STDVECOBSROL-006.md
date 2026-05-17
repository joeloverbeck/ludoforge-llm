# 180STDVECOBSROL-006: Phase 5 - FITL ARVN standing witness and cookbook addendum

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Profile/docs/report only unless integration proof exposes focused fallout.
**Deps**: `archive/tickets/180STDVECOBSROL-002.md`, `archive/tickets/180STDVECOBSROL-003.md`, `tickets/180STDVECOBSROL-004.md`, `tickets/180STDVECOBSROL-005.md`

## Problem

After Spec 180 lands standing projection, status-aware aggregates, seat matrix trace metadata, and role primitives, the series needs the FITL ARVN integration witness that Spec 179 could not close. This ticket proves ordinary-operation opponent-standing visibility with role-based considerations and updates author-facing documentation.

## Assumption Reassessment (2026-05-17)

1. The old Spec 179 Phase 2 gate is not reused because it depends on `previewUsage.outcomeGrantContinuation.exitCounts`.
2. The new witness uses ordinary-operation standing cells and role selectors, not production `outcomeGrantResolve` activation.
3. The existing red report and Phase 0 baseline remain historical context, not acceptance thresholds for this new surface.

## Architecture Check

1. FITL is only the witness workload; the implemented surface must be generic.
2. Witness metrics must distinguish ready, unavailable, capped, and partial signal.
3. Cookbook prose must describe landed behavior and explicit fallbacks, not aspirational profile tuning.

## What to Change

### 1. Add role-based ARVN considerations

Add bounded `hurtCurrentLeader` and `reduceNearestThreat` considerations to `arvn-evolved` using the Spec 180 standing surface with explicit `previewFallback: noContribution`.

### 2. Run the FITL witness

Run the bounded ARVN campaign and aggregate `previewUsage.seatMatrix` / ready-ref stats for ordinary-operation candidates.

### 3. Update reports and docs

Update the cookbook with standing projection, `seatAgg.availability`, role primitives, and `seatMatrix`. Write or update a report with exact commands, seed range, standing differentiation metrics, and residual risks.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `docs/agent-dsl-cookbook.md` (modify)
- `reports/180-fitl-arvn-standing-witness.md` (new)
- campaign diagnostic helper script if needed for reusable matrix aggregation

## Out of Scope

- Retuning unrelated ARVN profile weights.
- Migrating VC or other profiles.
- Inner-preview opponent option refs.
- Claiming Spec 179 `outcomeGrantContinuation` activation from ordinary-operation evidence.

## Acceptance Criteria

### Tests That Must Pass

1. `hurtCurrentLeader` and `reduceNearestThreat` differentiate ARVN ordinary-operation candidates on at least 30% of main-phase decisions where opponent margins shift through the standing projection.
2. `previewUsage.seatMatrix` records per-candidate x per-seat ready/unavailable status for the witness refs.
3. Cookbook addendum lands with exact field names and fallback guidance.
4. `pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL-specific engine code.
2. Unavailable or capped standing signal uses explicit fallback and trace provenance.
3. Reported witness metrics do not reuse the old `outcomeGrantContinuation.exitCounts` gate.

## Test Plan

### New/Modified Tests

1. No new unit test expected unless integration proof exposes missing focused fallout. The durable proof is the campaign report plus existing Spec 180 architecture tests.

### Commands

1. `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8`
2. `node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs`
3. Matrix/standing aggregation command selected by the implementing ticket.
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`
