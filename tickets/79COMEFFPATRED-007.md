# 79COMEFFPATRED-007: Performance re-baseline and spec closure

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — benchmarks and documentation only
**Deps**: 79COMEFFPATRED-006

## Problem

The spec requires a performance re-baseline to confirm parity between compiled
and interpreted effect paths after the DraftTracker integration. Pre-Spec-78
benchmarks showed the compiled path was +16% slower than the interpreter for
Texas Hold'em. The gap may have widened further since Spec 78 only optimized the
interpreter side. This ticket measures the post-optimization gap and closes the
spec.

## Assumption Reassessment (2026-03-24)

1. Texas Hold'em benchmark exists — **must verify** whether a benchmark script or test exists, or if it needs to be created using the E2E test infrastructure.
2. The compiled path can be toggled via configuration — **must verify** how verification mode and compiled-only mode are activated.
3. FITL is also a valid benchmark target (more lifecycle effects) — **confirmed** per spec impact section.
4. The spec target is "0% overhead (parity with interpreter), ideally slight improvement" — **confirmed**.

## Architecture Check

1. Benchmarking is a measurement task — no code changes to production files.
2. Results inform whether follow-up optimization (shared tracker, whole-sequence compilation) is needed.
3. Spec status update from PROPOSED to COMPLETED (or NEEDS-FOLLOW-UP if parity not achieved).

## What to Change

### 1. Run Texas Hold'em benchmark

Run 10+ full Texas Hold'em games across multiple seeds with:
- **Interpreted path only** (compiled effects disabled)
- **Compiled path only** (compiled effects enabled)

Measure:
- Total wall-clock time
- Per-game average
- GC pressure (if measurable)
- Allocation count difference (if measurable)

### 2. Run FITL benchmark (optional but recommended)

Same measurement for FITL, which has higher lifecycle effect density and higher
fallback rates.

### 3. Document results

Record benchmark results in a brief report. Include:
- Before/after comparison (if pre-optimization baseline is available)
- Compiled vs interpreted timing
- Percentage overhead or improvement
- Whether parity target is met

### 4. Update spec status

Update `specs/79-compiled-effect-path-redesign.md`:
- Status: PROPOSED → COMPLETED (if parity achieved) or NEEDS-FOLLOW-UP
- Add a "Results" section with benchmark data

### 5. Update CLAUDE.md if needed

If the spec moves to completed:
- Move Spec 79 from "Active specs" to completed list
- Update any references

## Files to Touch

- `specs/79-compiled-effect-path-redesign.md` (modify — status + results)
- `CLAUDE.md` (modify — spec status update)
- Benchmark script or test file (new or existing, if a script is needed)

## Out of Scope

- Any production code changes — this ticket is benchmarks and documentation only.
- Whole-sequence compilation optimization (future spec).
- Shared tracker optimization (future spec).
- Archiving the spec (follows the archival workflow separately).
- Kernel, compiler, agent, simulator changes.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test` — full engine test suite still passes (no regressions from measurement).
2. `pnpm -F @ludoforge/engine test:e2e` — E2E parity tests pass.
3. Benchmark data is collected and documented.

### Invariants

1. No production code changes in this ticket.
2. Spec status reflects actual measured performance.
3. If parity is NOT achieved, the spec status is NEEDS-FOLLOW-UP with a clear explanation of the remaining gap and suggested next steps.

## Test Plan

### New/Modified Tests

1. Benchmark script (if needed) — not a CI test, a manual performance measurement.

### Commands

1. `pnpm -F @ludoforge/engine test:e2e`
2. Benchmark command (TBD based on existing infrastructure)
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
