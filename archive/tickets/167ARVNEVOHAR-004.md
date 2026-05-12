# 167ARVNEVOHAR-004: Campaign-local GameDef disk cache

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — campaign-local cache module + test only
**Deps**: `specs/167-arvn-evolution-harness-performance.md`

## Problem

`campaigns/fitl-arvn-agent-evolution/run-tournament.mjs:317-318` calls `loadGameSpecBundleFromEntrypoint(entrypoint)` followed by `runGameSpecStagesFromBundle(bundle)` on every invocation. The FITL spec content does not change between most evolution experiments — mutations live in `data/games/fire-in-the-lake/agents/92-agents.md` (policy YAML) only — yet the parse + macro-expand + validate + compile pipeline pays the same multi-second cost each run. The engine ships an internal cache for test helpers at `packages/engine/test/helpers/gamedef-cache.ts` (keyed on source fingerprint + compiler stamp), but no campaign caller consumes it. The campaign needs its own cache keyed in a way that captures both spec content changes and engine commit changes, with fail-safe invalidation on either axis.

## Assumption Reassessment (2026-05-12)

1. `loadGameSpecBundleFromEntrypoint` and `runGameSpecStagesFromBundle` are exported from `packages/engine/dist/src/cnl/index.js`. Confirmed at `run-tournament.mjs:42-43`.
2. `createGameDefRuntime` at `run-tournament.mjs:51,343` accepts a `GameDef` and produces a fresh `GameDefRuntime`. Per spec §3.3, the cache stores the compiled `GameDef` JSON only; runtime structural members are reconstructed by re-invoking `createGameDefRuntime(def)` on cache hit (cheap pure function of `def`).
3. The campaign-local cache directory `campaigns/fitl-arvn-agent-evolution/.gamedef-cache/` does not currently exist. Add it to the campaign's `.gitignore` (or root `.gitignore` if a campaign-level one is missing) in the same change.
4. The engine commit SHA can be obtained inside campaign code via `child_process.execFileSync('git', ['rev-parse', 'HEAD'])` against `REPO_ROOT`. Spec §3.3 mentions `packages/engine/dist/version.js` "or equivalent" — direct `git rev-parse` is the equivalent and keeps engine code untouched (Foundation #1 alignment).
5. `loadGameSpecBundleFromEntrypoint` reads the entrypoint at `data/games/fire-in-the-lake.game-spec.md` and follows include directives to other `.md` files. The cache-key content hash MUST cover all files the bundle loader would read, not just the entrypoint. A cheap approach: walk the bundle's reported source files after one cache-miss compile and persist their absolute paths inside the cache entry; on cache lookup, hash the current contents of those paths and compare. Alternative: hash every `*.md` under `data/games/fire-in-the-lake/` recursively. Implementer chooses the cheaper of the two during the cache-miss path — but the hash MUST be deterministic across machines (sorted file list, byte-level hash).
6. The result JSON written by `run-tournament.mjs:535-550` does not currently include a `gamedefCacheHit` field. Spec §7 mandates adding it.
7. The engine-side helper cache (`packages/engine/test/helpers/gamedef-cache.ts`) provides a precedent shape (key = `gameKey + sourceFingerprint + cacheFormatVersion`, atomic temp-file write, env-var disable). The campaign cache adopts the same atomic-write discipline but lives entirely in campaign code; it does not import from the test helper.

## Architecture Check

1. **Foundation #1 (Engine Agnosticism)**: cache module lives at `campaigns/fitl-arvn-agent-evolution/gamedef-cache.mjs` (campaign-local code, not engine code). Engine code is untouched. The engine-commit-sha capture uses `git rev-parse` from campaign code — no engine-side version constant is introduced, avoiding a per-game generated artifact in engine `dist/`.
2. **Foundation #8 (Determinism Is Sacred)**: cache hit MUST produce a byte-identical `GameDef` to cache miss. Tested explicitly by the new invalidation test below (`JSON.stringify(cacheHitDef) === JSON.stringify(cacheMissDef)`).
3. **Foundation #14 (No Backwards Compatibility)**: cache is additive; no legacy code path is preserved. A `LUDOFORGE_GAMEDEF_CACHE=off` env var (matching the engine helper convention at `packages/engine/test/helpers/gamedef-cache.ts:97`) lets diagnostic runs bypass the cache without keeping a code-level toggle.
4. **Foundation #15 (Architectural Completeness)**: cache invalidates on either spec content OR engine commit change — both axes that can produce a different compiled `GameDef`. A future engine refactor that changes compilation output but not the spec is caught by the engine-commit-sha component of the key.
5. **No backwards-compat aliasing**: cache file format is `v1` (campaign-local format version, independent of the engine helper's `v2`); a future format change increments the version, and stale-format files are treated as cache miss + overwrite.

## What to Change

### 1. New campaign-local cache module

Create `campaigns/fitl-arvn-agent-evolution/gamedef-cache.mjs`:

- Exports `loadOrCompileGameDef({ entrypoint, repoRoot, compileFn })`: returns `{ def, cacheHit: boolean }`.
- Cache key derivation (per spec §3.3):
  - `specSourceContentHash`: SHA-256 over the sorted-by-path list of `(absolutePath, contentBytes)` for every `.md` file the spec bundle reads. First call (cache miss) records the set of paths into the cache entry's `sources` field; subsequent calls hash the recorded paths' current contents.
  - `engineCommitSha`: `execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })`, trimmed.
  - `cacheKey = sha256(specSourceContentHash || engineCommitSha || cacheFormatVersion)`.
- Cache directory: `campaigns/fitl-arvn-agent-evolution/.gamedef-cache/`. Cache file: `<cacheKey>.gamedef.json`.
- Atomic write: write to `<path>.<pid>.<random>.tmp`, then `renameSync` (mirrors `packages/engine/test/helpers/gamedef-cache.ts:64-83`).
- Disable env var: `LUDOFORGE_CAMPAIGN_GAMEDEF_CACHE=off` short-circuits both read and write.
- The persisted entry shape: `{ def: GameDef, sources: string[], specSourceContentHash: string, engineCommitSha: string, cacheFormatVersion: 'v1' }`.

### 2. Wire the cache into `run-tournament.mjs`

In `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`, replace the unconditional compile at lines 316-340 with a call to `loadOrCompileGameDef`:

- Cache miss: run the existing `loadGameSpecBundleFromEntrypoint` + `runGameSpecStagesFromBundle` pipeline, persist the result.
- Cache hit: deserialize and pass through `assertValidatedGameDef` (the validation step is cheap and ensures cache-file tampering or version skew surfaces as a typed error).
- Capture `cacheHit: boolean` for inclusion in the result JSON.

### 3. Extend the result JSON with `gamedefCacheHit`

In the `result` object at `run-tournament.mjs:535-550`, add `gamedefCacheHit: <boolean>`. Per spec §7 this field is reproducibility metadata; it MUST NOT affect `compositeScore`.

### 4. New unit test for cache-key invalidation

Add `campaigns/fitl-arvn-agent-evolution/__tests__/gamedef-cache.test.mjs` (new directory `__tests__/`):

- Test fixture: a minimal spec source tree under a tmpdir.
- Test class header: `// @test-class: architectural-invariant` (the invariant is "cache hit produces byte-identical `GameDef` to cache miss" — a property over any spec content + engine commit pair, not a witness for a specific trajectory).
- Matrix (per spec §4 Phase 1):
  - Spec content change → cache miss.
  - Spec content unchanged + engine commit changed → cache miss.
  - Spec content unchanged + engine commit unchanged → cache hit.
  - Cache-hit `GameDef` is `JSON.stringify`-equal to cache-miss `GameDef`.
- The live campaign has no Vitest, TypeScript, or package-local test runner, so this ticket uses the authorized default: `node --test` with `.mjs` extension (no compile step required for campaign code).

### 5. Gitignore the cache directory

Add `campaigns/fitl-arvn-agent-evolution/.gamedef-cache/` to the appropriate `.gitignore`. Verify which gitignore is in scope (campaign-level, repo-root) during implementation.

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/gamedef-cache.mjs` (new)
- `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` (modify — compile site + result JSON)
- `campaigns/fitl-arvn-agent-evolution/__tests__/gamedef-cache.test.mjs` (new)
- `campaigns/fitl-arvn-agent-evolution/.gitignore` (modify — add `.gamedef-cache/` entry)

## Out of Scope

- Generalizing the cache to other campaigns (spec §10 — out of scope; if a second campaign needs it, extract at that point).
- Generating a `packages/engine/dist/version.js` constant (spec §3.3 says "or equivalent"; this ticket uses `git rev-parse` directly from campaign code to keep engine code untouched).
- Sharing the cache with the engine-test-helper cache at `packages/engine/test/helpers/gamedef-cache.ts` (different key derivations, different invalidation rules, different scopes — intentional separation).
- WASM bootstrap, trace defaults, build script, worker pool (tickets 001, 002, 003, 005).

## Acceptance Criteria

### Tests That Must Pass

1. `campaigns/fitl-arvn-agent-evolution/__tests__/gamedef-cache.test.mjs` — the four-cell invalidation matrix above.
2. Existing suite: `pnpm -F @ludoforge/engine test` continues to pass.
3. Manual: first invocation of `SEED_COUNT=1 bash campaigns/fitl-arvn-agent-evolution/harness.sh` writes `"gamedefCacheHit":false`; the immediately-subsequent invocation (no source change) writes `"gamedefCacheHit":true` and runs measurably faster on the compile phase.
4. Manual: editing any `.md` file under `data/games/fire-in-the-lake/` and re-running causes the next invocation to write `"gamedefCacheHit":false`.

### Invariants

1. **Byte-identical determinism**: `JSON.stringify(cacheHitDef) === JSON.stringify(cacheMissDef)` for the same spec content + engine commit. Asserted by test (4).
2. **Two-axis invalidation**: cache MUST miss on spec-content change AND on engine-commit change. Asserted by the test matrix.
3. **Atomic write safety**: concurrent invocations cannot produce a corrupt cache file. Atomic temp-file + rename is mandatory; on rename failure, the temp file is removed and the cache miss path runs normally.
4. **Environment opt-out**: `LUDOFORGE_CAMPAIGN_GAMEDEF_CACHE=off` short-circuits both read and write, falling back to the existing compile pipeline. This is the diagnostic escape hatch for any unexpected cache corruption.

## Test Plan

### New/Modified Tests

1. `campaigns/fitl-arvn-agent-evolution/__tests__/gamedef-cache.test.mjs` — architectural-invariant; asserts cache-key invalidation across spec content and engine commit, plus byte-identity of hit vs. miss outputs.

### Commands

1. Run the cache test in isolation (command depends on chosen runner; default: `node --test campaigns/fitl-arvn-agent-evolution/__tests__/gamedef-cache.test.mjs` or Vitest equivalent).
2. `pnpm -F @ludoforge/engine test` (full engine suite — regression parity; cache touches only campaign code so engine tests are unaffected).
3. Manual cache-warmth validation: `time bash campaigns/fitl-arvn-agent-evolution/harness.sh` twice; second run shows reduced compile-phase wall-time.
4. `pnpm turbo lint && pnpm turbo typecheck` (clean checks).

## Outcome

Completion date: 2026-05-12.

### Implementation Notes

- Added `campaigns/fitl-arvn-agent-evolution/gamedef-cache.mjs`, a campaign-local compiled-GameDef cache keyed by deterministic spec-source content hash, git commit SHA, and cache format version `v1`.
- The cache persists `{ def, sources, specSourceContentHash, engineCommitSha, cacheFormatVersion }` under `campaigns/fitl-arvn-agent-evolution/.gamedef-cache/` and writes entries through a temp file followed by `renameSync`; cache-write failures are best-effort accelerators and still return the freshly compiled `GameDef`.
- `run-tournament.mjs` now loads the FITL `GameDef` through the cache, validates the hit/miss result through the existing `assertValidatedGameDef` path after any profile override, logs `GameDef cache: hit|miss`, and emits `gamedefCacheHit` in the final JSON metadata without changing `compositeScore`.
- Added the campaign `.gitignore` entry for `.gamedef-cache/`.
- Test path correction: the live campaign has no package-local Vitest or TypeScript test runner, so the ticket-authorized Node runner path is `campaigns/fitl-arvn-agent-evolution/__tests__/gamedef-cache.test.mjs` rather than the draft `.test.ts` filename.
- Deferred sibling scope: worker-thread sharding remains `tickets/167ARVNEVOHAR-005.md`; the post-Spec-167 baseline report remains `tickets/167ARVNEVOHAR-006.md`.
- Runtime surface breadth: campaign-local/script-only; no engine kernel, compiler, schema, or generated artifact behavior changed.
- Source-size ledger: `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs | 622 | 640 | no | minimal cache-wiring growth only | cache logic extracted to new module, no further extraction justified | none`.

### Verification

- `node --test campaigns/fitl-arvn-agent-evolution/__tests__/gamedef-cache.test.mjs` — passed; proves the source-change miss, engine-commit miss, same-content hit, byte-identical hit/miss `GameDef`, and opt-out no-read/no-write behavior.
- `node --check campaigns/fitl-arvn-agent-evolution/gamedef-cache.mjs` — passed.
- `node --check campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` — passed.
- `node --check campaigns/fitl-arvn-agent-evolution/__tests__/gamedef-cache.test.mjs` — passed.
- `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 0 --no-wasm --trace-default none` — passed twice against built engine artifacts; first run emitted `"gamedefCacheHit":false`, second emitted `"gamedefCacheHit":true`. This is a bounded runner metadata/cache-wiring smoke, not a replacement for the manual `SEED_COUNT=1` harness warmth lane.
- `pnpm -F @ludoforge/engine test` — passed; schema artifact check plus default lane summary `66/66 files passed`.
- `pnpm turbo lint` — passed; `2 successful, 2 total`.
- `pnpm turbo typecheck` — passed; `3 successful, 3 total`.
- Cold manual cache-warmth lane after clearing the ignored campaign cache: `SEED_COUNT=1 bash campaigns/fitl-arvn-agent-evolution/harness.sh` — passed; `completed=1`, `truncated=0`, `errors=0`; `run.log.runner` emitted `"gamedefCacheHit":false`.
- Immediate warm manual cache-warmth lane: `SEED_COUNT=1 bash campaigns/fitl-arvn-agent-evolution/harness.sh` — passed; `completed=1`, `truncated=0`, `errors=0`; `run.log.runner` emitted `"gamedefCacheHit":true`.
- Post-review production source-change validation: after a warm zero-seed smoke emitted `"gamedefCacheHit":true`, temporarily changed `data/games/fire-in-the-lake/00-metadata.md`, reran `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 0 --no-wasm --trace-default none`, and confirmed it compiled with `"gamedefCacheHit":false`; restored the source file afterward and confirmed no data-file diff remained.
- `pnpm run check:ticket-deps` — passed after terminal status update; `3 active tickets and 2312 archived tickets`.

### Invariant Proof Matrix

| Invariant | Witness/assertion | Status | Proof lane |
|---|---|---|---|
| Byte-identical determinism | Cache-hit `GameDef` JSON equals the cache-miss `GameDef` JSON for the same spec content and engine commit | proven | focused cache unit test |
| Two-axis invalidation | Spec content change and engine commit change both produce cache misses | proven | focused cache unit test |
| Atomic write safety | Cache entries are written to a unique temp path and renamed into place; failed writes remove the temp file and return the compiled `GameDef` | proven structurally | cache module implementation + syntax checks |
| Environment opt-out | `LUDOFORGE_CAMPAIGN_GAMEDEF_CACHE=off` bypasses source loading, cache read, and cache write, then compiles normally | proven | focused cache unit test |

### Closeout Notes

- Ticket corrections applied: draft `.test.ts` campaign test path -> live `.test.mjs` Node test path because no campaign TypeScript/Vitest runner exists.
- Generated/artifact fallout: no schemas, goldens, or checked-in generated artifacts changed. The campaign `.gamedef-cache/` directory is ignored runtime output.
- Late-edit proof validity: terminal status, path correction, proof transcription, source-size ledger, and dependency-check transcription only after final lanes; no code, test, command semantics, acceptance boundary, dependency owner, or follow-up scope changed after the cited proof lanes.
