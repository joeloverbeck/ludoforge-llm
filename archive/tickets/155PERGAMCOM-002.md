# 155PERGAMCOM-002: CI cache warm step and `cache:gamedef:warm` package script

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — script + workflow change only
**Deps**: `archive/tickets/155PERGAMCOM-001.md`

## Problem

Phase 1 of Spec 155 (ticket 001) installs a disk-backed gamedef cache, but the cache only fills when a process actually runs `compileProductionSpec` or `compileTexasProductionSpec`. Without an explicit warm step in CI, the *first* test process in each `node --test` lane still pays the ~1.7 s compile cost (only its successors hit the cache). With 11 lanes, that's still ~19 s of redundant first-process compiles per CI run, and the warm cost is multiplied across both FITL and Texas production specs.

Phase 2 fixes this by warming the cache in the `engine-tests.yml` `build` job — once, after `pnpm -F @ludoforge/engine build` and before `Upload engine dist`. Because the existing `actions/upload-artifact@v7` step uploads `packages/engine/dist`, and the cache lives at `packages/engine/dist/.cache/`, the warmed cache rides along to every test job for free. No upload-step change is required.

## Assumption Reassessment (2026-05-05)

1. `.github/workflows/engine-tests.yml:50-56` already uploads `packages/engine/dist` as the `engine-dist` artifact; `dist/.cache/` will be included automatically. No change to the upload step is needed.
2. `.github/workflows/engine-tests.yml:85-89` downloads `engine-dist` to `packages/engine/dist` in every test lane. The cache will be present from the first test process onward.
3. Engine `package.json` has 30+ scripts but no existing `cache:gamedef:warm`. Confirmed — clean addition.
4. Both `compileProductionSpec` (FITL) and `compileTexasProductionSpec` (Texas) are exported from `packages/engine/test/helpers/production-spec-helpers.ts`. The warm script must invoke both so both specs are warmed in a single step.
5. The warm script imports test helpers (paths under `test/helpers/`). After ticket 001 lands, those helpers compile to `dist/test/helpers/`. The warm script runs against compiled JS, after `pnpm -F @ludoforge/engine build`, and uses the same import path conventions as engine tests (e.g., `../test/helpers/production-spec-helpers.js` from `dist/`). Use a `.mjs` script under `packages/engine/scripts/` that points to the compiled helpers explicitly.

## Architecture Check

1. **Cleaner than alternatives**: An alternative would be to warm the cache in each test lane's startup (e.g., a `before` hook in `node --test`). That would multiply the warm work across 11 lanes and still pay the cost N times. Warming exactly once in the `build` job and shipping the result via the existing artifact pipeline is the minimum-cost solution and reuses existing CI infrastructure.
2. **GameSpecDoc / GameDef boundary preserved**: The script is generic — it warms whichever production specs the helper exposes. Adding a new game in the future only requires invoking its helper in this script (or, better, exposing a list of production helpers and iterating). This ticket warms the two specs that exist today.
3. **No backwards-compatibility shims**: The new script and workflow step are additive. The existing `engine-dist` artifact path is unchanged.
4. **Foundation 13 (Artifact Identity)**: The warmed cache files carry the identity (`<gameKey>.<sourceFingerprint>.<cacheFormatVersion>.gamedef.json`) installed by ticket 001. CI uploads them with the rest of `dist/`, preserving reproducibility.

## What to Change

### 1. New script: `packages/engine/scripts/warm-gamedef-cache.mjs`

ESM script invoked from a workspace command. Responsibilities:

1. Import `compileProductionSpec` and `compileTexasProductionSpec` from the compiled helpers (`../dist/test/helpers/production-spec-helpers.js` resolved relative to the script).
2. Invoke each once. Each call populates the persistent cache via the helper installed in ticket 001.
3. After warming, `readdirSync` on `packages/engine/dist/.cache/` and log to stdout: file count, total bytes, and each file's name + size. This produces visible CI output that confirms the warm step succeeded.
4. Exit non-zero if either compile throws or if the cache directory is empty after warm.
5. No other side effects. Do not touch source files, do not run tests.

### 2. New script entry in `packages/engine/package.json`

Add to `scripts`:

```json
"cache:gamedef:warm": "node scripts/warm-gamedef-cache.mjs"
```

Place it adjacent to `schema:artifacts` to keep build-adjacent commands grouped.

### 3. New workflow step in `.github/workflows/engine-tests.yml`

Insert into the `build` job, after the `pnpm -F @ludoforge/engine build` step (currently `engine-tests.yml:49`) and before the `Upload engine dist` step (currently `engine-tests.yml:50-56`):

```yaml
      - name: Warm GameDef cache
        run: pnpm -F @ludoforge/engine cache:gamedef:warm
```

Indentation matches the existing `run:` steps (six spaces before `-`). No other workflow change is needed; the existing `actions/upload-artifact@v7` step already uploads `packages/engine/dist` and will include `dist/.cache/`.

## Files to Touch

- `packages/engine/scripts/warm-gamedef-cache.mjs` (new)
- `packages/engine/package.json` (modify — add `cache:gamedef:warm` script)
- `.github/workflows/engine-tests.yml` (modify — add `Warm GameDef cache` step in `build` job)

## Out of Scope

- The cache helper itself — owned by ticket 001.
- Equivalence and invalidation tests — owned by ticket 003.
- Cumulative cost measurement script — owned by ticket 004.
- Other workflow files (only `engine-tests.yml` runs the slow lanes that motivate this spec).
- Cache compression or retention policy on the artifact (Spec §7).
- Adding the warm step to local dev workflows — `pnpm -F @ludoforge/engine build` will still produce a clean `dist/.cache/` and the first local test invocation will populate it. Locally, the savings from a warm step are negligible for typical workflows.

## Acceptance Criteria

### Tests That Must Pass

1. Local manual: `pnpm -F @ludoforge/engine clean && pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine cache:gamedef:warm` produces files under `packages/engine/dist/.cache/` for both FITL and Texas. The script's stdout lists both files with non-zero sizes.
2. Local manual: after warming, running `pnpm -F @ludoforge/engine test:integration:fitl-rules` shows the first test process is a cache hit (verifiable via temporary debug logging in ticket 001's helper, or via timing — the first process should now be ~5 ms parse instead of ~1.7 s compile).
3. CI: a clean PR run shows the `Warm GameDef cache` step succeeds in the `build` job and the downstream `engine-tests / test (fitl-events-shard-a)` etc. lanes no longer pay first-process compile cost.
4. Existing engine integration suite passes with the warm step in place.

### Invariants

1. The warm step runs *after* `pnpm -F @ludoforge/engine build` and *before* the `Upload engine dist` step. Order matters: the script depends on compiled helpers in `dist/`, and the upload must include `dist/.cache/` populated by the warm step.
2. The warm script's only side effect is creating files in `packages/engine/dist/.cache/`. It does not modify source files, does not run tests, does not change exit codes for any reason other than a real compile failure or an empty cache directory after warm.
3. The CI workflow remains a single `build` job feeding N test lanes via one `engine-dist` artifact (no per-lane warm step duplication).

## Test Plan

### New/Modified Tests

No new automated tests. Verification is manual locally and via observation of the next CI run on the PR that lands this ticket. The structural correctness (cache files exist, sizes match expectations) is asserted by the warm script's own exit code check.

### Commands

1. `pnpm -F @ludoforge/engine clean`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine cache:gamedef:warm` — expect non-zero file count under `dist/.cache/`, both FITL and Texas warmed.
4. `ls -la packages/engine/dist/.cache/` — visual confirmation.
5. `pnpm -F @ludoforge/engine test:integration:fitl-rules` — verify hot cache after warm.
6. `pnpm turbo lint`
7. `pnpm turbo test` — full suite, includes ticket-deps check.

## Outcome

Completion date: 2026-05-05.

**Durable state**: COMPLETED.

### What Landed

- Added `packages/engine/scripts/warm-gamedef-cache.mjs`, which imports the compiled production spec helpers, invokes both FITL and Texas production compiles once, then prints the warmed cache file count, total bytes, and per-file sizes.
- Added `cache:gamedef:warm` to `packages/engine/package.json`.
- Added the `Warm GameDef cache` step to `.github/workflows/engine-tests.yml` after `pnpm -F @ludoforge/engine build` and before `Upload engine dist`.

### Ticket Corrections / Proof Substitutions

- The clean PR CI observation remains external to this local implementation session. Local proof verifies the same artifact boundary: clean build, warm step, non-zero FITL and Texas cache files under `packages/engine/dist/.cache/`, and a downstream hot-cache integration lane.
- No upload/download workflow change is required; the existing `engine-dist` artifact path remains `packages/engine/dist`, so `dist/.cache/` is included by path.

### Verification

- `node --check packages/engine/scripts/warm-gamedef-cache.mjs` — pass.
- `pnpm -F @ludoforge/engine clean` — pass.
- `pnpm -F @ludoforge/engine build` — pass.
- `pnpm -F @ludoforge/engine cache:gamedef:warm` — pass; output listed 2 files / 1,710,749 bytes:
  - `fire-in-the-lake.6e7d5aa842f00da3429a707ce8eaab84b45815d8f33cf4a0ff833be6e7c228ba.v1.gamedef.json` — 1,511,317 bytes.
  - `texas-holdem.625dbb57206ef2a629b030a81b45377a640011408538e74334742d300de373fb.v1.gamedef.json` — 199,432 bytes.
- `ls -la packages/engine/dist/.cache` — pass; confirmed the same two non-zero cache files under `packages/engine/dist/.cache/`.
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` — pass, 79/79 files.
- `pnpm turbo lint` — pass.
- `pnpm turbo test` — pass, 5/5 tasks.
- Post-Turbo final rerun: `pnpm -F @ludoforge/engine cache:gamedef:warm` — pass; output again listed the two expected FITL/Texas cache files with the same byte sizes.

### Schema / Artifact Fallout

- No schema, golden, or checked-in generated artifact changes are expected. The warmed cache lives under `packages/engine/dist/.cache/`, which is build output.

### Deferred Spec 155 Scope

- Cache equivalence and invalidation invariant tests remain ticket 003.
- FITL lane cumulative startup cost measurement remains ticket 004.

### Late-Edit Proof Validity

- Late edits after the final proof set: this terminal status and exact evidence transcription.
- Proof invalidation: no. The edits did not change code, workflow step order, package script command semantics, touched-file scope, dependencies, acceptance boundaries, or deferred sibling ownership. The post-Turbo warm command was already rerun after the broad lane rebuilt `packages/engine/dist`.
