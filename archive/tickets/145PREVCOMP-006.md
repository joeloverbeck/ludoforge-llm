# 145PREVCOMP-006: Performance harness and topK derivation script

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — test/measurement-only
**Deps**: `archive/tickets/145PREVCOMP-001.md`, `archive/tickets/145PREVCOMP-002.md`

## Problem

Per Spec 145 §I6: a CI-friendly performance harness asserts that the post-spec preview pipeline does not exceed `1.05 × pre-spec wall time + 30 ms / candidate budget` on a representative ARVN microturn corpus. Live reassessment on 2026-04-25 showed that the existing campaign trace summaries contain candidate-count metadata but do not contain replayable `GameState` snapshots, so this ticket uses a deterministic live FITL corpus for the perf harness and keeps the existing trace summaries as the topK derivation-script input.

Per reassess-spec Improvement #7: the 8–12 action-selection candidate-count empirical bound that justifies `K_PREVIEW_TOPK = 4` should be re-verifiable as the campaign corpus evolves. This ticket lands a small derivation script alongside the perf harness so future authors can re-check the floor.

## Assumption Reassessment (2026-04-25)

1. `packages/engine/test/perf/agents/` does NOT yet exist. New directory created in this ticket.
2. Existing campaign summaries in `campaigns/fitl-arvn-agent-evolution/traces/` include `evolvedMoves[].agentDecision.initialCandidateCount` and `legalMoveCount`, so they are sufficient for the topK candidate-count derivation script.
3. Those trace summaries do NOT include serialized `GameState` snapshots for each microturn, so they are not sufficient to replay 50 microturns through the policy-evaluation pipeline. Foundation-aligned perf proof must generate the representative corpus live from fixed production FITL seeds/profile bindings, with reproducibility metadata recorded in the baseline fixture.
4. The harness is a CI signal, not a hard fail: per Spec 145 §I6, regressions exceeding the budget should warn but not block. Implementation: emit a `POLICY_PERF_REGRESSION` warning rather than throwing.
5. The derivation script computes the candidate-count distribution across a recent ARVN trace corpus (e.g., last N traces) and reports min/median/max. Spec 145 D7 cites "8–12 typical" — the script's output validates or refines this.

## Architecture Check

1. **F#9 (Replay, Telemetry, Auditability)** — perf measurements are deterministic across runs (modulo wall-clock noise); the harness emits structured output suitable for CI consumption.
2. **F#16 (Testing as Proof)** — perf is a soft signal, not a property test; the harness's role is to alert on regressions, not to define the contract. The contract is in Spec 145's wall-time budget, not in the harness.
3. **F#10 (Bounded Computation)** — the harness itself runs over a fixed-size microturn corpus; the derivation script reads a bounded number of trace files.

No backwards-compatibility shims. The harness is additive — a new test directory, no modifications to existing pipelines.

## What to Change

### 1. Performance harness

`packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` (new directory + new file)

Test structure:
- Generate a live deterministic corpus from production FITL using fixed seed/profile bindings (`us-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`) and capture the first 50 ARVN action-selection policy decisions.
- Invoke the policy agent's evaluation pipeline naturally through `runGame`, which exercises the driver + gate on production microturns under the same rules protocol.
- Measure wall time for the deterministic run; aggregate total time, sampled ARVN action-selection count, and candidate budget.
- Compare against a baseline JSON fixture stored in `packages/engine/test/perf/agents/preview-pipeline.baseline.json` (format includes `{ "totalMs": <number>, "perCandidateMs": <number>, "capturedAt": "<ISO date>", "corpus": { ...reproducibility metadata... } }`). The baseline represents the same live corpus with preview mode disabled.
- Assert: post-spec total wall time `<= 1.05 × baseline.totalMs + 30 × candidateCount`.

If the assertion fails, emit a non-blocking warning (e.g., via `console.warn` or test-runner annotation) with the regression magnitude. The test PASSES even on regression — operators interpret the warning. This matches the `POLICY_PROFILE_QUALITY_REGRESSION` precedent in `docs/FOUNDATIONS.md` Appendix.

### 2. Baseline capture

The baseline is captured by running the same deterministic live corpus with production profile preview modes overridden to `disabled`, then storing the measured values plus the corpus identity in `preview-pipeline.baseline.json`. The harness does not regenerate or rewrite this file at test time.

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
- `turbo.json` (verified no edit — `test:perf` remains an explicit package command rather than a turbo pipeline task)

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
4. The perf harness records corpus identity metadata sufficient to reproduce the measured live corpus (`seed`, `maxTurns`, seat/profile bindings, evolved seat, sample size, and baseline mode).

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

## Outcome

Completed 2026-04-25.

- Corrected the ticket boundary to the Foundation-aligned live contract: existing campaign trace summaries provide candidate-count evidence for the topK derivation script, but not replayable `GameState`; the perf harness now generates its representative FITL corpus live from fixed seed/profile bindings.
- Added `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts`, which runs the production FITL policy pipeline until it samples 50 ARVN action-selection decisions and compares current preview cost against a checked-in disabled-preview baseline. The harness emits `POLICY_PERF_REGRESSION` as a non-blocking warning when the budget is exceeded.
- Added `packages/engine/test/perf/agents/preview-pipeline.baseline.json` with disabled-preview timing plus corpus reproducibility metadata (`seed`, `maxTurns`, profiles, evolved seat, sample size, baseline mode).
- Added `packages/engine/test/perf/agents/derive-topk-floor.mjs`, which reads checked-in trace summaries and reports min/p25/median/p75/max candidate counts. On `trace-1000.json`, it reported `min=1, p25=7, median=10, p75=11, max=20` over 61 action-selection microturns.
- Added `pnpm -F @ludoforge/engine test:perf` package script. `turbo.json` was verified no-edit because the ticket-owned command is explicit package invocation rather than a new default turbo lane.
- Measured perf comparison: the checked-in disabled-preview baseline is `11486.28 ms` over 50 sampled ARVN action-selection decisions and 433 baseline candidates. A same-environment post-closeout probe measured disabled preview at `12062.05 ms` / 433 candidates and enabled preview at `87262.84 ms` / 493 candidates; enabled preview was `75200.79 ms` slower, or `7.23x` (`623.45%`) slower than disabled preview, and the non-blocking warning gate fired.
- Schema/artifact fallout: none; no runtime schema or generated artifact changed.
- Verification set: `pnpm -F @ludoforge/engine build`; `node packages/engine/test/perf/agents/derive-topk-floor.mjs campaigns/fitl-arvn-agent-evolution/traces/trace-1000.json`; `pnpm -F @ludoforge/engine test:perf`; `pnpm turbo lint`; `pnpm turbo typecheck`.
- No-invalidation decision: the final status/outcome edit transcribes the already-run proof set and corrected boundary recorded before implementation; it does not change code, commands, thresholds, or acceptance scope.
- Proof gaps: none for the corrected ticket boundary. Broader durable replay-state capture remains out of scope because this ticket no longer treats campaign trace summaries as replay inputs.
