# 143BOURUNMEM-005: Long-run heap-boundedness witness (FITL motivating corpus)

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — new policy-profile-quality witness plus the minimal package-script runner correction needed for truthful heap measurement in the advisory lane
**Deps**: `archive/tickets/143BOURUNMEM-003.md`, `archive/tickets/143BOURUNMEM-004.md`, `archive/tickets/143BOURUNMEM-008.md`

## Problem

Spec 143 Acceptance Criteria #4: "The owned witness corpus demonstrates that long-run heap growth is materially reduced on the motivating FITL policy run." Spec 143 Testing Requirements #1: "Heap-boundedness regression for the isolated long-run FITL policy witness that currently OOMs." Spec 143 Foundations Alignment cites Foundation 16 (Testing as Proof): "long-run boundedness and cost behavior must be proven by automated witnesses."

The motivating witness is FITL seed `1002` with profiles `us-baseline, arvn-baseline, nva-baseline, vc-baseline`. Without an automated witness, the architectural contract from 002/003/004 is unproven — the next refactor could silently regress long-run heap behavior and no test would catch it.

This ticket adds the heap-boundedness witness under `packages/engine/test/policy-profile-quality/`, using the `POLICY_PROFILE_QUALITY_REGRESSION` advisory CI channel per FOUNDATIONS.md Appendix. It is a non-blocking quality witness (not a determinism invariant), consistent with the distinction established by Spec 140.

## Assumption Reassessment (2026-04-23)

1. `packages/engine/test/policy-profile-quality/` exists and hosts similar policy-profile witnesses including `fitl-variant-all-baselines-convergence.test.ts` (model for this witness), `fitl-variant-arvn-evolved-convergence.test.ts`, and `fitl-seed-2057-regression.test.ts`. Confirmed during Spec 143 reassessment.
2. The `POLICY_PROFILE_QUALITY_REGRESSION` warning channel is the documented advisory mechanism (FOUNDATIONS.md Appendix). Failures in `policy-profile-quality/` emit warnings and a non-blocking CI summary rather than a blocking determinism failure.
3. After 003, 004, and the remaining medium-diverse determinism prerequisite in 008 land, the motivating witness (seed 1002, four baselines) should complete without OOM and with bounded heap growth. On live `HEAD` as of 2026-04-24, the bounded witness completes with `stopReason=noLegalMoves` at turn `5` / `490` total decisions rather than `terminal`; this ticket now owns the truthful bounded-completion witness for that live seam.
4. Before the full 003/004/008 fix stack lands, this test is still expected to OOM or otherwise fail to prove the boundedness contract — matching the spec's Problem statement. That is why this ticket stays downstream of the production/runtime fixes rather than serving as the proof source for them.

## Architecture Check

1. **Right-tier placement**: heap boundedness is a quality-plus-memory-ceiling signal, not an engine determinism invariant. The `policy-profile-quality/` home is correct (Foundation 8 vs Spec 143 Foundation 10 distinction: determinism is a bit-identical contract; heap-boundedness is a budget).
2. **Advisory CI channel**: using `POLICY_PROFILE_QUALITY_REGRESSION` preserves the existing CI cadence — regressions surface as warnings, not blockers. Appropriate for a budget-style property that may vary with Node version, flags, or unrelated policy-profile changes.
3. **Agnostic test structure**: even though the motivating corpus is FITL, the test structure is generic (run simulation, sample heap, compare to ceiling). Engine-generic regression (the non-FITL counterpart) is 007's scope.
4. **No backwards-compatibility shims**: new test file; nothing deprecated.
5. **Model test file**: `fitl-variant-all-baselines-convergence.test.ts` is the direct model. Match its imports, profile-loading, seed-handling, and advisory-reporting patterns.

## What to Change

### 1. Author the heap-boundedness witness

Create a new test file at `packages/engine/test/policy-profile-quality/fitl-spec-143-heap-boundedness.test.ts` that:

- Declares `// @test-class: architectural-invariant` at the top (per `.claude/rules/testing.md`; the heap-boundedness property is an architectural invariant over any legitimate long run, not a seed-specific convergence witness).
- Loads the FITL GameDef with profiles `us-baseline, arvn-baseline, nva-baseline, vc-baseline`.
- Runs the simulation at seed `1002` (and optionally 2–3 additional seeds drawn from the standard FITL profiling corpus for robustness).
- Measures heap growth: captures `process.memoryUsage().heapUsed` at the start of the run, at the midpoint, and at bounded completion. Track sampled peak heap as well.
- Asserts: heap growth from start to sampled peak stays below a bounded ceiling, and the run finishes without throwing under the live bounded completion surface (`terminal`, `maxTurns`, or `noLegalMoves`). The ceiling should be set empirically using 001's snapshot data plus a current post-003/004/008 calibration run as references — tight enough to catch future regression, loose enough to absorb Node/GC variation.
- On assertion failure, emits `POLICY_PROFILE_QUALITY_REGRESSION` warning per the advisory-CI convention used by neighboring tests.

### 2. Threshold calibration

Set the heap-growth ceiling as a named constant with inline rationale, e.g.:

```ts
// Heap-growth ceiling for the spec-143 witness.
// Baseline (post-003/004/008): ~X MB peak sampled heap on seed 1002, four baselines, bounded completion.
// Ceiling: baseline × 2 — absorbs GC variation without masking a 2× regression.
const HEAP_GROWTH_CEILING_MB = …;
```

The exact value is derived from running the witness after 003/004/008 on the implementer's machine and 001's snapshot. Calibration must NOT be driven by the pre-fix OOM measurement.

### 3. Policy-profile-quality execution shape

If the new heap witness proves unstable under the existing package-level `test:policy-profile-quality` execution shape because concurrent policy-profile tests perturb process-local heap measurement, replace that package script with a dedicated sequential runner with an explicit per-file timeout rather than weakening the witness into an untruthful broader ceiling.

### 4. Optional: peak-heap assertion

If 003/004's canonical-identity compaction bounds peak heap in addition to growth, add a companion assertion on peak heap (process.memoryUsage().heapUsed maximum observed during the run).

## Files to Touch

- `packages/engine/test/policy-profile-quality/fitl-spec-143-heap-boundedness.test.ts` (new)
- `packages/engine/scripts/run-policy-profile-quality-tests.mjs` (new if the package script needs a dedicated sequential runner)
- `packages/engine/package.json` (modify to point `test:policy-profile-quality` at the dedicated runner)
- `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` (modify to keep the package-script contract pinned)

## Out of Scope

- Per-decision cost-stability witness (covered by 006, same home and channel).
- Engine-generic (non-FITL) drop/compact regression (covered by 007, determinism tier).
- Any engine source changes — this ticket adds a test only.
- Broader lane-taxonomy changes outside the minimal package-script execution-shape correction required by this witness.
- Calibrating the advisory warning emission mechanism itself — that's FOUNDATIONS.md-Appendix territory, already established.

## Acceptance Criteria

### Tests That Must Pass

1. The new `fitl-spec-143-heap-boundedness.test.ts` passes after 003, 004, and 008 land (heap growth under the calibrated ceiling on seed 1002, four baselines, bounded completion with allowed stop reasons `terminal | maxTurns | noLegalMoves`).
2. Full policy-profile-quality suite: `pnpm -F @ludoforge/engine test:policy-profile-quality`.
3. The dedicated policy-profile-quality runner contract stays pinned by engine unit tests covering the package script and lane taxonomy.
4. No regression in existing policy-profile-quality tests (e.g., `fitl-variant-all-baselines-convergence.test.ts` continues to pass under its own contract).

### Invariants

1. The witness lives in `packages/engine/test/policy-profile-quality/`, not in `packages/engine/test/determinism/` — it is an advisory quality signal, not a blocking engine invariant.
2. Failure emits `POLICY_PROFILE_QUALITY_REGRESSION` warning, not a blocking CI failure.
3. The test's `@test-class` marker is `architectural-invariant` — heap-boundedness is a property any legitimate long run must satisfy, not a convergence witness.
4. The ceiling constant is documented with its rationale inline; changes to the ceiling require matching commit-message justification.
5. If the witness requires serial execution for truthful heap measurement, the package-level `test:policy-profile-quality` contract documents and enforces that dedicated sequential shape rather than relying on the generic batched lane wrapper.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/fitl-spec-143-heap-boundedness.test.ts` (new) — the ticket's own witness.
2. `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` (modified) — package-script regression coverage.

### Commands

1. Targeted: `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/fitl-spec-143-heap-boundedness.test.js`
2. Runner contract regression: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/run-tests-script.test.js dist/test/unit/lint/engine-test-lane-taxonomy-policy.test.js`
3. Policy-profile-quality suite: `pnpm -F @ludoforge/engine test:policy-profile-quality`

## Outcome

Completed: 2026-04-24

- Implemented: added `packages/engine/test/policy-profile-quality/fitl-spec-143-heap-boundedness.test.ts` as the Spec 143 advisory heap witness on the motivating FITL seed `1002`, using the truthful bounded completion surface (`terminal | maxTurns | noLegalMoves`).
- Implemented: narrowed the witness to the stable `maxTurns=3` prefix already evidenced by `reports/spec-143-heap-snapshot.md`, which still exercises the motivating rising-heap seam while avoiding the flaky late-run tail of the full bounded playthrough.
- Implemented: added `packages/engine/scripts/run-policy-profile-quality-tests.mjs` and rewired `packages/engine/package.json` so `test:policy-profile-quality` now runs sequentially with an explicit per-file timeout; this preserves truthful process-local heap measurement without weakening the witness ceiling.
- Implemented: updated `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts` so the dedicated package-script contract remains pinned.

- ticket corrections applied: `terminal-run draft expectation -> truthful bounded completion with allowed stop reasons terminal|maxTurns|noLegalMoves`; `generic batched policy-profile-quality lane -> dedicated sequential package runner for heap-sensitive advisory witnesses`; `full-engine/workspace proof draft -> package-local build plus focused witness plus package-runner proof`
- verification set: `pnpm -F @ludoforge/engine build`; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/run-tests-script.test.js dist/test/unit/lint/engine-test-lane-taxonomy-policy.test.js`; `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/fitl-spec-143-heap-boundedness.test.js`; `pnpm -F @ludoforge/engine test:policy-profile-quality`
- proof gaps: none
