# 168ENGHOTPATH-004: Phase 3 — zobrist incremental digest

**Status**: COMPLETED
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
- `reports/turnperf-007-spec-168-phase-3.md` (new — measurements)

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
2. Re-run `archive/tickets/168ENGHOTPATH-001.md` benchmark fixture; capture pre/post into `reports/turnperf-007-spec-168-phase-3.md`

### Commands

1. `pnpm -F @ludoforge/engine test packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts`
2. `pnpm -F @ludoforge/engine test:perf`
3. `pnpm turbo test`

**Coordination note**: `archive/tickets/168ENGHOTPATH-002.md` (Phase 1) extended `gamedef-runtime.ts` with a new `runLocal` field. Phase 3 must merge any additional additive runtime fields cleanly.

## Outcome (2026-05-13)

Phase 3 implementation landed and the measured gate is green.

What landed:

1. Added `zobristTable.frameDigestCache` as a bounded run-local cache and
   forked it alongside `zobristTable.keyCache`.
2. Changed decision-stack frame digest input from full suspended-state JSON to
   the Spec 168 structural input: parent-frame digest, frame/context/effect
   structure, and suspended state summarized by canonical `stateHash`.
3. Threaded the running parent-frame digest through `computeFullHash` and
   `zobrist-phase-hash`.
4. Added
   `packages/engine/test/integration/zobrist-frame-digest-cache-equivalence.test.ts`.
5. Updated
   `packages/engine/test/determinism/spec-161-choosenstep-no-op-default.snapshot.json`
   for the intentional canonical state-hash change and live preview-usage
   coverage shape.
6. Added `reports/turnperf-007-spec-168-phase-3.md` with the decisive Phase 3
   measurement.

Boundary correction:

- The live pre-change helper had no parent-digest input. The implementation
  keeps the ticket-owned parent-digest cache key by threading a running digest
  through decision-stack walkers instead of changing public move/decision
  protocol surfaces.
- The retained improvement is primarily structural digest input reduction, not
  high run-local cache-hit volume on the canonical workload. This still matches
  Spec 168 §3.4 because the digest no longer rebuilds the full suspended-state
  frame input for every preview-inner frame.

Source-size ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
|---|---:|---:|---|---|---|---|
| `packages/engine/src/kernel/zobrist.ts` | `598` | `645` | no | yes | surgical digest/cache logic in the canonical zobrist owner; extraction would obscure the ticket seam | none |

Measured gate:

| Field | Phase 1b comparison | Phase 3 decisive |
|---|---:|---:|
| `zobrist:digestDecisionStackFrame` | `90.99 ms` | `27.44 ms` |
| `zobrist:encodeDecisionStackFrame` | `35.90 ms` | `17.30 ms` |
| Combined named bucket | `126.89 ms` | `44.74 ms` |
| Delta vs Phase 1b | N/A | `-82.15 ms` |
| Required drop | N/A | `>= 40.00 ms` |
| Verdict | comparison | green |

Verification completed:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js` — passed, 4 tests after post-review parent-digest memoization regression coverage.
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/sim/simulator.test.js` — passed, 22 tests.
4. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-wasm-equivalence.test.js` — passed.
5. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-parallel-determinism.test.js` — passed.
6. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — passed, 6 tests.
7. `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js` — passed after snapshot update.
8. `pnpm -F @ludoforge/engine test:determinism` — passed, 22/22 files.
9. `pnpm -F @ludoforge/engine test:perf` — passed, 4/4 perf files and produced the decisive Phase 3 metric. Existing advisory perf warnings in older non-Phase-3 checks were classified as non-final/not ticket-owned for this Phase 3 closeout.
10. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/zobrist-table.test.js` — passed, 9 tests after updating the legacy hand-authored frame fixture to the live shape.
11. `pnpm turbo test` — passed after post-review cache fix, 5/5 tasks; engine reported 69/69 default files passed and runner tests passed.
12. Post-`pnpm turbo test` rerun of `pnpm -F @ludoforge/engine exec node --test dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js` — passed, 4 tests.
13. Post-review focused rerun of `pnpm -F @ludoforge/engine exec node --test dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js` — passed, 4 tests.

Generated/artifact fallout:

- No schema, golden, or compiled GameDef artifact fallout.
- The raw perf fixture artifact remains ignored at
  `packages/engine/test/perf/.artifacts/per-decision-cost-budget.json`; durable
  evidence is transcribed into `reports/turnperf-007-spec-168-phase-3.md`.

Late-edit proof validity:

- The snapshot update was proof-affecting; the focused Spec 161 file and full
  determinism lane were rerun afterward.
- The legacy `zobrist-table.test.ts` fixture update was proof-affecting for the
  broad unit/root lane; the focused unit file, the cache equivalence file, and
  `pnpm turbo test` were rerun afterward.
- Post-review found and fixed one small cache-memoization bug: the WeakMap frame
  memo now scopes entries by `parentFrameDigest`, and the cache equivalence test
  includes a same-frame/different-parent regression.
- The final ticket/report edits after the post-review code fix are proof
  transcription only; they do not change acceptance scope, dependency edges, or
  artifact content.
