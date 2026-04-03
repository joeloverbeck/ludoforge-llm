# 65INTINTDOM-010: Phase 3 profiling gate

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None
**Deps**: `tickets/65INTINTDOM-009.md`

## Problem

Phase 3 (variable name interning) is the smallest expected improvement (1-2%). This final profiling gate verifies the Phase 3 contribution and produces a cumulative performance report for the entire Spec 65 migration.

## Assumption Reassessment (2026-04-03)

1. Phase 1 and Phase 2 profiling gates established the methodology.
2. Expected Phase 3 contribution is 1-2% — variable Map lookups are less frequent than zone or action ID operations.
3. Cumulative target is 6-10% total reduction from all three phases.

## Architecture Check

1. Same profiling gate pattern as tickets 006 and 008. Observability only.
2. This is the final gate — produces the cumulative performance report for the spec.

## What to Change

### 1. Run FITL 3-seed benchmark

Compare `combined_duration_ms` before and after Phase 3 (ticket 009).

### 2. Profile with `perf`

Run `perf record --perf-basic-prof`. Compare against post-Phase-2 profile:
- `Builtins_FindOrderedHashMapEntry` should be reduced (variable Maps eliminated)
- Remaining string operations should be limited to `TokenId`, `TriggerId`, and non-domain strings

### 3. Produce cumulative performance report

Document the total improvement across all three phases:
- Phase 1 (ZoneId + zones array): X%
- Phase 2 (ActionId, PhaseId, SeatId): Y%
- Phase 3 (variable names): Z%
- **Total**: X + Y + Z%

Compare against the spec's expected impact (6-10% combined).

### 4. Identify remaining string overhead

After all three phases, profile the remaining string operations. Document what's left (TokenId, TriggerId, non-domain strings) and whether further optimization is feasible or warranted.

## Files to Touch

- No code files modified

## Out of Scope

- Code changes
- Further optimization beyond Spec 65 scope

## Acceptance Criteria

### Tests That Must Pass

1. Full test suite passes: `pnpm turbo test`
2. Cumulative performance report is documented

### Invariants

1. Gate decision is evidence-based with specific metric values
2. Report includes per-phase and cumulative improvement numbers

## Test Plan

### New/Modified Tests

None — measurement ticket.

### Commands

1. `pnpm turbo test`
2. Benchmark harness run
3. `perf record --perf-basic-prof` profiling run
