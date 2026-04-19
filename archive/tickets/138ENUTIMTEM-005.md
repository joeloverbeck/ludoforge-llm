# 138ENUTIMTEM-005: Caching gate and CI performance assertion for guided-classifier overhead

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — generic profiler plumbing and deterministic performance gate; no cache landed
**Deps**: `archive/tickets/138ENUTIMTEM-006.md`, `archive/tickets/138ENUTIMTEM-004.md`

## Problem

Per Spec 138 Investigation I4 and Goal G5, the guided-classifier pass added by `138ENUTIMTEM-006` must be measured before any cache is justified. The draft boundary was: if the corrected guidance path adds more than 25% overhead versus the pre-guidance baseline on the authoritative FITL arvn tournament runner, add a cache keyed by `(stateHash, actionId)`; otherwise defer caching as YAGNI and land a regression gate instead.

The live measurement is now complete. On 2026-04-19, the authoritative 20-seed arvn runner measured `332.87s` on pre-guidance commit `6653d9ea7f54cb443b47f763c8279a955b8634a1` and `301.60s` on current `HEAD`, so no cache is warranted on overhead grounds. This ticket therefore closes on the no-cache path and lands a deterministic regression gate proving the guided classifier's probe-step overhead stays below the same 25% budget on the stable comparable FITL corpus.

## Assumption Reassessment (2026-04-19)

1. `GameDefRuntime` remains at `packages/engine/src/kernel/gamedef-runtime.ts`, but the live wall-clock measurement does not justify adding a cache there.
2. The authoritative wall-clock measurement surface is still `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`, not an ad hoc benchmark harness.
3. Pre-guidance baseline commit for a like-for-like timing comparison is `6653d9ea7f54cb443b47f763c8279a955b8634a1` (`Implemented 138ENUTIMTEM-002.`), the commit immediately before the guided completion series landed.
4. The current `HEAD` tournament runner completes the named 20-seed command in `301.60s`, but reports `errors=3` on seeds `1002`, `1010`, and `1012`. Because the runner is error-bearing on `HEAD`, the durable CI gate should use a deterministic proxy over the stable comparable seed subset rather than raw wall-clock.
5. The repo already has the right generic seams for a deterministic proxy: test-only `disableGuidedChooser` on `PolicyAgent`, opt-in `PerfProfiler`, and a dedicated performance test lane at `packages/engine/test/performance/`.

## Architecture Check

1. Measurement-first, implementation-second — the cache lands only if the live evidence justifies it. Here it does not, so the correct architecture is no cache plus a regression gate.
2. The landed gate uses the engine's generic profiler side-channel and existing guided-toggle seam rather than a FITL-specific shortcut, preserving Foundations #1, #5, and #16.
3. The deterministic gate is bounded and reproducible: same compiled FITL GameDef, same stable 17-seed comparable corpus, same guided toggle, same probe-step counter.
4. No backwards-compatibility shim is introduced. The cache branch is not added speculatively, and the active ticket is corrected in place to the live measurement surface and repo-valid proof command.

## What to Change

### 1. Record the decisive wall-clock measurement

Capture the already-completed authoritative timing evidence in the ticket outcome:
- Baseline: commit `6653d9ea7f54cb443b47f763c8279a955b8634a1` completed the 20-seed arvn sweep in `332.87s` with `errors=2`.
- Current `HEAD`: completed the same command in `301.60s` with `errors=3`.
- Measured overhead: `(301.60 - 332.87) / 332.87 = -9.39%`.

### 2. Gate decision

The measured result is below threshold, so no cache lands. Close the cache branch as descoped and proceed directly to the deterministic regression gate.

### 3. Deterministic CI performance gate

Add `packages/engine/test/performance/spec-138-guided-classifier-overhead.test.ts`:
- Run the stable comparable 17-seed FITL corpus (`1000, 1001, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1011, 1013, 1014, 1015, 1016, 1017, 1018, 1019`) twice within the test process.
- First run: guidance disabled behind the existing test-only `disableGuidedChooser` flag.
- Second run: default guided path active.
- Count total `decisionSequenceSatisfiability:probeStep` work across the corpus via the generic kernel profiler.
- Assert `guidedProbeSteps / legacyProbeSteps < 1.25`.
- File-top marker: `// @test-class: architectural-invariant`.

### 4. Generic profiler plumbing

Thread the existing `PerfProfiler` through the classifier call sites needed for the deterministic proxy:
- add a count-only helper on `perf-profiler.ts`
- instrument `decision-sequence-satisfiability.ts` probe-step increments
- plumb profiler through `move-decision-sequence.ts`, `legal-moves.ts`, `simulator.ts`, and the guided retry path in `prepare-playable-moves.ts`

## Files to Touch

- `packages/engine/src/kernel/perf-profiler.ts` (modify — count-only dynamic bucket helper)
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (modify — probe-step counter instrumentation)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify — profiler plumbing)
- `packages/engine/src/kernel/legal-moves.ts` (modify — profiler plumbing)
- `packages/engine/src/sim/simulator.ts` (modify — pass profiler into legal move enumeration)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify — pass profiler into guided retry classification)
- `packages/engine/test/performance/spec-138-guided-classifier-overhead.test.ts` (new)

## Out of Scope

- No cache slot on `GameDefRuntime` — the live measurement did not justify it.
- No changes to the subset-extraction algorithm itself (owned by `138ENUTIMTEM-002`).
- No changes to the guided-completion logic itself beyond generic profiler plumbing (owned by `138ENUTIMTEM-006`).
- No changes to stop-reason / error-class deletion (owned by archived `138ENUTIMTEM-004`).
- No attempt to “fix” the current-head tournament runner errors inside this ticket; they are recorded as measurement caveat only.

## Acceptance Criteria

### Tests That Must Pass

1. Deterministic performance gate passes: guided probe-step overhead on the stable 17-seed FITL corpus remains below `1.25x` of the disable-guided baseline.
2. No cache lands unless the live wall-clock measurement crosses the 25% threshold.
3. `pnpm turbo build test lint typecheck` green.
4. `pnpm run check:ticket-deps` passes.
5. The decisive wall-clock measurement is recorded truthfully in the ticket outcome: baseline `332.87s`, current `301.60s`, current runner `errors=3`.

### Invariants

1. No cache is added speculatively when live measurement does not justify it.
2. The probe-step counter is deterministic: same seed corpus and same guided toggle produce the same counter values.
3. The deterministic gate is a hard assertion, not a warning — regression past 25% probe-step overhead fails the focused performance lane.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/performance/spec-138-guided-classifier-overhead.test.ts` (new) — deterministic CI performance gate over the stable 17-seed comparable FITL corpus.

### Commands

1. Baseline profiling: `time node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 20 --players 4 --evolved-seat arvn --max-turns 200` (on commit `6653d9ea7f54cb443b47f763c8279a955b8634a1` and on current `HEAD`)
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/performance/spec-138-guided-classifier-overhead.test.js`
4. `pnpm turbo build test lint typecheck`

## Outcome

- Completed: 2026-04-19
- Descoped cache path — authoritative wall-clock measurement was `332.87s` on commit `6653d9ea7f54cb443b47f763c8279a955b8634a1` versus `301.60s` on current `HEAD`, for `-9.39%` overhead. No cache was warranted.
- Added deterministic profiler plumbing to count `decisionSequenceSatisfiability:probeStep` work across simulation and guided retry paths, and added a focused performance gate covering the stable comparable 17-seed FITL corpus.
- The focused performance gate passed at `legacy=4315`, `guided=4358`, `ratio=1.0100`, staying well below the `1.25` threshold.
- Current-head timing caveat: the authoritative 20-seed runner still reports `errors=3` on seeds `1002`, `1010`, and `1012`, so raw wall-clock is recorded as evidence only, not as the durable CI assertion surface.
- ticket corrections applied: `cache slot on GameDefRuntime iff profiling gate triggers -> no cache landed because live wall-clock measurement was below threshold`; `CI wall-clock assertion over the 20-seed runner -> deterministic probe-step gate over the stable 17-seed comparable corpus`; `pnpm -F @ludoforge/engine test:e2e --test-name-pattern="spec-138-guided-classifier-overhead" -> pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine exec node --test dist/test/performance/spec-138-guided-classifier-overhead.test.js`
