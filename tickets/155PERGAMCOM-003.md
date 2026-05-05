# 155PERGAMCOM-003: Cache equivalence and invalidation invariant tests

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — integration tests only
**Deps**: `archive/tickets/155PERGAMCOM-001.md`

## Problem

Spec 155 §3 (Determinism Contract) commits the cache to two non-negotiable properties:

1. **Cache content is byte-identical to a fresh compile.** The cache is purely an accelerator; a hit must produce the exact same GameDef as a miss-then-compile.
2. **Source mutation invalidates the cache.** Changing any byte of the GameSpecDoc source markdown changes `sourceFingerprint`, and the cache key changes with it — so a stale GameDef can never be served after a content change.

Spec §6 acceptance criteria 2 and 3 require these to be *proven*, not assumed (Foundation 16: Testing as Proof). Foundation 8 (Determinism) requires byte-identity across cache disabled vs enabled paths.

This ticket also owns the direct production persistent-cache read activation witness deferred from ticket 001: the real production helper must show a miss/write followed by a persistent cache read, not merely a green correctness suite that could have passed through the fresh-compile fallback.

This ticket delivers both proofs as architectural-invariant integration tests under `packages/engine/test/integration/`.

## Assumption Reassessment (2026-05-05)

1. After ticket 001 lands, `compileProductionSpec` and `compileTexasProductionSpec` consult the persistent cache and `LUDOFORGE_GAMEDEF_CACHE=off` disables both reading and writing. The equivalence test toggles the env var across two compile runs to compare cache-disabled vs cache-enabled GameDefs.
2. `JSON.stringify` with no replacer or spacing is the canonical-JSON encoding ticket 001 commits to. Equivalence is asserted by `JSON.stringify(a) === JSON.stringify(b)` over the two GameDef trees.
3. `sourceFingerprint` is computed from source paths *and* markdown content (`load-gamespec-source.ts:103-110`). Mutating either invalidates the cache. The invalidation test mutates a copy of the FITL spec in a tmpdir and runs the bundle loader against the copy — this changes both the path and the content, but path-only mutation is enough to confirm the invalidation contract for this ticket. Content-only mutation is the more interesting case and is what the test asserts.
4. `loadGameSpecBundleFromEntrypoint` accepts an arbitrary entrypoint path (it does not hard-code FITL/Texas paths), so the test can point it at a tmpdir copy. Confirmed at `load-gamespec-source.ts:45`.
5. Integration tests live under `packages/engine/test/integration/` and run via `node --test` against compiled JS. They are picked up by lane manifests in `packages/engine/scripts/test-lane-manifest.mjs`. New `gamedef-cache-*.test.ts` files default to the `integration:core` lane unless explicitly assigned elsewhere; verify membership when authoring (and add to the manifest if required).

## Architecture Check

1. **Cleaner than alternatives**: An alternative is to assert equivalence inside a unit test using a synthetic GameDef. That doesn't actually exercise the production compile path or the real `sourceFingerprint`. The integration tests prove the contract over the real production specs (FITL and Texas) — exactly the artifacts the cache serves.
2. **Both tests are `architectural-invariant`**: They prove properties that must hold for every legitimate cache state, not properties of a specific seed or trajectory. Authoring default per `.claude/rules/testing.md`.
3. **GameSpecDoc / GameDef boundary preserved**: Tests consume the existing helpers and the public `loadGameSpecBundleFromEntrypoint`. They do not introduce new schema types or game-specific branches.
4. **No backwards-compatibility shims**: New test files only.
5. **Foundation 8 (Determinism)**: Byte-identity proof is the canonical determinism witness for the cache layer.
6. **Foundation 16 (Testing as Proof)**: Spec §6 acceptance criteria 2 and 3 demand proof; this ticket provides it.

## What to Change

### 1. New test: `packages/engine/test/integration/gamedef-cache-equivalence.test.ts`

```ts
// @test-class: architectural-invariant
```

Steps:

1. Clear any existing in-process and persistent cache state (`clearGameDefCache()` helper from ticket 001 + reset module-level in-process cache vars by re-importing or via a test-only reset hook).
2. With `process.env.LUDOFORGE_GAMEDEF_CACHE = 'off'`, call `compileProductionSpec()` and capture `gameDefDisabled = result.compiled.gameDef`.
3. Re-import (or reset module state) and remove the env var. Call `compileProductionSpec()` twice — first call is a cache miss + write, second call is a hit. Capture `gameDefMissThenCompile` (first call) and `gameDefHit` (second call).
4. Assert `JSON.stringify(gameDefDisabled) === JSON.stringify(gameDefMissThenCompile)` (cache-write path matches cache-disabled path).
5. Assert `JSON.stringify(gameDefHit) === JSON.stringify(gameDefDisabled)` (cache-read path matches cache-disabled path).
6. Repeat the entire flow for `compileTexasProductionSpec`.

Notes:

- Resetting the in-process cache between calls may require a test seam exported from `production-spec-helpers.ts` (e.g., `__resetProductionSpecCacheForTests`). Add it in this ticket if ticket 001 did not. Mark it test-only in a JSDoc comment; do not export from a non-test entry point.
- The test must not depend on absolute paths beyond what `production-spec-helpers.ts` already resolves via `resolveRepoRoot()`.

### 2. New test: `packages/engine/test/integration/gamedef-cache-invalidation.test.ts`

```ts
// @test-class: architectural-invariant
```

Steps:

1. Create a tmpdir via `mkdtempSync(join(tmpdir(), 'gamedef-cache-invalidation-'))`.
2. Copy `data/games/fire-in-the-lake.game-spec.md` and its imports to the tmpdir, preserving relative structure. (Use a small subset if a complete copy is too large; the assertion only needs *one* compilable spec the test can mutate.) Alternative: use a minimal GameSpecDoc fixture under `packages/engine/test/fixtures/cnl/compiler/` that already compiles to a valid GameDef. Either approach is acceptable; the minimal-fixture approach is faster and more isolated.
3. Call `loadGameSpecBundleFromEntrypoint(tmpEntrypointPath)` and `runGameSpecStagesFromBundle(bundle)` to produce the first GameDef. Then directly call `writeGameDefCache({ gameKey, sourceFingerprint: bundle.sourceFingerprint, cacheFormatVersion: GAMEDEF_CACHE_FORMAT_VERSION }, { gameDef, sourceFingerprint, compilerStamp })`. Confirm a subsequent `readGameDefCache` returns the entry.
4. Mutate the spec markdown in the tmpdir (append a comment, change a numeric value in YAML, anything that changes one byte). Re-load the bundle. Assert `bundle.sourceFingerprint` differs from the prior fingerprint.
5. Call `readGameDefCache` with the *new* fingerprint → assert `null` (cache miss).
6. Call `readGameDefCache` with the *old* fingerprint → assert non-null but a follow-up `assertValidatedGameDef` on the cached GameDef *plus* a re-compile from the new source produces a different GameDef. (This proves the old cache entry, while still readable by key, is not what the new content compiles to — i.e., the key-on-content scheme prevents stale serves under the production code path.)
7. Tear down the tmpdir.

### 3. Lane-manifest membership

Verify the two new test files are picked up by the lane that runs them. If `packages/engine/scripts/test-lane-manifest.mjs` enumerates integration tests by glob, no change is needed. If it enumerates them by name, add both files to the appropriate lane (likely `integration:core`).

## Files to Touch

- `packages/engine/test/integration/gamedef-cache-equivalence.test.ts` (new)
- `packages/engine/test/integration/gamedef-cache-invalidation.test.ts` (new)
- `packages/engine/scripts/test-lane-manifest.mjs` (modify *only if* it enumerates tests by name; otherwise unchanged)
- `packages/engine/test/helpers/production-spec-helpers.ts` (modify only if a test-only `__resetProductionSpecCacheForTests` seam is needed and was not added in ticket 001)

## Out of Scope

- Cache helper code — owned by ticket 001.
- CI workflow integration — owned by ticket 002.
- Cumulative cost measurement script — owned by ticket 004.
- Performance assertions (the equivalence/invalidation tests do not assert wall-clock budgets; that is ticket 004's domain).
- Cache invalidation for engine code changes outside the compiler entry — explicitly excluded by Spec §7. The compiler stamp covers `staged-pipeline.js`, and `pnpm clean` removes `dist/.cache/` for kernel-only changes that affect GameDef shape.

## Acceptance Criteria

### Tests That Must Pass

1. `gamedef-cache-equivalence.test.ts` — both FITL and Texas: cache-disabled, cache-write, and cache-read GameDefs are byte-identical under `JSON.stringify` with no replacer/spacing, and the cache-read assertion proves the persistent read route was exercised rather than satisfied by the in-process cache or fresh-compile fallback.
2. `gamedef-cache-invalidation.test.ts` — source-content mutation produces a different `sourceFingerprint`; reading under the new fingerprint returns `null`; the new compile produces a GameDef that differs from the old cached GameDef.
3. Existing engine integration suite: `pnpm -F @ludoforge/engine test:integration` — no regression.
4. Both new tests classified `architectural-invariant` per `.claude/rules/testing.md`.

### Invariants

1. **Byte-identity**: cache content equals a fresh compile, byte for byte, for every production spec the helper warms.
2. **Content-keyed invalidation**: any byte mutation in the GameSpecDoc source markdown changes the cache key, so a stale GameDef is unreachable through the helper after content changes.
3. **No flaky tests**: the equivalence test does not rely on timing or process-order side effects beyond what `clearGameDefCache` and the in-process reset seam guarantee.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/gamedef-cache-equivalence.test.ts` — class `architectural-invariant`. Proves Spec §3 contract 1 and Spec §6 acceptance criterion 2.
2. `packages/engine/test/integration/gamedef-cache-invalidation.test.ts` — class `architectural-invariant`. Proves Spec §3 contract 2 and Spec §6 acceptance criterion 3.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:integration:core` (or whichever lane the two tests are assigned to)
3. `node --test dist/test/integration/gamedef-cache-equivalence.test.js dist/test/integration/gamedef-cache-invalidation.test.js`
4. `pnpm turbo lint`
5. `pnpm turbo test`
