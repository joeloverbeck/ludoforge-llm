# POLPREVDRIVE-004: Per-drive `resolveRef` memoisation

**Status**: PENDING
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
3. `zobrist-incremental-parity-fitl.test.ts` — replay parity green within the 30-min budget on the `fitl-parity-zobrist` shard.
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
