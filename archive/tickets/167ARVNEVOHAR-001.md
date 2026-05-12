# 167ARVNEVOHAR-001: WASM runtime bootstrap in tournament runner

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — campaign runner bootstrap, production preview-drive parity repair, and new integration test
**Deps**: `specs/167-arvn-evolution-harness-performance.md`

## Problem

The Rust WASM policy VM at `packages/engine-wasm/policy-vm/` is fully built and tested via `packages/engine/test/integration/policy-bytecode-equivalence.test.ts`, but no production caller — engine entry, simulator, or campaign harness — invokes `initializePolicyWasmRuntimeSync` or `loadPolicyWasmRuntime`. Because `evaluatePolicyMoveCore` at `packages/engine/src/agents/policy-eval.ts:734` reads `getInitializedPolicyWasmRuntime()` and silently falls back to the TypeScript interpreter when it returns `null`, the `fitl-arvn-agent-evolution` tournament runs on the slow path every invocation. The bytecode↔WASM equivalence contract is already proven at the unit/integration layer, so adopting WASM as the default introduces no determinism risk that is not already under test — but the slow path costs measurable wall-time at every seed in every harness invocation.

## Assumption Reassessment (2026-05-12)

1. `packages/engine/src/agents/policy-wasm-runtime-node-loader.ts:41` exports `initializePolicyWasmRuntimeSync`; `:57` exports `loadPolicyWasmRuntime`. Confirmed.
2. `packages/engine/src/agents/policy-eval.ts:734` calls `getInitializedPolicyWasmRuntime()`; current behavior is silent fallback to the TypeScript interpreter when the runtime is uninitialized. Confirmed (spec says line 735, actual is 734 — off-by-one in spec, no correction needed).
3. `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs:53-54` imports `PolicyAgent` from `packages/engine/dist/src/agents/index.js`. Confirmed.
4. `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` exists and asserts bytecode↔WASM equivalence. Confirmed; new equivalence test will reuse its helper machinery rather than duplicate.
5. The result JSON written by `run-tournament.mjs:535-550` did not include a `wasmEnabled` field. Confirmed; spec §7 mandated adding it.
6. Implementation discovered a live WASM/TypeScript parity bug before the runner could safely default to WASM. User approved Option A on 2026-05-12: widen this ticket to repair the parity bug rather than narrow the ticket to instrumentation only or block it.

## Architecture Check

1. **Fail-loud over silent-fallback**: per spec §3.1, if `initializePolicyWasmRuntimeSync()` throws (missing `.wasm`, ABI mismatch), the runner emits a stderr diagnostic and exits non-zero. This prevents subsequent harness invocations from silently regressing to the TS path — a regression class that would otherwise be invisible to the campaign accept/reject contract because determinism is preserved across both paths.
2. **Foundation #5 (One Rules Protocol)** — both VMs execute the same compiled bytecode IR over the same `Agent` interface. The new equivalence test gates Foundation alignment at the campaign-runner level, complementing the existing engine-level equivalence test.
3. **Foundation #8 (Determinism Is Sacred)** — the equivalence test asserts byte-identical decision streams across WASM-on and WASM-off, providing the determinism proof for this optimization.
4. **Foundation #1 (Engine Agnosticism)** — the bootstrap call lives in campaign code (`run-tournament.mjs`). The engine changes are limited to policy-WASM scoring parity and do not add game-specific runner behavior to engine entrypoints.
5. **No backwards-compatibility shim**: `--no-wasm` is an explicit diagnostic opt-out, not a compatibility flag. The TS bytecode path remains under test via the existing equivalence test in the engine; the campaign runner does not maintain a parallel codepath beyond the single conditional bootstrap call.

## What to Change

### 1. Bootstrap the WASM runtime at startup

In `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`, after the engine imports (currently lines 42-57) and before the first `runGame` invocation:

- Import `initializePolicyWasmRuntimeSync` from `packages/engine/dist/src/agents/policy-wasm-runtime-node-loader.js`.
- Read a new `--no-wasm` flag via the existing `getArg` helper (line 64). When the flag is present, skip the bootstrap; otherwise invoke `initializePolicyWasmRuntimeSync()` inside a `try/catch`.
- On bootstrap exception: write a diagnostic to `stderr` (artifact path attempted, error message) and `process.exit(1)`. Fail-loud, not silent fallback.
- Emit one `stderr` line `"WASM policy runtime: enabled"` or `"WASM policy runtime: disabled (--no-wasm)"` so the harness log records the choice.

### 2. Extend the result JSON with `wasmEnabled`

In the `result` object at `run-tournament.mjs:535-550`, add `wasmEnabled: <boolean>` reflecting whether the bootstrap was invoked and succeeded. Per spec §7 this field is reproducibility metadata; it MUST NOT affect `compositeScore` (determinism is preserved across both paths).

### 3. New architectural-invariant equivalence test

Add `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts`:

- Header: `// @test-class: architectural-invariant`.
- Compile the production FITL spec via `compileProductionSpec` from `packages/engine/test/helpers/production-spec-helpers.ts`.
- Construct ARVN-evolved + 3 baseline `PolicyAgent` instances (same shape as `run-tournament.mjs:388-390`).
- Run one seed with WASM initialized (`initializePolicyWasmRuntimeSync()` called) and the same seed in a separate process / module-scope reset with the WASM runtime uninitialized.
- Assert: per-decision `entry.decision` and `entry.agentDecision.candidates[*].score` arrays are deep-equal across both runs.
- Reuse helper machinery from `packages/engine/test/integration/policy-bytecode-equivalence.test.ts`. Extend, do not duplicate — if a shared fixture or setup helper is missing, lift it into a sibling helper file (`packages/engine/test/integration/helpers/policy-vm-equivalence.ts`) and consume from both tests.

The test asserts the architectural invariant that runtime-VM-choice is a determinism-preserving optimization, not just a performance choice.

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` (modify)
- `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` (new)
- `packages/engine/test/integration/helpers/policy-vm-equivalence.ts` (new — only if extraction needed; otherwise reuse existing helpers in place)

## Out of Scope

- Worker-thread per-worker bootstrap calls (deferred to ticket 005 — that ticket explicitly cites this one and inherits the bootstrap contract for each worker).
- Trace emission defaults (ticket 002).
- Build script changes (ticket 003).
- Disk cache (ticket 004).
- Gating `--no-wasm` behind a `DEBUG`-only path (spec §9 open question; left for implementation review, not gated here).

## Implementation Notes (2026-05-12)

- `run-tournament.mjs` now initializes the policy WASM runtime by default, emits `WASM policy runtime: enabled`, fails loud with the attempted artifact path on bootstrap failure, and supports explicit `--no-wasm`.
- The final tournament JSON now includes `wasmEnabled`.
- `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` compares an 80-player-decision production FITL ARVN prefix across WASM-enabled and WASM-disabled policy evaluation and asserts per-candidate score equality.
- The parity repair keeps event-card action batches on the TypeScript preview path because card-event action definitions are resolved outside the generic action effect list. WASM production preview-drive now supports preview victory surface slots for `victoryCurrentMargin`/`victoryCurrentRank`, including updated globals, zones, zone vars, and markers, so projected-margin scoring remains deterministic while still exercising the production WASM score-row route.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` — per-decision and per-candidate-score deep-equal across WASM-on and WASM-off for the production FITL ARVN scenario at a fixed seed.
2. Package build passes before running the dist-based focused test.
3. Manual: `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --players 4 --evolved-seat arvn` writes `"wasmEnabled":true` in the final-line JSON; same invocation with `--no-wasm` writes `"wasmEnabled":false`; both produce identical `compositeScore`.

### Invariants

1. **Determinism preservation**: same `def`, same seed, same agents — identical decision stream regardless of which VM evaluated the policy.
2. **Fail-loud bootstrap**: a missing or ABI-mismatched WASM artifact causes the runner to exit non-zero, never silently fall back. The campaign harness must surface the failure as a `RUNNER_FAIL`, not a hidden performance regression.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` — architectural-invariant; asserts WASM↔TS decision-stream identity for the FITL ARVN production scenario at a representative seed.

### Commands

1. `node --check campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`.
2. `pnpm -F @ludoforge/engine build`.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-wasm-equivalence.test.js`.
4. `timeout 360 node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --players 4 --evolved-seat arvn`.
5. `timeout 360 node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --players 4 --evolved-seat arvn --no-wasm`.
6. `pnpm -F @ludoforge/engine test`.

## Outcome

Completed: 2026-05-12.

- Default tournament-runner WASM bootstrap landed with fail-loud startup diagnostics, explicit `--no-wasm`, and final-line `wasmEnabled` reproducibility metadata.
- The implementation included the user-approved Option A parity repair required to make default WASM truthful for the production FITL ARVN runner path.
- Added the architectural-invariant integration test `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts`; the helper extraction named in the draft was unnecessary because the test could use existing production helper surfaces directly.
- Post-review cleanup extracted `packages/engine/src/agents/policy-wasm-production-preview-drive-lowering.ts` from `policy-wasm-production-preview-drive.ts`, reducing that file from 807 lines at ticket start to 780 lines after review and bringing it back under the repo 800-line cap. No successor ticket is needed for source size.

Verification:

1. `node --check campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-wasm-equivalence.test.js`
4. `timeout 360 node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --players 4 --evolved-seat arvn` -> `wasmEnabled:true`, `compositeScore:-6`
5. `timeout 360 node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --players 4 --evolved-seat arvn --no-wasm` -> `wasmEnabled:false`, `compositeScore:-6`
6. `pnpm -F @ludoforge/engine test` -> 66/66 files passed
