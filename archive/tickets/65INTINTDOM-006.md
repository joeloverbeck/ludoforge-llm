# 65INTINTDOM-006: Phase 1 profiling gate

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None
**Deps**: `archive/tickets/65INTINTDOM-005.md`

## Problem

Phase 1 (ZoneId interning + zone array migration) is the largest expected performance win (3-5%). Before proceeding to Phase 2 (other ID types), the improvement must be verified via profiling. If Phase 1 shows no measurable improvement, Phase 2 and Phase 3 should be closed — further migration effort is not justified.

## Assumption Reassessment (2026-04-03)

1. The FITL 3-seed benchmark harness exists at `campaigns/fitl-perf-optimization/harness.sh` (used in the prior improve-loop campaign).
2. `perf record --perf-basic-prof` is available for CPU-sample-level profiling.
3. Baseline metrics from the last improve-loop campaign are in `campaigns/fitl-perf-optimization/results.tsv`.
4. V8 JIT sensitivity is a known risk — the fitl-perf-optimization campaign demonstrated that kernel function modifications can cause deoptimization regressions.

## Architecture Check

1. Profiling gates are observability, not implementation — no code changes, no architectural impact.
2. This follows the pattern established by Specs 63 and 64 (profiling gate per phase).
3. The gate decision is binary: measurable improvement → proceed to Phase 2; no improvement → close tickets 007-010.

## What to Change

### 1. Run FITL 3-seed benchmark

Run the existing benchmark harness (or equivalent) before and after Phase 1 tickets (001-005). Compare `combined_duration_ms` (or the primary metric).

### 2. Profile with `perf`

Run `perf record --perf-basic-prof` on a 3-seed FITL simulation. Compare the post-migration profile against the pre-migration baseline:
- `Builtins_StringEqual` should be reduced (fewer string zone comparisons)
- `Builtins_StringFastLocaleCompare` should be eliminated (no more `sortAndDedupeZones`)
- `Builtins_LoadIC_Megamorphic` should be reduced (array access is monomorphic)
- `Builtins_FindOrderedHashSetEntry` should be reduced (integer Set operations)

### 3. Record results and gate decision

Document the before/after metrics. If improvement is measurable (>1% reduction in `combined_duration_ms`), proceed to Phase 2 (ticket 007). If no measurable improvement, close tickets 007-010 with a note explaining the profiling result.

## Files to Touch

- No code files modified
- Profiling results documented in the ticket or a campaign log

## Out of Scope

- Code changes — this is a measurement-only ticket
- Phase 2 or Phase 3 work

## Acceptance Criteria

### Tests That Must Pass

1. Full test suite passes (confirming Phase 1 didn't break anything): `pnpm turbo test`
2. Profiling results are documented with specific metric values

### Invariants

1. Gate decision is evidence-based — must show actual profiling numbers, not assumptions
2. If gate fails (no improvement), downstream tickets 007-010 are closed, not deferred

## Test Plan

### New/Modified Tests

None — this is a profiling/measurement ticket.

### Commands

1. `pnpm turbo test` (verify correctness)
2. Benchmark harness run (3-seed FITL simulation, before/after comparison)
3. `perf record --perf-basic-prof` profiling run

## Outcome

Completed: 2026-04-04

What changed:
- Ran the corrected profiling gate for the actually landed Phase 1 subset: `65INTINTDOM-001`, `65INTINTDOM-002`, and `65INTINTDOM-003`, with `65INTINTDOM-004/005` already closed as not actionable under the corrected architecture.
- Used the preserved `fitl-perf-optimization` campaign runner logs as the historical baseline because `campaigns/fitl-perf-optimization/results.tsv` no longer contains the benchmark rows.
- Closed downstream tickets `65INTINTDOM-007` through `65INTINTDOM-010` as not actionable because the gate failed.

Deviations from original plan:
- "Phase 1" was measured against the corrected landed subset, not the original `001-005` plan, because the series boundary changed after reassessment of `002` through `005`.
- The usable baseline came from `campaigns/fitl-perf-optimization/run.log.runner.{1,2,3}` rather than `results.tsv`.

Verification results:
- Preserved baseline median from campaign logs: `120835.42ms`
- Current harness median from `bash campaigns/fitl-perf-optimization/harness.sh`: `123340.12ms`
- Net result versus baseline: about `+2.07%` slower, so the `>1%` improvement gate failed
- Current median breakdown:
  - `compilation_ms=1714.78`
  - `legalMoves_ms=91396.05`
  - `applyMove_ms=1049.76`
  - `agentChooseMove_ms=28500.29`
  - `computeDeltas_ms=0.38`
- `perf` capture command:
  - `perf record -g -o /tmp/fitl-intintdom-006.perf.data node --perf-basic-prof campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200`
- Current `perf` attribution still concentrated in query/selector/ref stacks rather than showing a decisive zone-storage win, including visible hot entries for `evalQuery`, `resolveRef`, `resolveZoneRef`, `resolveZoneSelCore`, and `Builtins_LoadIC_Megamorphic`
