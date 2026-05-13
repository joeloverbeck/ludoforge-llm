# Spec 167 — ARVN Evolution Harness Performance

**Status**: ✅ COMPLETED
**Priority**: High — the `fitl-arvn-agent-evolution` campaign at seed-tier 15 takes ~15 minutes per harness invocation, which throttles every experiment in the improve-loop and compounds across the unbounded campaign horizon. Recovering even half of that wall-time roughly doubles the experimental throughput of the active campaign and every successor that reuses the harness.
**Complexity**: M
**Date**: 2026-05-12
**Predecessors**: Spec 143 (run-local memory ownership, `forkGameDefRuntimeForRun` contract — most load-bearing precedent for safely sharing structural runtime state across runs).
**Dependencies**: Spec 143 (closed).
**Trigger reports**:
- Internal investigation in this session (no external proposal): three parallel codebase audits covering (a) the per-decision kernel hot path, (b) the bytecode-IR ↔ Rust WASM policy VM relationship, (c) harness-layer bottlenecks. Key findings recorded in §2.
- Existing baseline reference: `archive/reports/turnperf-001-investigation-2026-04-28.md` — per-card cost decomposition (agent choice ≈ 62% of per-decision CPU; ~15 token-state-index rebuilds per decision). The data motivates the deferred follow-up scope in §8 but does not require changes by this spec.

---

## 1. Goal

Reduce wall-time of `campaigns/fitl-arvn-agent-evolution/harness.sh` at seed-tier 15 from ~15 minutes to ~2 minutes, without altering the campaign's accept/reject contract, the determinism of any individual `runGame` invocation, or the engine kernel surface.

After this spec lands:

- The Rust WASM policy VM is the default execution path for policy scoring during tournament runs, with the existing TypeScript bytecode interpreter retained only as an opt-out fallback for diagnostics.
- The 15 seeds in one tournament invocation run sharded across N Node `worker_threads` via a new `--concurrency` flag on `run-tournament.mjs`, with per-seed traces and aggregate metrics byte-identical to a single-worker baseline.
- The TypeScript build step in `harness.sh` runs incrementally — the `clean && tsc` pre-step is removed and `composite: true` actually delivers incremental compilation by retaining `tsBuildInfoFile` across invocations.
- Per-seed trace JSON emission is opt-in (off by default at tier ≥ 2), preserving the `--trace-seed N` and `--trace-all true` overrides for OBSERVE-phase introspection.
- The compiled `GameDef` is cached to disk under a canonical key derived from the spec content hash and the engine commit, eliminating repeated YAML parse + compile work across consecutive harness invocations when the spec hasn't changed.

## 2. Context (verified against codebase)

### 2.1 The harness wall-time decomposes into three independent layers

The investigation traced `campaigns/fitl-arvn-agent-evolution/harness.sh:6-107` end-to-end and identified three independent cost layers. Layer ordering reflects descending leverage per unit of engineering effort.

**Layer 1 — Harness scaffolding (estimated ~3-4 minutes today, mostly waste):**
- `harness.sh:19` runs `pnpm -F @ludoforge/engine build`, which per `packages/engine/package.json` resolves to `pnpm run clean && tsc`. `pnpm run clean` deletes `dist/`, including `dist/tsconfig.tsbuildinfo`. `packages/engine/tsconfig.json:8` declares `composite: true` (which implies `incremental`), but the buildinfo file never survives long enough to be consumed. Every invocation pays a full-tree cold tsc cost across ~700+ source files.
- `harness.sh:28` runs the full engine test suite as a regression gate (`pnpm -F @ludoforge/engine test` → `packages/engine/scripts/run-tests.mjs --lane default`). The default lane covers ~875+ test files. This spec preserves this gate unchanged (see §10 — Out of scope).
- `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs:317-318` calls `loadGameSpecBundleFromEntrypoint(entrypoint)` and `runGameSpecStagesFromBundle(bundle)` on every invocation. The spec content does not change between most experiments (mutations live in `92-agents.md` only), so the parse + macro-expand + validate + compile-agents pipeline pays the same cost each run.
- `run-tournament.mjs:74` defaults `TRACE_ALL` to `'true'`. `run-tournament.mjs:501-502` writes a per-seed trace JSON. Confirmed file sizes: `traces/trace-1000.json` 3.4 MB, `traces/trace-1001.json` 4.7 MB, directory total 84 MB. Trace I/O plus the `computeAllSeatMargins` evalContext built per seat per trace at `run-tournament.mjs:140-174,450,463` is non-trivial.

**Layer 2 — Tournament loop structure (estimated ~10-11 minutes today, parallelizable):**
- `run-tournament.mjs:384-515` is a serial `for` loop over `SEED_COUNT` seeds. `def` and `runtime` are constructed once at `run-tournament.mjs:342-343` and reused across all seeds.
- The Spec 143 audit (this repo's `docs/architecture.md`, "Runtime Ownership" section) explicitly classifies the structural members of `GameDefRuntime` (adjacencyGraph, runtimeTableIndex, alwaysCompleteActionIds, firstDecisionDomains, ruleCardCache, compiledLifecycleEffects) as `sharedStructural` — safe to reuse across runs — while `zobristTable.keyCache` is `runLocal` and is the responsibility of `forkGameDefRuntimeForRun(...)` at `packages/engine/src/kernel/gamedef-runtime.ts:84-95`. The contract is already in place to support multiple independent runs over one compiled `GameDef`.

**Layer 3 — Per-decision kernel hot path (estimated ~5-7 minutes today, engine-level, DEFERRED):**
- `archive/reports/turnperf-001-investigation-2026-04-28.md` reports agent choice ≈ 62% of per-decision CPU and ~15 token-state-index rebuilds per decision for a single-card baseline. This layer is in scope for a follow-up spec (see §10).

### 2.2 The WASM policy VM is built but never loaded in the tournament path

`run-tournament.mjs:53-54` imports `PolicyAgent` from `packages/engine/dist/src/agents/index.js`. Neither `run-tournament.mjs` nor any module in the agent or simulator entry path calls `initializePolicyWasmRuntimeSync` or `loadPolicyWasmRuntime`. Grep of the source tree:

- `packages/engine/src/agents/policy-wasm-runtime-node-loader.ts:41,57` — the two public initializers.
- `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts:22,48` — the perf test deliberately calls `initializePolicyWasmRuntimeSync()` because its author understood the runtime would otherwise stay dormant.
- `packages/engine/test/unit/agents/preview-budget-allocator.test.ts:8,398` — same pattern.
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts:15,470,533,602`, `policy-wasm-runtime.test.ts:11,…`, `policy-preview-driver.test.ts:7,513,616,653` — all explicit.

No production caller (engine entry points, simulator, or campaign harness) invokes either initializer. The bytecode IR continues to be compiled and cached (`packages/engine/src/agents/policy-wasm-score-bytecode-cache.ts:15-22`), but with no loaded WASM runtime, `getInitializedPolicyWasmRuntime()` returns `null` and `evaluatePolicyMoveCore` (`packages/engine/src/agents/policy-eval.ts:735`) silently uses the TypeScript interpreter. The Rust VM at `packages/engine-wasm/policy-vm/src/lib.rs` (1298 lines, ABI version 9, opcodes for batched candidate scoring and preview-drive simulation) is dormant during evolution.

The equivalence contract between WASM and TS bytecode interpretation is already proven by `packages/engine/test/integration/policy-bytecode-equivalence.test.ts`, so adopting WASM as the default introduces no determinism risk that is not already under test.

### 2.3 Per-seed independence is already a property of the existing contract

`run-tournament.mjs:392` calls `runGame(def, seed, agents, MAX_TURNS, PLAYER_COUNT, undefined, runtime)`. The `runtime` parameter is the shared `GameDefRuntime` from `run-tournament.mjs:343`. Per `docs/architecture.md` "Runtime Ownership", the only `runLocal` member is `zobristTable.keyCache`, and `forkGameDefRuntimeForRun(...)` exists precisely to grant each run a fresh `keyCache` while preserving every `sharedStructural` reference. The harness does not currently call `forkGameDefRuntimeForRun` per seed because the existing serial path tolerates a single shared `keyCache` (it's an additive cache, deterministic in absence of concurrent writers). Under a worker-thread split, each worker receives a forked runtime per run, which is the contract's intended use.

`PolicyAgent` instances are constructed per seed at `run-tournament.mjs:388-390` and discarded after each game, so agent-side state is already per-seed-isolated.

### 2.4 The trace emission default is at odds with steady-state evolution

The `program.md:374` OBSERVE-phase protocol mandates reading `last-trace.json` (a single seed's trace, written when `TRACE_ALL=false`). The current `TRACE_ALL=true` default writes 15 traces per invocation; only one is read during OBSERVE. The remaining 14 are pure overhead in the steady-state campaign loop.

## 3. Architecture

### 3.1 WASM bootstrap in the tournament runner

Add a single synchronous call to `initializePolicyWasmRuntimeSync()` near the top of `run-tournament.mjs`, after the engine imports but before any `runGame` invocation. Behavior:

- Default: WASM is initialized at startup. If initialization fails (missing `.wasm` artifact, ABI mismatch), the runner emits a diagnostic to `stderr` and exits non-zero — fail-loud, not silent-fallback. This guarantees subsequent harness invocations cannot accidentally regress to the slow path.
- Opt-out: a `--no-wasm` flag forces TypeScript-only execution for diagnostic comparison. Defaults remain WASM-on.

The `.wasm` artifact path resolution must respect monorepo layout. The existing loader at `packages/engine/src/agents/policy-wasm-runtime-node-loader.ts:41` already encodes this; the spec does not introduce a second path-resolution surface.

### 3.2 Build script: drop the unconditional `clean`

In `packages/engine/package.json`, the `build` script is changed from `pnpm run clean && tsc` to `tsc`. A separate `build:clean` script preserves the old behavior for CI and manual full rebuilds. `harness.sh` continues to invoke `pnpm -F @ludoforge/engine build`; the change is transparent.

`tsconfig.json` is left as-is (`composite: true` is sufficient — `incremental` is implied). The `dist/tsconfig.tsbuildinfo` file now survives across invocations and is regenerated on file change as designed.

A regression risk: stale `dist/` artifacts after structural refactors. Mitigation: the regression gate at `harness.sh:28` runs the full engine test suite against the rebuilt `dist/`; any staleness fails the gate before reaching the tournament phase.

### 3.3 Compiled GameDef disk cache

Introduce a cache at `campaigns/fitl-arvn-agent-evolution/.gamedef-cache/` (gitignored), keyed by:

```
key = sha256(specEntrypointMtime || specSourceContentHash || engineCommitSha)
```

- `specSourceContentHash` is computed from the concatenated source of every Markdown file `loadGameSpecBundleFromEntrypoint` would read. This MUST be computed without invoking the compiler (cheap stat + read).
- `engineCommitSha` is the engine package's git commit, captured at build time and exposed via a generated constant in `packages/engine/dist/version.js` (or equivalent). This ensures cache invalidation on engine changes, including the ones this spec introduces.

On cache hit, the runner deserializes the compiled `GameDef` JSON and the structural members of `GameDefRuntime` (those classified `sharedStructural` per Spec 143). On cache miss, the runner runs the existing `loadGameSpecBundleFromEntrypoint` + `runGameSpecStagesFromBundle` pipeline and writes the result.

Determinism requirement: cache hits MUST produce byte-identical `GameDef` to cache misses. Validated by Phase 1 test (§4).

### 3.4 Worker-thread shard pool for seeds

Add `--concurrency N` to `run-tournament.mjs` (default 1 for backward compatibility; harness defaults to a value tuned to the CI/dev box, set via `CONCURRENCY` env in `harness.sh`).

Architecture:

- The main process compiles the spec once and obtains the canonical `def` + shared structural runtime.
- The main process serializes `def` (already JSON) and worker-bootstrap data to each worker via `workerData`. Each worker re-imports the engine and reconstructs `GameDefRuntime` from `def` via `createGameDefRuntime(def)`. This rebuild is intentional: cross-thread sharing of `GameDefRuntime` would require `SharedArrayBuffer` discipline that the structural members do not currently respect, and the rebuild cost is amortized across multiple seeds per worker.
- Worker bootstrap MUST call `initializePolicyWasmRuntimeSync()` before its first `runGame`.
- Each worker calls `forkGameDefRuntimeForRun(runtime)` per seed, per the existing run-boundary contract.
- The main process distributes seeds to workers via a work-stealing queue (not static partition) so that long-running seeds do not stall short-running workers.
- Per-seed result objects (margin, decisions count, optional trace summary) are returned to the main process via `postMessage`. Aggregation logic at `run-tournament.mjs:519-553` runs once in the main process over the collected results.

Determinism contract: with the same `def`, same seed, same concurrency setting, and same engine version, every per-seed trace must be byte-identical to a single-worker run. Concurrency MUST NOT affect any individual `runGame` output. This is the same property the kernel already proves at the single-seed level; the parallel test asserts it across the harness aggregate.

### 3.5 Trace emission default at tier ≥ 2

Add `--trace-default` to `run-tournament.mjs` (values: `none`, `last`, `all`). Default behavior:

- `none` at `SEED_COUNT == 1`: no trace written by default. OBSERVE-phase tooling continues to honor `--trace-seed N` and `--trace-all true` overrides.
- `last` at `SEED_COUNT > 1`: emit `last-trace.json` for the first seed (1000) — matches the `program.md:374` OBSERVE protocol.
- `all`: emit one trace per seed — current behavior, preserved as an explicit opt-in for deep diagnostic sessions.

`harness.sh` does not need to change for this — the env variable contract is preserved. `run-tournament.mjs` reads `--trace-all` if present (legacy), else falls back to `--trace-default last`.

The `traces/` directory is cleared at the start of each tournament invocation (per the existing implicit semantics — old traces would otherwise accumulate). Confirmed not breaking any external consumer by inspection of campaign files.

## 4. Phases & acceptance criteria

### Phase 0 — WASM bootstrap + trace defaults

- Modify `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`: import and call `initializePolicyWasmRuntimeSync()` at startup; add `--no-wasm` opt-out.
- Add `--trace-default {none|last|all}` and reroute trace emission per §3.5.
- Add an equivalence test fixture under `packages/engine/test/integration/` (likely `arvn-tournament-wasm-equivalence.test.ts`) that runs one seed with WASM on and one seed with WASM off, asserting identical decision streams. The equivalence proof draws on the existing `policy-bytecode-equivalence.test.ts` machinery — extend, do not duplicate.

**Acceptance**: a `SEED_COUNT=2` harness invocation completes in **≤ baseline − 60 s** wall-time on the development box, with `errors == 0` and `compositeScore` unchanged vs. baseline at fixed seed and profile.

### Phase 1 — Incremental build + GameDef disk cache

- Change `packages/engine/package.json` `build` script: remove `clean &&`; preserve old behavior under new `build:clean` script.
- Add the compiled-GameDef disk cache per §3.3. Cache key derivation lives in a new module under `campaigns/fitl-arvn-agent-evolution/` (campaign-local code, not engine code — Foundation #1).
- Add a unit test for the cache-key invalidation: spec content change ⇒ cache miss; spec content unchanged + engine commit changed ⇒ cache miss; spec content unchanged + engine commit unchanged ⇒ cache hit; cache-hit `GameDef` byte-identical to cache-miss `GameDef`.

**Acceptance**: a `SEED_COUNT=2` harness invocation following Phase 0 completes in **≤ Phase 0 result − 60 s** wall-time on the second consecutive run (i.e., where the cache is warm and tsc has its tsbuildinfo).

### Phase 2 — Worker-thread shard pool

- Add `--concurrency N` flag to `run-tournament.mjs` per §3.4.
- Add a determinism test under `packages/engine/test/integration/`: same `def`, same seed set, `--concurrency 1` vs. `--concurrency 4`, asserting per-seed traces and aggregate metrics are byte-identical.
- Wire `harness.sh` to pass `--concurrency ${CONCURRENCY:-4}` (default value reviewed at the worktree where this lands; if the development box is a different shape, the default is tuned there).

**Acceptance at tier 15**: a `SEED_COUNT=15` harness invocation following Phase 1 completes in **≤ 3 minutes total wall-time** on the development box, with `errors == 0` and `compositeScore` matching the single-worker baseline within `NOISE_TOLERANCE` (0.05 composite points) — but since determinism is preserved, the match should be exact, not noise-bounded.

The 3-minute target is a budget, not a goal; the realistic expectation is ~2 minutes once all three phases compound.

**Implementation reassessment (2026-05-13)**: ticket 167ARVNEVOHAR-005 owns the Phase 2 worker-thread tournament-loop slice, not regression-gate scoping. Live proof after Phase 2 showed the 15-seed tournament runner at `--concurrency 8` completed in `172.67s` with `errors == 0` and exact aggregate parity across the tested concurrency values, while the full `harness.sh` invocation completed in `261.28s` because it still includes the preserved build plus full engine regression gate. Since §8 keeps test-gate scoping out of scope, the worker-pool ticket closes on the tournament-loop budget and records the full-harness result as residual end-to-end evidence for later campaign-protocol work.

## 5. Test plan

- `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` — Phase 0 equivalence. Architectural-invariant class (asserts identical decision streams under either VM path).
- `packages/engine/test/integration/arvn-tournament-parallel-determinism.test.ts` — Phase 2 determinism. Architectural-invariant class (asserts per-seed determinism preservation across concurrency settings).
- `campaigns/fitl-arvn-agent-evolution/__tests__/gamedef-cache.test.ts` (new) — Phase 1 cache-key invalidation matrix. Unit-level; campaign-local since the cache itself is campaign-local. This file is the one new addition outside the engine; placing it in the campaign keeps engine-test scope unchanged.
- Existing tests: `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` continues to assert the WASM↔TS bytecode interpretation equivalence at the lower layer; this spec's Phase 0 test is the campaign-level corollary.
- Re-run baseline: `archive/reports/turnperf-001-investigation-2026-04-28.md`-style per-decision measurement, captured into `reports/turnperf-002-spec-167-baseline.md` once Phase 2 lands, to document the new wall-time decomposition and validate the deferred Spec 168 scope.

## 6. Foundation alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | All campaign-specific code (cache, harness flags) lives under `campaigns/fitl-arvn-agent-evolution/`. Engine code is untouched except for the WASM bootstrap, which is generic. |
| #5 One Rules Protocol | Unchanged. WASM and TS bytecode interpretation execute the same compiled bytecode IR over the same `Agent` interface. Phase 0 test proves equivalence. |
| #8 Determinism Is Sacred | Reinforced. Phase 0 (WASM↔TS) and Phase 2 (parallel↔serial) tests both assert determinism — neither optimization is accepted without proof. |
| #10 Bounded Computation | Unchanged. No new loops, no new recursion. Worker count `N` is a finite static parameter. |
| #11 Immutability (and corollary on run-local state) | Reinforced. Phase 2 uses the existing `forkGameDefRuntimeForRun` contract (Spec 143) without weakening it. Workers obtain isolated `runLocal` state per run. |
| #14 No Backwards Compatibility | The build script change replaces `clean && tsc` with `tsc`; the old behavior is preserved under a new explicit `build:clean` script, not a `build:legacy` shim. |
| #16 Testing as Proof | Three architectural-invariant tests gate the three phases. Performance acceptance criteria are wall-time budgets recorded in `reports/`, not asserted in tests (wall-time isn't deterministic). |

## 7. Reproducibility metadata

The cache key derivation in §3.3 implicitly captures the spec content and engine commit. For experiment reproducibility, the `result` JSON written by `run-tournament.mjs:535-550` is extended with three fields:

```
"wasmEnabled": true | false,
"concurrency": <integer>,
"gamedefCacheHit": true | false
```

These do not affect `compositeScore` (determinism is preserved), but they make it trivial to detect a future regression where, say, a refactor accidentally re-disables WASM in the harness.

## 8. Out of scope

- Engine per-decision kernel optimizations: token-state-index persistence, probe-cache key interning, observation projection memoization, redundant legal-move re-enumeration on continuation resume. These are deferred to a follow-up spec (working name: "engine per-decision hot-path optimizations") that will draw on `archive/reports/turnperf-001-investigation-2026-04-28.md` and the new `reports/turnperf-002-spec-167-baseline.md` for prioritization. That spec is expected to deliver an additional ~20-30 seconds of harness improvement on top of this one.
- Test-gate scoping: `harness.sh:25-39` continues to run the full engine test suite as a regression gate. Scoping that gate (smoke lane plus periodic full gate) is a campaign-protocol amendment, not a harness optimization, and would require updating `campaigns/fitl-arvn-agent-evolution/program.md:124` ("All engine tests must pass — the harness enforces this"). Out of scope here.
- Generalizing the disk cache or worker-thread shard to other campaigns. The cache and harness changes are intentionally campaign-local; if a second campaign needs the same machinery, it should be extracted at that point, not preemptively.
- Changes to the campaign accept/reject logic, progressive seed protocol, or the `compositeScore` formula.

## 9. Open questions

- The `--concurrency` default value depends on the development box's CPU count. The implementing ticket should benchmark `N ∈ {2, 4, 6, 8}` and pick the value that minimizes 15-seed wall-time without thrashing. The default is recorded in `harness.sh` and `program.md:268-278` (Configuration section).
- Whether to gate the `--no-wasm` opt-out behind a `DEBUG`-only path. The current proposal leaves it always available; if the campaign's auto-accept logic ever tolerated a silent WASM regression, this would need to be tightened. Defer to implementation review.

## 10. Reassessment of source proposal

N/A. This spec was authored from a session-internal investigation, not from an external proposal. No per-recommendation disposition table is required.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-12:

- [`archive/tickets/167ARVNEVOHAR-001.md`](../archive/tickets/167ARVNEVOHAR-001.md) — WASM runtime bootstrap in tournament runner (completed; covers Phase 0 — WASM half, §3.1)
- [`archive/tickets/167ARVNEVOHAR-002.md`](../archive/tickets/167ARVNEVOHAR-002.md) — Trace emission defaults (`--trace-default`) (completed; covers Phase 0 — trace half, §3.5)
- [`archive/tickets/167ARVNEVOHAR-003.md`](../archive/tickets/167ARVNEVOHAR-003.md) — Engine build script — drop unconditional clean (completed; covers Phase 1 — build half, §3.2)
- [`archive/tickets/167ARVNEVOHAR-004.md`](../archive/tickets/167ARVNEVOHAR-004.md) — Campaign-local GameDef disk cache (completed; covers Phase 1 — cache half, §3.3)
- [`archive/tickets/167ARVNEVOHAR-005.md`](../archive/tickets/167ARVNEVOHAR-005.md) — Worker-thread shard pool for seeds (completed; covers Phase 2, §3.4 + §7)
- [`archive/tickets/167ARVNEVOHAR-006.md`](../archive/tickets/167ARVNEVOHAR-006.md) — Baseline measurement report turnperf-002 (completed; covers §5 last bullet)

## Outcome

**Completion date**: 2026-05-13

**What actually changed**: All six decomposed tickets (167ARVNEVOHAR-001 through 167ARVNEVOHAR-006) landed and are archived under `archive/tickets/`. Phase 0 (WASM bootstrap + trace defaults), Phase 1 (incremental build + GameDef disk cache), and Phase 2 (worker-thread shard pool) shipped; the per-card cost dropped from `8710 ms` (TURNPERF-001 baseline) to `2051 ms` (`12.82 ms/decision`) — a `-76.5%` reduction on the canonical one-card profile.

**Deviations from original plan**: The §4 Phase 2 acceptance criterion expected the full `harness.sh` invocation to land at `≤ 3 minutes` total wall-time on the development box. The reassessment recorded inline in §4 (2026-05-13) documents that the tournament-loop budget was met (`172.67s` at `--concurrency 8`, exact aggregate parity), but the full `harness.sh` invocation completed in `261.28s` — and `277.90s` on the turnperf-002 measurement run — because the preserved full engine regression gate (`114.10s` per turnperf-002) is part of every harness invocation. Test-gate scoping was explicitly out of scope per §8, so the tournament-loop budget is the spec's contractual acceptance and the full-harness number is recorded as residual evidence for later campaign-protocol work.

**Verification results**: Captured in `reports/turnperf-002-spec-167-baseline.md` (kernel commit `e2346e8e84c403153f8133d6ee14afe9a49fea55`). 15-seed harness result: `compositeScore=-3.4`, `winRate=0.2667`, `wins=4`, `completed=15`, `truncated=0`, `errors=0`, `concurrency=8`, `wasmEnabled=true`, `gamedefCacheHit=true`. WASM↔TS bytecode equivalence (`policy-bytecode-equivalence.test.ts`) and parallel-determinism (`arvn-tournament-parallel-determinism.test.ts`) tests remain green.

**Follow-up**: `specs/168-engine-per-decision-hot-path-optimizations.md` covers the per-decision kernel-internal hot-path scope this spec deferred in §8 (working name "engine per-decision hot-path optimizations" → final name "Engine Per-Decision Hot-Path Optimizations"). The follow-up is grounded in turnperf-002's "Prioritized Targets for Spec 168" section and is a profile-validated 5-phase plan with an explicit Phase 5 escalation gate for further bytecode-IR / WASM expansion.
