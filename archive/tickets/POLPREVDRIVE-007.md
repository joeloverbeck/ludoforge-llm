# POLPREVDRIVE-007: Residual non-drive TokenStateIndex rebuilds in effect/query paths

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — likely `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/effects-choice.ts`, `packages/engine/src/kernel/effects-token.ts`, and token-index runtime context plumbing
**Deps**: archive/tickets/POLPREVDRIVE-002.md, archive/tickets/POLPREVDRIVE-001.md, reports/polprevdrive-001-investigation.md

## Problem

`POLPREVDRIVE-002` eliminated the drive-scoped `buildTokenStateIndex` rebuild seam, but the original broad performance target still remains red when measured as total `buildTokenStateIndex` self-time on:

```bash
node --cpu-prof --cpu-prof-dir=/tmp/polprev-after-profile2 \
  packages/engine/scripts/profile-fitl-preview-drive.mjs \
  --profilesAll --maxTurns 10 --seed 42 --label after-cpuprof
```

Post-`POLPREVDRIVE-002` evidence:

- scoped repro wall-clock improved materially (`34917 ms` investigation baseline to `18492.64 ms` under the after CPU-profile run).
- `buildTokenStateIndex` self-time dropped from `1807.6 ms` to `848.9 ms`.
- the remaining `848.9 ms` is still `10.1x` vs the `1e64d085` merge-base self-time (`84.2 ms`), above the original `<= 4x` threshold.
- stack attribution shows the remaining sampled `buildTokenStateIndex` time is **NONDRIVE**; it no longer appears under `driveSyntheticCompletion` / `withDraftTokenStateIndex`.

Top residual stacks include:

| self_ms | Stack summary |
|---------|---------------|
| 242.5 | `applyTokenFilter -> evalTokensInMapSpacesQuery -> applyChooseN -> applyEffectWithBudget` |
| 180.1 | `applyTokenFilter -> evalQuery -> countAggregateItems -> evalValue -> evalCondition` |
| 124.8 | `applyTokenFilter -> evalTokensInMapSpacesQuery -> evalHomogeneousRecursiveQuery -> applyChooseN` |
| 68.8 | `applyTokenFilter -> evalQuery -> countAggregateItems -> evalValue -> applyLet` |
| 58.2 | `getTokenStateIndexEntry -> resolveTokenOccurrence -> applySetTokenProp` |

This ticket owns the residual root cause: non-drive effect/query paths still rebuild token indexes for transient immutable states that are not covered by the drive-scoped override.

## Assumption Reassessment (2026-04-27)

1. **The drive-scoped seam is no longer the sampled owner.** Verified by CPU-profile stack attribution after `POLPREVDRIVE-002`: all sampled `buildTokenStateIndex` time was classified `NONDRIVE`.
2. **The broad `<= 4x` total metric is still red.** Verified: `848.9 ms / 84.2 ms = 10.1x`.
3. **The remaining stacks are generic effect/query code.** Verified by stack paths through `eval-query`, `effects-choice`, `effects-token`, `eval-value`, and `eval-condition`; no FITL-specific engine branch is implicated.
4. **A module-level key change is still out of scope unless proven safe.** `POLPREVDRIVE-002` kept the existing WeakMap-by-`state.zones` behavior for ordinary callers. This ticket must reassess whether residual sharing belongs in runtime context, state-draft plumbing, or a broader generic cache rather than changing module-level identity ad hoc.

## Architecture Check

1. **F15 (root-cause)**: This ticket exists because `POLPREVDRIVE-002` proved the broad red metric moved to a different root cause. The fix must target the non-drive effect/query rebuild path, not weaken the perf claim.
2. **F11 (immutability)**: Any sharing must remain scoped internal mutation. It may cache derived index data, but it must not mutate caller-visible `GameState` or make stale immutable states observe newer index contents.
3. **F8 (determinism)**: Cached/indexed reads must equal fresh rebuild reads for every state. Property tests must prove semantic equality.
4. **F1 (engine agnosticism)**: The fix must be generic over `GameState` and kernel read/effect paths. No FITL-specific branching.
5. **F14 (no backwards compatibility)**: No duplicate old/new public token-index APIs. If the ownership model changes, migrate owned callers in the same ticket.

## What to Change

### 1. Reproduce and preserve the residual stack attribution

Use the existing CPU-profile parser command from the `POLPREVDRIVE-002` closeout to confirm the current top residual stacks before editing. Record the exact top stacks in this ticket Outcome.

### 2. Identify the correct generic ownership boundary

Before coding, decide whether residual sharing belongs in:

- eval/effect runtime resources, so one effect execution scope can reuse a draft index across transient states;
- state-draft plumbing, so token mutations update a shared derived index together with zone deltas;
- a more conservative read-through cache keyed by a generic state/runtime identity that cannot make stale immutable states observe newer contents.

Do not implement a module-level mutable singleton or game-specific shortcut.

### 3. Implement the narrowest generic residual fix

The implementation should make the residual hot paths reuse index work across transient immutable states while preserving the existing public read shape:

- `getTokenStateIndex(state)` remains a read API returning `ReadonlyMap<string, TokenStateIndexEntry>`.
- any scoped mutable index must be private to the synchronous evaluation/effect scope.
- old immutable states must not share a live mutable map whose contents later change.

### 4. Add regression proof

Add a production-shaped correctness test proving the residual scoped index equals a fresh rebuild across the specific non-drive mutation/query paths this ticket changes. Extend or add a perf witness that reports:

- total `buildTokenStateIndex` self-time,
- residual `buildTokenStateIndex` stack classification,
- token-index rebuild/delta counters.

## Files to Touch

- `packages/engine/src/kernel/token-state-index.ts` (likely modify)
- `packages/engine/src/kernel/eval-query.ts` (likely modify)
- `packages/engine/src/kernel/effects-choice.ts` (likely modify)
- `packages/engine/src/kernel/effects-token.ts` (likely modify)
- `packages/engine/src/kernel/eval-context.ts` or runtime-resource plumbing (likely modify)
- `packages/engine/test/kernel/<residual-token-state-index>.test.ts` (new or modify)
- `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` (modify if needed)

## Out of Scope

- Drive-scoped TokenStateIndex sharing already completed in `POLPREVDRIVE-002`.
- `K_PREVIEW_DEPTH` lowering (`POLPREVDRIVE-003`).
- `resolveRef` memoisation (`POLPREVDRIVE-004`).
- Cross-candidate drive memoisation (`POLPREVDRIVE-005`).
- Adding the parity perf gate (`POLPREVDRIVE-006`).
- FITL-specific engine branches or production-data edits.

## Acceptance Criteria

### Tests That Must Pass

1. New or modified correctness test proving residual scoped token-index reads equal fresh rebuilds for the affected non-drive effect/query paths.
2. `pnpm -F @ludoforge/engine test:integration:fitl-rules` — green; no behavioural drift.
3. `spec-140-replay-identity.test.js` — kernel replay identity unchanged.
4. FITL Zobrist parity shards — replay parity green within the 30-min budget.
5. `pnpm turbo lint typecheck` — green.

### Invariants

1. **F8 — determinism**: cached residual reads equal fresh rebuild reads.
2. **F11 — immutability**: scoped index mutation cannot leak across immutable states or caller-visible state.
3. **F1 — engine agnosticism**: no game-specific branching.
4. **F14 — no backwards compatibility**: no parallel public token-index APIs.

### Performance Gate

5. On the `profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42` repro, total `buildTokenStateIndex` self-time is **<= 4x** vs the `1e64d085` merge-base (`<= 336.8 ms` using the `84.2 ms` baseline from `POLPREVDRIVE-001`), or the ticket stops for 1-3-1 with exact residual stack attribution and a proposed split.

## Test Plan

1. `pnpm -F @ludoforge/engine build`
2. Focused new residual correctness test.
3. `node --cpu-prof --cpu-prof-dir=/tmp/polprev-after-residual packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42 --label after-residual`
4. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
5. `pnpm turbo lint typecheck`

## Outcome (2026-04-27)

**Completed.** The residual non-drive rebuild fix landed as cache propagation/preservation rather than a global effect-scoped draft. The first candidate proved that a global outer-effect draft can make `buildTokenStateIndex` disappear from the profile, but it also caused pathological draft-delta churn in FITL parity (`seed=123` timed out under the 30-minute guard). A clean `HEAD` A/B run showed the same lean seed-123 witness passed pre-change in `23410.937831 ms`, so the timeout was candidate-caused.

**What changed:**

- Added `copyCachedTokenStateIndex(fromState, toState)` in `packages/engine/src/kernel/token-state-index.ts` and call it when an outer effect batch creates its mutable state wrapper. This lets read-heavy non-drive query/effect probes inherit an already-built token index from the source state instead of rebuilding for each transient mutable `zones` object.
- Added `refreshCachedTokenStateIndexEntries(state, tokenIds)` for small token-zone mutations. When a cache exists and the affected token-id set is small, mutable token writes refresh only those entries; larger mutations still invalidate conservatively.
- Updated `setTokenProp` to preserve the token-state cache after prop-only token replacement.
- Split the heavy FITL Zobrist parity file into seed-specific tests with a shared helper. The helper disables unnecessary deltas/full decision retention and counts decisions through `decisionHook`.
- Extended `packages/engine/test/kernel/token-state-index-incremental.test.ts` with a `POLPREVDRIVE-007` witness proving an outer mutable effect scope inherits/preserves the cached token-state index, performs zero full `buildTokenStateIndex` calls in the focused prop-only sequence, and matches a fresh rebuild for the final state.

**Measured result:**

- `node --cpu-prof --cpu-prof-dir=/tmp/polprev-after-residual-copy-cache packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42 --label after-residual-copy-cache`
  - `elapsedMs=19627.04`
  - `tokenStateIndexBuildCount=3673`
  - `draftTokenStateIndexDeltaCount=25371`
  - `draftTokenStateIndexAttachCount=218`
- CPU-profile parser:
  - profile artifact: `/tmp/polprev-after-residual-copy-cache/CPU.20260427.115939.2.0.001.cpuprofile`
  - total sampled `buildTokenStateIndex` self-time: `56.743 ms`
  - threshold: `<= 336.8 ms` (`4x` the `84.2 ms` merge-base baseline from `POLPREVDRIVE-001`)
  - verdict: **PASS** (`0.67x` vs baseline)

**Zobrist parity harness result:**

- The original two-seed `zobrist-incremental-parity-fitl.test.ts` did redundant retention work for this witness: it retained full decision logs and deltas even though the assertion only needed hash parity to not throw and at least one decision to occur.
- The test was split into seed-specific shards and switched to `skipDeltas: true`, `traceRetention: 'finalStateOnly'`, and `decisionHook` decision counting.
- Final candidate proof:
  - `timeout 30m node --test dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js` — green in `21181.993964 ms` after final `dist` rebuild.
  - `timeout 30m node --test dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js` — green in `21943.641071 ms` after final `dist` rebuild.

**Residual risk if continuing this candidate:**

- The ticket-owned `buildTokenStateIndex` gate is green. The scoped repro remains dominated by other hot paths outside this ticket and still belongs to the sibling `POLPREVDRIVE-*` optimization tickets.

**Verification:**

- `pnpm -F @ludoforge/engine build` — green.
- `cd packages/engine && node --test dist/test/kernel/token-state-index-incremental.test.js` — green.
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` — green, 79/79 files passed.
- `cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/spec-140-replay-identity.test.js` — green.
- `pnpm turbo lint typecheck` — green, 5/5 tasks passed.
- `timeout 30m node --test dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js` — green in `21181.993964 ms` after final `dist` rebuild.
- `timeout 30m node --test dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js` — green in `21943.641071 ms` after final `dist` rebuild.
