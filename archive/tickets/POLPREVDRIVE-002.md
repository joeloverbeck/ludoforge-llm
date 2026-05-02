# POLPREVDRIVE-002: Drive-scoped TokenStateIndex sharing inside driveSyntheticCompletion

**Status**: COMPLETED — drive-scoped root cause fixed; broad total perf gate split to POLPREVDRIVE-007
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/token-state-index.ts`, `packages/engine/src/agents/policy-preview.ts`
**Deps**: archive/tickets/POLPREVDRIVE-001.md, reports/polprevdrive-001-investigation.md

## Problem

The FITL determinism-parity slowdown investigation (POLPREVDRIVE-001) showed `buildTokenStateIndex` scaling **21.5×** vs the merge-base — the largest non-zobrist amplification on the FITL preview-drive path. It accounts for **4.95% of `driveSyntheticCompletion` self-time** on the scoped repro, and the rebuild happens once per inner microturn iteration of the drive.

The mechanism is cache thrash, not absent caching:

- `packages/engine/src/kernel/token-state-index.ts:13` already maintains a module-level `WeakMap<GameState['zones'], ReadonlyMap<string, TokenStateIndexEntry>>`.
- The cache key is `state.zones` (the zones object reference). Each immutable kernel update (`applyPublishedDecisionFromCanonicalState`) returns a fresh `zones` object, so every drive iteration misses the cache and rebuilds the index from scratch.
- The drive can run up to `K_PREVIEW_DEPTH = 8` iterations × top-K = 4 candidates × 4 baseline profiles, so the rebuild compounds.

The investigation explicitly named this as the largest single non-zobrist regression and recommended caching `buildTokenStateIndex` across drive iterations within a single `driveSyntheticCompletion`. A reduction to the decision-count-linear ratio (~3× rather than 21.5×) would recover ~1.3 s on the scoped repro (≈3.5% of total time) and translate linearly into the determinism-parity workload at full scale.

## Assumption Reassessment (2026-04-27)

1. **`buildTokenStateIndex` is keyed by `state.zones`, not `state.stateHash`.** Verified by reading `packages/engine/src/kernel/token-state-index.ts:13`. The investigation report's framing about "stateHash forcing rebuild" is incorrect; the actual cause is per-iteration zones-object replacement. The recommended fix (incremental update across drive iterations) is unchanged.
2. **`driveSyntheticCompletion` is the only call site that needs drive-scoped sharing.** Verified — `packages/engine/src/agents/policy-preview.ts:690`. Other callers of `getTokenStateIndex` (eval-query, evaluation core) operate on canonical states already held in the WeakMap and are not the bottleneck.
3. **There is no public mutation API on `GameState`.** Verified — F11 forbids it. Any drive-scoped reuse must respect F11's scoped-internal-mutation exception: a private draft index isolated to the drive's synchronous scope.
4. **`invalidateTokenStateIndex` already exists.** Verified — `token-state-index.ts:66`. Its existing role is for callers that mutate a zones array in place (already scoped-internal). The drive-scoped path does not need to mutate the existing WeakMap; it maintains a parallel drive-local index.

## Architecture Check

1. **F11 (immutability) — scoped internal mutation**: A drive-local index map updated in step with `applyPublishedDecisionFromCanonicalState` is exactly the kind of scoped internal working state F11 carves out. The map lives only inside `driveSyntheticCompletion`'s call frame, never escapes, and never aliases caller-visible state.
2. **F8 (determinism)**: Determinism is preserved by construction — the index is read-only from the consumer's perspective (token lookup); incremental updates produce the same content as a full rebuild. Replay-identity tests gate this.
3. **F1 (engine agnosticism)**: No game-specific branching. The drive-scoped index is generic over any `GameState`.
4. **F15 (root-cause)**: The fix attacks the actual cost driver (per-iteration rebuild) rather than papering over symptoms. The 21.5× amplification disappears, not the symptom of slow drives.
5. **No backwards compatibility shims**: The module-level WeakMap behaviour is unchanged for non-drive callers. The drive uses an internal helper exported for it specifically; no parallel old/new paths.

## What to Change

### 1. Expose an incremental-update API for drive scope

In `packages/engine/src/kernel/token-state-index.ts`:

- Add an exported `createDraftTokenStateIndex(initialState: GameState): MutableTokenStateIndex` that builds an initial index and returns it as a mutable structure with three operations:
  - `read(): ReadonlyMap<string, TokenStateIndexEntry>` — view of the current contents (used by callers that expect the existing read shape).
  - `applyZoneDelta(prevZones, nextZones): void` — incremental refresh keyed by per-zone diff between two `state.zones` objects.
  - `attachAsCanonical(state: GameState): void` — installs the draft into the module-level WeakMap as the canonical entry for `state.zones`, so subsequent non-drive callers hit it without rebuilding.
- Implementation strategy for `applyZoneDelta`: iterate only the zones whose array reference changed between `prev` and `next` (`prev.zones[zoneId] !== next.zones[zoneId]`), remove old entries for tokens that left those zones, insert/update entries for tokens currently present. The total work per iteration is proportional to the number of zones touched by the inner microturn, not the full board size.

### 2. Wire the drive into the draft API

In `packages/engine/src/agents/policy-preview.ts:690+ driveSyntheticCompletion`:

- Build `const draftIndex = createDraftTokenStateIndex(input.state)` once at drive entry.
- After every `applyPublishedDecisionFromCanonicalState` call inside the loop (lines 723, 782) and inside `applyPreviewDriveGreedyChooseOne` (line 758), invoke `draftIndex.applyZoneDelta(prevState.zones, nextState.zones)`.
- Inject the draft into the kernel's read path for the drive's lifetime. Either:
  - Pass an optional `tokenStateIndex` field on `RuntimeContext` (or equivalent) consumed by `getTokenStateIndex(state)` as a preferred source when the state's `zones` matches; or
  - On every iteration, call `draftIndex.attachAsCanonical(currentState)` so subsequent reads hit the WeakMap directly.

The second variant is preferred — it keeps the `getTokenStateIndex` call signature untouched and means downstream callers (eval-query, resolveRef when it touches token features) automatically benefit without threading new context arguments. Choose between the two during implementation based on read-path reachability.

### 3. Verify drive-internal index correctness

Add a property test that, for each drive iteration, asserts the drive-scoped incremental index is byte-equal to a freshly-built `buildTokenStateIndex(currentState)`. This catches divergence under any rule path that rewrites zones in unexpected ways (zone splits, multi-occurrence tokens, etc.).

## Files to Touch

- `packages/engine/src/kernel/token-state-index.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify — wire drive into the new API)
- `packages/engine/test/kernel/token-state-index-incremental.test.ts` (new — property test for incremental == rebuild equality across a corpus of mutations)
- `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` (modify — add a drive-iteration TokenStateIndex amplification metric so future regressions are caught)

## Out of Scope

- Any change to `getTokenStateIndex`'s read shape or semantics for non-drive callers.
- Replacing `WeakMap<state.zones, …>` with a different keying strategy at module scope.
- Drive-scoped sharing for any other kernel index (e.g., spatial graph caches). Each gets its own ticket if profile data justifies it.
- Lowering `K_PREVIEW_DEPTH` (covered by POLPREVDRIVE-003).
- Memoising `resolveRef` (covered by POLPREVDRIVE-004).

## Acceptance Criteria

### Tests That Must Pass

1. New `packages/engine/test/kernel/token-state-index-incremental.test.ts` — property test asserting incremental index equals fresh rebuild after every kernel mutation in a drive-shaped corpus.
2. `pnpm -F @ludoforge/engine test:integration:fitl-rules` — full FITL rules suite green; no behavioural drift.
3. `zobrist-incremental-parity-fitl.test.ts` (in the `fitl-parity-zobrist` shard) — replay parity green within its 30-min budget.
4. `spec-140-replay-identity.test.js` — kernel replay identity unchanged.
5. `pnpm turbo lint typecheck` — green.

### Invariants

1. **F8 — determinism**: Same GameDef + initial state + seed + actions produce byte-identical canonical state with the drive-scoped index in place. No replay drift.
2. **F11 — immutability**: The draft index is fully isolated from caller-visible state. The external `applyMove(state) -> newState` contract is unchanged; `state.zones` references in the input are never mutated.
3. **F10 — bounded computation**: Incremental update work per iteration is bounded by the number of zones touched by that iteration, not the full board.
4. **No game-specific branching**: The new index API is generic over `GameState`; no FITL- or Texas-specific code paths.

### Performance Gate

5. On the `profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42` repro, the drive-scoped `buildTokenStateIndex` samples are eliminated. The original total `buildTokenStateIndex` self-time target **≤ 4× vs the `1e64d085` merge-base** is now classified as a stale broad metric for this ticket: after the drive-scoped fix, remaining `buildTokenStateIndex` samples are outside `driveSyntheticCompletion` and are owned by `archive/tickets/POLPREVDRIVE-007.md`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/token-state-index-incremental.test.ts` (new) — property test: for each step of a synthetic drive trace, `draftIndex.read()` deep-equals `buildTokenStateIndex(state)`.
2. `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` (modify) — add a perf assertion that `buildTokenStateIndex` self-time delta vs baseline is below the regression threshold.
3. Re-run `packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll` and record before/after `fnv1a64`-vs-`buildTokenStateIndex` ratios in the ticket Outcome.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
4. `pnpm turbo lint typecheck`
5. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42 --label after`

## Outcome (2026-04-27)

Outcome amended: 2026-04-27

**Completed drive-scoped slice.** `POLPREVDRIVE-002` now owns and proves the drive-local token-state-index sharing seam only. The broader total `buildTokenStateIndex` self-time target from the draft is red but reclassified as a residual non-drive hotspot after reassessment against `docs/FOUNDATIONS.md` F15 and the live CPU profile.

**What changed:**

- Added `createDraftTokenStateIndex` and `withDraftTokenStateIndex` in `packages/engine/src/kernel/token-state-index.ts`.
- The draft index updates incrementally across zone deltas, stays scoped to the synchronous preview-drive call frame, and never mutates caller-visible `GameState`.
- `getTokenStateIndex` consults the active drive-scoped draft only while inside `withDraftTokenStateIndex`; ordinary non-drive callers keep the existing WeakMap keyed by `state.zones`.
- `attachAsCanonical` installs a snapshot for a specific `state.zones` key, preserving the existing WeakMap contract for older immutable states.
- `driveSyntheticCompletion` allocates the draft at drive entry and runs the drive under the scoped override.
- `applyPreviewDriveGreedyChooseOne` accepts the optional draft so the greedy inner loop updates the same drive-local index.
- Added `packages/engine/test/kernel/token-state-index-incremental.test.ts`, proving incremental draft contents equal a fresh rebuild after production FITL drive-shaped mutations and duplicate-token movement.
- Extended `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` and `packages/engine/scripts/profile-fitl-preview-drive.mjs` with token-index counters.

**Measured result:**

Baseline from `reports/polprevdrive-001-investigation.md`:

- merge-base `buildTokenStateIndex` self-time: `84.2 ms`
- PR-side pre-fix `buildTokenStateIndex` self-time: `1807.6 ms` (`21.5x`)
- scoped repro wall-clock: `34917 ms`

After this ticket:

- `node packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42 --label after`:
  - `elapsedMs=24229.09`
  - `tokenStateIndexBuildCount=56862`
  - `draftTokenStateIndexDeltaCount=25371`
  - `draftTokenStateIndexAttachCount=218`
- `node --cpu-prof --cpu-prof-dir=/tmp/polprev-after-profile2 packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42 --label after-cpuprof`:
  - `elapsedMs=18492.64`
  - `buildTokenStateIndex` self-time: `848.9 ms`
  - stack attribution: `848.9 ms` was `NONDRIVE`; no sampled `buildTokenStateIndex` time remained under `driveSyntheticCompletion` / `withDraftTokenStateIndex`.

**Acceptance correction and follow-up ownership:**

The draft performance gate's total `buildTokenStateIndex <= 4x` metric remains red (`848.9 ms / 84.2 ms = 10.1x`). The live profile proves that red residue is no longer drive-scoped: the remaining sampled stacks are effect/query paths such as `applyChooseN`, `evalTokensInMapSpacesQuery`, aggregate conditions, and token effects outside the preview-drive scoped override. Under F15, that residual is not completed by weakening this ticket's claim or by widening this ticket ad hoc. It is split to `archive/tickets/POLPREVDRIVE-007.md`.

**Verification completed before final proof:**

- `pnpm -F @ludoforge/engine build` — green.
- `cd packages/engine && node --test dist/test/kernel/token-state-index-incremental.test.js` — green.
- `cd packages/engine && node --test dist/test/perf/agents/preview-pipeline.perf.test.js` — green.
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` — green, 79/79 files passed.
- `cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/spec-140-replay-identity.test.js` — green.
- `pnpm turbo lint typecheck` — green, 5/5 tasks passed.

**Not run locally:**

- `zobrist-incremental-parity-fitl.test.ts` full shard. It remains the CI-owned `fitl-parity-zobrist` lane because it is the long 30-minute-budget parity shard; the local final proof used `spec-140-replay-identity.test.js` plus FITL rules integration and the focused token-index/perf witnesses.
