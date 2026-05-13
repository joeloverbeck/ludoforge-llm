# 168ENGHOTPATH-003: Phase 2 — compiled query/filter plans

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/resolve-ref.ts`, `packages/engine/src/kernel/gamedef-runtime.ts`
**Deps**: `archive/tickets/168ENGHOTPATH-001.md`

## Problem

`reports/turnperf-002-spec-167-baseline.md` records `evalQuery:countMatchingTokens` at `91.33 ms` (4.5% of elapsed), and the CPU-profile tops show `boundToken` (48 self-samples), `resolveRef` (67 samples), `countMatchingTokens` (42 samples) — token-binding and ref-resolution work that runs once per token-iteration step. The per-token iteration in `countMatchingTokens` rebuilds binding records and re-resolves refs for each token even though the predicate AST is stable. Spec 168 §3.3 prescribes a `compileQueryPlan` step cached on `sharedStructural` runtime that captures resolved refs, binding scaffolding, and a per-token closure — eliminating per-token re-resolution.

## Assumption Reassessment (2026-05-13)

1. `packages/engine/src/kernel/eval-query.ts` is `1353` lines — verified via `wc -l` earlier this session.
2. `packages/engine/src/kernel/resolve-ref.ts` is `723` lines — verified.
3. Predicate AST node identity is stable post-compile and is suitable as a cache key — verify exact node-identity accessor during impl (likely a stable structural id assigned by the compiler).
4. `compileQueryPlan` belongs on `sharedStructural` runtime per Spec 143 because plans depend only on the compiled `GameDef`, not on `runLocal` state — verify there are no closure captures of run-local refs during impl.

## Architecture Check

1. Cleaner than per-token re-resolution because compilation captures resolved ref paths and binding scaffolding once per call site; per-token iteration becomes a closure invocation taking only the token + state slice.
2. Plans live on `sharedStructural` runtime per Spec 143 — they depend only on the compiled `GameDef`, not run-local state. No per-run isolation needed (one compiled plan serves all concurrent runs of the same `GameDef`).
3. Foundation #1 Engine Agnosticism preserved — query plan compilation operates on generic kernel AST nodes; no game-specific branching.
4. Foundation #14 No Backwards Compatibility — old per-token re-resolution paths are deleted, not flagged. The compiled-plan path is the single execution surface.

## What to Change

### 1. Introduce `compileQueryPlan(predicate, bindEnv) -> CompiledQueryPlan`

Lazily compile query plans on first call site invocation. The plan captures:
- Resolved ref paths (precomputed via `resolveRef`)
- Binding scaffolding (variable-name to slot mapping, predicate evaluation order)
- A per-token closure: `(token, stateSlice) -> boolean | value`

### 2. Plan cache on `sharedStructural` runtime

Cache compiled plans on `GameDefRuntime.sharedStructural` (no per-run isolation). Cache key: predicate AST node identity. Cache lifetime: runtime lifetime (no eviction needed; the per-`GameDef` plan working set is bounded by the spec's call-site count).

### 3. Replace per-token iteration in `countMatchingTokens`, `applyTokenFilter`, and adjacent paths

Modify each per-token iteration site in `eval-query.ts` to:
- Look up (or compile) the plan keyed by predicate AST node identity
- Invoke the plan's per-token closure for each token in the iteration

Delete the old per-token re-resolution code paths (Foundation #14 — no compat shims).

### 4. Equivalence test

Add `packages/engine/test/integration/compiled-query-plan-equivalence.test.ts` (architectural-invariant class) — exercises the FITL canary corpus through both paths (compiled plan vs. a temporary opt-out flag for the test only) and asserts byte-identical query results across all call sites. The opt-out flag is test-only; it does NOT ship in production, per Foundation #14.

### 5. Per-phase measurement report

After landing, re-run the Phase 0 fixture and capture pre/post bucket decomposition into `reports/turnperf-NNN-spec-168-phase-2.md`. Acceptance: combined `evalQuery:countMatchingTokens + evalQuery:applyTokenFilter + token-binding/ref-resolution CPU-sample share` drops by **≥ 80 ms** on canonical probe.

## Files to Touch

- `packages/engine/src/kernel/eval-query.ts` (modify)
- `packages/engine/src/kernel/resolve-ref.ts` (modify — extract reusable resolution pieces if needed for plan compilation)
- `packages/engine/src/kernel/gamedef-runtime.ts` (modify — add `compileQueryPlan` cache to `sharedStructural`)
- `packages/engine/test/integration/compiled-query-plan-equivalence.test.ts` (new)
- `reports/turnperf-NNN-spec-168-phase-2.md` (new — measurements)

## Out of Scope

- Phase 1 token-state-index changes (`tickets/168ENGHOTPATH-002`)
- Phase 3 zobrist digest cache (`tickets/168ENGHOTPATH-004`)
- Phase 4 bytecode input row cache (`tickets/168ENGHOTPATH-005`)
- Reusing compiled plans inside `effect-compiler-codegen.ts` and `first-decision-compiler.ts` — deferred per spec §9 open question (extend only if Phase 2 measurement shows reusability is non-trivial)
- Routing query/filter ops through WASM (deferred to potential Spec 169 per Phase 5 escalation gate)

## Acceptance Criteria

### Tests That Must Pass

1. New `compiled-query-plan-equivalence.test.ts` — plan results identical to per-token re-resolution on canary corpus
2. Existing `arvn-tournament-wasm-equivalence.test.ts` (Spec 167 Phase 0) green
3. Existing `arvn-tournament-parallel-determinism.test.ts` (Spec 167 Phase 2) green
4. Existing `policy-bytecode-equivalence.test.ts` green
5. Existing suite: `pnpm turbo test`

### Invariants

1. Plans are pure functions of the compiled `GameDef` + canonical state slice; no per-run state leaks into compilation
2. Determinism: same predicate AST + same state → same query result, regardless of plan-cache state
3. Foundation #14 — no compat shim for the old per-token re-resolution path in production code (the test-only opt-out is gated behind a test flag, not exposed in production)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/compiled-query-plan-equivalence.test.ts` — Phase 2 architectural-invariant equivalence proof
2. Re-run `archive/tickets/168ENGHOTPATH-001.md` benchmark fixture; capture pre/post into `reports/turnperf-NNN-spec-168-phase-2.md`

### Commands

1. `pnpm -F @ludoforge/engine test packages/engine/test/integration/compiled-query-plan-equivalence.test.ts`
2. `pnpm -F @ludoforge/engine test:perf`
3. `pnpm turbo test`
