# 155PERGAMCOM-001: Persistent gamedef cache helper and `compileProductionSpec` integration

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-helper module only; no kernel/compiler/runtime semantics change
**Deps**: `specs/155-persistent-gamedef-compile-cache.md`

## Problem

The four longest CI lanes (`fitl-events-shard-{a,b,c}`, `fitl-rules`) spawn 195 sequential `node --test` subprocesses, each of which re-compiles the FITL production GameSpecDoc from source via `compileProductionSpec` at ~1.7 s per process. The existing in-process cache deduplicates within one Node process but cannot share across subprocesses, costing ~5.5 minutes of cumulative wall-clock per CI run.

Phase 1 of Spec 155 introduces a disk-backed cache, keyed by the existing `sourceFingerprint` (sha256 over source paths and markdown content), under `packages/engine/dist/.cache/`. Cross-process cache lookups replace per-process recompiles. The compiled GameDef JSON is ~1.5 MB and `JSON.parse` of it is ~5 ms — a ~350× speedup over a fresh compile per subprocess.

This ticket delivers Phase 1: the cache helper, the `compileProductionSpec` / `compileTexasProductionSpec` rewrite to consult it, and the unit tests covering the five contract paths (read/write hit, fingerprint mismatch, compiler-stamp mismatch, format-version mismatch, env-var opt-out).

## Assumption Reassessment (2026-05-05)

1. `compileProductionSpec` and `compileTexasProductionSpec` in `packages/engine/test/helpers/production-spec-helpers.ts` currently key their in-process cache on `bundle.sourceFingerprint`. Confirmed at `production-spec-helpers.ts:73-90, 151-168` — no other consumers of the in-process cache state.
2. `LoadedGameSpecBundle.sourceFingerprint` is exposed by `loadGameSpecBundleFromEntrypoint` in `packages/engine/src/cnl/load-gamespec-source.ts:79`. The internal `fingerprintGameSpecBundleSources` (line 103) is not exported — the helper consumes the field on the bundle, not the function.
3. `runGameSpecStagesFromBundle` (`packages/engine/src/cnl/staged-pipeline.ts:42`) threads `sourceFingerprint` onto its result; the cache helper does not need to recompute it.
4. `assertValidatedGameDef` exists at `packages/engine/src/kernel/validate-gamedef.ts:151` and accepts `GameDef`, returning `ValidatedGameDef`. Spec §2.2 step 3 calls for running it on every cache hit before returning.
5. `pnpm -F @ludoforge/engine clean` is `rm -rf dist` (engine `package.json:33`), so `dist/.cache/` is wiped on every clean. The compiler-stamp safeguard handles partial rebuilds where `dist/` survives but compiler logic changes.
6. No existing `gamedef-cache.ts` module — clean addition under `packages/engine/test/helpers/`.

## Architecture Check

1. **Cleaner than alternatives**: A purely in-process cache cannot cross subprocesses; a per-test-runner persistent worker pool (Approach B in the spec brainstorm) requires a substantial rewrite of `node --test` conventions. A disk cache keyed on the existing fingerprint is a structural fix at the smallest possible diff: one helper module, no kernel touch, no test-runner change.
2. **GameSpecDoc / GameDef boundary preserved**: The cache stores the *output* of `compileProductionSpec` (a GameDef) using the *input fingerprint* (a hash over GameSpecDoc source markdown). It does not invent a new schema, does not move game-specific data into the helper, and does not affect what evolution mutates (still GameSpecDoc YAML). Cache helper is generic over GameDef — same mechanism applies to FITL, Texas Hold'em, and any future spec compiled via `compileProductionSpec`.
3. **No backwards-compatibility shims**: The cache helper *replaces* the cache miss path inside `compileProductionSpec`; the prior in-process cache is retained alongside it (a different layer, not a shim). The env-var opt-out (`LUDOFORGE_GAMEDEF_CACHE=off`) is a debugging escape hatch, not a long-term toggle, and is removed at Phase 3 completion per Spec §5 F14 row.
4. **Foundation 8 (Determinism)**: Cache content is byte-identical to a fresh compile because GameDef is plain JSON and we use `JSON.stringify` with no replacer/spacing. Two writers racing on the same key write identical bytes; atomic rename ensures readers always see complete content. Equivalence is *proven* in ticket 003, not assumed here.
5. **Foundation 13 (Artifact Identity)**: The cache file name encodes `<gameKey>.<sourceFingerprint>.<cacheFormatVersion>.gamedef.json` — every required identity field is in the path, so a stale or mismatched artifact is unreachable.

## What to Change

### 1. New module: `packages/engine/test/helpers/gamedef-cache.ts`

Exports:

```ts
export interface GameDefCacheKey {
  readonly gameKey: string;            // derived from entrypoint basename (e.g. 'fire-in-the-lake')
  readonly sourceFingerprint: string;  // bundle.sourceFingerprint
  readonly cacheFormatVersion: string; // module-internal constant 'v1'
}

export interface CachedGameDefEntry {
  readonly gameDef: GameDef;
  readonly sourceFingerprint: string;
  readonly compilerStamp: string;
}

export const GAMEDEF_CACHE_FORMAT_VERSION: 'v1';
export function readGameDefCache(key: GameDefCacheKey): CachedGameDefEntry | null;
export function writeGameDefCache(key: GameDefCacheKey, entry: CachedGameDefEntry): void;
export function clearGameDefCache(): void; // test utility
export function deriveGameKeyFromEntrypoint(entrypointPath: string): string;
```

Implementation requirements:

- **Cache directory**: resolved relative to the engine package root → `packages/engine/dist/.cache/`. Use `resolveRepoRoot()` style logic already present in `production-spec-helpers.ts:26-39`, then join `packages/engine/dist/.cache`. Create with `mkdirSync(..., { recursive: true })` on first write.
- **Cache file name**: `<gameKey>.<sourceFingerprint>.<cacheFormatVersion>.gamedef.json`.
- **Compiler stamp**: at first call within a process, compute sha256 over the contents of `packages/engine/dist/src/cnl/staged-pipeline.js`. Memoize in module-level `let`. On read, if the file's stamp does not match the cached entry's `compilerStamp`, return `null` (treat as miss). On write, embed the current stamp.
- **Atomic write**: `writeFileSync(tempPath, JSON.stringify(entry))` then `renameSync(tempPath, finalPath)`. `tempPath` includes `process.pid` and a random suffix to avoid collisions: `<final>.<pid>.<random>.tmp`.
- **Env-var opt-out**: `process.env.LUDOFORGE_GAMEDEF_CACHE === 'off'` → `readGameDefCache` returns `null`, `writeGameDefCache` is a no-op. Read once per call; do not memoize, so tests can toggle within a process.
- **Read path**: on miss (file does not exist, `JSON.parse` failure, fingerprint mismatch, compiler-stamp mismatch, format-version mismatch), return `null`. Never throw — a miss must always be safe to fall through to a fresh compile.
- **Game key derivation**: `deriveGameKeyFromEntrypoint(entrypointPath)` strips the `.game-spec.md` suffix and returns the basename: `data/games/fire-in-the-lake.game-spec.md` → `fire-in-the-lake`.
- **No imports** from `kernel/runtime` modules with side effects. Import only `GameDef` type and any pure utilities.

### 2. Rewire `compileProductionSpec` in `packages/engine/test/helpers/production-spec-helpers.ts`

Modified flow (FITL):

1. `loadFitlBundle()` (existing).
2. Check existing in-process cache (existing) — short-circuit if `cachedFitlBundle?.sourceFingerprint === bundle.sourceFingerprint`.
3. **New**: probe persistent cache via `readGameDefCache({ gameKey: deriveGameKeyFromEntrypoint(FITL_PRODUCTION_ENTRYPOINT_PATH), sourceFingerprint: bundle.sourceFingerprint, cacheFormatVersion: GAMEDEF_CACHE_FORMAT_VERSION })`.
4. **On hit**: run `assertValidatedGameDef` on the cached `GameDef`. If validation throws, treat as miss and fall through. Otherwise build the `CompiledProductionSpec` shape using the cached GameDef. The fields `markdown`, `parsed`, and `validatorDiagnostics` come from the bundle and a single fresh `runGameSpecStagesFromBundle` *only when callers need them* — see step 6.
5. **On miss**: run `runGameSpecStagesFromBundle(bundle)` (existing), call `requireSuccessfulProductionCompilation` (existing), then `writeGameDefCache(...)` with the resulting GameDef and the current `compilerStamp`.
6. **Return shape preservation**: callers of `compileProductionSpec` consume `markdown`, `parsed`, `validatorDiagnostics`, and `compiled.gameDef`. The cache only stores `gameDef`. To preserve the existing return shape on cache hit, retain a single call to `runGameSpecStagesFromBundle` *only when the caller's accessor demands the non-GameDef fields*. Concretely: keep the cheap-but-not-free pipeline call on cache hit so `parsed`/`validatorDiagnostics` remain populated. The savings come from skipping the *compile* stage; parse + validate are not the dominant cost.
   - **Implementation note**: factor `requireSuccessfulProductionCompilation` so it can validate a cached `gameDef` directly (skipping the `staged.compilation` block when a cached GameDef is supplied). Or keep the existing function unchanged and run a partial pipeline only for parse + validation diagnostics on hit. Choose the option that keeps changes localized to `production-spec-helpers.ts`.
7. **Same wiring for `compileTexasProductionSpec`** (`production-spec-helpers.ts:151-168`): identical structure with Texas constants.

The existing in-process caches (`cachedFitlResult`, `cachedTexasResult`) remain — they still deduplicate within a process. The persistent cache deduplicates across processes.

### 3. Unit tests: `packages/engine/test/unit/helpers/gamedef-cache.test.ts`

Test class: `architectural-invariant`. Cover all five contract paths with synthetic GameDef objects (do not require a real production compile in unit tests):

1. **Read/write happy path**: write entry, read same key, deep-equal returned `gameDef`.
2. **Fingerprint mismatch**: write entry under fingerprint A, read with key carrying fingerprint B → `null`.
3. **Compiler-stamp mismatch**: write entry, then mutate `dist/src/cnl/staged-pipeline.js` (or use a stub/factory that injects a different stamp); read returns `null`.
4. **Format-version mismatch**: write entry under `cacheFormatVersion: 'v1'`, read with `cacheFormatVersion: 'v0'` → `null`.
5. **Env-var opt-out**: with `LUDOFORGE_GAMEDEF_CACHE=off`, `readGameDefCache` returns `null` even for a valid file; `writeGameDefCache` does not create a file.
6. **Atomic write**: assert that during a `writeGameDefCache` call, no file at the final path exists with partial content (mock `renameSync` to fail, verify final path is unchanged and temp file is cleaned up — best-effort if temp cleanup is implementation-dependent).
7. **`clearGameDefCache`**: removes the cache directory contents (or removes only the helper-managed files; choose the simpler of the two).
8. **`deriveGameKeyFromEntrypoint`**: covers `.game-spec.md` suffix stripping for both production paths.

Use `node --test` matching the rest of the engine unit-test suite. Place fixtures under a tmpdir created with `mkdtempSync(join(tmpdir(), 'gamedef-cache-test-'))` so the real `dist/.cache/` is untouched. Inject the cache directory via either an exported test seam (e.g., a function-level override) or by setting an env var like `LUDOFORGE_GAMEDEF_CACHE_DIR` (lighter-weight; choose this if it does not conflict with the opt-out var). If introducing the override, document it as a test-only seam in the helper module.

## Files to Touch

- `packages/engine/test/helpers/gamedef-cache.ts` (new)
- `packages/engine/test/helpers/production-spec-helpers.ts` (modify — `compileProductionSpec`, `compileTexasProductionSpec`, optionally factor `requireSuccessfulProductionCompilation`)
- `packages/engine/test/unit/helpers/gamedef-cache.test.ts` (new)

## Out of Scope

- CI workflow changes — owned by ticket 002.
- Equivalence and invalidation integration tests over the real production spec — owned by ticket 003.
- Cumulative cost measurement script — owned by ticket 004.
- Cache for non-production specs (unit-test inline GameSpecDocs, fixture-based compiles, schema-validation harnesses) — explicitly excluded by Spec §7.
- Cache compression — explicitly excluded by Spec §7.
- Removing the env-var opt-out — Spec §5 F14 row says it is removed at Phase 3 completion; that closure happens in a follow-up after ticket 003 lands. Do not remove it here.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/helpers/gamedef-cache.test.ts` — all eight contract paths green.
2. Existing engine unit suite: `pnpm -F @ludoforge/engine test:unit` — no regression.
3. Existing engine integration suite: `pnpm -F @ludoforge/engine test:integration` — no regression with the cache enabled (default).
4. With `LUDOFORGE_GAMEDEF_CACHE=off`, the integration suite still passes (cache entirely disabled, falls back to existing compile path).

### Invariants

1. Cache content is byte-identical to a fresh compile (canonical-JSON equality). Proven later in ticket 003; the helper's serialization (`JSON.stringify(entry)` with no replacer or spacing) MUST be the only serialization path.
2. `assertValidatedGameDef` runs on every cache hit before the GameDef leaves the helper.
3. The cache helper contains no game-specific identifiers. It is generic over GameDef (Foundation 1).
4. A miss never throws — every failure mode (missing file, parse error, mismatch) returns `null` so the caller falls back to a fresh compile.
5. Two concurrent writers racing on the same key cannot leave the cache in a partially-written state visible to a reader (atomic write-temp-rename).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/helpers/gamedef-cache.test.ts` — class `architectural-invariant`. Covers read/write hit, fingerprint mismatch, compiler-stamp mismatch, format-version mismatch, env-var opt-out, atomic-write isolation, `clearGameDefCache`, `deriveGameKeyFromEntrypoint`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test:integration:fitl-rules` (verify cache hits on second run; first run is a miss-then-write, second run is hits)
4. `LUDOFORGE_GAMEDEF_CACHE=off pnpm -F @ludoforge/engine test:integration:fitl-rules` (verify opt-out fallback path is healthy)
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`
7. `pnpm turbo test`

## Outcome

Completion date: 2026-05-05

**Durable state**: COMPLETED.

### What Landed

- Added `packages/engine/test/helpers/gamedef-cache.ts` with deterministic cache file naming, compiler-stamp validation, atomic temp-file write/rename, `LUDOFORGE_GAMEDEF_CACHE=off`, test-only `LUDOFORGE_GAMEDEF_CACHE_DIR`, cache clearing, and entrypoint-derived game keys.
- Rewired `compileProductionSpec` and `compileTexasProductionSpec` to check the in-process cache first, then the persistent cache, then the existing fresh compile path on miss.
- Cache hits run `assertValidatedGameDef` before returning the cached GameDef and reconstruct the existing `CompileResult.sections` shape from the validated GameDef so existing production helper consumers keep their current return contract.
- Added `packages/engine/test/unit/helpers/gamedef-cache.test.ts` covering the eight Phase 1 helper contract paths.

### Ticket Corrections Applied

- Draft cache-hit note said to preserve return shape through `runGameSpecStagesFromBundle` on hit; live code showed that function always runs compilation. The implemented hit path instead uses `validateGameSpec` for parse/validation diagnostics and uses the cached validated GameDef for the compile result, preserving the ticket's cross-process compile-skip deliverable.
- `LUDOFORGE_GAMEDEF_CACHE_DIR` is documented here as a test-only seam for unit isolation. It does not change production cache layout, which remains `packages/engine/dist/.cache/`.

### Verification

- `pnpm -F @ludoforge/engine build` — pass.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/helpers/gamedef-cache.test.js` — pass, 8/8 tests.
- `pnpm -F @ludoforge/engine test:unit` — initial sandbox run hit `spawnSync /bin/sh EPERM` only in `walker-deletion-enforcement.test.js`; direct unsandboxed rerun of that file passed; full unsandboxed rerun passed 5503/5503 tests.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/compiler-structured-results-production.test.js dist/test/integration/production-spec-strict-binding-regression.test.js` — pass.
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` — pass, 79/79 files with cache enabled.
- `LUDOFORGE_GAMEDEF_CACHE=off pnpm -F @ludoforge/engine test:integration:fitl-rules` — pass, 79/79 files with cache disabled.
- `pnpm turbo lint` — pass.
- `pnpm turbo typecheck` — pass; this command rebuilt `packages/engine/dist`, so the final closeout reruns the narrow compiled-output proofs after this ticket update.
- Post-typecheck final rerun: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/helpers/gamedef-cache.test.js dist/test/integration/compiler-structured-results-production.test.js dist/test/integration/production-spec-strict-binding-regression.test.js` — pass, 12/12 tests.
- `pnpm turbo build` — pass.
- `pnpm turbo test` — pass.
- Post-Turbo final rerun: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/helpers/gamedef-cache.test.js dist/test/integration/compiler-structured-results-production.test.js dist/test/integration/production-spec-strict-binding-regression.test.js` — pass, 12/12 tests.

### Schema / Artifact Fallout

- No schema, golden, or checked-in generated artifact changes are expected or present. `packages/engine/dist/.cache/` is build output only and remains under `dist`.

### Deferred Spec 155 Scope

- CI warm-step integration remains ticket 002.
- Real production cache equivalence/invalidation tests remain ticket 003.
- Direct production persistent-cache read activation proof remains ticket 003; this Phase 1 closeout proves the helper contract, integration wiring, and fallback health, but does not claim the later cross-process production hit witness as landed here.
- Cumulative lane-cost measurement remains ticket 004.

### Late-Edit Proof Validity

- Late edits before final closeout: this outcome block, the final status line, and transcription of the post-typecheck and post-Turbo final rerun results.
- Proof invalidation: the outcome block changed the ticket proof ledger, so the narrow compiled-output proofs were rerun after it. Turbo build/test were then run and the same narrow compiled-output proofs were rerun again afterward. The final status/result transcription is status-and-evidence-only after those reruns and does not change code, scope, commands, thresholds, dependency ownership, or acceptance boundaries.
