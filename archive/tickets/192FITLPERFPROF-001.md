# 192FITLPERFPROF-001: Env-gated `ENGINE_PER_DECISION_PROFILE` hook + trajectory-identity test

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — single env-gated diagnostic hook at agent or kernel decision boundary; one new integration test
**Deps**: `archive/specs/192-fitl-perf-profiling-methodology.md`

## Problem

Spec 192's measurement methodology (§4.2 step 4) requires per-microturn wall-clock telemetry — `(turnId, seatId, decisionKind, decisionKey, wallClockMs, candidateCount, sourceStateHash)` per decision — without perturbing the trajectory. All downstream tickets (-002 harness scripts, -003 baseline capture, -004 categorisation) consume the hook's output via `ENGINE_PER_DECISION_PROFILE=1`; the trajectory-identity proof (§6 + §9) is the gate that protects Foundation 8 from a telemetry-induced determinism regression. Until this hook lands and is proven telemetry-only, no measurement campaign can be trusted.

## Assumption Reassessment (2026-05-23)

1. The `ENGINE_OOM_TRACE` precedent in `packages/engine/src/agents/policy-eval.ts` (`const shouldLogPolicyEvalOomTrace = (): boolean => process.env.ENGINE_OOM_TRACE === '1';` plus conditional `heapUsedMb` logging) is real and provides the env-gate pattern to mirror — verified during reassessment.
2. The spec leaves the insertion point open between agent and kernel decision boundary (§2 Non-Goals + §4.2 step 4). Reassessment selected the simulator run boundary in `packages/engine/src/sim/run-game-steps.ts`, where existing `DecisionLog` records already cover player and auto-resolved kernel decisions and where a private per-run buffer can flush exactly once at run completion. This avoided per-agent duplication and avoided deriving partial decision context in `applyMove`.
3. Foundation 11's scoped-internal-mutation exception governs the telemetry buffer (a private per-run array, never observable to callers, emitted via `process.stderr.write` at completion). The spec explicitly invokes this exception in §6.
4. The trajectory-identity test name follows the convention from existing integration tests under `packages/engine/test/integration/` (verified during reassessment).

## Architecture Check

1. **Zero-cost when off**: The hook is gated behind a single env-var check that short-circuits before any allocation, mirroring `shouldLogPolicyEvalOomTrace`. Production runs and CI runs without the flag are unaffected — no perf regression.
2. **Foundation 1 (Engine Agnosticism)**: The instrumentation is game-agnostic; it captures only decision-shape fields (`decisionKind`, `decisionKey`, `seatId`, `turnId`, `candidateCount`, `sourceStateHash`). No FITL-specific fields. The same hook works for any GameDef.
3. **Foundation 8 (Determinism)**: The hook reads `performance.now()` only as telemetry; the value never feeds back into seed-derived state or any kernel decision. The trajectory-identity test is the proof obligation — if the hook perturbs trajectory in any seed × workload combination, the test fails and the hook is bugged.
4. **Foundation 11 (Immutability)**: The hook appends to a private per-run array (scoped-internal-mutation exception), never mutating caller-visible state and never observing the buffer before finalization.
5. **Foundation 14 (No Backwards Compatibility)**: This is not a compat shim — it is a deliberate diagnostic surface paired with the existing `ENGINE_OOM_TRACE` pattern.
6. **No agent-decision change**: The hook records timing only; it does NOT alter any agent's decision output.

## What to Change

### 1. Add env-gate predicate and per-run telemetry buffer

Mirror the `ENGINE_OOM_TRACE` pattern from `policy-eval.ts`. Added to `packages/engine/src/sim/run-game-steps.ts`:

```ts
const shouldRecordPerDecisionProfile = (): boolean =>
  process.env.ENGINE_PER_DECISION_PROFILE === '1';
```

When active, allocate a per-run array `perDecisionProfileBuffer: PerDecisionProfileEntry[] = []`, append one entry per kernel-visible decision, and emit at run completion via `process.stderr.write('[per-decision-profile] ' + JSON.stringify({ kind: 'per-decision-profile', entries }) + '\n')`. Single flush at end avoids stderr contention.

### 2. Resolve insertion point during `/implement-ticket` reassessment

Trace the original candidate sites and pick the one where the entry fields are naturally available:

- **PolicyAgent.chooseActionSelectionDecision** (and sibling methods `chooseOneOptionDecision`, `chooseNStepDecision` if present) — has `seatId`, `decisionKind`, `decisionKey`, `candidateCount` directly; needs `turnId` and `sourceStateHash` from the input state.
- **evaluatePolicyMoveCore** (policy-eval.ts:606) — same fields, but only fires on the policy-evaluator path; misses kernel-decided microturns (outcome grants, turn retirement) unless complemented.
- **applyMove** (apply-move.ts:1819) — sees every microturn (kernel + agent), but `decisionKind` and `candidateCount` need to be derived from the published decision before the move is applied.

The implemented seam is `runGameSteps`, using the existing run loop's before/after state, `autoResolvedLogs`, and player `DecisionLog`. It captures all six workload streams without adding game-specific code or changing decision selection.

### 3. Define the entry shape and emit format

```ts
interface PerDecisionProfileEntry {
  readonly turnId: number;
  readonly seatId: string;
  readonly decisionKind: string;       // 'actionSelection' | 'chooseOne' | 'chooseNStep' | 'kernel' | ...
  readonly decisionKey: string;        // canonical decision identifier
  readonly wallClockMs: number;
  readonly candidateCount: number;
  readonly sourceStateHash: string;
}
```

Emit format: single line per run, JSON-encoded, prefixed `[per-decision-profile]`. Match the existing perf-witness output style (e.g., `SPEC149_PHASE4_PREVIEW_BATCH_COUNT_DRIFT ...`) so the harness scripts in ticket -002 can grep for the prefix.

### 4. Add trajectory-identity integration test

Create `packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts`:

- For each of the six workloads in spec §4.1 (parity-drive, arvn-tournament-parallel, arvn-tournament-wasm-equivalence, policy-preview-parity-arvn-1008, bounded-termination-1002, diagnose-parity-runGame-1001), run twice — once with `ENGINE_PER_DECISION_PROFILE=1`, once without.
- Assert `trace.finalState.stateHash` equality between the two runs.
- Assert `trace.moves.length` equality (defense-in-depth — if hashes diverge first, this gives a more readable failure).
- If any workload's heaviest CI cost (>300s) makes this test prohibitively slow, use a reduced-seed/maxTurns variant per workload, documented in the test.

The test file must declare `// @test-class: architectural-invariant` per `.claude/rules/testing.md` — this is a property that must hold for every legitimate kernel evolution, not a seed-specific trajectory pin.

## Files to Touch

- `packages/engine/src/sim/run-game-steps.ts` (modified — exact target resolved in reassessment)
- `packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts` (new)

## Out of Scope

- The 5 harness scripts under `packages/engine/scripts/perf-baseline/` (ticket -002)
- The harness-smoke test (ticket -002)
- Capturing baselines at HEAD or in the pre-Spec-190 worktree (ticket -003)
- Writing the findings report (ticket -004)
- Any change to the engine's decision-making logic — telemetry only
- Cross-game extension; FITL workloads are the corpus per §2

## Acceptance Criteria

### Tests That Must Pass

1. New: `pnpm -F @ludoforge/engine build && node --test dist/test/integration/perf-baseline-trajectory-identity.test.js` — all six workloads produce identical `trace.finalState.stateHash` with vs. without the env flag.
2. Existing engine suite unaffected: `pnpm -F @ludoforge/engine test` passes.
3. Existing E2E suite unaffected: `pnpm -F @ludoforge/engine test:e2e` passes.
4. Lint + typecheck: `pnpm turbo lint typecheck` passes.

### Invariants

1. **Foundation 8 (Determinism)**: For every `(workload, seed)` pair in spec §4.1, `trace.finalState.stateHash` MUST be identical with `ENGINE_PER_DECISION_PROFILE=1` and unset. Violating this invalidates the entire measurement campaign.
2. **Foundation 11 (Immutability)**: The telemetry buffer MUST be a private per-run array; no caller-observable state mutation; no buffer read before run completion.
3. **Zero overhead when off**: Running the existing perf gates (`fitl-parity-drive.perf.test.ts`, etc.) without the env flag MUST NOT show wall-clock regression vs. PR #280 HEAD `422e951b9`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts` (new) — architectural-invariant test asserting hash + move-count identity across env-flag toggle for all 6 workloads. Required acceptance gate for P1 per spec §9.

### Commands

1. Targeted: `pnpm -F @ludoforge/engine build && node --test dist/test/integration/perf-baseline-trajectory-identity.test.js`
2. Engine full suite: `pnpm -F @ludoforge/engine test`
3. Lint + typecheck: `pnpm turbo lint typecheck`
4. Manual smoke (zero-overhead check): `pnpm -F @ludoforge/engine build && time node --test dist/test/perf/agents/fitl-parity-drive.perf.test.js` — wall-clock must match recent PR #280 baselines.

## Completion Notes (2026-05-23)

- Implemented the env-gated telemetry hook in `packages/engine/src/sim/run-game-steps.ts`, with no per-run buffer allocation unless `ENGINE_PER_DECISION_PROFILE === '1'`.
- Emitted exactly one `[per-decision-profile]` JSON line per run on normal completion paths.
- Used the browser-safe global `performance` instead of importing `node:perf_hooks`; `pnpm turbo lint typecheck` caught and prevented the Node-specific import.
- Added `packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts` with six reduced one-turn workload variants preserving the six Spec 192 workload keys. The full workload variants are too expensive for a standing architectural invariant, and the ticket explicitly allowed reduced seed/maxTurns variants when the heaviest workload cost is prohibitive.
- Source-size ledger: `run-game-steps.ts` grew by 63 lines to 456 total lines; the new trajectory-identity test is 167 lines. Both remain below the repository file-size cap.
- Generated/schema artifacts: none changed; `schema:artifacts:check` passed as part of the engine package test lane.

Verification:

- `pnpm -F @ludoforge/engine build` — pass.
- `node --test dist/test/integration/perf-baseline-trajectory-identity.test.js` — pass, 6/6 workload-key subtests.
- `pnpm -F @ludoforge/engine test` — pass, 168/168 files.
- `pnpm -F @ludoforge/engine test:e2e` — pass, 6 tests.
- `pnpm turbo lint typecheck` — pass.
- `node --test dist/test/perf/agents/fitl-parity-drive.perf.test.js` — pass in 157897.561 ms, below the 700000 ms perf gate.
