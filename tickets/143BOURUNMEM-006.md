# 143BOURUNMEM-006: Advisory long-run per-decision cost witness

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — new test file only
**Deps**: `archive/tickets/143BOURUNMEM-003.md`, `archive/tickets/143BOURUNMEM-004.md`, `archive/tickets/143BOURUNMEM-008.md`

## Problem

Spec 143 Acceptance Criteria #5: "The owned witness corpus also demonstrates that per-decision runtime does not degrade pathologically over the same run due to retained transient support state." Spec 143 Testing Requirements #4: "Advisory long-run performance witness on a fixed corpus showing that decision cost does not climb pathologically with turn count after the fix."

Spec 143 Design Section 4 explicitly couples long-run heap growth and long-run per-decision slowdown: "If a long simulation keeps more preview state, cache entries, serialized keys, or context payloads alive as the game grows, then later decisions become slower because the engine must allocate more, hash/compare larger values, walk larger maps/arrays/contexts, trigger more GC work." 005 proves the memory half; this ticket proves the cost-stability half.

## Assumption Reassessment (2026-04-23)

1. `packages/engine/test/policy-profile-quality/` is the correct home per Spec 143 Required Changes §Runtime-cost proof surface (bullet 2): "Same home and same advisory channel as the heap-boundedness witness." Confirmed during reassessment.
2. The `POLICY_PROFILE_QUALITY_REGRESSION` warning channel is the documented advisory mechanism (FOUNDATIONS.md Appendix).
3. Per-decision cost measurement is empirical and subject to ambient variation (CPU scheduling, GC, Node version). The test must measure drift (later-decision time vs earlier-decision time within the same run), not absolute values — this cancels ambient bias.
4. After 003, 004, and the remaining medium-diverse determinism prerequisite in 008 land, later-decision time should not climb pathologically as the simulation progresses. This ticket's witness proves that.

## Architecture Check

1. **Drift-over-absolute measurement**: comparing later-decision time to earlier-decision time within the same run cancels most ambient variation (same hardware, same process, same GC state arc). Threshold is stated as a ratio (e.g., "later-run decision time ≤ 2× earlier-run decision time"), not an absolute ms budget.
2. **Right-tier placement**: same rationale as 005 — cost stability is a quality-plus-budget signal, not an engine determinism invariant. Advisory channel appropriate.
3. **Agnostic test structure**: generic measurement scaffolding; FITL profiles supply the workload. 007 provides the engine-generic counterpart.
4. **No backwards-compatibility shims**: new test file.
5. **Model test file**: 005's `fitl-spec-143-heap-boundedness.test.ts` (authored in the immediately-preceding wave) is the direct template for imports, profile-loading, seed-handling, and advisory reporting. Mirror its structure.

## What to Change

### 1. Author the cost-stability witness

Create a new test file at `packages/engine/test/policy-profile-quality/fitl-spec-143-cost-stability.test.ts` that:

- Declares `// @test-class: architectural-invariant` at the top — cost stability is a property any legitimate long run must satisfy.
- Loads the FITL GameDef with profiles `us-baseline, arvn-baseline, nva-baseline, vc-baseline`.
- Runs seed `1002` (and optionally 2–3 additional seeds for robustness).
- During the run, samples per-decision execution time at defined intervals (e.g., buckets of N decisions).
- Computes the ratio of "average per-decision time in the last decile of the run" to "average per-decision time in the first decile of the run."
- Asserts the ratio is below a calibrated drift ceiling (e.g., ≤ 2.0 — absorbs GC and warmup variation without masking a 2× pathological drift).
- Emits `POLICY_PROFILE_QUALITY_REGRESSION` warning on breach.

### 2. Threshold calibration

Set the drift ceiling as a named constant with inline rationale, e.g.:

```ts
// Per-decision cost drift ceiling: last-decile avg / first-decile avg.
// Post-003/004 baseline: ~X on seed 1002, four baselines, terminal run.
// Ceiling: 2× — absorbs GC warmup and natural decision-shape variation
// without masking retained-state-driven pathological drift.
const COST_DRIFT_CEILING = 2.0;
```

Calibrate using post-003/004/008 measurements; do NOT use pre-fix measurements as the baseline.

### 3. Noise handling

- Warm-up: discard the first few decisions from the "first decile" computation to avoid JIT warmup bias.
- Outlier trimming: trim the top/bottom 5% of per-decision times in each decile to absorb GC pauses.

## Files to Touch

- `packages/engine/test/policy-profile-quality/fitl-spec-143-cost-stability.test.ts` (new)

## Out of Scope

- Heap-boundedness witness (covered by 005).
- Engine-generic drop/compact regression (covered by 007).
- Any engine source changes.
- Changing the advisory CI channel wiring.

## Acceptance Criteria

### Tests That Must Pass

1. The new `fitl-spec-143-cost-stability.test.ts` passes after 003, 004, and 008 land (drift under the calibrated ceiling on seed 1002, four baselines, terminal run).
2. Full policy-profile-quality suite: `pnpm -F @ludoforge/engine test -- test/policy-profile-quality`.
3. Full engine suite: `pnpm -F @ludoforge/engine test:all`.
4. No regression in existing policy-profile-quality tests or 005's heap witness.

### Invariants

1. The witness lives in `packages/engine/test/policy-profile-quality/`, using the `POLICY_PROFILE_QUALITY_REGRESSION` advisory channel — not in `packages/engine/test/determinism/`.
2. The drift ceiling is a ratio, not an absolute ms budget — resilient to hardware differences and Node version changes.
3. The `@test-class` marker is `architectural-invariant`.
4. The ceiling is documented with inline rationale; changes require matching commit-message justification.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/fitl-spec-143-cost-stability.test.ts` (new) — the ticket's own witness.

### Commands

1. Targeted: `pnpm -F @ludoforge/engine test -- --test-name-pattern=spec-143-cost`
2. Policy-profile-quality suite: `pnpm -F @ludoforge/engine test -- test/policy-profile-quality`
3. Full suite: `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`
