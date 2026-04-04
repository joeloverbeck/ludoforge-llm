# 64COMEXPEVA-005: Profiling gate — measure Phase 2 condition/value impact

**Status**: 🚫 NOT IMPLEMENTED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — profiling only
**Deps**: `archive/tickets/64COMEXPEVA-004.md`, `specs/64-compiled-expression-evaluation.md`

## Problem

The condition/value compiler extensions (004) must demonstrate measurable improvement. If extending the compiler doesn't reduce `evalCondition` + `resolveRef` CPU by ≥2%, the extensions should be reverted.
`64COMEXPEVA-004` was closed as not actionable after the Phase 1 profiling gate in `64COMEXPEVA-003` failed, so this Phase 2 profiling ticket was never reached.

## Assumption Reassessment (2026-04-03)

1. `perf` is installed and functional. Verified.
2. Pre-extension baseline: `evalCondition` at 6.40% CPU, `resolveRef` at 7.88%. Measured this session.
3. FITL 3-seed benchmark runner exists. Verified.

## Architecture Check

1. No code changes — profiling exercise only.
2. No game-specific logic.

## What to Change

### 1. Run perf profiling with extended condition compiler

```bash
pnpm -F @ludoforge/engine build
perf record -g -o /tmp/perf-condition-compiled.data -- \
  node --perf-basic-prof campaigns/fitl-perf-optimization/run-benchmark.mjs \
  --seeds 1 --players 4 --max-turns 200
```

### 2. Compare evalCondition + resolveRef CPU before and after

Extract percentages from the new profile. Compare against Phase 1 post-baseline (from 003).

### 3. Run FITL 3-seed benchmark

Compare `combined_duration_ms` against the Phase 1 result.

### 4. Apply gate decision

- If `evalCondition` + `resolveRef` combined CPU dropped by ≥2% AND benchmark improved: **ACCEPT** — spec is complete.
- If improvement is below threshold: **REVERT** ticket 004. Close spec as "Phase 1 only — condition compilation extension not actionable."

## Files to Touch

- No files modified — profiling output only

## Out of Scope

- Any code changes

## Acceptance Criteria

### Tests That Must Pass

1. No tests to run — no code changes
2. Existing suite unmodified: `pnpm turbo test`

### Invariants

1. No files in `packages/engine/src/` are modified
2. Profiling report includes before/after comparison for both phases

## Test Plan

### New/Modified Tests

1. None — profiling ticket

### Commands

1. `perf record -g -o /tmp/perf-condition-compiled.data -- node --perf-basic-prof campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 1 --players 4 --max-turns 200`
2. `node campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 3 --players 4 --max-turns 200`
