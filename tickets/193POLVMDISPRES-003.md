# 193POLVMDISPRES-003: Optional negative cache for unsupported-feature verdicts (P2 — gated on ticket 002)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-evaluation-core.ts` (negative cache field + lookup in `evaluateCompiledExprWithVm`); possibly a new `policy-vm-negative-cache.ts` module if the cache class grows beyond a few lines.
**Deps**: `tickets/193POLVMDISPRES-002.md`

## Problem

Spec 193 §4.3 P2: once the typed-verdict refactor (ticket 001) lands and ticket 002's measurement shows insufficient gain, add a bounded negative cache keyed on `(decisionKey, featureKind)` so the unsupported verdict short-circuits the VM entry entirely on cache hit. The cache is bounded (LRU cap), deterministic (keyed on already-deterministic inputs), and structurally bound to Spec 189's `cacheBinding` lifetime.

**Gate condition**: Close this ticket with `Outcome: Declined — P1 measured gain meets per-spec threshold` if `tickets/193POLVMDISPRES-002.md`'s recorded measurement shows ≥10% individual wall-clock reduction OR ≥10% combined reduction in `PolicyBytecodeVmUnsupportedError`-attributed self-time across the five regressed workloads (per Spec 193 §8 P3 acceptance). Only implement when the per-spec threshold is unmet. The explicit verdict is recorded in `reports/fitl-perf-baseline-2026-05-24.md`'s Spec 193 P3 Measurement sub-section per ticket 002.

## Assumption Reassessment (2026-05-24)

1. Ticket 001's typed-verdict refactor is landed: `executeBytecode` returns `VmEvalResult`; `resolveVmFallbackFeature` returns `UNSUPPORTED_FEATURE` sentinel; `PolicyBytecodeVmUnsupportedError` deleted.
2. Spec 189 (`archive/specs/189-policy-eval-context-cache-eligibility.md`, COMPLETED) established the structural `cacheBinding` requirement on `PolicyEvaluationContext`. This ticket's negative cache binds to the same `cacheBinding` — no per-process global state; rebuilding the binding rebuilds the cache.
3. `decisionKey` is the kernel's stable decision identifier (`ChoicePendingRequest['decisionKey']`, string-typed). Verified in `packages/engine/src/kernel/choose-n-set-variable-propagation.ts`, `kernel/event-execution.ts`, `kernel/decision-sequence-analysis.ts`, `kernel/free-operation-viability.ts`, and `agents/plan-controller.ts:127` during `/reassess-spec` on 2026-05-24.
4. `featureKind` is the static-enum field on `FeatureRef` produced by the bytecode emitter (per `packages/engine/src/cnl/policy-bytecode/index.ts` — `FEATURE_REF_KINDS` enumeration).
5. The Spec 172 emit-counter pattern for cross-layer telemetry exists (`policyEncodedStateCacheObjectHit`, `policyEncodedStateCacheHashHit`-style counters at the policy-eval layer, aggregated by the sim-level `ENGINE_PER_DECISION_PROFILE` hook at `packages/engine/src/sim/run-game-steps.ts:98`). This ticket mirrors that pattern.
6. The `zobristKey` per-table LRU cache (~4096 entries) in `packages/engine/src/kernel/zobrist.ts` is the existing precedent for a bounded LRU cache in the kernel/agents layer; this ticket's cap is calibrated against the same precedent.
7. The Spec 192 trajectory-identity test (`packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts`) and the Spec 189 `POLEVALCACHE` cache-binding witness must both remain green after this ticket lands.

## Architecture Check

1. **Foundation 8 (Determinism Is Sacred)**: cache is keyed on already-deterministic inputs (`decisionKey` is kernel-stable, `featureKind` is a static enum). Cache state itself never feeds into evaluation results — it's a pure short-circuit; the VM result on cache miss is byte-identical to the VM result without the cache. Replay identity preserved; Spec 192 trajectory-identity test is the proof gate.
2. **Foundation 11 (Immutability)**: cache stores immutable verdict tuples (`{ feature, reason }`); no mutation of cached values; LRU eviction replaces entries with new immutable tuples.
3. **Foundation 13 (Artifact Identity and Reproducibility)**: cache version-keys on the bytecode-VM-version metadata so feature-kind support evolution (e.g., a future `Bytecode-VM expansion` spec adding new supported feature kinds) invalidates stale negative-cache entries automatically. No silent stranding of negative verdicts when the VM gains new capability.
4. **Foundation 15 (Architectural Completeness)**: the cache is a structurally-complete accelerator with a single canonical fallback path (cache miss → VM → tag check → fallback). No silent default; the dispatch-completeness invariant Spec 154 owns is unchanged because the cache only short-circuits the throw-free `'unsupported'` verdict to the same TS fallback that would handle it post-VM.
5. **Foundation 1 (Engine Agnosticism)**: cache is generic policy-evaluation infrastructure; no game-specific code. Applies to any GameDef whose authored policies trigger unsupported bytecode features.
6. **Spec 189 cacheBinding preservation**: cache binds structurally to the `cacheBinding` lifetime — rebuilding the binding rebuilds the cache. No per-process global state, no cross-context cache pollution. The existing Spec 189 `POLEVALCACHE` cache-binding witness remains the regression gate.

## What to Change

### 1. Add a bounded LRU negative cache

Add a private cache field to `PolicyEvaluationContext` (in `packages/engine/src/agents/policy-evaluation-core.ts`) or extract to a sibling module if it grows beyond ~30 lines. Cache keyed on `(decisionKey, featureKind)` tuple (encoded as a stable string for Map lookup); value is the cached `{ feature, reason }` verdict.

Cap size: 4096 entries (matching the `zobristKey` per-table LRU precedent). Calibrate during implementation if profiling shows different working-set size.

LRU eviction policy: standard Map-with-insertion-reorder pattern (delete + re-insert on hit to refresh recency).

### 2. Bind the cache to `cacheBinding` lifetime per Spec 189

The cache is a field on `PolicyEvaluationContext` (constructed alongside the evaluation context, lives for its lifetime); rebuilding the `cacheBinding` rebuilds the context and therefore rebuilds the cache. Per Spec 189's structural contract, no `cacheBinding`-bypass path is permitted.

### 3. Check the cache in `evaluateCompiledExprWithVm` before invoking the VM

Update `policy-evaluation-core.ts:1152` `evaluateCompiledExprWithVm`:

```ts
// 1. Cache lookup
const cacheKey = `${decisionKey}|${featureKind}`;
if (this.vmNegativeCache.has(cacheKey)) {
  this.vmNegativeCacheHits += 1;
  return this.evaluateCompiledExprDirect(expr, candidate);
}
this.vmNegativeCacheMisses += 1;

// 2. VM execution
const result = executeBytecode(bytecode, this.encodedState, vmContext);
if (result.status === 'ok') return result.value;

// 3. Cache the unsupported verdict
this.vmNegativeCache.set(cacheKey, { feature: result.feature, reason: result.reason });
// LRU enforcement: if size exceeds cap, delete oldest entry

return this.evaluateCompiledExprDirect(expr, candidate);
```

Note: `decisionKey` and `featureKind` must be resolvable at the call site. `decisionKey` is available via the kernel decision context (verify the threading path during implementation — may require minor plumbing if not currently in scope at this call site). `featureKind` requires upfront inspection of the bytecode's primary feature ref OR may need to be deferred until after the VM has run (in which case the cache lookup happens post-VM and only the WRITE side benefits; document this tradeoff if it surfaces).

### 4. Version-key the cache on bytecode-VM-version metadata

Add a version field to the cache class; on `PolicyEvaluationContext` construction, set the version to the current bytecode-VM-version from compiled `GameDef` metadata (per Foundation 13 — `archive/specs/192-fitl-perf-profiling-methodology.md` §3.3 references existing version-keying patterns; locate the canonical bytecode-VM-version source during implementation).

When the version changes (e.g., a future spec extends VM-supported feature kinds), the cache invalidates implicitly because a new `PolicyEvaluationContext` is constructed against the new `GameDef` — but the version field provides a defense-in-depth check that flags stale-binding bugs during implementation rather than silently caching stale verdicts.

### 5. Emit cache telemetry via the Spec 172 counter pattern

Mirror the existing `policyEncodedStateCacheObjectHit` pattern:
- `policyBytecodeVmNegativeCacheHit` counter (incremented on cache hit)
- `policyBytecodeVmNegativeCacheMiss` counter (incremented on cache miss, before VM entry)
- `policyBytecodeVmNegativeCacheStore` counter (incremented on storing an unsupported verdict)

Counters live on `PolicyEvaluationContext` (or its `cacheBinding`-bound runtime); the sim-level `ENGINE_PER_DECISION_PROFILE` hook (`packages/engine/src/sim/run-game-steps.ts:98`) aggregates and emits them per-decision when the env flag is set.

### 6. Unit test the cache

New test file `packages/engine/test/unit/agents/policy-vm-negative-cache.test.ts`:
- Cache hit returns cached verdict and short-circuits VM (verify by asserting `executeBytecode` is NOT invoked on second call with same `(decisionKey, featureKind)`).
- Cache miss runs VM and stores verdict on `'unsupported'` result; does NOT store on `'ok'` result.
- LRU eviction at cap (insert 4097 entries, verify oldest entry evicted).
- Version-keying: changing the version field invalidates cache state (or is enforced via context rebuild — match the implementation choice from change item 4).
- `cacheBinding` rebuild semantics: a new `PolicyEvaluationContext` with a new `cacheBinding` starts with an empty cache (Spec 189 structural property).

### 7. Re-run ticket 002's perf witness to certify post-P2 gain

After this ticket's code lands, re-run the Spec 192 baseline harness on the five regressed workloads (per ticket 002's command list) to certify the post-P2 gain meets the per-spec acceptance threshold. Append a "Spec 193 P2 Measurement" sub-section to `reports/fitl-perf-baseline-2026-05-24.md` with the new measurement table. This re-measurement is part of this ticket's deliverable; the JSON outputs are written to `reports/perf-baseline/<workload>-<HEAD-sha>.json` (new SHA, post-P2).

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — add cache field + cache lookup in `evaluateCompiledExprWithVm`; add counter increments; version-key on construction)
- `packages/engine/src/agents/policy-vm-negative-cache.ts` (new, conditional — extract cache class if it grows beyond ~30 lines; otherwise inline in `policy-evaluation-core.ts`)
- `packages/engine/test/unit/agents/policy-vm-negative-cache.test.ts` (new — covers cache hit/miss, LRU eviction, version-keying, `cacheBinding` rebuild)
- `reports/perf-baseline/parity-drive-<HEAD-sha>.json` (new — post-P2 measurement; new SHA)
- `reports/perf-baseline/bounded-termination-1002-<HEAD-sha>.json` (new)
- `reports/perf-baseline/diagnose-parity-runGame-1001-<HEAD-sha>.json` (new)
- `reports/perf-baseline/policy-preview-parity-arvn-1008-<HEAD-sha>.json` (new)
- `reports/perf-baseline/arvn-tournament-parallel-<HEAD-sha>.json` (new)
- `reports/fitl-perf-baseline-2026-05-24.md` (modify — append Spec 193 P2 Measurement sub-section)

## Out of Scope

- No further `Bytecode-VM expansion` (a separate spec if Spec 192 §4.5 escalation trigger fires after this ticket's re-measurement).
- No change to the typed-verdict refactor (ticket 001 owns that and is a hard prerequisite).
- Cache is per-evaluation-context, not per-GameDef or per-process — sharing across evaluations is out of scope and would violate Spec 189's `cacheBinding` lifetime contract.
- No change to the canonical Zobrist key, the encoded state, the bytecode emitter, or any other adjacent infrastructure.
- No tightening of lane budgets — separate deferred follow-up per Spec 193 §11.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test` — 100% pass (existing suite, including the new `policy-vm-negative-cache.test.ts`).
2. `pnpm turbo typecheck` — 100% pass.
3. Spec 192 trajectory-identity test green across all six workloads (Foundation 8 proof — replay identity unchanged by cache).
4. Spec 189 `POLEVALCACHE` cache-binding witness remains green (cache binding remains structural; this ticket adds a new cache that respects the same discipline).
5. Spec 154 paired-contract architectural-invariant test (`policy-bytecode-fallback-completeness.test.ts`, shape-adapted by ticket 001) remains green (negative cache does not bypass the dispatch-completeness guarantee).
6. New `policy-vm-negative-cache.test.ts` covers hit, miss, LRU eviction, version-keying, and `cacheBinding` rebuild.
7. Post-P2 perf re-measurement (per change item 7) shows per-spec acceptance threshold met (≥10% individual wall-clock reduction OR ≥10% combined unsupported-error self-time reduction across the five regressed workloads).
8. `pnpm run check:ticket-deps` green.

### Invariants

1. Cache state never feeds into evaluation results (proven by replay-identity test + by the architectural-invariant test asserting cache hit and cache miss produce byte-identical evaluation output).
2. Cache is cleared when `cacheBinding` is rebuilt (Spec 189 structural property preserved).
3. Cache size never exceeds the LRU cap (proven by the LRU-eviction unit test).
4. Cache version invalidates when bytecode-VM-version changes (proven by the version-keying unit test, OR by the construction-time version-set behavior — match implementation choice).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-vm-negative-cache.test.ts` (new) — unit tests covering hit, miss, LRU eviction, version-keying, `cacheBinding` rebuild semantics per change item 6.
2. No modifications to existing tests required (the new cache is a transparent accelerator on the existing `evaluateCompiledExprWithVm` path; behavior is byte-identical to ticket 001's post-refactor state from the perspective of all existing tests).

### Commands

1. `pnpm turbo build` (engine build prerequisite).
2. `pnpm -F @ludoforge/engine test` (full engine suite — must be 100% pass).
3. `pnpm turbo typecheck` (TypeScript exhaustiveness gate).
4. `pnpm turbo lint`.
5. `node --test packages/engine/dist/test/integration/perf-baseline-trajectory-identity.test.js` (trajectory-identity standalone sanity).
6. `node --test packages/engine/dist/test/unit/agents/policy-vm-negative-cache.test.js` (new test standalone sanity).
7. Re-run Spec 192 baseline harness per ticket 002's command list against five regressed workloads; record post-P2 measurement in `reports/fitl-perf-baseline-2026-05-24.md` and commit body.
8. `pnpm run check:ticket-deps` (ticket integrity gate).
