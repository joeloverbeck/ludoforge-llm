# 63PROFSPR-001: Profile remaining spread overhead with perf

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — profiling only, no code changes
**Deps**: `specs/63-scoped-draft-state.md`

## Problem

CPU profiling shows ~15% of FITL benchmark time in V8 spread builtins (`CreateDataProperty`, `CloneObjectIC`, `ScavengerCollector`), but after draft state adoption in effect handlers, the remaining spread overhead is unattributed. Without call-site attribution, optimization efforts target the wrong sites.

## Assumption Reassessment (2026-04-03)

1. `perf` is installed and functional — verified: `/usr/local/bin/perf` version 6.6.123
2. `--perf-basic-prof` flag maps V8 JIT addresses to JS function names — verified this session: `perf report` successfully showed `JS:*functionName file:///path` entries
3. The FITL 3-seed benchmark runner exists at `campaigns/fitl-perf-optimization/run-benchmark.mjs` — verified
4. The spread overhead categories identified in the spec (apply-move hash, phase-advance turnOrderState, effects-control result, EffectCursor) are the primary suspects — validated via codebase exploration this session

## Architecture Check

1. No code changes — this is a read-only profiling exercise
2. No game-specific logic introduced — profiling is engine-level
3. No backwards-compatibility concerns

## What to Change

### 1. Run perf profiling session

Execute `perf record --perf-basic-prof` against the FITL benchmark (single seed for focused attribution):

```bash
cd <repo-root>
pnpm -F @ludoforge/engine build
perf record -g -o /tmp/perf-spread-audit.data -- \
  node --perf-basic-prof campaigns/fitl-perf-optimization/run-benchmark.mjs \
  --seeds 1 --players 4 --max-turns 200
```

### 2. Extract call-site attribution for spread builtins

Use `perf report` with caller call-graph to trace `CreateDataProperty` and `CloneObjectIC` back to their JS callers:

```bash
perf report -i /tmp/perf-spread-audit.data --stdio --sort=symbol --children \
  2>/dev/null | grep -B5 'CreateDataProperty\|CloneObjectIC'
```

### 3. Produce attribution table

Map each spread builtin caller to one of the 4 categories:
- **apply-move hash assignment** (`apply-move.ts` lines ~1355, ~1561)
- **phase-advance turnOrderState** (`phase-advance.ts` nested spreads)
- **effects-control PartialEffectResult** (`effects-control.ts` return objects)
- **EffectCursor spreading** (5-field cursor spreads across kernel)
- **Other** (uncategorized spread sites)

### 4. Apply spec gate

If no single category exceeds 2% CPU: close the spec as "not actionable" and archive `specs/63-scoped-draft-state.md`.

If apply-move hash assignment exceeds 2%: proceed to `63PROFSPR-002`.

If phase-advance turnOrderState exceeds 3%: flag `63PROFSPR-003` as actionable.

## Files to Touch

- No files modified — profiling output only
- Read: `campaigns/fitl-perf-optimization/run-benchmark.mjs` (existing)
- Read: `packages/engine/src/kernel/apply-move.ts` (existing)
- Read: `packages/engine/src/kernel/phase-advance.ts` (existing)

## Out of Scope

- Any code changes — this ticket is profiling only
- Modifying the benchmark runner or harness
- Profiling non-spread overhead (interpreter, token filtering, etc.)

## Acceptance Criteria

### Tests That Must Pass

1. No tests to run — no code changes
2. Existing suite unmodified: `pnpm turbo test`

### Invariants

1. No files in `packages/engine/src/` are modified
2. Profiling table covers all 4 categories with measured CPU %

## Test Plan

### New/Modified Tests

1. None — profiling ticket

### Commands

1. `perf record -g -o /tmp/perf-spread-audit.data -- node --perf-basic-prof campaigns/fitl-perf-optimization/run-benchmark.mjs --seeds 1 --players 4 --max-turns 200`
2. `perf report -i /tmp/perf-spread-audit.data --stdio --sort=symbol --no-children`
