# 168ENGHOTPATH-004: Phase 3 — zobrist incremental digest

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/zobrist.ts`, `packages/engine/src/kernel/gamedef-runtime.ts`
**Deps**: `archive/tickets/168ENGHOTPATH-001.md`

## Problem

`reports/turnperf-002-spec-167-baseline.md` records `zobrist:digestDecisionStackFrame` at `89.57 ms` (4.4%, 300 calls) and `zobrist:encodeDecisionStackFrame` at `36.88 ms` (1.8%, 305 calls) per card — combined `126.45 ms` (≈6.2% of elapsed). CPU-profile self-samples confirm: `updateFnv1a64State` (69), `encodeDecisionStackFrameDigestInput` (37), `zobristKey` (36). The encoder rebuilds the digest input from scratch on each preview-inner frame even when the parent-frame digest is already computed higher in the stack. Spec 168 §3.4 prescribes a `runLocal` frame-digest cache keyed by `(frame structure identity, parent-frame digest)`.

## Assumption Reassessment (2026-05-13)

1. `packages/engine/src/kernel/zobrist.ts` is `598` lines — verified via `wc -l` earlier this session.
2. The existing `runLocal` zobrist table already hosts `keyCache` per Spec 143 (`packages/engine/src/kernel/gamedef-runtime.ts:84-95`) — adding a sibling `frameDigestCache` is structurally analogous.
3. Frame structure identity is stable per `(decision id, scope, candidate identity)` tuple. Verify the exact tuple shape during impl by inspecting `digestDecisionStackFrame` callers.
4. Parent-frame digest is already computed earlier in the stack walk (the digest is built bottom-up over frames) — confirm the call order during impl.

## Architecture Check

1. Cleaner than per-call rebuild because the parent-frame digest is already memoized higher in the stack; cache reuses it instead of re-encoding the full frame chain.
2. Preserves engine agnosticism (Foundation #1) — frame digest cache is kernel-internal, operates on opaque hash values, no game-specific structure.
3. **Foundation #11 corollary** — cache stores digest VALUES (`bigint`/`u64`), not state references; cannot leak state aliasing across the public state contract.
4. Per Spec 143: `frameDigestCache` is `runLocal` and forked per run via `forkGameDefRuntimeForRun(...)` — no cross-run digest pollution under concurrent workers (Spec 167 Phase 2 contract preserved).

## What to Change

### 1. Add `frameDigestCache` to `runLocal` zobrist table

Extend `GameDefRuntime.runLocal.zobristTable` with a new `frameDigestCache` (bounded LRU map from `(frame structure identity, parent-frame digest)` → cached frame digest). Wire it into `forkGameDefRuntimeForRun(...)` so each run receives a fresh cache alongside the existing `keyCache` fork.

### 2. Cache lookup in `digestDecisionStackFrame` / `encodeDecisionStackFrame`

Modify the frame-digest entry points in `zobrist.ts` to:
- Compute the cache key from frame structure identity + parent-frame digest (the latter is already in scope from the bottom-up walk)
- Cache hit: return the precomputed digest directly
- Cache miss: compute via the existing `encodeDecisionStackFrameDigestInput` + `updateFnv1a64State` path and store

### 3. Equivalence test

Add `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` (architectural-invariant class) — exercises the FITL canary corpus with cache enabled vs. disabled, asserts byte-identical `digestDecisionStackFrame` output for every `(frame, parent-digest)` pair AND replay state-hash identity over canonical fixtures. The test is the durability proof that the cache cannot diverge from the canonical encoder path.

### 4. Per-phase measurement report

After landing, re-run the Phase 0 fixture and capture pre/post bucket decomposition into `reports/turnperf-NNN-spec-168-phase-3.md`. Acceptance: combined `zobrist:digestDecisionStackFrame + zobrist:encodeDecisionStackFrame` ms drops by **≥ 40 ms** on canonical probe.

## Files to Touch

- `packages/engine/src/kernel/zobrist.ts` (modify)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — extend `runLocal.zobristTable` with `frameDigestCache` and fork wiring)
- `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` (new)
- `reports/turnperf-NNN-spec-168-phase-3.md` (new — measurements)

## Out of Scope

- Phase 1 token-state-index changes (`archive/tickets/168ENGHOTPATH-002.md`, `archive/tickets/168ENGHOTPATH-007.md`)
- Phase 2 query/filter plan changes (`archive/tickets/168ENGHOTPATH-003.md`)
- Phase 4 bytecode input row cache (`tickets/168ENGHOTPATH-005`)
- Moving Zobrist hashing into the Rust WASM VM (deferred to potential Spec 169 per Phase 5 escalation gate)
- Changing the zobrist key algorithm or hash width

## Acceptance Criteria

### Tests That Must Pass

1. New `zobrist-frame-digest-cache-equivalence.test.ts` — cached digests byte-identical to recomputed digests on canary corpus + replay state-hash identity
2. Existing `arvn-tournament-wasm-equivalence.test.ts` (Spec 167 Phase 0) green
3. Existing `arvn-tournament-parallel-determinism.test.ts` (Spec 167 Phase 2) green — proves `runLocal` isolation
4. Existing `policy-bytecode-equivalence.test.ts` green
5. Existing replay-identity tests under `packages/engine/test/determinism/` green
6. Existing suite: `pnpm turbo test`

### Invariants

1. Cached digest equals recomputed digest for identical `(frame structure, parent-digest)` pair
2. `runLocal` isolation per Spec 143 — `frameDigestCache` forked per run; no cross-run pollution
3. Determinism: replay produces identical canonical state hash regardless of cache state
4. Cache stores `bigint`/`u64` digest values only — no state references (Foundation #11 corollary)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts` — Phase 3 architectural-invariant equivalence proof
2. Re-run `archive/tickets/168ENGHOTPATH-001.md` benchmark fixture; capture pre/post into `reports/turnperf-NNN-spec-168-phase-3.md`

### Commands

1. `pnpm -F @ludoforge/engine test packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts`
2. `pnpm -F @ludoforge/engine test:perf`
3. `pnpm turbo test`

**Coordination note**: `archive/tickets/168ENGHOTPATH-002.md` (Phase 1) extended `gamedef-runtime.ts` with a new `runLocal` field. Phase 3 must merge any additional additive runtime fields cleanly.
