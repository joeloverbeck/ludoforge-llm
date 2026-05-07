# PR #231 — Chronic CI Failure Diagnosis (2026-04-28)

**Branch**: `implemented-147` (38 commits ahead of `main` at `1e64d085`)
**Failing lane**: `determinism (fitl-parity-zobrist-seed-123, ...)` in workflow `Engine Determinism Parity`
**Workflow file**: `.github/workflows/engine-determinism.yml`
**Test file**: `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.ts`
**Repro command**: `pnpm -F @ludoforge/engine build && cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js`

---

## Cluster table (single cluster)

| Cluster | Lanes | Class | Status | Root cause | FOUNDATIONS | Priority |
|---|---|---|---|---|---|---|
| token-state-index slow path | `determinism (fitl-parity-zobrist-seed-123)` | timeout (b) genuine slowness | PR regression originating at `51a5a6bb`, currently amplified by remaining sluggish refresh path | `refreshCachedTokenStateIndexEntries` does O(K · Z · T) per `writeZoneMutations`; previously the active-draft fast-path served preview-drive lookups in O(K + zone_size) | F8 (Determinism), F11 (scoped mutation), F15 (no hacks) | HIGH |

### Lane evidence (run 25032331066, head SHA `3c5ec6dc`)

- Job ID 73316557224. Total wall-clock 1815s (= job `timeout-minutes: 30`).
- Last meaningful log line repeats every 30s: `[test-progress] [determinism] still running ... zobrist-incremental-parity-fitl-seed-123.test.js after Nm Ns quiet Nm Ns`. Test never emits any `it()` progress. Process is in a tight loop, not hung at I/O.
- Sibling shard `determinism (fitl-parity-zobrist-seed-42)` finishes in 121s on the same run — same code, different seed. The slow trajectory is seed-specific.

### Per-commit timing of the FITL parity shards on this branch

| Commit | Subject | seed-42 | seed-123 |
|---|---|---|---|
| `7a4f214c..a2e59e80` (4 commits) | pre-peel / first peel attempts | combined cancelled at 30 min | combined cancelled at 30 min |
| **`e63cb63e`** | **Implemented POLPREVDRIVE-007 (added `copyCachedTokenStateIndex` + `refreshCachedTokenStateIndexEntries`)** | **70 s** | **72 s** ← last green |
| `51a5a6bb` | fix(kernel): drop unsound active-draft fast-path | 121 s | 1822 s ← regression introduced |
| `3c5ec6dc` (HEAD) | Implemented POPREVDRIVE-006 | (current run) | 1815 s |

### What did NOT work (chronic-PR summary)

The user has been pursuing a perf-recovery campaign for several pushes. Six tickets (POLPREVDRIVE-001 through 006) plus two `fix(ci):` shard commits (`aea2f97a`, `a2e59e80`) and one `fix(kernel):` (`51a5a6bb`) have not closed the gap on seed-123:

- `POLPREVDRIVE-001/002`: introduced an active-draft preview fast-path. Soundness bug surfaced (false "Token appears multiple times" runtime errors during FITL preview drives because draft `applyZoneDelta` short-circuits when `state.zones` reference is unchanged but inner zone arrays were mutated by `writeZoneMutations`).
- `51a5a6bb`: reverted POLPREVDRIVE-002's fast-path for soundness. POLPREVDRIVE-007's WeakMap-based `copyCachedTokenStateIndex` + `refreshCachedTokenStateIndexEntries` was supposed to recover the perf, but only seed-42 (shallower trajectory) recovered. Seed-123 went from 72s → 1822s.
- `POLPREVDRIVE-003`: lowered `K_PREVIEW_DEPTH` 8→6. Per the ticket's own commit message: seed-123 still "exceeds local WSL2 budget and is gated by the dedicated CI shard." Movement within noise on seed-42.
- `POLPREVDRIVE-004`: drive-scoped `resolveRefCache` memoisation. Movement within noise.
- `POLPREVDRIVE-005`: drive result sink (instrumentation; off in tests). No perf impact.
- `POLPREVDRIVE-006`: forward-looking perf gate test (`fitl-parity-drive.perf.test.ts`). Tripwire only — does not fix anything. Calibration block in that test explicitly states: *"POLPREVDRIVE-002's fast-path gain was reverted by the soundness fix in 51a5a6bb, and POLPREVDRIVE-003/004/005 produced wall-clock movements within noise."*

### Why seed-123 is >25× slower than seed-42 after the fast-path drop

Both shards exercise the same code (`runFitlZobristIncrementalParitySeed` in `packages/engine/test/determinism/zobrist-incremental-parity-fitl-helper.ts`) under `verifyIncrementalHash: true`, 4 baseline FITL profiles, `maxTurns=200`. The only difference is the seed.

`getTokenStateIndex` is called twice in `eval-query.ts` (line 375 in `applyTokenFilter`, line 795 in `tokenZones`) — both deep inside the per-effect query / filter primitives that fire repeatedly during effect dispatch. After `51a5a6bb` removed the active-draft fast-path, every call falls through the `WeakMap<state.zones>` cache.

The current refresh path (`refreshCachedTokenStateIndexEntries`, `packages/engine/src/kernel/token-state-index.ts:230`) has an algorithmic flaw:

```ts
for (const tokenId of tokenIds) {
  const occurrences: TokenOccurrence[] = [];
  for (const [zoneId, tokens] of Object.entries(state.zones)) {     // O(Z)
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {  // O(T)
      ...
    }
  }
  ...
}
```

It scans **every zone × every token** for each affected tokenId, even when only 1–2 zones were mutated and the prior cache entry already records exactly which zones contain each token (`occurrenceZoneIds`). For FITL's late-game state (~30 zones with a handful of tokens each), this is ~50× slower per `writeZoneMutations` call than the active-draft path's O(K + zone_size) update. Seed-42's trajectory hits this path infrequently enough (1.7× slowdown). Seed-123 must hit a deeper / more contested trajectory where the slowdown compounds catastrophically.

---

## Options at gate 1

### Option A (recommended) — engineering fix to refresh path
Rewrite `refreshCachedTokenStateIndexEntries` to take the **set of mutated zoneIds** (already known by `writeZoneMutations` callers) and use the existing entry's `occurrenceZoneIds` to identify which zones currently hold each affected token. Scan only mutated zones for new occurrences. Restores O(K + zone_size) per call without re-introducing the soundness bug — there is no scope stack; the WeakMap remains keyed by `state.zones` reference. Aligns with F11's "Scoped internal mutation" exception and F15 ("address root causes").
- Pros: real fix, no workflow change, no test weakening, eliminates the perf gate calibrated in POLPREVDRIVE-006 from being a permanent ceiling.
- Cons: a few hours of careful work + property tests covering multi-occurrence tokens. Risk: if seed-123 has ANOTHER perf cliff beyond the refresh path, gap may not fully close. Hypothesis-validation prototype recommended before locking in.

### Option B — persist `MutableTokenStateIndex` inside the WeakMap
Store the full draft-style structure (with internal `occurrencesByToken`) in the WeakMap, not just the read-only snapshot. Updates go through its existing O(K + zone_size) helpers. Cleaner long-term abstraction; subsumes Option A.
- Pros: best architecture; no duplicate update logic between snapshot and draft paths.
- Cons: bigger surface area; touches every consumer of the WeakMap. Higher review burden.

### Option C — temporary `timeout-minutes` bump on the determinism job
Raise from 30 → 60 minutes (or per-shard override for seed-123) until Option A/B lands. Surfaces at gate 1 because the skill does not auto-edit workflow YAML.
- Pros: unblocks the PR immediately; preserves test coverage at full strength.
- Cons: doubles CI cost on this lane; legitimizes the regression rather than fixing it; F15 violation if treated as the final answer.

### Option D — mark seed-123 shard `continue-on-error: true` (advisory)
Same convention as `policy-profile-quality`. Lane still runs and produces signal but doesn't block merge.
- Pros: zero-cost unblock.
- Cons: silently hides a genuine regression; encourages "advisory creep". F15 violation if not paired with a tracking ticket.

### Option E — reduce seed-123 workload (`maxTurns` 200 → 100)
Shorter trajectory fits in budget at current perf level.
- Pros: keeps lane gating; small diff.
- Cons: weakens the architectural-invariant assertion (the test was written to validate replay-identity over the full game arc); may miss late-game incremental-hash drifts.

### Option F — drop seed-123 shard temporarily, with a tracking ticket
Pair with a high-priority ticket to restore once perf recovers.
- Pros: clean signal on what's gated vs. waived.
- Cons: loses coverage during a window where the kernel is being actively modified.

### Option G — status quo / merge with known failing CI
- Cons: contradicts F8 (Determinism Is Sacred) gating intent and the user's stated goal. Not recommended.

---

## Recommendation

Option A as the real fix. While the fix is being prototyped and verified, Option C (raise `timeout-minutes` to 60) as a temporary unblock is reasonable IF the user wants to merge the existing 38-commit branch sooner. If Option A's prototype recovers seed-123 to within budget, no workflow change is needed.

---

## Files implicated by Option A

- `packages/engine/src/kernel/token-state-index.ts` (lines 230–257: `refreshCachedTokenStateIndexEntries`)
- `packages/engine/src/kernel/effects-token.ts` (line 44–72: `writeZoneMutations` — caller passes affected token IDs; would also pass mutated zone IDs)
- `packages/engine/test/kernel/token-state-index-incremental.test.ts` (extend property tests for multi-occurrence tokens crossing mutated/unmutated zones)
