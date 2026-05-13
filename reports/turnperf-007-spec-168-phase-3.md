# TURNPERF-007 / Spec 168 Phase 3 Zobrist Frame Digest Gate (2026-05-13)

## Verdict

Spec 168 Phase 3 is green. Decision-stack frame digesting now uses a
run-local `frameDigestCache` keyed by structural frame identity plus the
running parent-frame digest. The canonical one-card fixture records:

- `zobrist:digestDecisionStackFrame = 24.73 ms`
- `zobrist:digestDecisionStackFrame = 27.44 ms`
- `zobrist:encodeDecisionStackFrame = 17.30 ms`
- combined zobrist frame bucket = `44.74 ms`

The Phase 1b comparison point was:

- `zobrist:digestDecisionStackFrame = 90.99 ms`
- `zobrist:encodeDecisionStackFrame = 35.90 ms`
- combined zobrist frame bucket = `126.89 ms`

The combined named bucket dropped by `82.15 ms` versus Phase 1b, satisfying the
`>= 40 ms` Phase 3 acceptance gate.

## Reproducibility Metadata

| Field | Value |
|---|---|
| Fixture version | `spec-168-phase-0-v1` |
| Generated at | `2026-05-13T07:14:13.833Z` |
| Kernel commit SHA | `bc121ad8f25d63beaff582f2bbee505798e9cca5` |
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
Phase 3 evidence is transcribed here.

## What Landed

1. Added `zobristTable.frameDigestCache` as a bounded run-local cache and
   forked it in `forkGameDefRuntimeForRun(...)`.
2. Replaced full suspended-state frame digest input with a structural digest
   input that carries `parentFrameDigest` and summarizes suspended state by its
   canonical `stateHash`.
3. Threaded parent-frame digest through `computeFullHash` and
   `zobrist-phase-hash` decision-stack walkers.
4. Added `zobrist-frame-digest-cache-equivalence.test.ts` proving cached,
   uncached, and recomputed digest parity plus replay state-hash identity.
5. Updated the Spec 161 no-op snapshot for the intentional canonical state-hash
   change and the live preview-usage coverage shape.

## Phase 3 Gate

| Field | Phase 0 baseline | Phase 1b comparison | Phase 3 decisive |
|---|---:|---:|---:|
| `zobrist:digestDecisionStackFrame` totalMs | `91.47` | `90.99` | `27.44` |
| `zobrist:encodeDecisionStackFrame` totalMs | `38.45` | `35.90` | `17.30` |
| Combined named bucket | `129.92` | `126.89` | `44.74` |
| Delta vs Phase 1b | N/A | N/A | `-82.15` |
| Required drop | N/A | N/A | `>= 40.00` |
| Verdict | baseline | comparison | green |

## Top-Line Result

| Metric | Phase 1b comparison | Phase 2 decisive | Phase 3 decisive |
|---|---:|---:|---:|
| `elapsedMs` | `1971.84` | `1873.48` | `2120.49` |
| per-card `elapsedMs` | `1971.67` | `1873.32` | `2120.30` |
| per-card decisions | `160` | `160` | `160` |
| per-card `msPerDecision` | `12.3230` | `11.7082` | `13.2519` |

Single-run wall-clock drift is diagnostic only; the Phase 3 verdict is based on
the named zobrist frame bucket gate above.

## Activation Counters

| Counter / bucket | Phase 3 decisive |
|---|---:|
| `zobrist:decisionStackFrameRunLocalCacheHit` | `10` |
| `zobrist:decisionStackFrameRunLocalCacheMiss` | `312` |
| `zobrist:decisionStackFrameWeakCacheHit` | `346` |
| `zobrist:decisionStackFrameEncodedChars` | `3238510` |

The retained improvement is primarily from the structural digest input replacing
full suspended-state JSON digesting; run-local hits are present but are not the
main source of the Phase 3 bucket drop on this workload.

## Invariants

1. Cached frame digest equals recomputed frame digest for the same structural
   frame input and parent-frame digest.
2. `frameDigestCache` is run-local and forked per run alongside
   `zobristTable.keyCache`.
3. Replay state hashes remain deterministic with populated and empty frame
   digest caches.
4. The cache stores digest string values only; it does not retain `GameState`
   object references.

## Verification

| Command | Result |
|---|---|
| `pnpm -F @ludoforge/engine build` | Passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js` | Passed, 3 tests |
| `pnpm -F @ludoforge/engine exec node --test dist/test/unit/sim/simulator.test.js` | Passed, 22 tests |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-wasm-equivalence.test.js` | Passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-parallel-determinism.test.js` | Passed |
| `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` | Passed, 6 tests |
| `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-161-choosenstep-inner-preview-no-op-default.test.js` | Passed after snapshot update |
| `pnpm -F @ludoforge/engine test:determinism` | Passed, 22/22 files |
| `pnpm -F @ludoforge/engine test:perf` | Passed, 4/4 perf files; Spec 168 fixture produced the decisive Phase 3 metric. Existing advisory perf warnings in older non-Phase-3 checks were classified as non-final/not ticket-owned for this Phase 3 closeout. |
| `pnpm -F @ludoforge/engine exec node --test dist/test/unit/zobrist-table.test.js` | Passed, 9 tests after updating the legacy hand-authored frame fixture to the live shape |
| `pnpm turbo test` | Passed after post-review cache fix, 5/5 tasks; engine reported 69/69 default files passed and runner tests passed |
| Post-`pnpm turbo test` rerun of `pnpm -F @ludoforge/engine exec node --test dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js` | Passed, 4 tests |
| Post-review focused rerun of `pnpm -F @ludoforge/engine exec node --test dist/test/integration/zobrist-frame-digest-cache-equivalence.test.js` | Passed, 4 tests after adding same-frame/different-parent memoization coverage |

## Durable State

Durable status: `COMPLETED`.

Late-edit validity: this report transcribes the final `test:perf` fixture
sample. The snapshot update was proof-affecting and the affected focused file
plus full determinism lane were rerun after the update. The later
`zobrist-table.test.ts` fixture update was proof-affecting for the broad
unit/root lane, and the focused unit file, focused cache equivalence file, and
`pnpm turbo test` were rerun afterward. Post-review found and fixed one small
cache-memoization bug: the WeakMap frame memo now scopes entries by
`parentFrameDigest`, and the cache equivalence test includes a
same-frame/different-parent regression. Final report/ticket edits after that
code fix are proof transcription only.
