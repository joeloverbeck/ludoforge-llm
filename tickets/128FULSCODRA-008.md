# 128FULSCODRA-008: Diagnose and recover Spec 128 post-conversion benchmark regression

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — profiling-guided hot-path recovery
**Deps**: `archive/tickets/128FULSCODRA-006.md`, `specs/128-full-scope-draft-state.md`

## Problem

The post-conversion benchmark gate in `128FULSCODRA-007` measured a `15152.90ms` FITL median on the live branch versus the campaign baseline `13755.39ms`, a `+10.16%` regression. Spec 128's architectural change is landed and externally proven correct, but the performance acceptance remains unmet. The regression source must be isolated and corrected before the series can close.

## Assumption Reassessment (2026-04-14)

1. The authoritative measurement surface is `campaigns/fitl-perf-optimization/harness.sh`, which rebuilds the engine, runs the full regression gate, executes 3 benchmark runs, and enforces deterministic `state_hash` consistency. Confirmed.
2. Ticket `128FULSCODRA-007` already established that the current branch is slower than the campaign baseline by `+10.16%` while still passing determinism and correctness gates. Confirmed.
3. A representative `node --prof` run on the live benchmark path still shows allocation-heavy builtins in the hotspot set (`CreateDataProperty 4.8%`, `CloneObjectIC 1.5%`, `CloneObjectIC_Slow 1.1%`), but that profile alone does not isolate the exact regression source. Confirmed.
4. The regression may come from the widened draft-state implementation itself, from changed state trajectories that increase agent/legal-move work, or from a hidden-class / IC side effect outside the DraftTracker object. This ticket must prove the source before changing code. Confirmed.

## Architecture Check

1. Keeping `128FULSCODRA-007` as a pure measurement gate and moving regression recovery here preserves boundary clarity: one ticket measures, the next ticket diagnoses and fixes.
2. The clean path is profiling-guided recovery on generic hot-path engine code only. No game-specific branching or benchmark-only compatibility code is allowed.
3. No backwards-compatibility shims: if a recovery requires refactoring a hot-path contract, migrate the owned runtime/tests directly rather than adding aliases or dual paths.

## What to Change

### 1. Isolate the regression source

Use the live FITL perf harness plus targeted profiling to determine whether the regression is primarily caused by:
- draft-state orchestration overhead in the apply-move boundary
- changed legal-move / agent state trajectories after the architectural conversion
- hidden-class / inline-cache fallout in a newly hot object path

### 2. Land the narrowest evidence-backed recovery

Implement the smallest Foundation-compliant code change that materially reduces the measured regression without weakening the draft-state external contract or reintroducing broad spread-based copies.

### 3. Re-benchmark and record the recovery

Rerun the authoritative FITL harness, correctness guard, and representative profile. Append the new benchmark row to `campaigns/fitl-perf-optimization/results.tsv` and record whether the branch has returned to baseline parity or better.

## Files to Touch

- `campaigns/fitl-perf-optimization/results.tsv` (modify)
- `packages/engine/src/kernel/*` (modify only the profiling-proven hot-path owner files)
- `packages/engine/src/agents/*` (modify only if profiling proves the regression is agent-path-driven)
- `tickets/128FULSCODRA-008.md` (mark complete and record outcome)

## Out of Scope

- Reverting Spec 128 wholesale without profiling evidence
- GameSpecDoc or FITL data changes
- Benchmark-only hacks that violate `docs/FOUNDATIONS.md`

## Acceptance Criteria

### Tests That Must Pass

1. `bash campaigns/fitl-perf-optimization/harness.sh`
2. `bash campaigns/fitl-perf-optimization/checks.sh`
3. Representative profiling rerun: `node --prof campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200` plus `node --prof-process isolate-*.log`

### Invariants

1. Foundation 8 (Determinism): benchmark harness still reports consistent repeated-run `state_hash`
2. Foundation 11 (Immutability — external contract): no optimization may weaken the already-proven `applyMove` / `applyTrustedMove` immutability guarantees
3. The recovered benchmark result must be no worse than the campaign baseline by more than the 1% noise tolerance, and ideally restore Spec 128's intended improvement trajectory

## Test Plan

### New/Modified Tests

1. Targeted proof lanes only if the recovery changes runtime contracts or exposes a bug during diagnosis

### Commands

1. `bash campaigns/fitl-perf-optimization/harness.sh`
2. `bash campaigns/fitl-perf-optimization/checks.sh`
3. `node --prof campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200`
4. `node --prof-process isolate-*.log`
