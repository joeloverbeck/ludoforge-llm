# Spec 64 — MCTS Performance Optimization

**Depends on**: Spec 63 (runtime move classification)

## 0. Problem Statement

### 0.1 MCTS on FITL Is ~4,600× Too Slow

A single MCTS decision with the `fast` preset (200 iterations, hybrid rollout) takes ~46 minutes on FITL. The target for a background worker is 10–30 seconds. This makes MCTS unusable for any practical purpose on complex games.

### 0.2 Root Cause: Materialization Dominates

Profiling reveals that `legalChoicesEvaluate` calls (move classification / materialization) at ~1,049 ms/call account for **76% of kernel time**. This function is called for every legal move (15–39 moves) at every tree node during selection, even when progressive widening means only 1–2 children will actually be expanded. This is the dominant waste.

Secondary costs are moderate, not bottleneck-level:
- `applyMove`: ~73 ms/call (4.3% of kernel time)
- `legalMoves`: ~39 ms/call (2.2% of kernel time)

### 0.3 Rollout-Phase Materialization Is the Largest Single Cost

In hybrid rollout mode, materialization occurs at every rollout ply in addition to every tree node. This accounts for **93.8% of total search time**. Switching to direct rollout mode (heuristic evaluation at expansion, no simulation plies) eliminates this entire cost category.

### 0.4 Root Classification Is Redundantly Recomputed

The root state is revisited on every iteration. Without caching, `classifyMovesForSearch` is called ~200 times for the same root state with 30+ moves, producing ~6,000 redundant `legalChoicesEvaluate` calls.

### 0.5 Pending Moves Receive Zero Visits

Critical finding: pending moves (rally, march, attack — the core FITL operations) receive **0 visits** even after 50 iterations. The search budget is entirely consumed by materialization overhead on ready moves, leaving no budget for the decision-tree paths that handle the most strategically important actions.

### 0.6 Too Many Configurations That Don't Work

The current codebase has:
- **4 presets**: `fast`, `default`, `strong`, `background` — but none except `background` (added in Phase 1 work) are tuned for actual FITL performance. The others take minutes to hours.
- **3 rollout modes**: `legacy`, `hybrid`, `direct` — but `legacy` and `hybrid` are unusable on complex games due to per-ply materialization costs.
- Config fields (`hybridCutoffDepth`, `maxSimulationDepth`) that only apply to dead rollout modes.

Having non-functional configurations creates confusion and maintenance burden. If a mode is purely non-workable from a runtime perspective, it should not exist as a user-facing option.

## 1. Architecture

### 1.1 Design Principle: Eliminate What Doesn't Work

Rather than maintaining backward compatibility with configurations that produce unusable performance, this spec removes them:

1. **Remove `legacy` and `hybrid` rollout modes.** Direct mode is the only viable option for complex games. The `MctsRolloutMode` type, the `rolloutMode` config field, and all rollout simulation code (`rollout()`, `simulateToCutoff()`, `materializeMovesForRollout()`) are removed.

2. **Collapse presets to a single tunable configuration.** The distinction between `fast`/`default`/`strong`/`background` is meaningless when all must use direct mode to be functional. Replace with a single `MctsConfig` default that works, plus documentation on which knobs to turn for speed vs. quality.

3. **Remove dead config fields.** `hybridCutoffDepth`, `maxSimulationDepth`, `rolloutPolicy`, `rolloutEpsilon`, `rolloutCandidateSample`, `mastWarmUpThreshold` all become dead code once rollout modes are removed. Remove them along with the MAST statistics infrastructure.

### 1.2 Design Principle: Cache Expensive Computations

Classification results are deterministic for a given (state, moves) pair. Cache them in the existing `StateInfoCache` to avoid redundant `legalChoicesEvaluate` calls across iterations.

### 1.3 Design Principle: Defer Materialization

During selection through already-expanded nodes, zero `legalChoicesEvaluate` calls are needed. Availability of existing children can be checked by matching `legalMoves()` output (already cached) against children's `moveKey`s — a string comparison, not AST evaluation. Full classification is only needed at expansion time, and even then only for the single candidate being expanded, not all remaining moves.

## 2. Phases

### Phase 1: Classification Caching + Rollout/Preset Cleanup (DONE — already implemented on branch)

The following changes are already implemented on the `mcts-fixes-3` branch and pass all 4,799 unit tests:

**1a. Classification cache in `StateInfoCache`** (`state-cache.ts`)
- Added `moveClassification?: MoveClassification` to `CachedStateInfo`
- Added `getOrComputeClassification()` following the existing cache-or-compute pattern
- Root state classified once, reused across all iterations

**1b. All presets switched to `rolloutMode: 'direct'`** (`config.ts`)
- `fast`, `default`, `strong` all changed from `hybrid` to `direct`
- Eliminates all rollout-phase materialization

**1c. `background` preset added** (`config.ts`)
- 200 iterations, 30s time limit, direct mode, `heuristicBackupAlpha: 0.4`
- Wider progressive widening (`K=1.5, alpha=0.5`)
- Lower root stop threshold (`rootStopMinVisits: 5`)

**1d. `classificationCacheHits` diagnostic** (`diagnostics.ts`)
- New counter in accumulator and immutable diagnostics

**1e. Search uses cached classification** (`search.ts`)
- Selection loop calls `getOrComputeClassification()` when state cache is enabled

**Expected impact**: ~1.1 s/iteration (1× materialization + 1× applyMove + 1× eval). 25 iterations in ~28 s.

### Phase 2: Remove Dead Rollout Modes and Consolidate Presets

**Rationale**: All presets now use `direct`. The `legacy` and `hybrid` code paths are dead weight — they cannot run at acceptable speeds on complex games and their continued existence suggests to users that they are viable options.

**2a. Remove `legacy` and `hybrid` rollout modes**

Remove:
- `rollout()` function from `rollout.ts`
- `simulateToCutoff()` function from `rollout.ts`
- `materializeMovesForRollout()` function from `materialization.ts`
- `sampleCandidates()` helper from `rollout.ts`
- `pickMove()` helper from `rollout.ts`
- `MctsRolloutMode` type (collapse to always-direct)
- `ROLLOUT_MODES` array from `config.ts`
- `rolloutMode` field from `MctsConfig` (always direct)
- `hybridCutoffDepth` field from `MctsConfig`
- `maxSimulationDepth` field from `MctsConfig`
- `rolloutPolicy` field, `RolloutPolicy` type, `ROLLOUT_POLICIES` array
- `rolloutEpsilon` field
- `rolloutCandidateSample` field
- `mastWarmUpThreshold` field
- MAST stats infrastructure: `mast.ts` (`MastStats`, `createMastStats`, `updateMastStats`, `mastSelectMove`)
- `hybridRolloutPlies` diagnostic counter
- All related tests: `rollout.test.ts`, `materialize-rollout.test.ts`, `hybrid-search.test.ts`, `mast.test.ts`, rollout-related tests in `search.test.ts`, mode-comparison e2e tests

The `resolveDecisionBoundary()` function in `rollout.ts` is still needed (called during selection when exiting at a decision node). It must be relocated to a surviving module (e.g., `decision-boundary.ts` or `search.ts`).

Files:
- `packages/engine/src/agents/mcts/config.ts` — remove rollout-related fields and validation
- `packages/engine/src/agents/mcts/rollout.ts` — remove `rollout()`, `simulateToCutoff()`, `sampleCandidates()`, `pickMove()`, keep `resolveDecisionBoundary()` (relocate)
- `packages/engine/src/agents/mcts/materialization.ts` — remove `materializeMovesForRollout()`
- `packages/engine/src/agents/mcts/mast.ts` — delete entirely
- `packages/engine/src/agents/mcts/search.ts` — remove rollout mode switch, simplify to always-direct
- `packages/engine/src/agents/mcts/diagnostics.ts` — remove `hybridRolloutPlies`, `rolloutMode` from diagnostics
- `packages/engine/src/agents/mcts/index.ts` — update exports

**2b. Consolidate presets**

Replace the 4-preset system (`fast`/`default`/`strong`/`background`) with a single default config. The meaningful tuning axes in direct mode are:
- `iterations` — search budget
- `timeLimitMs` — wall-clock budget
- `explorationConstant` — exploration vs exploitation
- `progressiveWideningK` / `progressiveWideningAlpha` — expansion rate
- `heuristicBackupAlpha` — blending weight
- `rootStopMinVisits` / `rootStopConfidenceDelta` — early stopping
- `decisionWideningCap` / `decisionDepthMultiplier` — decision tree sizing

Remove `MctsPreset` type, `MCTS_PRESETS`, `MCTS_PRESET_NAMES`, `resolvePreset()`. Users configure `MctsConfig` directly, with a single `DEFAULT_MCTS_CONFIG` that works on complex games out of the box.

Files:
- `packages/engine/src/agents/mcts/config.ts` — remove presets
- `packages/engine/src/agents/mcts/index.ts` — update exports
- `packages/engine/src/agents/mcts/agent.ts` — update to use config directly
- All test files referencing presets

**2c. Remove dead config validation**

With rollout fields removed, simplify `validateMctsConfig()` to only validate the surviving fields.

### Phase 3: Lazy/Deferred Materialization

The key insight: during selection through already-expanded nodes, you need ZERO `legalChoicesEvaluate` calls. You only need to check which existing children are "available" (legal in the current sampled world). That check can use `legalMoves` output (already cached) matched against existing children's `moveKey`s — a string comparison, not AST evaluation.

**3a. Availability checking without full classification**

Replace the current pattern in `search.ts` (classify all → build candidateKeySet → match children) with:

```
1. Get legalMoves (cached via StateInfoCache)
2. Build moveKeySet from legalMoves via canonicalMoveKey (cheap string ops)
3. For each existing child: child is available if moveKeySet.has(child.moveKey)
4. Skip classification entirely for this node
```

This requires computing `canonicalMoveKey` for raw `Move` objects from `legalMoves()`. This is already a pure string function — no kernel calls.

Files:
- `packages/engine/src/agents/mcts/search.ts` — refactor selection loop
- `packages/engine/src/agents/mcts/materialization.ts` — add `classifyMovesIncremental()` for expansion-only classification

**3b. Incremental classification at expansion**

When `shouldExpand()` returns true, don't classify ALL remaining moves. Instead:

```
1. Get list of unclassified moves (moves not matching any existing child's moveKey)
2. Classify them one at a time via legalChoicesEvaluate
3. Stop when one ready or pending candidate is found
4. Cache the partial classification for next time
```

Files:
- `packages/engine/src/agents/mcts/materialization.ts` — add `classifyNextCandidate()`
- `packages/engine/src/agents/mcts/search.ts` — use incremental classification in expansion

**3c. Pending move creation deferral**

Currently, ALL pending moves get decision root nodes created at every visit. Defer this: only create decision roots when expansion budget allows, and create one at a time.

Files:
- `packages/engine/src/agents/mcts/search.ts` — refactor decision root creation

**Expected result after Phase 3**: ~150 ms/iteration. 200 iterations in ~30 s. Pending moves now get visited because materialization no longer dominates the budget.

### Phase 4: Root Parallelization (optional)

Fork RNG per worker, run independent `runSearch()` calls, merge root child visit counts.

Files:
- `packages/engine/src/agents/mcts/parallel.ts` — new file: `runParallelSearch()`
- `packages/engine/src/agents/mcts/agent.ts` — integrate parallel option
- `packages/engine/src/agents/mcts/config.ts` — add `parallelWorkers?: number`

**Expected result**: 200 effective iterations in ~8–10 s with 4 workers.

## 3. Verification

### 3.1 Primary Acceptance Criterion: FITL MCTS CI Workflows

The three GitHub Actions workflows are the canonical proof that MCTS works on FITL at reasonable speeds:

- `engine-mcts-fitl-fast.yml` (20-minute timeout)
- `engine-mcts-fitl-default.yml` (30-minute timeout)
- `engine-mcts-fitl-strong.yml` (45-minute timeout)

These workflows run `test:e2e:mcts:fitl:{fast,default,strong}` and are gated by `RUN_MCTS_FITL_E2E=1`. The test suite covers:
- **9 category-competence scenarios** (S1–S9): MCTS picks a move from an acceptable action category at playbook decision points across 7 turns.
- **1 victory-trend scenario** (S10): MCTS picks a coup pacification move that doesn't degrade US victory score beyond tolerance.

After Phase 2 consolidates presets, these workflows must be updated:
- Collapse to a single workflow (or parameterize by iteration count)
- Update test helpers to use `MctsConfig` directly instead of `resolvePreset()`
- Adjust timeouts based on measured post-optimization performance

**Success criteria**:
- All 10 FITL MCTS scenarios pass (no crashes, correct move categories)
- Fast-equivalent config completes within the CI timeout
- Per-iteration cost measurably lower than pre-optimization baseline (~11.7 s → target <1 s after Phase 2, <200 ms after Phase 3)

### 3.2 Unit Test Verification

After each phase:
```bash
pnpm turbo build
pnpm turbo test
pnpm turbo lint
pnpm turbo typecheck
```

### 3.3 Performance Regression Tracking

The profiler test (`fitl-mcts-profiler.test.ts`) emits per-iteration timing, materialization call counts, and cache hit rates. After each phase, verify:
- `classificationCacheHits > 0` after first iteration (Phase 1)
- `materializeCalls` count drops dramatically (Phase 3)
- `iterationTimeP50Ms` decreases across phases
- Pending moves receive >0 visits within 50 iterations (Phase 3)

## 4. Critical Files

| File | Role | Phase |
|------|------|-------|
| `state-cache.ts` | Classification caching | 1 (done) |
| `config.ts` | Preset consolidation, dead field removal | 1 (done), 2 |
| `diagnostics.ts` | Cache hit counter, dead counter removal | 1 (done), 2 |
| `search.ts` | Cached classification, rollout removal, lazy materialization | 1 (done), 2, 3 |
| `materialization.ts` | Rollout materialization removal, incremental classification | 2, 3 |
| `rollout.ts` | Rollout function removal, boundary relocation | 2 |
| `mast.ts` | Delete entirely | 2 |
| `agent.ts` | Preset removal, parallel integration | 2, 4 |
| `index.ts` | Export cleanup | 2 |
| `parallel.ts` | New: root parallelization | 4 |

## 5. Existing Functions to Reuse

- `getOrComputeTerminal/LegalMoves/Rewards` in `state-cache.ts` — exact pattern for classification cache (Phase 1, done)
- `canonicalMoveKey()` in `move-key.ts` — for availability checking via string match (Phase 3)
- `filterAvailableCandidates()` in `materialization.ts` — already does child-key filtering (Phase 3)
- `shouldExpand()` in `expansion.ts` — progressive widening gate (Phase 3)
- `fork()` in `kernel/prng.ts` — deterministic RNG forking for parallelization (Phase 4)
- `resolveDecisionBoundary()` in `rollout.ts` — must survive rollout removal (Phase 2)

## 6. Risks

- **Move quality regression**: Direct mode relies entirely on heuristic evaluation rather than rollout simulation. If the heuristic is weak, move quality may degrade. Mitigated by the FITL competence scenarios which assert correct action categories.
- **Test churn**: Removing rollout modes and presets will require updating many test files. This is necessary housekeeping — keeping dead code tested creates false confidence.
- **Phase 3 correctness**: Lazy materialization changes when classification happens, which could introduce bugs where moves are never classified. Mitigated by comparing `classificationCacheHits` + `materializeCalls` totals against pre-optimization baselines.
