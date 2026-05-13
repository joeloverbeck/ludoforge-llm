# 168ENGHOTPATH-002: Phase 1 — persistent token-state-index

**Status**: BLOCKED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/token-state-index.ts`, `packages/engine/src/kernel/gamedef-runtime.ts`
**Deps**: `archive/tickets/168ENGHOTPATH-001.md`

## Problem

`reports/turnperf-002-spec-167-baseline.md` records `tokenStateIndex:build` at `87.91 ms` (×2903 calls) and `tokenStateIndex:refreshCachedEntries` at `64.93 ms` (×10568 calls) per card — a combined `152.84 ms` (≈7.5% of elapsed). The current rebuild-from-scratch pattern wastes work across draft transitions where state changes are local and predictable. Spec 168 §3.2 prescribes a `runLocal` persistent mutable index keyed by canonical state hash, validated by an architectural-invariant equivalence test.

## Assumption Reassessment (2026-05-13)

1. `packages/engine/src/kernel/token-state-index.ts` is `408` lines — verified via `wc -l` earlier this session.
2. `packages/engine/src/kernel/gamedef-runtime.ts` exposes `forkGameDefRuntimeForRun(runtime)` per Spec 143 (archived) at lines 84-95 — verified via spec §2.4 + grep.
3. The Spec 143 `runLocal`/`sharedStructural` runtime contract supports adding new `runLocal` fields without disturbing existing structural members (`adjacencyGraph`, `runtimeTableIndex`, `alwaysCompleteActionIds`, `firstDecisionDomains`, `ruleCardCache`, `compiledLifecycleEffects`).
4. Canonical state hash is already computed for replay/zobrist purposes and is suitable as a cache key — verify exact accessor at impl time.

## Architecture Check

1. Cleaner than per-call rebuild because the cache key is a state hash already computed for replay; lookup is O(1) and deterministic. Cache misses fall back to the existing build path with no behavioral difference.
2. Preserves engine agnosticism (Foundation #1) — index structure is generic kernel code; cache is keyed on opaque state hash with no game-specific semantics.
3. **Foundation #11 Scoped Internal Mutation** is explicitly invoked: persistent mutable structure is internal to the eval-query subsystem, never aliased outside the eval-scope, never exposed across the public `applyMove(state) -> newState` contract. Public state remains immutable.
4. Per Spec 143 contract: `tokenStateIndexCache` is `runLocal` and forked per run via `forkGameDefRuntimeForRun(...)` — no cross-run aliasing, satisfying parallel-determinism guarantees from Spec 167 Phase 2.

## What to Change

### 1. Add `tokenStateIndexCache` runLocal field

Extend `GameDefRuntime` with a new `runLocal` field `tokenStateIndexCache` (LRU-bounded map from canonical state hash → persistent mutable token-state-index structure). Wire it into `forkGameDefRuntimeForRun(...)` so each run receives a fresh, isolated cache.

### 2. Implement bounded LRU eviction

Add a finite cap on `tokenStateIndexCache` (configurable via runtime constant; default chosen during impl based on Phase 1 measured working-set size from `reports/turnperf-NNN-spec-168-phase-1.md`). Eviction is deterministic LRU.

### 3. Cache lookup in token-state-index build/refresh paths

Modify the build/refresh entry points in `token-state-index.ts` to:
- On cache hit: return the persistent mutable structure (applying any deferred deltas)
- On cache miss: build fresh and store

The mutable structure's contract (which fields can be in-place updated) is internal to the eval-query subsystem — see Foundation #11 Scoped Internal Mutation citation in Architecture Check.

### 4. Equivalence test

Add `packages/engine/test/integration/persistent-token-state-index-equivalence.test.ts` (architectural-invariant class) — runs the FITL canary corpus with cache enabled vs. disabled, asserts byte-identical token-state-index across all calls. The test is the durability proof that the cache cannot diverge from the canonical build path.

### 5. Per-phase measurement report

After landing, re-run the Phase 0 fixture (`archive/tickets/168ENGHOTPATH-001.md`) and capture pre/post bucket decomposition into `reports/turnperf-NNN-spec-168-phase-1.md`. Acceptance: combined `tokenStateIndex:build + tokenStateIndex:refreshCachedEntries` ms drops by **≥ 50 ms**, with `tokenStateIndexBuildCount` decreasing correspondingly (specific count delta recorded in report).

## Files to Touch

- `packages/engine/src/kernel/token-state-index.ts` (modify)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — add `runLocal` field + fork wiring)
- `packages/engine/test/integration/persistent-token-state-index-equivalence.test.ts` (new)
- `reports/turnperf-NNN-spec-168-phase-1.md` (new — measurements)

## Out of Scope

- Phase 2 query/filter plan changes (`tickets/168ENGHOTPATH-003`)
- Phase 3 zobrist digest cache (`tickets/168ENGHOTPATH-004`)
- Phase 4 bytecode input row cache (`tickets/168ENGHOTPATH-005`)
- Sharing index across runs (Spec 143 forbids; `runLocal` isolation is preserved)
- Persisting the cache to disk across process invocations (working-set fits in process memory per spec §2.1 evidence)

## Acceptance Criteria

### Tests That Must Pass

1. New `persistent-token-state-index-equivalence.test.ts` — cache hits byte-identical to fresh builds across canary corpus
2. Existing `arvn-tournament-parallel-determinism.test.ts` (Spec 167 Phase 2) green — proves `runLocal` isolation under concurrency
3. Existing `arvn-tournament-wasm-equivalence.test.ts` (Spec 167 Phase 0) green
4. Existing `policy-bytecode-equivalence.test.ts` green
5. Existing suite: `pnpm turbo test`

### Invariants

1. Public `applyMove(state) -> newState` contract preserved; no caller-visible mutation (Foundation #11)
2. `tokenStateIndexCache` is `runLocal` per Spec 143 — forked per run, isolated across concurrent workers
3. Determinism: same state → same index, regardless of cache hit/miss state
4. LRU eviction is deterministic (no wall-clock or insertion-order dependence on hash iteration)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/persistent-token-state-index-equivalence.test.ts` — Phase 1 architectural-invariant equivalence proof
2. Re-run `archive/tickets/168ENGHOTPATH-001.md` benchmark fixture; capture pre/post into `reports/turnperf-NNN-spec-168-phase-1.md`

### Commands

1. `pnpm -F @ludoforge/engine test packages/engine/test/integration/persistent-token-state-index-equivalence.test.ts`
2. `pnpm -F @ludoforge/engine test:perf`
3. `pnpm turbo test`

## Outcome (2026-05-13)

Phase 1 landed the run-local persistent token-state-index substrate, but the
measured Phase 1 gate remains red on the canonical one-card probe. Per user
authorization after a 1-3-1 reset, this ticket is blocked rather than marked as
implemented: the correct cache groundwork is retained, and the remaining
Phase 1 measured-gate miss is split to `tickets/168ENGHOTPATH-007.md`.

What landed:

- Added `tokenStateIndexCache` as a `runLocal` `GameDefRuntime` field with a
  deterministic LRU cap of `4096`, reset by `forkGameDefRuntimeForRun(...)`.
- Threaded the cache through policy/eval read contexts that can legitimately
  receive the run-local runtime.
- Added `packages/engine/test/integration/persistent-token-state-index-equivalence.test.ts`
  proving byte-identical cache hit/miss results, run-local fork isolation,
  deterministic LRU behavior, and snapshot detachment before mutable refresh.
- Extended the existing Phase 0 perf fixture output with persistent-cache
  hit/miss/write counters.

Boundary reset:

- Approved option: Option 1, narrow/blocked closeout.
- Scope effect: retains correct run-local cache groundwork, records the red
  measured gate honestly, and defers the remaining Phase 1 optimization to
  `tickets/168ENGHOTPATH-007.md`.
- Durable evidence: `reports/turnperf-004-spec-168-phase-1.md`.

Measured gate:

| Field | Value |
|---|---:|
| Baseline combined token-index buckets | `156.26 ms` |
| Decisive Phase 1 combined token-index buckets | `155.00 ms` |
| Target delta | `>= 50.00 ms` |
| Actual delta | `1.26 ms` |
| Percent change | `0.81%` |
| Baseline `tokenStateIndexBuildCount` | `2903` |
| Decisive `tokenStateIndexBuildCount` | `2903` |
| Persistent cache hits / misses / writes | `0 / 0 / 66` |
| Verdict | `red` |
| Terminal implementation status allowed? | `no; ticket remains BLOCKED` |

Generated fallout:

- No schema, golden, or compiled GameDef fallout.
- Ignored ephemeral artifact regenerated:
  `packages/engine/test/perf/.artifacts/per-decision-cost-budget.json`.

Deferred sibling/spec scope:

- `tickets/168ENGHOTPATH-007.md` owns the remaining Phase 1 measured-gate miss:
  determine why the canonical workload does not hit the persistent
  state-hash cache, then either land a material token-index optimization or
  update Spec 168 to skip/reorder Phase 1.
- Tickets `168ENGHOTPATH-003.md` through `006.md` keep their existing Phase 2-5
  ownership; Phase 5 now also waits for `007`.

Source-size ledger:

- `packages/engine/src/agents/policy-evaluation-core.ts | before lines 1930 | after lines 1932 | crossed cap? no, preexisting over-guidance | active growth 2 lines of runtime-resource threading | extraction/defer rationale preexisting policy-evaluation hub; extraction would widen this cache-threading ticket | successor none`
- `packages/engine/src/agents/policy-preview.ts | before lines 1285 | after lines 1285 | crossed cap? no, preexisting over-guidance | active growth none, argument threading only | extraction/defer rationale preexisting preview hub; no new logic to extract | successor none`
- `packages/engine/src/kernel/eval-query.ts | before lines 1353 | after lines 1353 | crossed cap? no, preexisting over-guidance | active growth none, argument threading only | extraction/defer rationale preexisting query hub; no new logic to extract | successor none`
- `packages/engine/scripts/profile-fitl-preview-drive.mjs | before lines 777 | after lines 798 | crossed cap? no | active growth 21 lines for counter transcription | extraction/defer rationale near-cap diagnostic script; added fields are adjacent to existing counter/report rows and extraction would obscure the measurement contract | successor none`
- `packages/engine/src/kernel/condition-compiler.ts | before lines 701 | after lines 703 | crossed cap? no | active growth 2 lines of cache-threading argument formatting | extraction/defer rationale no separable new logic | successor none`
- `packages/engine/src/kernel/resolve-ref.ts | before lines 723 | after lines 723 | crossed cap? no | active growth none, argument threading only | extraction/defer rationale no separable new logic | successor none`
- `packages/engine/src/kernel/token-state-index.ts | before lines 408 | after lines 466 | crossed cap? no | active growth cache substrate and counters | extraction/defer rationale still below near-cap; logic belongs in canonical token-index module | successor 168ENGHOTPATH-007 for measured-gate miss only`

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/persistent-token-state-index-equivalence.test.js` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/perf/per-decision-cost-budget.perf.test.js` — passed and produced the red metric recorded above.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-parallel-determinism.test.js` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-wasm-equivalence.test.js` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — passed.
- `node --check packages/engine/scripts/profile-fitl-preview-drive.mjs` — passed.
- `pnpm run check:ticket-deps` — passed for 6 active tickets and 2316 archived tickets.

Late-edit proof validity:

- Ticket/spec/report edits after the decisive metric changed only the durable
  blocked status, dependency graph, and evidence transcription. Correctness
  lanes were rerun where the code surface required them; dependency graph
  integrity was rerun with `pnpm run check:ticket-deps`.
