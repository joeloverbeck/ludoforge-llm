# TURNPERF-002 Phase 2 Implementation Report (2026-04-28)

## Verdict

TURNPERF-002 is not complete. The live scoped token-index refresh and preview no-final-hash reduction are correct and measured, but they do not close the per-card or determinism-parity budget gates. Token-index/cache candidates and scalar/digest hash-cache candidates that did not improve the owned probes were measured and removed; the preview no-final-hash seam remains landed as a real root-cause reduction.

## Live Baseline Reassessment

The live checkout already contains the scoped token-index refresh from the PR diagnosis:

- `refreshCachedTokenStateIndexEntries(state, affectedTokenIds, mutatedZoneIds)`
- `writeZoneMutations()` passes mutated zone ids.
- `packages/engine/test/kernel/token-state-index-incremental.test.ts` covers multi-occurrence and changed-zone refresh cases.

That made this pass a validation/remeasurement of the existing candidate before any further optimization.

## Clean Candidate Measurements

Build and focused correctness:

```bash
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js
```

Result: both passed. Focused token-index test result was 9 tests / 3 suites passing.

One-card smoke:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-smoke
```

Result:

| Metric | Value |
|---|---:|
| elapsedMs | 6421.76 |
| per-card elapsedMs | 6421.60 |
| decisions | 159 |
| driveExitTotal | 211 |
| tokenStateIndexBuildCount | 2381 |
| draftTokenStateIndexDeltaCount | 198 |
| draftTokenStateIndexAttachCount | 623 |

One-card attribution:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label turnperf-002-attribution
```

Result:

| Metric | Value |
|---|---:|
| elapsedMs | 6581.02 |
| per-card elapsedMs | 6580.88 |
| tokenStateIndexBuildCount | 2381 |
| draftTokenStateIndexDeltaCount | 198 |
| draftTokenStateIndexAttachCount | 623 |
| driveExitTotal | 211 |
| simAgentChooseMove | 4038.46 ms |
| agent:evaluatePolicyExpression | 4036.42 ms |
| simApplyMove | 813.47 ms |

CPU profile:

```bash
node --cpu-prof --cpu-prof-dir=/tmp/turnperf-002-cpuprofile-clean packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-cpuprofile-clean
```

Profile artifact: `/tmp/turnperf-002-cpuprofile-clean/CPU.20260428.172750.2.0.001.cpuprofile`

Top self-sample buckets:

| Bucket | Samples |
|---|---:|
| `fnv1a64` (`kernel/zobrist`) | 1484 |
| garbage collector | 844 |
| `resolveRef` | 326 |
| `copyCachedTokenStateIndex` | 311 |
| `evalCondition` | 263 |
| `canonicalizeHashValue` | 211 |
| YAML parser `next` | 194 |
| `evalValue` | 168 |
| `zobristKey` | 147 |
| `evalQuery` | 144 |

## Rejected Candidates

### Full mutable index in WeakMap

Candidate: persist and clone the full mutable occurrence index as the WeakMap cache value, so `createDraftTokenStateIndex()` could reuse cached occurrence maps.

Correctness: focused token-index suite passed after the candidate.

Measurement:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-smoke-option-b
```

Result: `elapsedMs=8651.11`, per-card `elapsedMs=8650.95`, `tokenStateIndexBuildCount=2381`.

Verdict: rejected and removed. It regressed wall-clock and did not reduce the rebuild counter.

### Lazy copy-on-write cache sharing

Candidate: make `copyCachedTokenStateIndex()` install a shared wrapper and clone only when the copied state mutates its cache.

Correctness: focused token-index suite passed after the candidate, including a copied-cache isolation regression.

Measurements:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-lazy-copy-smoke
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label turnperf-002-lazy-copy-attribution
```

Results:

| Probe | elapsedMs | tokenStateIndexBuildCount | Top attribution |
|---|---:|---:|---|
| lazy-copy smoke | 6448.87 | 2381 | n/a |
| lazy-copy attribution | 6648.99 | 2381 | `agent:evaluatePolicyExpression=4076.84 ms` |

Verdict: rejected and removed. The result was noise/slightly worse than the clean candidate state.

### Compact scalar Zobrist key caching

Candidate: cache compact runtime-valued scalar feature keys (`globalVar`, `perPlayerVar`, `turnCount`, `actionUsage`, `zoneVar`, id counters, unavailable actions) in the existing run-local `ZobristTable.keyCache`, while continuing to leave bulky `decisionStackFrame` and `lastingEffect` features uncached.

Correctness: focused Zobrist/hash suite passed after the candidate:

```bash
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/zobrist-incremental-edge-cases.test.js dist/test/unit/zobrist-table.test.js dist/test/unit/zobrist-hash-updates.test.js
```

Measurements:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-hash-cache-smoke
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label turnperf-002-hash-cache-attribution
node --cpu-prof --cpu-prof-dir=/tmp/turnperf-002-hash-cache-cpuprofile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-hash-cache-cpuprofile
timeout 300s bash -lc 'cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js'
```

Results:

| Probe | Result |
|---|---|
| smoke | `elapsedMs=6744.85`, `tokenStateIndexBuildCount=2381` |
| attribution | `elapsedMs=6502.71`, `agent:evaluatePolicyExpression=4024.29 ms`, `simApplyMove=695.99 ms` |
| CPU profile | `fnv1a64` samples reduced from `1484` to `1268`; profile artifact `/tmp/turnperf-002-hash-cache-cpuprofile/CPU.20260428.180127.2.0.001.cpuprofile` |
| seed 42 parity | timed out after 300s; last progress line reported still running after `4m 31s` |

Verdict: rejected and removed. The CPU-profile signal was real, but it did not move the ticket-owned wall-clock/parity acceptance lanes enough to justify keeping the cache-boundary change.

### Decision-stack-frame digest WeakMap

Candidate: cache decision-stack-frame digests in a WeakMap keyed by frame object identity.

Correctness: focused Zobrist/hash suite passed after the candidate.

Measurement:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-hash-cache2-smoke
```

Result: `elapsedMs=7149.96`, `tokenStateIndexBuildCount=2381`.

Verdict: rejected and removed. It worsened the one-card smoke probe.

## Blocking Acceptance Lanes

Perf lane:

```bash
timeout 300s pnpm -F @ludoforge/engine test:perf
```

Result: timed out after 300s with no TAP result.

Seed 42 determinism parity:

```bash
timeout 300s bash -lc 'cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js'
```

Result: timed out after 300s. Last progress line reported the file still running after `4m 31s`.

Seed 123 determinism parity:

```bash
timeout 300s bash -lc 'cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js'
```

Result: timed out after 300s. Last progress line reported the file still running after `4m 31s`.

## Next Decision Point

The scoped token-index refresh is not enough, and the stronger token-index/cache candidates were measured rejects. The remaining evidence points at hashing and policy-expression evaluation:

1. Hashing path: `fnv1a64`, `canonicalizeHashValue`, `zobristKey`, `digestDecisionStackFrame`, and `computeFullHash`.
2. Policy-expression path: `resolveRef`, `evalCondition`, `evalValue`, and `evalQuery`.
3. Workflow/budget path: raise or split long-running perf/determinism gates while a narrower implementation ticket handles the next optimization.

Updated next step after Foundation-aligned boundary reset: TURNPERF-002 should remain open. Token-index cache variants, compact scalar Zobrist key caching, and decision-stack digest caching have all been measured and removed. User approved the preview-inner no-final-hash implementation seam on 2026-04-28.

## Hash Reduction (2026-04-28)

After the Foundation-aligned reset, a fresh clean CPU profile was captured to identify why `fnv1a64` dominated while scalar Zobrist key caching did not move wall clock:

```bash
node --cpu-prof --cpu-prof-dir=/tmp/turnperf-002-hash-reduction-clean packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-hash-reduction-clean
```

Result: `elapsedMs=6908.88`, per-card `elapsedMs=6908.72`, `tokenStateIndexBuildCount=2381`, `driveExitTotal=211`.

Profile artifact: `/tmp/turnperf-002-hash-reduction-clean/CPU.20260428.181506.2.0.001.cpuprofile`

Top self-sample buckets:

| Bucket | Samples |
|---|---:|
| `fnv1a64` (`kernel/zobrist`) | 1488 |
| garbage collector | 830 |
| `resolveRef` | 356 |
| `copyCachedTokenStateIndex` | 326 |
| `evalCondition` | 235 |
| `canonicalizeHashValue` | 212 |
| `evalValue` | 169 |
| `zobristKey` | 156 |
| `evalQuery` | 126 |

Zobrist `fnv1a64` immediate parents:

| Parent | Samples |
|---|---:|
| `digestDecisionStackFrame` | 1208 |
| `zobristKey` | 277 |
| `createZobristTable` | 3 |

Top `digestDecisionStackFrame` stacks:

| Stack owner | Samples |
|---|---:|
| `computeFullHash -> microturn/apply.ts updateHash -> applyPublishedDecisionFromCanonicalState -> driveSyntheticCompletion -> classifyPreviewOutcome` | 619 |
| `computeFullHash -> microturn/apply.ts updateHash -> spawnPendingFrame -> applyPublishedDecisionFromCanonicalState -> driveSyntheticCompletion` | 235 |
| `computeFullHash -> microturn/apply.ts updateHash -> applyPublishedDecisionFromCanonicalState -> runGame` | 182 |
| `computeFullHash -> microturn/apply.ts updateHash -> spawnPendingFrame -> applyPublishedDecisionFromCanonicalState -> runGame` | 134 |
| `computeFullHash -> microturn/drive.ts canonicalizeState -> applyPreviewDriveGreedyChooseOne -> driveSyntheticCompletion` | 38 |

Interpretation:

- The dominant Zobrist `fnv1a64` work is decision-stack-frame digesting inside full `computeFullHash`, not scalar feature key hashing.
- The dominant call path is non-greedy synthetic preview completion through `microturn/apply.ts` `applyPublishedDecisionFromCanonicalState`, which computes a full canonical hash after every inner microturn.
- The existing greedy choose-one preview drive already has a no-final-hash path and appears much smaller in this profile.
- The next plausible implementation seam is a no-final-hash/public preview-internal apply path for non-greedy inner microturns, with final canonicalization at preview-drive exit, rather than more feature-key cache changes.

## Preview No-Final-Hash Reduction (2026-04-28)

Implemented the approved preview-inner no-final-hash seam:

- `publishMicroturnFromPreviewStateNoHash` publishes bounded preview microturns from private states whose content is current but whose stored hash may lag until preview-drive exit.
- `applyPublishedDecisionFromPreviewStateNoFinalHash` exposes the existing preview no-final-hash apply internals for non-greedy synthetic completion.
- `driveSyntheticCompletion()` now defers final hash computation for private non-greedy preview-inner states and canonicalizes before every public preview exit, telemetry capture, or handoff to the existing greedy choose-one drive.
- `policy-preview-driver.test.ts` now asserts returned choose-one and choose-N preview states carry canonical hashes.

Focused proof:

```bash
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-driver.test.js
pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js
```

Result: build passed; policy preview driver passed 5 tests; token-index suite passed 9 tests / 3 suites.

One-card smoke:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-option1-smoke
```

| Metric | Value |
|---|---:|
| elapsedMs | 7000.69 |
| per-card elapsedMs | 7000.50 |
| decisions | 159 |
| driveExitTotal | 211 |
| tokenStateIndexBuildCount | 2377 |
| draftTokenStateIndexDeltaCount | 198 |
| draftTokenStateIndexAttachCount | 682 |

One-card attribution:

```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label turnperf-002-option1-attribution
```

| Metric | Value |
|---|---:|
| elapsedMs | 6272.93 |
| per-card elapsedMs | 6272.78 |
| tokenStateIndexBuildCount | 2377 |
| draftTokenStateIndexDeltaCount | 198 |
| draftTokenStateIndexAttachCount | 682 |
| driveExitTotal | 211 |
| simAgentChooseMove | 3607.89 ms |
| agent:evaluatePolicyExpression | 3605.66 ms |
| simApplyMove | 830.21 ms |

CPU profile:

```bash
node --cpu-prof --cpu-prof-dir=/tmp/turnperf-002-option1-cpuprofile packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label turnperf-002-option1-cpuprofile
```

Profile artifact: `/tmp/turnperf-002-option1-cpuprofile/CPU.20260428.182242.2.0.001.cpuprofile`

Result: `elapsedMs=6410.85`, per-card `elapsedMs=6410.67`, `tokenStateIndexBuildCount=2377`, `driveExitTotal=211`.

Compared with the fresh clean hash-reduction profile, `fnv1a64` self samples dropped from `1594` to `1289`; immediate-parent samples from `digestDecisionStackFrame` dropped from `1208` to `911`.

Broad determinism lane:

```bash
timeout 300s bash -lc 'cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js'
```

Result: still timed out after 300s.

Verdict: keep the implementation as a real root-cause reduction in decision-stack hashing, but TURNPERF-002 remains open. The CPU-profile and attribution signals improved, while the smoke run stayed noisy/red and the broad parity lane still misses the 300s bounded probe.
