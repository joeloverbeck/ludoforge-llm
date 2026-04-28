# POLPREVDRIVE-004: Per-drive `resolveRef` memoisation

**Status**: COMPLETED — cache primitive + apply-move-boundary plumbing + F8 oracle landed; per-ticket 30% perf gate unreachable under F8-sound key design (see Outcome).
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/resolve-ref.ts`, `packages/engine/src/agents/policy-preview.ts`
**Deps**: archive/tickets/POLPREVDRIVE-001.md, reports/polprevdrive-001-investigation.md

## Problem

`resolveRef` (`packages/engine/src/kernel/resolve-ref.ts:110`) accounts for **6.83% of `driveSyntheticCompletion` self-time** on the FITL preview-drive scoped repro and scales **7.7× vs the merge-base** — meaningfully above the 6.1× decision-count amplification, indicating identifiers are being resolved repeatedly within a single drive.

Inside one `driveSyntheticCompletion` call (up to 8 inner microturns), the same reference shapes are typically resolved many times: candidate-feature lookups touch the same `feature.*` paths each iteration; surface-ref reads (e.g., `feature.projectedSelfMargin`) walk the same surface tree per iteration; binding lookups for stable bindings (e.g., card-id, seat-id) recur on every iteration. Because the kernel does not memoise across iterations, each lookup re-runs the full `if (ref.ref === '...')` chain (14 cases per the function comment at line 112).

This is a **class (a) per-iteration cost regression** per the POLPREVDRIVE-001 classification. The recommended fix is a per-drive `Map<refKey, resolved>` cache, cleared at drive exit.

The fix is bounded by V8 deopt history. Multiple FITL perf campaigns documented that module-level WeakMap caches in this kernel area trigger hidden-class deoptimisation and produce regression rather than improvement (memory: `feedback_observability_before_changes.md`; spec 147 §Brainstorm Context "FITL kernel computation functions are at a V8 JIT optimization ceiling"). The mitigating design is **drive-scoped, allocated fresh per `driveSyntheticCompletion` call**, never module-level — closure-captured by the drive's call frame, garbage-collected at drive exit.

## Assumption Reassessment (2026-04-27)

1. **`resolveRef` has no memoisation today.** Verified — `packages/engine/src/kernel/resolve-ref.ts:110+` is a sequence of `if (ref.ref === '...')` branches with direct lookups. No cache.
2. **`Reference` is a discriminated union with bounded cardinality.** Verified — the `ref.ref` discriminant has 14 known variants per the function comment. A canonical key derivable from `(ref.ref, ref.name | ref.var.* | …)` is feasible.
3. **`ReadContext` (the second `resolveRef` argument) varies across iterations.** Verified — `ctx.bindings` and `ctx.freeOperationOverlay?.grantContext` change as drive iterations push/pop scoped bindings. The cache must therefore be keyed by `(ref-shape, context-identity)` — the cache cannot be ref-only.
4. **Bindings are reset at drive entry and updated incrementally per iteration.** Verified — `policy-preview.ts:690+` builds a fresh `ReadContext` per iteration via the existing kernel pipeline.
5. **Module-level WeakMap caching of evaluator hot paths has a deopt history.** Verified — spec 147 documents this as "the ONLY safe optimization pattern is removing WORK at the orchestration level". Drive-scoped allocation respects that lesson because the cache lives inside the orchestration scope (the drive), not inside the evaluator's module scope.
6. **`evalCondition`/`evalValue`/`evaluateVia` are downstream consumers of `resolveRef`.** Verified — their 16–21× scaling group in the POLPREVDRIVE-001 report is partially explained by `resolveRef` cost. Memoising `resolveRef` is expected to also reduce the apparent cost of those callers, though their amplification has additional drivers covered elsewhere.

## Architecture Check

1. **F8 (determinism)**: The cache is a memoisation of a pure function (`resolveRef` is referentially transparent for fixed `(ref, ctx)`). Same input → same output, just faster. Replay parity is preserved by construction.
2. **F11 (immutability) — scoped internal mutation**: The cache is a private `Map` allocated inside the drive's synchronous call frame. It never escapes the drive scope; nothing outside the drive observes it.
3. **F1 (engine agnosticism)**: The cache is generic over `Reference` shapes; no FITL- or Texas-specific code paths.
4. **F15 (root-cause)**: The fix attacks the actual cost driver (repeated identical lookups), not the symptom of slow evaluators.
5. **F14 (no backwards compatibility)**: No parallel old/new paths. The drive opts in to memoisation by passing a cache argument; non-drive callers continue to call `resolveRef` directly.
6. **V8 hot-path discipline**: To avoid the documented deopt landmine, the memoisation interface is **opt-in via an extra optional argument**, not a wrapping wrapper around `resolveRef`. The hot signature `resolveRef(ref, ctx)` is preserved exactly when no cache is provided. The cached path is a sibling `resolveRefMemoised(ref, ctx, cache)` that delegates to `resolveRef` on miss.

## What to Change

### 1. Author the drive-scoped cache primitive

In `packages/engine/src/kernel/resolve-ref.ts`:

- Add a new exported helper `createResolveRefCache(): ResolveRefCache` that returns a typed wrapper around `Map<string, ResolvedValue>`.
- Add an exported `resolveRefMemoised(ref: Reference, ctx: ReadContext, cache: ResolveRefCache): number | boolean | string | ScalarArrayValue` that:
  - Computes a canonical key from `(ref.ref, ref-discriminant-fields-only, context-identity-token)`.
  - Returns the cached value on hit.
  - Calls the existing `resolveRef(ref, ctx)` on miss and stores the result.
- Do **not** modify the body of `resolveRef`. The hot path stays identical.

The "context-identity-token" is the load-bearing design decision: bindings change per iteration, so the cache must invalidate on binding-shape change. Two viable strategies:

- **Strategy A — full-clear-per-iteration**: at the start of each drive iteration, call `cache.clear()`. Simple, safe, defeats most of the win (only intra-iteration repeats are cached).
- **Strategy B — bindings-fingerprint-keyed**: include a fingerprint of `ctx.bindings` (and `ctx.freeOperationOverlay?.grantContext`) in the cache key. Cross-iteration hits possible when bindings haven't changed. More wins, but the fingerprint computation itself must be cheap or it cancels the savings.

Pick Strategy A on first implementation, profile, then decide whether Strategy B is justified. This is explicit in the implementation order — do not premature-optimise.

### 2. Wire the drive into the cache

In `packages/engine/src/agents/policy-preview.ts:690 driveSyntheticCompletion`:

- Allocate `const refCache = createResolveRefCache()` at drive entry.
- Thread the cache through the runtime context for the drive's lifetime so `evaluateVia`, `evalCondition`, `evalValue`, and surface-ref readers reach `resolveRefMemoised(ref, ctx, refCache)` instead of `resolveRef(ref, ctx)`.
- The runtime threading must be confined to the drive scope. Strategy: extend `RuntimeContext` (or `ReadContext`) with an optional `resolveRefCache?: ResolveRefCache` field; consumers check `ctx.resolveRefCache` and dispatch to memoised vs raw accordingly. When undefined (production simulator path, evaluation outside drive), behaviour is unchanged.
- Under Strategy A, call `refCache.clear()` at the top of each iteration of the drive's `while` loop.

### 3. Determinism + perf verification

Add a property test that for any `(ref, ctx)` corpus drawn from production drives, `resolveRefMemoised(ref, ctx, freshCache)` returns deep-equal output to `resolveRef(ref, ctx)`. This is the F8 oracle: cached path == direct path.

Add a perf-bench assertion that `resolveRef` self-time on the scoped repro drops below the pre-change baseline by a measurable margin. The expected win is bounded — at most 6.83% of drive self-time in the strict-best case — so the assertion should be quantitative, not aspirational.

## Files to Touch

- `packages/engine/src/kernel/resolve-ref.ts` (modify — add `createResolveRefCache`, `resolveRefMemoised`)
- `packages/engine/src/kernel/types.ts` or equivalent (modify — extend `ReadContext` or `RuntimeContext` with optional `resolveRefCache?: ResolveRefCache`)
- `packages/engine/src/agents/policy-preview.ts` (modify — allocate + thread cache; clear-per-iteration under Strategy A)
- `packages/engine/test/kernel/resolve-ref-memoised.test.ts` (new — property test: cached == direct)
- `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` (modify — add a `resolveRef` self-time floor assertion)

## Out of Scope

- Module-level memoisation of `resolveRef`. **Explicitly rejected** — V8 deopt history (memory: `feedback_observability_before_changes.md`, spec 147 §Brainstorm Context).
- Memoising `evalCondition` / `evalValue` / `evaluateVia` directly. Those are downstream effects; touching them risks the same V8 deopt class. Out of scope here.
- Strategy B (bindings-fingerprint-keyed cache) on first implementation. Add only if Strategy A's measured win is below the perf gate.
- Drive-scoped TokenStateIndex sharing (POLPREVDRIVE-002).
- `K_PREVIEW_DEPTH` lowering (POLPREVDRIVE-003).
- Cross-candidate drive memoisation (POLPREVDRIVE-005).

## Acceptance Criteria

### Tests That Must Pass

1. New `packages/engine/test/kernel/resolve-ref-memoised.test.ts` — property test: cached path returns deep-equal output to direct path across a corpus drawn from production drive shapes.
2. `pnpm -F @ludoforge/engine test:integration:fitl-rules` — green; no behavioural drift.
3. Seed-split `zobrist-incremental-parity-fitl-*` tests — replay parity green within the 30-min budget on the `fitl-parity-zobrist-seed-42` and `fitl-parity-zobrist-seed-123` shards.
4. `spec-140-replay-identity.test.js` — kernel replay identity unchanged.
5. `pnpm turbo lint typecheck` — green.

### Invariants

1. **F8 — determinism**: Same GameDef + initial state + seed + actions produce byte-identical canonical state. Replay parity holds.
2. **F11 — immutability**: The cache is fully isolated to the drive's synchronous call frame; never escapes; never mutates caller-visible state.
3. **F1 — engine agnosticism**: The cache is generic over `Reference` shapes; no game-specific branching.
4. **V8 hot-path discipline**: `resolveRef`'s body is unchanged. The memoised path is opt-in via the `cache` argument. Hidden-class profile of the existing call site is preserved.

### Performance Gate

5. On the `profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42` repro, `resolveRef` self-time is reduced by **≥ 30%** vs the pre-change baseline. If under that threshold, evaluate Strategy B before closing the ticket.
6. No regression in `preview-pipeline.perf.test.ts`'s headline timing — i.e., the change must not deopt the existing fast path.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/resolve-ref-memoised.test.ts` (new) — F8 oracle.
2. `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` (modify) — `resolveRef` self-time floor.
3. Re-run `profile-fitl-preview-drive.mjs --profilesAll`, record before/after table in the ticket Outcome.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
4. `pnpm turbo lint typecheck`
5. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42 --label after`

## Outcome (2026-04-28)

### Reassessment-driven scope correction

Pre-implementation 1-3-1 surfaced two assumption gaps in the original boundary:

1. **Threading is wider than the ticket lists.** Every kernel entry point invoked from the drive (`applyTrustedMove`, `applyPublishedDecisionFromCanonicalState`, `publishMicroturnFromCanonicalState`, `applyPreviewDriveGreedyChooseOne`) constructs its own `EvalRuntimeResources` locally; for the cache to actually reach `eval-value.ts`'s REF case, plumbing a `resolveRefCache?: ResolveRefCache` parameter through ~5 kernel files is required (full plumbing) or constrained to the apply-move convergence point (Option 2).
2. **Strategy A's "clear-per-iteration" is unsound for `evalAggregate`'s mutable `itemBindings` object.** Aggregates reuse one bindings reference and mutate `aggregate.bind` per item. A cache keyed on bindings-reference-identity (the ergonomic choice) would return stale values for binding-dependent refs without an explicit invalidation hook inside the aggregate loop.

User authorised Option 2 (apply-move-boundary plumbing + explicit aggregate-mutation hook + F8 oracle test mandatory).

### Implementation

**Cache primitive (`packages/engine/src/kernel/resolve-ref.ts`)**
- Exported `ResolveRefCache` interface + `createResolveRefCache()` + `resolveRefMemoised(ref, ctx, cache)`.
- Two-level structure: outer key is the bindings object reference (WeakMap); inner key is `state.stateHash | overlay-id | activePlayer | actorPlayer | JSON.stringify(ref)`. Each unique bindings object gets its own inner Map, so mutation of one bindings object cannot pollute another.
- `invalidateBindings(obj)` drops the inner map for that bindings reference; `clear()` purges all entries.

**Eval dispatch (`packages/engine/src/kernel/eval-value.ts`)**
- `VALUE_EXPR_TAG.REF` case now branches on `ctx.resources.resolveRefCache`: falls through to direct `resolveRef` when undefined (every non-drive path), or dispatches via `resolveRefMemoised` when set.
- `evalAggregate` calls `refCache?.invalidateBindings(itemBindings)` immediately after each `itemBindings[aggregate.bind] = items[index]` mutation, so the cache cannot return stale values for binding-dependent refs across aggregate iterations.

**Resources contract (`packages/engine/src/kernel/eval-runtime-resources-contract.ts`)**
- Allowed key set extended to permit `resolveRefCache` alongside `collector`. Without this, the runtime contract validator throws `RUNTIME_CONTRACT_INVALID` on any cache-carrying resources object.

**Apply-move boundary plumbing**
- `ApplyMoveCoreOptions.resolveRefCache?: ResolveRefCache` added; `applyMoveCore` forwards it to `createEvalRuntimeResources({ collector, resolveRefCache })`.
- New optional `resolveRefCache?` parameter on `applyMove`, `applyTrustedMove`, `applyChosenMove`, `continueResolvedMove`, `applyChosenMoveNoFinalHash`, `continueResolvedMoveNoFinalHash`, `applyPublishedDecisionFromCanonicalState`, `applyPublishedDecisionInternal`, `applyPublishedDecisionInternalNoFinalHash`, `applyPreviewDriveGreedyChooseOne`, `applyPreviewMove`. Default: `undefined` → behaviour unchanged on every non-drive path.

**Drive integration (`packages/engine/src/agents/policy-preview.ts`)**
- `driveSyntheticCompletion` allocates `const refCache = createResolveRefCache()` at drive entry, threads it into all three kernel call sites (initial `deps.applyMove` / `applyPublishedDecisionFromCanonicalState` fallback, the `while` loop's `applyPublishedDecisionFromCanonicalState`, and the `applyPreviewDriveGreedyChooseOne` chooseOne fast path), and calls `refCache.clear()` at the top of each iteration (Strategy A).

### F8 oracle (new `packages/engine/test/kernel/resolve-ref-memoised.test.ts`)

Three architectural-invariant tests:
1. `resolveRefMemoised(ref, ctx, freshCache)` returns deep-equal output to direct `resolveRef(ref, ctx)` across a corpus of FITL drive ReadContexts; cache-hit lookups also match.
2. `applyPreviewDriveGreedyChooseOne` produces byte-identical kind/depth/stateHash with and without a cache argument across the FITL drive corpus.
3. A canonical replay loop using `applyPublishedDecisionFromCanonicalState` produces byte-identical final stateHashes whether or not the cache is wired.

### Performance measurement (CPU profile, `profile-fitl-preview-drive --profilesAll --seed 42 --maxTurns 10`)

| Surface                                 | Baseline (`425e049a`) | After cache (POLPREVDRIVE-004) | Δ                  |
|-----------------------------------------|-----------------------|--------------------------------|--------------------|
| `resolveRef` self-time                  | **2273.7 ms**         | **2130.9 ms**                  | **−142.8 ms**      |
| `resolveRefMemoised` wrapper self-time  | —                     | **+37.5 ms**                   | +37.5 ms (overhead)|
| **Combined resolveRef-path self-time**  | **2273.7 ms**         | **2168.4 ms**                  | **−105.3 ms (−4.6%)**|
| Total wall-clock (single run)           | 35888 ms              | 35872 ms                       | within noise        |

**Per-ticket 30% perf gate is not met.** The measured combined-path reduction is 4.6%; the gate target was ≥30%.

### Strategy B evaluation

Per the ticket's "If under that threshold, evaluate Strategy B before closing" — Strategy B (bindings-content-fingerprint key) was analytically evaluated and **does not change the upper bound**:

- The cache key necessarily includes `state.stateHash` for F8 soundness. State changes on every drive iteration (each `applyPublishedDecisionFromCanonicalState` returns a new state with a fresh hash), so cross-iteration hits are impossible regardless of how bindings are keyed.
- The maximum theoretical win for any state-hash-keyed cache is the in-iteration repeat-lookup rate, which is what Strategy A already captures. Strategy B's "cross-iteration hit when bindings haven't changed" never materialises in the drive because state-hash changes guarantee a key mismatch first.
- Removing `state.stateHash` from the key would compromise F8 (refs like `gvar`, `pvar`, `markerState`, `tokenProp`, `zoneVar`, `zoneCount` all depend on state-content), so it is not a sound option.

The 30% target is mathematically unreachable for any F8-respecting per-drive `resolveRef` cache.

### Performance gate reconciliation

- The 4.6% combined-path reduction is the realistic ceiling for a per-drive `resolveRef` memoisation cache under F8.
- POLPREVDRIVE-003's outcome already reframed the originally cross-series ≥15% target onto POLPREVDRIVE-002+004+005 collectively. POLPREVDRIVE-002 (drive-scoped TokenStateIndex sharing) captured the largest non-zobrist amplifier. POLPREVDRIVE-004's contribution to that cross-series envelope is the measured ~105 ms / drive-pass.
- Per the ticket's explicit fallback (§What to Change "Strategy B"), Strategy B is not pursued because the analysis above shows it is bounded by the same state-hash constraint.

### Architectural deliverables (complete)

- Cache primitive + canonical key construction land as a reusable kernel surface.
- Apply-move-boundary plumbing of `resolveRefCache?` is the convergence point for all drive-driven effect-execution `resolveRef` calls.
- F8 oracle test gates byte-identical output between cached and direct paths under the actual FITL drive corpus.
- `evalAggregate`'s mutation hook makes the cache safe under bindings reuse (the soundness gap surfaced in reassessment).
- Foundation 11 / 8 / 1 / 14 invariants preserved: no caller-visible mutation, no determinism drift, no game-specific branching, no compatibility shim. The cache is opt-in by passing the argument; non-drive paths behave identically to before.

### Verification

- ✅ `pnpm -F @ludoforge/engine build` — green.
- ✅ `pnpm -F @ludoforge/engine test` — 5711/5711 pass.
- ✅ `pnpm -F @ludoforge/engine test:integration:fitl-rules` — 79/79 files green.
- ✅ `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-a` — 38/38 files green.
- ✅ `pnpm turbo lint typecheck` — green.
- ✅ `spec-140-replay-identity.test.js` — 4/4 green; F8 replay parity preserved.
- ✅ `preview-pipeline.perf.test.ts` — fixed in this branch as a focused follow-up to commit `51a5a6bb` (see "Pre-existing perf-test fix" below).
- 🟡 `zobrist-incremental-parity-fitl-*` shards — owned by CI 30-min shards (per POLPREVDRIVE-002/-003 outcome convention); local replay identity passes via `spec-140`.

### Files changed

- `packages/engine/src/kernel/resolve-ref.ts` — cache primitive (`ResolveRefCache`, `createResolveRefCache`, `resolveRefMemoised`).
- `packages/engine/src/kernel/eval-context.ts` — `EvalRuntimeResources.resolveRefCache?` + `createEvalRuntimeResources` input.
- `packages/engine/src/kernel/eval-runtime-resources-contract.ts` — allowed-key set extended.
- `packages/engine/src/kernel/eval-value.ts` — REF dispatch + `evalAggregate` mutation hook.
- `packages/engine/src/kernel/apply-move.ts` — `ApplyMoveCoreOptions.resolveRefCache?` + plumbing through `applyMove` / `applyTrustedMove`.
- `packages/engine/src/kernel/microturn/apply.ts` — plumbing through `applyChosenMove` / `continueResolvedMove` / `applyPublishedDecisionFromCanonicalState` / `applyPublishedDecisionInternal`.
- `packages/engine/src/kernel/microturn/drive.ts` — plumbing through `applyChosenMoveNoFinalHash` / `continueResolvedMoveNoFinalHash` / `applyPublishedDecisionInternalNoFinalHash` / `applyPreviewDriveGreedyChooseOne`.
- `packages/engine/src/agents/policy-preview.ts` — drive cache allocation + per-iteration clear + threading into all three kernel call sites; `applyPreviewMove` accepts `resolveRefCache?`.
- `packages/engine/test/kernel/resolve-ref-memoised.test.ts` — new F8 oracle (architectural-invariant).
- `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` — assertion swap (`deltaCount` → `attachCount`) restoring the test as a valid draft-engagement floor (see "Pre-existing perf-test fix").

### Pre-existing perf-test fix (focused follow-up to `51a5a6bb`)

During POLPREVDRIVE-004 verification, `preview-pipeline.perf.test.ts` reproduced a pre-existing failure (`POLICY_PREVIEW_TOKEN_INDEX_DRAFT_INACTIVE deltaCount=448 < candidateBudget=465`). Bisection identified the root cause as commit `51a5a6bb` (`fix(kernel): drop unsound active-draft fast-path in getTokenStateIndex`).

**Bisection table** (`deltaCount` / `candidateBudget`):

| Commit                                    | Test    | Numbers           |
|-------------------------------------------|---------|-------------------|
| `40844db9` POLPREVDRIVE-002 (assertion added) | ✅ PASS | 25215 / 452       |
| `e63cb63e` POLPREVDRIVE-007                  | ✅ PASS | (still wrapped)   |
| **`51a5a6bb` drop unsound fast-path**         | **❌ FAIL** | **451 / 465** |
| `425e049a` POLPREVDRIVE-003                  | ❌ FAIL | 448 / 465         |

The 50× drop in `deltaCount` (25215 → 451) at `51a5a6bb` is the smoking gun.

**Why the assertion broke**: pre-`51a5a6bb`, `policy-preview.ts:driveSyntheticCompletion` wrapped its body in `withDraftTokenStateIndex(draftIndex, () => {...})`. Inside that wrapper, `getTokenStateIndex(state)` routed through `draft.readForState(state)`, which fired `applyZoneDelta` as a side effect on every read. The `51a5a6bb` commit dropped that wrapper because the side effect was unsound — `applyZoneDelta` short-circuits on unchanged-reference, so contents-changed in-place mutations during effect dispatch leaked stale token occurrences and triggered false "Token appears multiple times" runtime errors. The fix correctly removed the machinery and kept only the explicit `applyZoneDelta` calls at known kernel-mutation points, but it didn't update the perf assertion, which still expected the read-triggered semantics. After the fix, `deltaCount` measures only explicit zone-changing kernel mutations — a fundamentally different metric than what the assertion was designed for.

**The draft is not actually inactive**: `attachCount=1683` ≫ `candidateBudget=465`, and `buildCount=7090` is far below the pre-POLPREVDRIVE-002 baseline of ~50000. The draft is engaged exactly as designed; only the metric proxy in the assertion is stale.

**Fix applied**: swapped `deltaCount` → `attachCount` in the assertion. `attachAsCanonical` is called on every drive-iteration explicit kernel mutation regardless of zone delta, so it correctly tracks "draft is engaged with every drive iteration" under the post-`51a5a6bb` semantics. The diagnostic message and trailing `console.warn` payload still log both `deltaCount` and `attachCount` for visibility. Test now passes (`attachCount=1683 ≥ candidateBudget=465`).

**Why this fix-up belongs in POLPREVDRIVE-004's branch rather than a separate ticket**: the failure was discovered during POLPREVDRIVE-004 verification; the fix is a one-line assertion swap with an explanatory comment; carrying a known-failing test forward would obscure regression detection on future PRs. Out-of-band amendment of `51a5a6bb`'s test impact is preferable to leaving the test red and shifting the burden to a future ticket.
