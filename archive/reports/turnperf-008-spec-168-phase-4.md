# TURNPERF-008 / Spec 168 Phase 4 Bytecode Input Row Cache (2026-05-13)

## Verdict

Spec 168 Phase 4 is green. Policy WASM bytecode input encoding now uses a
bounded run-local cache carried by `GameDefRuntime`. The canonical one-card
fixture records:

- `policyWasmRuntime:encodeBytecodeInput = 14.88 ms`
- whole-row cache activation: `0` hits, `394` misses
- encoded-state segment cache activation: `342` hits, `52` misses
- per-call cost: `14.88 / 394 = 0.0378 ms` per bytecode input call

The ticket baseline was:

- `policyWasmRuntime:encodeBytecodeInput = 38.28 ms`

The named bucket dropped by `23.40 ms`, satisfying the Phase 4 acceptance gate
of `>= 10 ms`.

## Reproducibility Metadata

| Field | Value |
|---|---|
| Fixture version | `spec-168-phase-0-v1` |
| Generated at | captured by `packages/engine/test/perf/.artifacts/per-decision-cost-budget.json` |
| Kernel commit SHA | `1f78bd92339129976ea646a5ab44554872442464` |
| Node | `v22.17.0` |
| pnpm | `10.12.1` |
| OS | `Linux 6.6.114.1-microsoft-standard-WSL2 linux` |
| CPU | `12th Gen Intel(R) Core(TM) i9-12900K` |

## Methodology

Build prerequisite:

```bash
pnpm -F @ludoforge/engine build
```

Decisive fixture command:

```bash
pnpm -F @ludoforge/engine test:perf
```

The broad perf lane includes the Spec 168 fixture, which invokes:

```bash
node scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label spec-168-phase-0-fixture
```

The raw fixture JSON is ignored at
`packages/engine/test/perf/.artifacts/per-decision-cost-budget.json`; durable
Phase 4 evidence is transcribed here.

## What Landed

1. Added bounded `policyWasmBytecodeInputCache` and
   `policyWasmBytecodeStateWordsCache` caches to `GameDefRuntime`.
2. Reset that cache during `forkGameDefRuntimeForRun(...)`, matching run-local
   ownership because encoded input bytes include state-dependent values.
3. Replaced the prior module-level WeakMap cache with a runtime-owned LRU cache
   keyed by bytecode structure, layout identity, expected layout, canonical
   `state.stateHash`, active player, and scoring player.
4. Added a safe state-words segment cache for repeated canonical state hashes
   when bytecode constants differ and whole-row reuse is not correct.
5. Threaded the caches through production WASM preview-candidate and score-row
   routes.
6. Added `bytecode-input-row-cache-equivalence.test.ts`, which compares fresh
   encoded bytes against cached bytes and proves a forked runtime starts with an
   empty run-local cache.

## Phase 4 Gate

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

## Top-Line Result

| Metric | Phase 4 decisive |
|---|---:|
| `elapsedMs` | `1950.02` |
| per-card `elapsedMs` | `1949.83` |
| per-card decisions | `160` |
| per-card `msPerDecision` | `12.1864` |

Single-run wall-clock is diagnostic only; the Phase 4 verdict is based on the
named bytecode input encoding bucket gate above.

## Activation Counters

| Counter / bucket | Phase 4 decisive |
|---|---:|
| `policyWasmRuntime:encodedInputCacheHit` | `0` |
| `policyWasmRuntime:encodedInputCacheMiss` | `394` |
| `policyWasmRuntime:encodedStateWordsCacheHit` | `342` |
| `policyWasmRuntime:encodedStateWordsCacheMiss` | `52` |
| `wasmScoreRowRouteCount` | `52` |
| `wasmPreviewCandidateFeatureRowRouteCount` | `60` |
| `wasmProductionPreviewDriveBatchCount` | `182` |

The safe whole-row cache correctly records no hits on this workload because
bytecode constants differ under the same source fingerprint. The state segment
cache is active on repeated canonical state hashes in the production score-row
and preview-candidate row routes. Preview-drive batch encoding remains separate
and is unchanged by this phase.

## Invariants

1. Cached bytecode input bytes equal freshly encoded bytes for the same
   bytecode, layout, state hash, active player, and scoring player.
2. Cached state-word segments are keyed by layout identity and canonical
   `state.stateHash`.
3. The caches are run-local and forked per run.
4. The caches store `Uint8Array` byte snapshots and `Int32Array` state-word
   snapshots only; they do not retain
   `GameState` references.
5. No WASM ABI magic, version, opcode, or target export changed.

## Verification

| Command | Result |
|---|---|
| `pnpm -F @ludoforge/engine build` | Passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/bytecode-input-row-cache-equivalence.test.js` | Passed, 1 test |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` | Passed, 6 tests |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-wasm-equivalence.test.js` | Passed, 1 test |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-parallel-determinism.test.js` | Passed, 1 test |
| `pnpm -F @ludoforge/engine test:perf` | Passed, 4/4 perf files; emitted the decisive Phase 4 metric |
| `pnpm turbo test` | Passed, 5/5 tasks; engine default integration summary `70/70` files passed |
| `pnpm run check:ticket-deps` | Passed |

Visible advisory warnings from older perf witnesses were non-final for this
ticket: `SPEC149_PHASE4_PER_CARD_RESET_WARNING`,
`SPEC149_PHASE4_PREVIEW_BATCH_COUNT_DRIFT`, and
`POLICY_PREVIEW_CORPUS_INCOMPLETE`. The ticket-owned Spec 168 fixture passed and
reported a green Phase 4 bucket gate.

## Durable State

Durable status: implemented.

Late-edit validity: this report transcribes the final `test:perf` fixture
sample. Later ticket/status proof transcription was clerical only and did not
change source, acceptance, command semantics, touched-file ownership, follow-up
ownership, or dependency classification.
