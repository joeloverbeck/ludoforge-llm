# 65INTINTDOM-008: Phase 2 profiling gate

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None
**Deps**: `tickets/65INTINTDOM-007.md`

## Problem

Phase 2 (ActionId, PhaseId, SeatId migration) should show a measurable improvement (2-3% expected). Before proceeding to Phase 3 (variable name interning), the improvement must be verified. If Phase 2 shows no measurable improvement, Phase 3 should be closed — the remaining string-keyed operations may not be significant enough to justify the migration effort.

## Assumption Reassessment (2026-04-03)

1. Phase 1 profiling gate (ticket 006) established the baseline methodology and tools.
2. Expected Phase 2 contribution is 2-3% — smaller than Phase 1 because action/phase/seat IDs are less frequently accessed than zone IDs.
3. Cumulative improvement from Phase 1 + Phase 2 should be 5-8%.

## Architecture Check

1. Same profiling gate pattern as ticket 006. Observability only, no code changes.
2. Gate decision: measurable improvement → proceed to Phase 3; no improvement → close tickets 009-010.

## What to Change

### 1. Run FITL 3-seed benchmark

Compare `combined_duration_ms` before and after Phase 2 (ticket 007).

### 2. Profile with `perf`

Run `perf record --perf-basic-prof`. Compare against post-Phase-1 profile:
- `Builtins_StringEqual` should be further reduced
- `Builtins_FindOrderedHashSetEntry` should be further reduced
- Remaining string operations should be primarily from `TokenId`, `TriggerId`, and variable names

### 3. Record results and gate decision

Document before/after metrics. If improvement >1%, proceed to Phase 3. Otherwise close tickets 009-010.

## Files to Touch

- No code files modified

## Out of Scope

- Code changes
- Phase 3 work

## Acceptance Criteria

### Tests That Must Pass

1. Full test suite passes: `pnpm turbo test`
2. Profiling results documented with specific metric values

### Invariants

1. Gate decision is evidence-based
2. If gate fails, downstream tickets 009-010 are closed

## Test Plan

### New/Modified Tests

None — measurement ticket.

### Commands

1. `pnpm turbo test`
2. Benchmark harness run
3. `perf record --perf-basic-prof` profiling run
