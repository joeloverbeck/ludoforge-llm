# 168ENGHOTPATH-005: Phase 4 — bytecode input row cache

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-wasm-runtime.ts`, `packages/engine/src/agents/policy-wasm-production-preview-values.ts`
**Deps**: `archive/tickets/168ENGHOTPATH-001.md`

## Problem

`reports/turnperf-002-spec-167-baseline.md` records `policyWasmRuntime:encodeBytecodeInput` at `38.28 ms` (1.9%, 394 calls) per card. CPU-profile top files include `policy-wasm-runtime.js` (42 self-samples) and `policy-wasm-production-preview-values.js` (50 samples). Each preview-drive batch re-encodes input rows even when the underlying preview-state shape and feature table are stable across calls. This bucket is also load-bearing as a marshalling-cost proxy for Spec 168 §3.6 (Phase 5 escalation criterion) — bringing it down sharpens the cost-model that decides whether further WASM expansion is worthwhile.

## Assumption Reassessment (2026-05-13)

1. `packages/engine/src/agents/policy-wasm-runtime.ts` exists — verified via grep earlier this session.
2. `packages/engine/src/agents/policy-wasm-production-preview-values.ts` exists — verified via grep.
3. WASM routing is active per turnperf-002: `wasmScoreRowRouteCount=52`, `wasmPreviewCandidateFeatureRowRouteCount=60`, `wasmProductionPreviewDriveBatchCount=182`, all with zero `unsupported` counts — verified.
4. Preview-state shape hash and candidate feature-table identity are already computed elsewhere on the path — confirm exact accessors during impl. If a stable shape hash is not currently materialized, this ticket's scope is unchanged but the impl introduces the hash as a side-derivative of existing state machinery (no new hash algorithm).

## Architecture Check

1. Cleaner than per-call re-encoding because the cache key is data already computed on the path; lookup is O(1) and deterministic.
2. Preserves engine agnosticism (Foundation #1) — encoding cache is generic agent infrastructure with no per-game data; the same cache shape would apply to any spec.
3. **Foundation #11 corollary** — cache stores encoded byte arrays, not state references; cannot leak state aliasing.
4. Foundation #5 — WASM↔TS bytecode equivalence preserved. The cache returns the same bytes the encoder would have produced; the existing `policy-bytecode-equivalence.test.ts` continues to gate equivalence at the lower layer.

## What to Change

### 1. Cache encoded bytecode input rows

Cache encoded rows keyed by `(preview-state shape hash, candidate feature-table identity)`. Cache lives on:
- `sharedStructural` runtime if encoding depends only on compiled `GameDef` + canonical state shape (preferred; verify during impl)
- `runLocal` runtime if encoding captures any per-run state — fork per `forkGameDefRuntimeForRun(...)` per Spec 143

The cache home decision is recorded in the impl's commit message and the `Architecture Check` of the post-landing report.

### 2. Bounded cache size

Cache size is bounded by the working set of distinct `(state-shape, feature-table)` pairs. Phase 4 measurement characterizes the working set; the cap is set during impl based on observed working-set size. LRU eviction; deterministic ordering.

### 3. Equivalence test

Add `packages/engine/test/integration/bytecode-input-row-cache-equivalence.test.ts` (architectural-invariant class) — exercises the FITL canary corpus with cache enabled vs. disabled, asserts byte-identical encoded rows across all calls. The test piggybacks on the existing `policy-bytecode-equivalence.test.ts` machinery for assertion patterns, but is a separate file (Phase-4-scoped, not WASM↔TS-scoped).

### 4. Per-phase measurement report

After landing, re-run the Phase 0 fixture and capture pre/post bucket decomposition into `reports/turnperf-NNN-spec-168-phase-4.md`. Acceptance: `policyWasmRuntime:encodeBytecodeInput` ms drops by **≥ 10 ms** on canonical probe. Also record the per-call cost (`encodeBytecodeInput ms / encodeBytecodeInput call count`) — this number feeds the Phase 5 escalation cost-model.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify)
- `packages/engine/src/agents/policy-wasm-production-preview-values.ts` (modify)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify if cache lives on runtime — sharedStructural or runLocal home)
- `packages/engine/test/integration/bytecode-input-row-cache-equivalence.test.ts` (new)
- `reports/turnperf-NNN-spec-168-phase-4.md` (new — measurements)

## Out of Scope

- New WASM opcodes or ABI changes (deferred to potential Spec 169 per Phase 5 escalation gate)
- Marshalling reduction by batching MORE work across the WASM boundary — this ticket only caches existing crossings; new batching would be Spec 169 territory
- Phase 1, 2, 3 work (separate tickets)

## Acceptance Criteria

### Tests That Must Pass

1. New `bytecode-input-row-cache-equivalence.test.ts` — cached rows byte-identical to fresh-encoded rows on canary corpus
2. Existing `policy-bytecode-equivalence.test.ts` green — no ABI/opcode change
3. Existing `arvn-tournament-wasm-equivalence.test.ts` (Spec 167 Phase 0) green
4. Existing `arvn-tournament-parallel-determinism.test.ts` (Spec 167 Phase 2) green
5. Existing suite: `pnpm turbo test`

### Invariants

1. WASM↔TS bytecode equivalence preserved (no new opcode, no ABI bump)
2. Cached encoded rows are byte-identical to canonical encoder output
3. No new WASM ABI surface introduced

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/bytecode-input-row-cache-equivalence.test.ts` — Phase 4 architectural-invariant equivalence proof
2. Re-run `archive/tickets/168ENGHOTPATH-001.md` benchmark fixture; capture pre/post into `reports/turnperf-NNN-spec-168-phase-4.md`

### Commands

1. `pnpm -F @ludoforge/engine test packages/engine/test/integration/bytecode-input-row-cache-equivalence.test.ts`
2. `pnpm -F @ludoforge/engine test packages/engine/test/integration/policy-bytecode-equivalence.test.ts`
3. `pnpm -F @ludoforge/engine test:perf`
4. `pnpm turbo test`
