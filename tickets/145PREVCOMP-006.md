# 145PREVCOMP-006: Performance harness and topK derivation script

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test/measurement-only
**Deps**: `archive/tickets/145PREVCOMP-001.md`, `archive/tickets/145PREVCOMP-002.md`

## Problem

Per Spec 145 §I6: a CI-friendly performance harness asserts that the post-spec preview pipeline does not exceed `1.05 × pre-spec wall time + 30 ms / candidate budget` on a representative ARVN microturn corpus. The pre-spec baseline is captured at the time `145PREVCOMP-001` lands (that is, the harness must be authored against an engine that has the driver but bypassable to a no-driver baseline for comparison, OR baseline numbers are captured before merge as part of this ticket's setup).

Per reassess-spec Improvement #7: the 8–12 action-selection candidate-count empirical bound that justifies `K_PREVIEW_TOPK = 4` should be re-verifiable as the campaign corpus evolves. This ticket lands a small derivation script alongside the perf harness so future authors can re-check the floor.

## Assumption Reassessment (2026-04-25)

1. `packages/engine/test/perf/agents/` does NOT yet exist (verified by reassess-spec). New directory created in this ticket.
2. ARVN action-selection microturns suitable for replay come from `campaigns/fitl-arvn-agent-evolution/traces/`. Trace JSON includes per-microturn data sufficient to reconstruct candidate sets — verified by structure of `trace-1000.json`.
3. The harness is a CI signal, not a hard fail: per Spec 145 §I6, regressions exceeding the budget should warn but not block. Implementation: emit a `POLICY_PERF_REGRESSION` warning rather than throwing.
4. The derivation script computes the candidate-count distribution across a recent ARVN trace corpus (e.g., last N traces) and reports min/median/max. Spec 145 D7 cites "8–12 typical" — the script's output validates or refines this.

## Architecture Check

1. **F#9 (Replay, Telemetry, Auditability)** — perf measurements are deterministic across runs (modulo wall-clock noise); the harness emits structured output suitable for CI consumption.
2. **F#16 (Testing as Proof)** — perf is a soft signal, not a property test; the harness's role is to alert on regressions, not to define the contract. The contract is in Spec 145's wall-time budget, not in the harness.
3. **F#10 (Bounded Computation)** — the harness itself runs over a fixed-size microturn corpus; the derivation script reads a bounded number of trace files.

No backwards-compatibility shims. The harness is additive — a new test directory, no modifications to existing pipelines.

## What to Change

### 1. Performance harness

`packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` (new directory + new file)

Test structure:
- Load 50 ARVN action-selection microturns from a captured trace corpus (use `campaigns/fitl-arvn-agent-evolution/traces/trace-1000.json` or successor traces; cite the path explicitly so future authors can refresh).
- For each microturn, invoke the policy agent's evaluation pipeline (which goes through the driver + gate) under controlled conditions: same seed, same RNG state, same profile.
- Measure wall time per microturn; aggregate to total and per-candidate budget.
- Compare against a baseline JSON fixture stored in `packages/engine/test/perf/agents/preview-pipeline.baseline.json` (created at I1 land time; format: `{ "totalMs": <number>, "perCandidateMs": <number>, "capturedAt": "<ISO date>", "traceSource": "<path>" }`).
- Assert: post-spec total wall time `<= 1.05 × baseline.totalMs + 30 × candidateCount`.

If the assertion fails, emit a non-blocking warning (e.g., via `console.warn` or test-runner annotation) with the regression magnitude. The test PASSES even on regression — operators interpret the warning. This matches the `POLICY_PROFILE_QUALITY_REGRESSION` precedent in `docs/FOUNDATIONS.md` Appendix.

### 2. Baseline capture

The pre-spec baseline (driver disabled, classic rejection path) is captured at I1 land time. Two options:
- **Option A**: capture baseline before this ticket's harness PR lands by running the perf measurement on the I1-merged engine with `previewMode: 'disabled'` for all candidates, normalizing for the disabled-mode cost difference.
- **Option B**: capture baseline by adding a temporary `previewMode: 'disabled'` flag to the harness setup, run baseline once, store in `preview-pipeline.baseline.json`, then enable the driver for the actual assertion.

Recommended Option B for reproducibility: the baseline JSON is a checked-in fixture, regenerable on demand.

### 3. K_PREVIEW_TOPK derivation script

`packages/engine/test/perf/agents/derive-topk-floor.mjs` (new)

Pattern: standalone Node script (not a test) that:
- Reads a configurable trace path or trace corpus directory.
- For each action-selection microturn in the trace, counts the candidate set size.
- Reports min / 25th percentile / median / 75th percentile / max / total-count.
- Prints a summary line: `K_PREVIEW_TOPK justification: min=N1, p25=N2, median=N3, p75=N4, max=N5 (over N6 microturns from <path>). Spec 145 cites 8–12 typical; current default K=4.`
- Exit nonzero if the median candidate count is materially below 4 (would suggest the gate is over-tight).

Document the script in a one-paragraph header comment so a future reassess-spec or campaign-tooling ticket can re-run without re-reading this ticket.

### 4. CI integration

The perf harness goes under `test:perf` (or equivalent existing perf-test package script). If no such script exists in `packages/engine/package.json`, add one: `"test:perf": "node --test ./dist/test/perf/**/*.test.js"` and document its non-blocking nature.

## Files to Touch

- `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` (new)
- `packages/engine/test/perf/agents/preview-pipeline.baseline.json` (new — captured baseline)
- `packages/engine/test/perf/agents/derive-topk-floor.mjs` (new — derivation script)
- `packages/engine/package.json` (modify — add `test:perf` script if absent)
- `turbo.json` (modify — add `test:perf` to pipeline if absent and CI integration desired; otherwise leave non-pipelined for explicit invocation)

## Out of Scope

- Driver and gate implementations — `145PREVCOMP-001`, `145PREVCOMP-002`.
- Trace fixture re-bless — `145PREVCOMP-003`.
- Cross-game conformance — `145PREVCOMP-004`.
- Diagnostic field emission — `145PREVCOMP-005`.
- Refining `K_PREVIEW_TOPK` default — out of scope; the derivation script reports data, but changing the default is a separate decision.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test:perf` runs the new harness; under normal conditions (no regression), it passes.
2. Manual run of `node packages/engine/test/perf/agents/derive-topk-floor.mjs <trace-path>` produces a valid summary line with no exit error.
3. `pnpm turbo lint` and `pnpm turbo typecheck` green.

### Invariants

1. The perf harness is non-blocking — it emits warnings on regression rather than throwing (operators interpret).
2. The derivation script does not depend on the engine being in any particular post-spec state — it reads checked-in trace JSON only.
3. Baseline JSON is checked in and regenerable; the harness does not silently update the baseline on every run.

## Test Plan

### Manual verification

1. Run `pnpm -F @ludoforge/engine test:perf` after `145PREVCOMP-001` and `145PREVCOMP-002` land — confirm baseline-vs-current comparison runs to completion.
2. Run `node packages/engine/test/perf/agents/derive-topk-floor.mjs campaigns/fitl-arvn-agent-evolution/traces/trace-1000.json` — confirm summary output includes min/p25/median/p75/max and the `K_PREVIEW_TOPK justification` line.
3. Manually flip the driver depth cap to 1 (force `'depthCap'` outcomes) and re-run the harness — confirm warning emitted but test does not throw (non-blocking property).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:perf`
3. `node packages/engine/test/perf/agents/derive-topk-floor.mjs <trace-path>`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`
