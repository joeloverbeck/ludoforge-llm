# Spec 155: Persistent Compiled GameDef Cache for CI Test Lanes

**Status**: DRAFT
**Priority**: P2 — CI ergonomics. No correctness impact, no architectural debt repayment, no evolution-readiness gate. Worth doing because the wasted work is large (~5.5 min cumulative across the four FITL lanes per CI run) and the structural fix is small.
**Complexity**: M — one new helper, one cache invalidation contract, one CI build-step integration, three verification tests. ~200-400 lines of new code; no kernel, compiler, or runtime semantics change.
**Dependencies**:
- `packages/engine/src/cnl/load-gamespec-source.ts` — `fingerprintGameSpecBundleSources` already produces the deterministic sha256 source fingerprint this cache keys on.
- `packages/engine/src/cnl/staged-pipeline.ts` — `runGameSpecStagesFromBundle` already threads `sourceFingerprint` onto its result.
- `packages/engine/test/helpers/production-spec-helpers.ts` — current per-process cache lives here; this spec extends it to a cross-process cache.
- `archive/specs/150-fitl-policy-vm-wasm-port.md` — context: this spec is the explicit non-WASM alternative to extending the policy-VM WASM port to kernel evaluation. The brainstorm rejected a kernel WASM port given the Spec 150 plateau evidence and the limited overlap between the policy-VM hot path and these CI lanes' actual workload.

## Brainstorm Context

**Original prompt**: After the recent Rust/WASM gains in policy code (Specs 149, 150, 154), the user asked whether similar techniques could induce gains for the remaining slow CI lanes — `fitl-events-shard-{a,b,c}` and `fitl-rules` — and whether such gains would warrant a spec aligned with `docs/FOUNDATIONS.md`.

**Brainstorm date**: 2026-05-05.

**Investigation summary**:

1. **Profile evidence** (`fitl-events-sihanouk.test.js`, the heaviest agent-using test, 20s wall-clock on a recent local run):
   - 11.0% GC
   - 6.8% YAML parser (`parser.next`, `lex`, `foldLines`, `parseDocument`)
   - 2.6% `resolveRef` (kernel IR walk)
   - 2.4% `resolveSpanForDiagnosticPath` (compiler diagnostics)
   - 1.9% `visitEffects` (kernel)
   - 1.6% `resolveEffectBindings` (kernel)
   - 1.6% `eval-query` (kernel)
   - 1.1% `evalValue` (kernel)
   - 1.0% `fnv1a64FromState` (Zobrist hashing)
   - The policy bytecode VM (Spec 150's optimization target) is essentially absent from the hot path; only 2 of 195 fitl-events / fitl-rules test files even import `PolicyAgent`.

2. **Wall-clock decomposition**:
   - 113 fitl-events test files + 82 fitl-rules test files = 195 sequential `node --test` subprocesses across the four lanes.
   - Each subprocess re-runs `compileProductionSpec` from scratch: ~1.7 s per process. Cumulative wasted work: ~5.5 minutes per CI run.
   - The compiled GameDef is 1476 KB JSON. `JSON.parse` of that artifact is ~5 ms. Ratio of "compile from source" to "load from cache": ~350×.

3. **Spec 150 plateau evidence** (the WASM analogy that does not transfer here):
   - Spec 150 ported the policy bytecode VM to Rust/WASM over ~34 tickets across multiple months.
   - Outcome: per-card cost reduced from 6700 ms → ~1500 ms (4-5×). The original ≤ 250 ms target was retired and replaced with a measured ≤ 1800 ms successor budget after `150FITLWASM-034` confirmed the same-seam architecture cannot reach 250 ms without changing the work done per candidate.
   - The kernel symbolic-IR walker is a much larger and more diverse surface than policy expressions. Re-applying the WASM pattern would inherit the same plateau risk at higher cost, with limited applicability to the actual fitl-events / fitl-rules workload.

4. **Approach selection** (compound-move, brainstorm 2026-05-05): user initially selected "Approach A plus a tactical heavy-shard rebalance" but, on reviewing the tactical ticket, concluded the round-trip cost (write the rebalance, undo when this spec lands) approached the savings for a non-blocked CI lane on a Medium-complexity strategic fix horizon. Tactical pairing was dropped; this spec stands alone. Approaches B (single persistent test runner) and C (kernel WASM port) were considered and explicitly deferred / rejected respectively.

**Final brainstorm confidence**: 88% on diagnosis and approach selection. Remaining uncertainty is implementation detail at phase boundaries, addressed inside each phase.

## 1. Overview

The four longest CI lanes (`fitl-events-shard-{a,b,c}`, `fitl-rules`) spend ~5.5 minutes of cumulative wall-clock per CI run on redundant work: each of the 195 test subprocesses re-parses, re-validates, and re-compiles the FITL production GameSpecDoc from source, even though the GameSpecDoc has not changed within a single CI run. The in-process `compileProductionSpec` cache deduplicates within one Node process but cannot share across the per-test-file `node --test` subprocesses spawned by `packages/engine/scripts/run-tests.mjs`.

The fix is a disk-backed compiled-GameDef cache keyed by the same `sourceFingerprint` (sha256 over source paths and markdown content) that `fingerprintGameSpecBundleSources` already computes. The first subprocess that finds a cache miss runs the full compile, atomically writes the canonicalized GameDef JSON to a cache file under `packages/engine/dist/.cache/`, and returns it. Subsequent subprocesses load the cache via `JSON.parse(readFileSync(...))`.

The cache is generic over GameDef. It applies to the FITL production spec, the Texas Hold'em production spec, and any future game spec that flows through `compileProductionSpec`.

## 2. Architecture

### 2.1 Cache layout

```
packages/engine/dist/.cache/
  <game-key>.<sourceFingerprint>.<cacheFormatVersion>.gamedef.json
```

- `<game-key>`: derived from the entrypoint file basename (e.g., `fire-in-the-lake`, `texas-holdem`).
- `<sourceFingerprint>`: the sha256 hex string from `fingerprintGameSpecBundleSources`.
- `<cacheFormatVersion>`: a constant string in the helper module (e.g., `v1`). Bumped when the cache format changes incompatibly.

Cache files are placed under `dist/.cache/` so they live alongside `engine-dist` build output, can be uploaded as part of the existing `actions/upload-artifact@v7` step in `engine-tests.yml`, and are removed by `pnpm -F @ludoforge/engine clean`.

### 2.2 Cache helper API

A new module `packages/engine/test/helpers/gamedef-cache.ts` exposes:

```ts
export interface GameDefCacheKey {
  readonly gameKey: string;          // e.g., 'fire-in-the-lake'
  readonly sourceFingerprint: string;
  readonly cacheFormatVersion: string;
}

export interface CachedGameDefEntry {
  readonly gameDef: GameDef;
  readonly sourceFingerprint: string;
  readonly compilerStamp: string;    // see §2.3
  readonly parsed?: LoadedGameSpecBundle['parsed'];
  readonly validatorDiagnostics?: readonly Diagnostic[];
}

export function readGameDefCache(key: GameDefCacheKey): CachedGameDefEntry | null;
export function writeGameDefCache(key: GameDefCacheKey, entry: CachedGameDefEntry): void;
export function clearGameDefCache(): void; // test utility
```

`compileProductionSpec` in `production-spec-helpers.ts` is updated to:

1. Load the bundle sources and source fingerprint without composing the full GameSpecDoc.
2. Probe the persistent cache for `(gameKey, sourceFingerprint, cacheFormatVersion)`.
3. On hit: deserialize the cached entry, run `assertValidatedGameDef` on the GameDef, reuse cached parsed bundle metadata and validator diagnostics when present, populate the in-process cache, return.
4. On miss: run the existing pipeline (`runGameSpecStagesFromBundle`), populate the in-process cache, atomically write the persistent cache (write-temp-rename), return.

The atomic write is `writeFileSync(tempPath, JSON.stringify(entry))` followed by `renameSync(tempPath, finalPath)`. This handles concurrent test processes racing to the same cache miss: the loser's rename simply overwrites the winner's identical content.

### 2.3 Compiler stamp

The cache key includes `sourceFingerprint` + `cacheFormatVersion`. It does NOT include a compiler version, because:

- The engine is a workspace package with no version field that changes on code edits.
- Node's `require.resolve` and pnpm's `node_modules/.cache` give the cache an implicit "binary" identity already: when the engine's compiled `dist/` changes, the cache directory under `dist/.cache/` is wiped by `pnpm -F @ludoforge/engine clean` (which is invoked by `pnpm -F @ludoforge/engine build`).

To make this explicit and survive partial rebuilds, the cache entry includes a `compilerStamp`: a sha256 of the contents of `packages/engine/dist/src/cnl/staged-pipeline.js` (or its `.d.ts`) computed at first-call time and memoized in-process. On hit, if the stored `compilerStamp` does not match, the cache is treated as a miss. This catches the case where `dist/` was rebuilt without `clean` and the cache directory survived but the compiler logic changed.

### 2.4 Opt-out

A debugging escape hatch: env var `LUDOFORGE_GAMEDEF_CACHE=off` disables both reading and writing the persistent cache. This is for debugging compiler determinism issues, not a long-term toggle. The default is "on".

### 2.5 CI integration

`engine-tests.yml` `build` job already produces `engine-dist` and uploads it as an artifact. After the build job's `pnpm -F @ludoforge/engine build` step, add one step:

```yaml
- name: Warm GameDef cache
  run: pnpm -F @ludoforge/engine cache:gamedef:warm
```

`cache:gamedef:warm` is a new package script that imports `compileProductionSpec` once (or once per known game), forcing a cache write under `dist/.cache/`. The `engine-dist` upload already includes `dist/`, so `dist/.cache/` rides along to the test jobs.

The download-artifact step in the test jobs already restores `dist/`, so the cache is present from the first test process onward.

## 3. Determinism Contract

1. **Cache content is byte-identical to a fresh compile.** The serialization is canonical: the GameDef is run through a stable JSON encoder (`JSON.stringify` with no replacer, no spacing) — the GameDef is already a plain JSON-compatible structure with no sets, maps, or non-serializable values, per the existing kernel ownership of the GameDef shape. Equivalence is proven by Phase 3's `cache-equivalence.test.ts`.

2. **Cache key is deterministic.** `sourceFingerprint` is a sha256 over source paths and markdown content (already in production use). The fingerprint is independent of process state, locale, wall-clock, or hash-map iteration order.

3. **Cache miss never produces incorrect results.** A miss falls through to the existing compile path, which is already proven by the existing test suite. The cache is purely an accelerator.

4. **Cache hit cannot serve a stale GameDef across compiler changes.** The `compilerStamp` mismatch path forces a recompile when `dist/src/cnl/staged-pipeline.js` content changes. The `cacheFormatVersion` mismatch path forces a recompile when the cache helper itself changes incompatibly.

5. **Concurrent writes are safe.** Atomic rename ensures any reader sees either the old content or the new content, never a partial write. Two writers racing on the same key write byte-identical content (deterministic compile + canonical serialization), so the rename order is irrelevant.

## 4. Phases

### Phase 1 — Persistent cache helper

Owns `gamedef-cache.ts`, the rewrite of `compileProductionSpec` to consult it, and unit tests for the cache mechanism (read/write, fingerprint mismatch, compiler stamp mismatch, format version mismatch, env-var opt-out).

Acceptance:
- Hit path returns a GameDef byte-identical to a fresh compile (canonical JSON equality).
- Miss path produces and persists a cache entry; subsequent processes hit.
- All four mismatch paths (fingerprint, compiler stamp, format version, env-var off) take the recompile path.
- All existing engine tests pass with the cache enabled.

### Phase 2 — CI build-step integration

Adds the `cache:gamedef:warm` package script and the `Warm GameDef cache` step in `engine-tests.yml` after the `pnpm -F @ludoforge/engine build` step. Verifies that the cache is included in the `engine-dist` artifact upload (no change required to the upload step itself; `dist/` is already uploaded).

Acceptance:
- A clean CI run with the new step warms the cache and uploads it.
- All test lanes that download `engine-dist` find the cache present.
- The Warm step's wall-clock is measured and recorded as the new "compile cost" baseline (~1.7 s, paid once).

### Phase 3 — Verification and budget proof

Two tests + one CI assertion:

1. `packages/engine/test/integration/gamedef-cache-equivalence.test.ts` (new) — `architectural-invariant`: asserts that for FITL and Texas, `compileProductionSpec` with cache disabled and with cache enabled produces byte-identical canonical-JSON GameDefs.

2. `packages/engine/test/integration/gamedef-cache-invalidation.test.ts` (new) — `architectural-invariant`: asserts that mutating the source markdown of any spec file invalidates the cache (cache miss path is taken, fresh GameDef differs from prior cached GameDef).

3. `packages/engine/scripts/measure-fitl-lane-cumulative-cost.mjs` (new) — sums per-test-file startup overhead across the FITL lanes, runs once with cache hot and once cold, and records whether the hot run's cumulative startup time is < 30 s (the warm-target budget). Wired into a non-blocking CI summary step or a manual measurement script — not a blocking gate, because the absolute number depends on CI runner hardware.

Acceptance:
- All three artifacts land. The two equivalence/invalidation tests are blocking. The cumulative-cost measurement is informational. Ticket `155PERGAMCOM-004` delivered the manual script and measured the live no-test startup seam red (`hotCumulativeMs=1597210`, `hotMeetsBudget=false`, `speedupRatio=1.0219902204469042`). Ticket `155PERGAMCOM-005` reduced the persistent-hot helper path by caching parsed bundle metadata and deriving source fingerprints without full GameSpecDoc composition, but the revised lower-bound proof remains red. Ticket `155PERGAMCOM-006` owns residual runner/process topology or replacement-budget work.

## 5. FOUNDATIONS.md Alignment

| Foundation | Alignment |
|---|---|
| F1 Engine Agnosticism | Cache is generic over GameDef. No FITL- or Texas-specific code in the cache helper. The same mechanism applies to any GameSpecDoc. |
| F2 Evolution-First Design | No change to evolution surface. Evolution still mutates GameSpecDoc YAML; cache transparently accelerates the YAML→GameDef step that evolution drives. |
| F5 One Rules Protocol | No change. Cache delivers the same GameDef the kernel already consumes. |
| F6 Schema Ownership | Cache stores the existing GameDef shape; no new schema files. |
| F7 Specs Are Data | Cache content is data only — a serialized GameDef with no executable callbacks. |
| F8 Determinism | Deterministic cache key (sha256 fingerprint) + canonical-JSON serialization. Cache content is byte-identical to a fresh compile. Equivalence is proven by Phase 3. |
| F11 Immutability | Cached GameDef is a plain immutable JSON structure. No mutable shared state across processes. |
| F13 Artifact Identity | The cache is a persisted form of the GameSpec-hash → GameDef-hash mapping that F13 already requires. The fingerprint is the existing reproducibility identity. |
| F14 No Backwards Compatibility | The cache helper replaces, not wraps, the relevant call path. The opt-out env var is a debugging flag, not a long-term compatibility toggle, and is not retained beyond Phase 3. |
| F15 Architectural Completeness | Root-cause fix for persistent GameDef reuse landed, and ticket 005 reduced the cache-hit parse/validation/load residual. The original lane-startup budget model is still incomplete because per-file Node process/module startup dominates; residual topology ownership is explicit in `155PERGAMCOM-006` rather than hidden behind a false green. |
| F16 Testing as Proof | Equivalence and invalidation are proven by Phase 3 tests, not assumed. The cumulative-startup proof is red on the live no-test seam and is recorded as evidence for the successor. |

## 6. Acceptance Criteria

1. `compileProductionSpec` consults the persistent cache before falling back to a fresh compile, and writes the cache atomically on miss.
2. Cache content is byte-identical to a fresh compile (Phase 3 equivalence test passes).
3. Source mutation invalidates the cache (Phase 3 invalidation test passes).
4. Cumulative startup overhead across `fitl-events-shard-{a,b,c}` + `fitl-rules` lanes is measured by the Phase 3 script. The 2026-05-05 manual result is red on the no-test startup seam (`fileCount=192`, `coldCumulativeMs=1632333`, `hotCumulativeMs=1597210`, `hotMeetsBudget=false`). Ticket 005's v2 cache-entry change reduced representative hot startup samples materially by caching parsed bundle metadata with the GameDef, but the fastest post-change sample still implies a 192-file lower bound of `161664 ms`; `155PERGAMCOM-006` owns residual runner/process topology or replacement-budget work.
5. The CI build job warms the cache; the test jobs find it via the existing `engine-dist` artifact transfer.
6. All existing engine tests pass with the cache enabled (default).

## 7. Out of Scope

- **Approach B — single persistent test runner / worker pool.** Considered in the brainstorm. Now the active residual owner because Phase 3 and ticket 005 measured the per-file no-test startup seam red even with a hot v2 GameDef cache; `155PERGAMCOM-006` owns deciding whether this is the right fix or whether the proof surface should be replaced.
- **Approach C — Rust/WASM port of the kernel evaluation hot path.** Considered and rejected. The Spec 150 plateau (4-5× ceiling, original 250 ms target retired) and the limited overlap between the policy-VM hot path and these CI lanes' actual workload make this a poor cost/benefit. May become interesting downstream of Spec 14 (evolution pipeline) if simulation throughput becomes the dominant motivator; not justified for test-CI duration.
- **Cache for non-production specs.** This spec covers `compileProductionSpec` only — the helper mentioned by many slow integration tests. Ticket 004's live inventory found 192 files in the four FITL lanes, 150 mentioning production compile helpers, and only 25 with obvious top-level production fixture/compile calls under the no-test startup witness. Other compile call sites (unit tests building inline GameSpecDocs, fixture-based compiles, schema-validation harnesses) are fast in absolute terms and are not addressed here.
- **Cache compression.** The original v1 FITL GameDef-only cache file was about 1.5 MB. Ticket 005's v2 FITL cache entry is about 17.9 MB because it also persists parsed bundle metadata. Compression remains deferred because the current ticket evidence only proves helper-startup reduction, while compression would add a separate read/decompress/parse tradeoff owned by a future cache-artifact-size ticket if artifact upload or cache read I/O becomes material.
- **Persistent cache invalidation across engine code changes outside the compiler.** The `compilerStamp` covers `cnl/staged-pipeline.js`, which transitively imports the rest of the compiler. If a kernel-side change affects the GameDef shape without touching the compiler entry, cache invalidation falls back on `pnpm clean` removing `dist/.cache/` as part of `dist/`. This is the same correctness boundary the rest of the build already operates under.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-05:

- [`archive/tickets/155PERGAMCOM-001.md`](../archive/tickets/155PERGAMCOM-001.md) — Persistent gamedef cache helper and `compileProductionSpec` integration (covers Phase 1)
- [`archive/tickets/155PERGAMCOM-002.md`](../archive/tickets/155PERGAMCOM-002.md) — CI cache warm step and `cache:gamedef:warm` package script (covers Phase 2)
- [`archive/tickets/155PERGAMCOM-003.md`](../archive/tickets/155PERGAMCOM-003.md) — Cache equivalence and invalidation invariant tests (covers Phase 3 blocking tests)
- [`archive/tickets/155PERGAMCOM-004.md`](../archive/tickets/155PERGAMCOM-004.md) — FITL lane cumulative startup cost measurement script and first-cause red-result classification (covers Phase 3 informational measurement)
- [`archive/tickets/155PERGAMCOM-005.md`](../archive/tickets/155PERGAMCOM-005.md) — Reduce persistent-hot helper residual and classify the still-red startup budget
- [`tickets/155PERGAMCOM-006.md`](../tickets/155PERGAMCOM-006.md) — Resolve residual FITL lane process startup topology or respecify the proof surface
