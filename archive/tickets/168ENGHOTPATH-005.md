# 168ENGHOTPATH-005: Phase 4 — bytecode input row cache

**Status**: COMPLETED
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

## Outcome (2026-05-13)

Phase 4 implementation landed the bytecode input row cache substrate and the
decisive measured gate is green. The ticket-named correctness lanes, root test
lane, and dependency integrity check are green.

What landed:

- Added bounded run-local `policyWasmBytecodeInputCache` and
  `policyWasmBytecodeStateWordsCache` caches to
  `GameDefRuntime`, reset by `forkGameDefRuntimeForRun(...)`.
- Replaced the prior module-level WeakMap encoded-input cache with a bounded
  runtime-owned LRU cache keyed by bytecode structure, layout identity, expected
  layout, canonical `state.stateHash`, active player, and scoring player.
- Added safe state-word segment reuse for repeated canonical state hashes when
  bytecode constants differ and whole-row reuse is not correct.
- Threaded the cache through production WASM preview-candidate and score-row
  routes.
- Added `packages/engine/src/agents/policy-wasm-bytecode-input-cache.ts` for
  cache keying, counters, and LRU access.
- Added `packages/engine/test/integration/bytecode-input-row-cache-equivalence.test.ts`
  proving fresh encoded bytes match cached bytes and forked run-local caches
  start empty.
- Added `reports/turnperf-008-spec-168-phase-4.md` with the decisive Phase 4
  measurement.

Ticket corrections applied:

- Cache home decision: `runLocal`, because encoded bytecode input bytes include
  state-dependent values. The cache stores byte snapshots only, not `GameState`
  references.
- `packages/engine/src/agents/policy-wasm-production-preview-values.ts` was
  verified-no-edit; live bytecode input encoding is owned by
  `policy-wasm-runtime.ts`, while production route wiring lives in
  `policy-wasm-score-routing.ts`.
- Focused command substitution: the repo-valid focused proof is
  `pnpm -F @ludoforge/engine build` followed by
  `pnpm -F @ludoforge/engine exec node --test dist/test/integration/<file>.js`,
  not `pnpm -F @ludoforge/engine test <source-file>`.

Measured gate:

| Field | Baseline | Phase 4 decisive |
|---|---:|---:|
| `policyWasmRuntime:encodeBytecodeInput` totalMs | `38.28` | `14.88` |
| `policyWasmRuntime:encodeBytecodeInput` calls | `394` | `394` |
| Whole-row input cache hits | `0` | `0` |
| Whole-row input cache misses | `394` | `394` |
| Encoded-state segment cache hits | `0` | `342` |
| Encoded-state segment cache misses | `394` | `52` |
| Delta | N/A | `-23.40` |
| Required drop | N/A | `>= 10.00` |
| Verdict | baseline | green |

Per-call cost for Phase 5 input: `14.88 / 394 = 0.0378 ms` per bytecode input
call.

Generated fallout:

- No schema, golden, or compiled GameDef fallout.
- Ignored ephemeral artifact regenerated:
  `packages/engine/test/perf/.artifacts/per-decision-cost-budget.json`.
- An unsafe whole-row key that used only `sourceFingerprint` was rejected by
  `arvn-tournament-wasm-equivalence.test.js`; the final key includes the full
  bytecode structure. The green measured win comes from the state-word segment
  cache where reuse is semantically valid.

Deferred sibling/spec scope:

- Phase 5 escalation memo remains owned by `tickets/168ENGHOTPATH-006.md`.
- New WASM opcodes, ABI changes, and wider preview-drive batching remain out of
  scope for this ticket.

Source-size ledger:

- `packages/engine/src/agents/policy-wasm-runtime.ts | before lines 954 | after lines 1096 | crossed cap? no, preexisting over guidance | active growth cache wiring, state-word encoder fast path, and test internals | extraction/defer rationale cache key/counter mechanics extracted to packages/engine/src/agents/policy-wasm-bytecode-input-cache.ts; further extraction would widen/obscure the Phase 4 seam | successor none`
- `packages/engine/src/agents/policy-wasm-bytecode-input-cache.ts | after lines 73 | new helper | crossed cap? no`
- `packages/engine/src/agents/policy-wasm-score-routing.ts | after lines 545 | crossed cap? no`
- `packages/engine/src/kernel/gamedef-runtime.ts | after lines 132 | crossed cap? no`
- `packages/engine/test/integration/bytecode-input-row-cache-equivalence.test.ts | after lines 101 | crossed cap? no`

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/bytecode-input-row-cache-equivalence.test.js` — passed, 1 test.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — passed, 6 tests.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-wasm-equivalence.test.js` — passed, 1 test.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-parallel-determinism.test.js` — passed, 1 test.
- `pnpm -F @ludoforge/engine test:perf` — passed, 4/4 perf files; emitted the decisive green Phase 4 metric recorded in
  `reports/turnperf-008-spec-168-phase-4.md`.
- `pnpm turbo test` — passed, 5/5 tasks; engine default integration summary
  `70/70` files passed.
- `pnpm run check:ticket-deps` — passed.

Visible advisory perf warnings from older witnesses were non-final for this
ticket: `SPEC149_PHASE4_PER_CARD_RESET_WARNING`,
`SPEC149_PHASE4_PREVIEW_BATCH_COUNT_DRIFT`, and
`POLICY_PREVIEW_CORPUS_INCOMPLETE`. The ticket-owned Spec 168 fixture passed and
reported a green Phase 4 bucket gate.

Late-edit validity: after the final `test:perf` sample, only ticket/report proof
transcription and status text changed. No source, acceptance, command semantics,
touched-file ownership, follow-up ownership, or dependency classification
changed after the final correctness and perf witnesses.
