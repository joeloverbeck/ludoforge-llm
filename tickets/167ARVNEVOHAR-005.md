# 167ARVNEVOHAR-005: Worker-thread shard pool for seeds

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: None — campaign runner + new integration test only
**Deps**: `archive/tickets/167ARVNEVOHAR-001.md`

## Problem

`campaigns/fitl-arvn-agent-evolution/run-tournament.mjs:384-515` is a serial `for` loop over `SEED_COUNT` seeds. At tier-15 the loop spends ~10-11 minutes of wall-time running 15 fully-independent `runGame` invocations sequentially on a single Node thread, despite the existing `GameDefRuntime` contract from Spec 143 (`docs/architecture.md` "Runtime Ownership") explicitly classifying structural members as `sharedStructural` and run-local members as `runLocal`, with `forkGameDefRuntimeForRun` at `packages/engine/src/kernel/gamedef-runtime.ts:94` providing the per-run isolation primitive. The contract is already in place to support per-seed parallel execution; the campaign harness simply does not exploit it.

## Assumption Reassessment (2026-05-12)

1. Per-seed independence is a property of the existing contract: `def` is shared across seeds; `forkGameDefRuntimeForRun(runtime)` produces a per-run forked runtime with a fresh `zobristTable.keyCache` and a fresh publication-probe `runLocal` cache (`packages/engine/src/kernel/gamedef-runtime.ts:40,94`). Confirmed.
2. `PolicyAgent` instances are constructed per seed at `run-tournament.mjs:388-390` and discarded after each game; agent-side state is already per-seed-isolated. Confirmed.
3. `GameDef` is JSON-serializable (already used as such in ticket 004's cache). Passing it across worker thread boundaries via `workerData` is safe. Confirmed.
4. `GameDefRuntime` structural members include compiled lifecycle effects, rule-card cache, adjacency graph, runtime-table index, etc. (`packages/engine/src/kernel/gamedef-runtime.ts:19-44`). These reconstruct deterministically from `def` via `createGameDefRuntime(def)`; rebuilding per worker is correct and the amortized cost across multiple seeds per worker is acceptable. Confirmed.
5. WASM bootstrap (ticket 001) installs the runtime in the main thread only. Each worker thread starts with its own V8 isolate and must call `initializePolicyWasmRuntimeSync()` before its first `runGame`. Confirmed by inspection of `packages/engine/src/agents/policy-wasm-runtime-node-loader.ts`.
6. Result aggregation logic at `run-tournament.mjs:519-553` operates over per-seed accumulators (`wins`, `completed`, `aggregateDecisionStats`, etc.). These reduce associatively over seeds, so consuming worker results in any completion order produces the same final aggregate as the serial path — but the per-seed JSON output (margin, `evolvedMoves`, decisionBreakdown, the optional trace summary) MUST be byte-identical to the serial path for the same seed.
7. Spec §3.4 mandates work-stealing dispatch (not static partition) so long-running seeds do not stall short workers. A simple queue + `postMessage` pull pattern suffices; `--concurrency` defines pool size.
8. The result JSON written by `run-tournament.mjs:535-550` does not currently include a `concurrency` field. Spec §7 mandates adding it.
9. `harness.sh:46-51` passes flags to the runner; spec §3.4 says to add `--concurrency ${CONCURRENCY:-N}` where `N` is benchmarked at implementation time (spec §9 open question). Implementer selects the default after a `{2,4,6,8}` benchmark on the dev box; default value lives in `harness.sh` and is documented in `campaigns/fitl-arvn-agent-evolution/program.md:268-278` (Configuration section).

## Architecture Check

1. **Foundation #8 (Determinism Is Sacred)**: every per-seed trace MUST be byte-identical to a `--concurrency 1` run for the same seed. The new determinism test asserts this property — concurrency is a wall-time optimization, never a semantic change.
2. **Foundation #11 (Immutability — run-local state corollary)**: each worker calls `forkGameDefRuntimeForRun(runtime)` per seed, per Spec 143's contract. Workers obtain isolated `runLocal` state per run; the shared `sharedStructural` members are reconstructed per worker rather than shared across threads (per spec §3.4's intentional cost trade-off — `SharedArrayBuffer` discipline would be required for cross-thread reuse and the structural members do not currently respect it).
3. **Foundation #1 (Engine Agnosticism)**: worker bootstrap logic lives in campaign code (`run-tournament.mjs` + a sibling worker entry script). No engine code is touched.
4. **Foundation #5 (One Rules Protocol)**: workers use the same `runGame` entry, the same `PolicyAgent` class, the same compiled `GameDef`. No worker-only legality path is introduced.
5. **Foundation #14 (No Backwards Compatibility)**: `--concurrency 1` continues to behave identically to the pre-ticket serial path (single-worker pool, no thread-spawn overhead path). The default value flips when `harness.sh` is updated; the override semantics do not.
6. **Work-stealing dispatch is the only correct choice**: FITL seeds vary in length (truncated games hit `maxTurns`, while winning games end earlier). Static partition stalls short workers; a pull-queue saturates the pool. The dispatch policy itself does not affect per-seed determinism — only completion order — so this is a pure throughput choice.

## What to Change

### 1. Extract the per-seed runner into a reusable module

Refactor the inner loop body at `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs:384-515` into a pure function in a new module `campaigns/fitl-arvn-agent-evolution/run-seed.mjs`:

- Export `runSeed({ def, runtime, seed, seatProfiles, evolvedPlayerIndex, maxTurns, playerCount, traceMode, traceSeed, evolvedSeat })`.
- The function returns a structured result object: `{ seed, evolvedWon, evolvedMargin, allSeatMargins, decisionStats, traceSummary | null, error: null | string, stopReason, completed: boolean, truncated: boolean }`.
- The function calls `forkGameDefRuntimeForRun(runtime)` once per invocation (per Spec 143 contract).
- Decision-stat accumulation that previously happened in the loop (`run-tournament.mjs:437-447`) moves into this function; the caller is responsible for reducing per-seed results into the aggregate.

### 2. Add worker entry script

Create `campaigns/fitl-arvn-agent-evolution/run-seed-worker.mjs`:

- Reads `workerData` (the `def` JSON + bootstrap parameters).
- Calls `initializePolicyWasmRuntimeSync()` at startup (mandatory per spec §3.4; mirrors ticket 001's main-thread bootstrap). Honors a `--no-wasm` flag passed in `workerData`.
- Reconstructs `GameDefRuntime` via `createGameDefRuntime(def)` once per worker.
- Listens for `postMessage({ seed })` from the main thread; for each message, invokes `runSeed(...)` and posts back `{ seed, result }`.
- On uncaught exception, posts `{ seed, error: <message + stack> }` and remains alive for the next dispatch (or exits if the pool is shutting down).

### 3. Main-process pool + work-stealing dispatch

In `run-tournament.mjs`, after the compile step (cache hit/miss from ticket 004) and before the existing seed loop:

- Parse `const CONCURRENCY = Number(getArg('concurrency', '1'));` — default 1 preserves current serial behavior for non-harness invocations.
- When `CONCURRENCY === 1`, take the in-process serial path (call `runSeed` directly in a loop). This keeps single-seed diagnostic runs simple and avoids worker-spawn overhead for the `SEED_COUNT == 1` case.
- When `CONCURRENCY > 1`, spawn `min(CONCURRENCY, SEED_COUNT)` workers; maintain a shared seed queue (`[1000, 1001, ..., 1000 + SEED_COUNT - 1]`); on each worker's "ready" or completion message, post the next pending seed. Collect results into a `Map<seed, result>`.
- After all workers report completion (or all seeds drained), iterate `Map` entries in **seed-numeric-ascending** order and reduce into the existing aggregate accumulators — this preserves deterministic aggregation regardless of worker completion order.
- Trace emission (ticket 002 logic) runs after the reduce, in the main process. Worker `traceSummary` payloads come back via `postMessage`; the main process is responsible for the actual file write to preserve ticket 002's single-source-of-truth I/O.

### 4. Extend the result JSON with `concurrency`

In the `result` object at `run-tournament.mjs:535-550`, add `concurrency: <integer>` reflecting the resolved pool size. Per spec §7 this field is reproducibility metadata; it MUST NOT affect `compositeScore`.

### 5. Wire the harness flag

In `campaigns/fitl-arvn-agent-evolution/harness.sh:46-51`, add `--concurrency "${CONCURRENCY:-N}"` to the runner invocation. Benchmark `N ∈ {2, 4, 6, 8}` on the dev box at implementation time (spec §9); select the value that minimizes 15-seed wall-time without thrashing. Document the chosen value in `campaigns/fitl-arvn-agent-evolution/program.md:268-278` (Configuration section).

### 6. New architectural-invariant determinism test

Add `packages/engine/test/integration/arvn-tournament-parallel-determinism.test.ts`:

- Header: `// @test-class: architectural-invariant`.
- Compile the production FITL spec via `compileProductionSpec`.
- Import `runSeed` from the campaign module (relative path from the test file).
- Run the same seed set (e.g., `[1000, 1001, 1002, 1003]`) twice: once with single-threaded direct calls, once with worker-pool dispatch (`--concurrency 4`).
- Assert: per-seed result objects are deep-equal across both runs; the reduced aggregate (`compositeScore`, `avgMargin`, `winRate`, `decisionBreakdown`) is exactly equal (no noise tolerance — determinism is preserved, equality is exact).

The test asserts the architectural invariant that worker-thread dispatch is a wall-time optimization, not a semantic change. This is the campaign-level analogue of the engine's per-seed replay-identity tests.

### 7. Note on baseline measurement

The `reports/turnperf-002-spec-167-baseline.md` deliverable from spec §5 is owned by the follow-up ticket 167ARVNEVOHAR-006. This ticket produces the data path (parallel `runSeed` invocation); ticket 006 captures and writes the report.

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/run-seed.mjs` (new — extracted seed runner)
- `campaigns/fitl-arvn-agent-evolution/run-seed-worker.mjs` (new — worker entry)
- `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` (modify — pool dispatch + result JSON extension)
- `campaigns/fitl-arvn-agent-evolution/harness.sh` (modify — `--concurrency` flag wiring)
- `campaigns/fitl-arvn-agent-evolution/program.md` (modify — document the chosen `CONCURRENCY` default in §Configuration)
- `packages/engine/test/integration/arvn-tournament-parallel-determinism.test.ts` (new)

## Out of Scope

- Sharing structural runtime members across worker threads via `SharedArrayBuffer` (spec §3.4 — explicit cost trade-off; rebuild per worker is amortized correctly).
- Engine per-decision kernel optimizations (deferred per spec §10 — owned by a follow-up spec, working name "engine per-decision hot-path optimizations").
- Baseline report `reports/turnperf-002-spec-167-baseline.md` (owned by ticket 167ARVNEVOHAR-006).
- Generalizing the worker pool to other campaigns (spec §10 — extract at the second use).

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/arvn-tournament-parallel-determinism.test.ts` — per-seed deep equality + aggregate exact equality across `--concurrency 1` vs. `--concurrency 4`.
2. Existing suite: `pnpm -F @ludoforge/engine test` continues to pass.
3. End-to-end at tier 15: `SEED_COUNT=15 bash campaigns/fitl-arvn-agent-evolution/harness.sh` completes in ≤ 3 minutes wall-time on the dev box, with `errors=0` and `compositeScore` exactly matching the single-worker baseline (no noise tolerance — determinism is preserved).
4. Manual: `--concurrency 1` continues to take the in-process serial path; no worker-spawn overhead introduced for single-thread invocations.

### Invariants

1. **Per-seed determinism**: for the same `def`, same seed, same engine version, the per-seed trace is byte-identical across any `--concurrency N`. Asserted by the new test.
2. **Aggregate determinism**: `compositeScore`, `avgMargin`, `winRate`, `decisionBreakdown` are byte-identical across any `--concurrency N`. Worker completion order does not influence aggregate output because reduction happens in seed-numeric order.
3. **Run-local isolation**: each worker calls `forkGameDefRuntimeForRun(runtime)` per seed. The Spec 143 contract is honored — no shared `runLocal` state across runs in the same worker.
4. **Worker WASM parity**: every worker bootstraps the WASM runtime (or skips it under `--no-wasm`) before its first `runGame`. The campaign cannot have workers in mixed-VM states.
5. **Reduction is order-stable**: per-seed results are reduced in numeric ascending seed order, not in worker completion order.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/arvn-tournament-parallel-determinism.test.ts` — architectural-invariant; asserts byte-identical per-seed traces and aggregate metrics across `--concurrency 1` and `--concurrency 4`.

### Commands

1. `node packages/engine/scripts/run-tests.mjs --testNamePattern "arvn-tournament-parallel-determinism"` (after `pnpm turbo build`).
2. `pnpm -F @ludoforge/engine test` (full engine suite — regression parity).
3. `pnpm turbo lint && pnpm turbo typecheck` (clean checks).
4. End-to-end: `SEED_COUNT=15 time bash campaigns/fitl-arvn-agent-evolution/harness.sh` — measure wall-time; verify ≤ 3 minutes and `compositeScore` exact-match vs. the pre-ticket-005 baseline at the same seed set.
5. Benchmark `--concurrency ∈ {2, 4, 6, 8}` at `SEED_COUNT=15` to select the harness default; record the chosen value in `program.md`.
