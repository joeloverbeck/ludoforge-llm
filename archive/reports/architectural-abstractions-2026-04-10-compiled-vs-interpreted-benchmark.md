# Architectural Abstraction Recovery: compiled-vs-interpreted-benchmark

**Status**: ✅ COMPLETED
**Date**: 2026-04-10
**Input**: `packages/engine/test/performance/compiled-vs-interpreted-benchmark.test.ts`
**Engine modules analyzed**: ~105 (kernel: ~105, sim: 1, agents: 1, cnl: ~60 via test helpers)
**Prior reports consulted**: none

## Executive Summary

The compiled-vs-interpreted benchmark exercises the full game simulation pipeline — from spec compilation through kernel runtime to simulator loop — comparing compiled lifecycle effect execution against interpreted (AST-based) execution. **No cross-subsystem fractures were found at the two-signal minimum.** The compiled effect optimization path has clean authority boundaries: `effect-compiler.ts` compiles, `gamedef-runtime.ts` stores, `phase-lifecycle.ts` dispatches. The profiler is correctly implemented as a zero-overhead measurement side-channel. One item ("Needs investigation") was identified: `GameDefRuntime` aggregates 7 fields from different concern areas, but lacks a second signal to confirm this as a fracture.

## Scenario Families

| Family | Tests | Domain Concepts | Key Assertions |
|--------|-------|----------------|----------------|
| **Parity Benchmarks** | 2 (Texas Hold'em, FITL) | Compiled vs interpreted lifecycle effect paths, full game simulation loop, RandomAgent decision-making, deterministic seeded PRNG | Advisory timing comparison only — `assert.ok(true)`. Both paths must complete without throwing. Timing metrics (total, avg, median, min, max) collected and logged. |
| **Profiler Breakdown** | 2 (Texas Hold'em, FITL) | Per-subsystem wall-clock instrumentation, static + dynamic profiler buckets, compiled path only, single fixed seed | Advisory profiler output only — `assert.ok(true)`. Profiler data collected successfully, per-bucket timing logged to console. |

## Traceability Summary

| Module Cluster | Scenario Families | Confidence | Strategy |
|----------------|------------------|------------|----------|
| `kernel/gamedef-runtime.ts` + `kernel/effect-compiler*.ts` (5 files) | Both | High | Import tracing: test directly imports `createGameDefRuntime`, which calls `compileAllLifecycleEffects` |
| `kernel/phase-lifecycle.ts` | Both | High | Import tracing: `dispatchLifecycleEvent` contains the compiled/interpreted dispatch ternary (line 64) |
| `kernel/perf-profiler.ts` | Profiler Breakdown | High | Import tracing: test directly imports `createPerfProfiler` |
| `sim/simulator.ts` | Both | High | Import tracing: test directly imports `runGame` which threads runtime + profiler through kernel calls |
| `kernel/apply-move.ts` + 45 deps | Both | High | Import tracing: `applyTrustedMove` transitively exercises action pipeline, effects, turn flow, free operations |
| `kernel/legal-moves.ts` + 50 deps | Both | High | Import tracing: `enumerateLegalMoves` transitively exercises move enumeration, action discovery, viability checks |
| `kernel/initial-state.ts` + 20 deps | Both | High | Import tracing: `initialState` sets up game state with lifecycle effects |
| `kernel/terminal.ts` + 15 deps | Both | High | Import tracing: `terminalResult` evaluates game-over conditions |
| `cnl/` pipeline (~60 files) | Both | High | Import tracing via test helpers: `compileProductionSpec` → `loadGameSpecBundleFromEntrypoint` → staged compilation pipeline |
| `agents/random-agent.ts` | Both | High | Import tracing: test directly imports `RandomAgent` |

**Phase 3 note**: Phase 3 satisfied by Phase 1 outputs. Import analysis achieved high confidence for all exercised modules. No registry/dispatch indirection or barrel-heavy trees requiring additional tracing strategies.

## Temporal Coupling (Git History, 6 months)

**Cross-boundary coupling summary** (208 cross-boundary commits out of 962 total):

| Boundary | Co-change Count | % of Cross-Boundary |
|----------|----------------|-------------------|
| cnl ↔ kernel | 114 | 54.8% |
| agents ↔ kernel | 41 | 19.7% |
| agents ↔ cnl ↔ kernel | 24 | 11.5% |
| kernel ↔ sim | 12 | 5.8% |

**Compiled effects pipeline stability**: `gamedef-runtime.ts` had 0 commits in 6 months. `perf-profiler.ts` had 1 commit. The effect-compiler cluster (codegen/patterns/compiler) changed together in 3 commits — expected internal cohesion.

**Top intra-kernel cluster**: `effects-resource.ts`, `effects-var.ts`, `scoped-var-runtime-access.ts` co-changed 5 times — expected cohesion within the effects subsystem.

## Fracture Summary

| # | Fracture Type | Assessment | Evidence |
|---|--------------|------------|----------|
| 1 | Split protocol | **Not found** | Lifecycle effect protocol is a clean pipeline: compile → store → dispatch. All stages have single owners. |
| 2 | Authority leak | **Not found** | `compiledLifecycleEffects` has single writer (effect-compiler.ts), single storage (GameDefRuntime), single consumer (phase-lifecycle.ts). |
| 3 | Projection drift | **Not found** | AST resolution and compiled resolution serve different purposes (fallback vs optimization). Both are always resolved in `dispatchLifecycleEvent` — this is deliberate dual-resolution for verification, not drift. |
| 4 | Boundary inversion | **Not found** | Simulator passes runtime through to kernel functions; kernel owns all state transitions. Profiler is a measurement channel that doesn't affect game state. |
| 5 | Concept aliasing | **Not found** | "lifecycle effects" (AST) and "compiled lifecycle effects" (optimized functions) are explicitly different representations of the same concept, correctly named. |
| 6 | Hidden seam | **Not found** | Effect-compiler cluster changes together (3 commits) but these files are in the same logical module. cnl ↔ kernel coupling (54.8%) is structural — compiler produces kernel types. |
| 7 | Overloaded abstraction | **Single signal** — moved to Needs Investigation | `GameDefRuntime` carries 7 fields from different concerns. See below. |
| 8 | Orphan compatibility layer | **Not found** | The interpreted path is the original/fallback path with explicit verification mechanism. The compiled path is a legitimate optimization. |

## Candidate Abstractions

*No candidates survived the two-signal minimum.*

## Acceptable Architecture

### Compiled Effect Optimization Pipeline

The compiled-vs-interpreted dual-path architecture is well-structured:

- **Single compilation authority**: `effect-compiler.ts` (with cohesive helpers: codegen, patterns, runtime, types) compiles all lifecycle effects upfront via `compileAllLifecycleEffects(def)`.
- **Immutable storage**: `GameDefRuntime.compiledLifecycleEffects` is a `ReadonlyMap` created once, never modified.
- **Clean dispatch**: `phase-lifecycle.ts:64` uses a simple ternary — `compiledEffect === undefined ? applyEffects(...) : executeLifecycleEffect(...)`. No complex routing, no strategy pattern, no indirection.
- **Fallback correctness**: The interpreted path is always available. The compiled path is purely an optimization with opt-in verification (`policy?.verifyCompiledEffects`) that checks byte-identical state hashes via Zobrist table.
- **Test technique**: The benchmark forces the interpreted path by replacing the map with `new Map()` — a clean, minimal intervention that doesn't require test-specific code paths in production.

### Profiler Infrastructure

The profiler follows FOUNDATIONS principles correctly:

- **Zero overhead when disabled**: Single `!== undefined` check per instrumentation point.
- **Measurement-only side-channel**: Does not affect determinism, game state, or engine agnosticism.
- **Static + dynamic buckets**: 21 named static buckets cover major kernel operations; dynamic `Map<string, PerfBucket>` handles per-effect-type granularity.
- **Deliberately incomplete**: Profiler is NOT passed to `applyTrustedMove` to avoid 30%+ overhead — this is an explicit design choice documented in the simulator, not a gap.

### Kernel/Sim Boundary

The runtime threading pattern is clean:

- `runGame` creates or receives a `GameDefRuntime`, then threads it as the final parameter to all kernel calls (`initialState`, `terminalResult`, `enumerateLegalMoves`, `applyTrustedMove`).
- The simulator never duplicates kernel logic or maintains parallel state.
- `GameDefRuntime` is a pure function of `GameDef` — creating it is idempotent.

### Compilation Pipeline (cnl → kernel)

The high cnl ↔ kernel temporal coupling (54.8% of cross-boundary commits) is structural and expected:

- The compiler's job is to produce kernel types (`GameDef`, `ValidatedGameDef`).
- Schema and type changes naturally propagate from kernel definitions to compiler implementations.
- The test helpers (`production-spec-helpers.ts`) use lazy caching with fingerprint-based invalidation — clean and efficient for benchmark scenarios.

## Needs Investigation

### GameDefRuntime Field Aggregation

**Single signal**: Code observation — `GameDefRuntime` aggregates 7 fields serving different architectural concerns:

| Field | Concern Area |
|-------|-------------|
| `adjacencyGraph` | Spatial queries |
| `runtimeTableIndex` | Table lookups |
| `zobristTable` | State hashing |
| `alwaysCompleteActionIds` | Enumeration optimization |
| `firstDecisionDomains` | Enumeration optimization |
| `ruleCardCache` | Lazy mutable cache (only mutable field) |
| `compiledLifecycleEffects` | Effect execution optimization |

**What second signal to look for**: Check whether these fields evolve independently in git history — do changes to `ruleCardCache` usage occur without changes to `compiledLifecycleEffects` usage, and vice versa? If so, the type may benefit from decomposition. Currently, `gamedef-runtime.ts` had 0 commits in 6 months, which suggests extreme stability rather than active fragmentation. The single-signal observation is that the type *could* be overloaded, but there is no evidence it *is* causing problems.

**Counter-evidence**: If all 7 fields are always consumed together (every kernel function that receives `GameDefRuntime` accesses most fields), then aggregation is justified — it's a "runtime cache bundle" rather than an overloaded abstraction. The 0-commit stability supports this interpretation.

## Recommendations

- **Spec-worthy**: None
- **Conditional**: None
- **Acceptable**: Compiled effect optimization pipeline, profiler infrastructure, kernel/sim boundary, cnl→kernel compilation pipeline
- **Needs investigation**: `GameDefRuntime` field aggregation (check field access patterns across consuming kernel functions to determine if decomposition would add value)

## Outcome

- Completion date: 2026-04-10
- What actually changed: The report was finalized and archived after its findings were exploited, with no additional code changes required from the report itself.
- Deviations from original plan: None.
- Verification results: Archival metadata was added per policy before moving the report into `archive/reports/`.
