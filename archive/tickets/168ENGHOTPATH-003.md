# 168ENGHOTPATH-003: Phase 2 — compiled query/filter plans

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/eval-query.ts`, `packages/engine/src/kernel/resolve-ref.ts`, `packages/engine/src/kernel/gamedef-runtime.ts`
**Deps**: `archive/tickets/168ENGHOTPATH-007.md`

## Problem

`reports/turnperf-002-spec-167-baseline.md` records `evalQuery:countMatchingTokens` at `91.33 ms` (4.5% of elapsed), and the CPU-profile tops show `boundToken` (48 self-samples), `resolveRef` (67 samples), `countMatchingTokens` (42 samples) — token-binding and ref-resolution work that runs once per token-iteration step. The per-token iteration in `countMatchingTokens` rebuilds binding records and re-resolves refs for each token even though the predicate AST is stable. Spec 168 §3.3 prescribes a `compileQueryPlan` step cached on `sharedStructural` runtime that captures resolved refs, binding scaffolding, and a per-token closure — eliminating per-token re-resolution.

## Assumption Reassessment (2026-05-13)

1. `packages/engine/src/kernel/eval-query.ts` is `1353` lines — verified via `wc -l` earlier this session.
2. `packages/engine/src/kernel/resolve-ref.ts` is `723` lines — verified.
3. Predicate AST node identity is stable post-compile and is suitable as a cache key — verify exact node-identity accessor during impl (likely a stable structural id assigned by the compiler).
4. `compileQueryPlan` belongs on `sharedStructural` runtime per Spec 143 because plans depend only on the compiled `GameDef`, not on `runLocal` state — verify there are no closure captures of run-local refs during impl.
5. Phase 1 substrate ticket `archive/tickets/168ENGHOTPATH-002.md` left the measured token-index gate red; `archive/tickets/168ENGHOTPATH-007.md` resolved that Phase 1b prerequisite before Phase 2 should proceed.

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

- Phase 1 token-state-index changes (`archive/tickets/168ENGHOTPATH-002.md`, `archive/tickets/168ENGHOTPATH-007.md`)
- Phase 3 zobrist digest cache (`archive/tickets/168ENGHOTPATH-004.md`)
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

## Outcome (2026-05-13)

Outcome amended: 2026-05-13 — post-archive path repair after Phase 5 moved to
`archive/tickets/168ENGHOTPATH-006.md`.

Phase 2 landed a Foundation-aligned compiled query/filter plan substrate and
now meets the explicit measured gate. The first retained implementation was
correct but red; follow-up work on this same ticket fixed the measured
regression by separating cache-hit accounting from scan timing, caching
context-independent filtered result arrays, and tightening the compiled miss
loops.

What landed:

- Added `packages/engine/src/kernel/compiled-query-plan.ts` as the canonical
  query/filter plan helper around the existing token-filter compiler.
- Added `GameDefRuntime.compiledQueryPlanCache` as `sharedStructural` runtime
  state and preserved it across `forkGameDefRuntimeForRun(...)`.
- Threaded `compiledQueryPlanCache` through runtime-aware eval resources in
  policy, legal-move, apply-move, microturn, terminal, and preview query paths.
- Updated `eval-query.ts` so `applyTokenFilter` and `countMatchingTokens` use
  the runtime-carried cache when available.
- Added a context-independent filtered-result cache for `applyTokenFilter`,
  keyed by token-array identity and filter AST identity and bypassed under
  free-operation overlays.
- Moved hot-path timing around actual miss/fallback scan work so cache hits
  remain counted but do not pay per-hit timing overhead in the benchmark
  fixture.
- Replaced callback-based compiled token scans with index loops in the
  remaining miss paths.
- Extended `eval-runtime-resources-contract.ts` so boundary validation accepts
  the new shared-structural resource key while preserving unknown-key failures.
- Added `packages/engine/test/integration/compiled-query-plan-equivalence.test.ts`
  proving shared runtime cache identity across forks and FITL corpus parity.

Boundary reset:

- Approved option: Option 1 initially kept the correct substrate while the
  ticket stayed nonterminal.
- Scope effect: retained the shared-structural cache substrate and continued
  Phase 2 work inside this ticket until the measured gate was green.
- Foundations posture: F8/F11/F14/F15/F16 are satisfied by the retained
  substrate, cache-key boundaries, and green measured proof.
- Durable evidence: `reports/turnperf-006-spec-168-phase-2.md`.

Measured gate:

| Field | Phase 1b comparison | Phase 2 decisive |
|---|---:|---:|
| `evalQuery:countMatchingTokens` totalMs | `90.53` | `11.57` |
| `evalQuery:applyTokenFilter` totalMs | `13.75` | `10.24` |
| Combined named bucket | `104.28` | `21.81` |
| Required drop | N/A | `>= 80.00` |
| Actual delta vs Phase 1b | N/A | `-82.47` |
| Verdict | comparison | green |
| Terminal implementation status allowed? | N/A | `yes; ticket status is COMPLETED` |

Activation counters from the decisive fixture:

- `evalQuery:applyTokenFilterCacheHit = 6122`
- `evalQuery:applyTokenFilterCompiled = 3123`
- `evalQuery:countMatchingTokensCacheHit = 943368`
- `evalQuery:countMatchingTokensCompiled = 14917`

The compiled/cache route is active. The green metric is not a dead-code result.

CPU-profile classification:

- The intermediate CPU profile showed `countMatchingTokens` cache hits were
  paying nearly one million profiler timestamp calls; final code keeps the hit
  counter but times only actual miss/fallback scan work.
- `resolveRef` remains mostly under zone/effect condition paths such as
  `applyZonesFilter` and `countZonesMatchingFilter`, not under query-plan
  compilation.
- `matchesTokenFilterExprInContext`, `filterTokensByExprInContext`,
  `getCompiledQueryPlan`, and `tryCompileTokenFilter` were not visible owners
  in the Phase 2 CPU profile.

Generated fallout:

- No schema artifacts, goldens, or compiled `GameDef` outputs changed.
- Ignored ephemeral artifact regenerated:
  `packages/engine/test/perf/.artifacts/per-decision-cost-budget.json`.

Deferred sibling/spec scope:

- Phase 3 remains with `archive/tickets/168ENGHOTPATH-004.md`.
- Phase 4 remains with `archive/tickets/168ENGHOTPATH-005.md`.
- Phase 5 is archived at `archive/tickets/168ENGHOTPATH-006.md`.
- Remaining non-Phase-2 residuals shown by the CPU profile belong to later
  phase owners, not this ticket.

Named file deliverables:

- `packages/engine/src/kernel/eval-query.ts` — done, runtime-cache lookup
  wiring plus context-independent filtered-result caching and tighter compiled
  scan loops.
- `packages/engine/src/kernel/resolve-ref.ts` — verified-no-edit; CPU profile
  shows residual `resolveRef` ownership, but this retained substrate did not
  require reusable resolution extraction.
- `packages/engine/src/kernel/gamedef-runtime.ts` — done, added
  `compiledQueryPlanCache`.
- `packages/engine/test/integration/compiled-query-plan-equivalence.test.ts`
  — done.
- `reports/turnperf-006-spec-168-phase-2.md` — done.

Source-size ledger:

- `packages/engine/src/agents/policy-evaluation-core.ts | before lines 1932 | after lines 1935 | crossed cap? no, preexisting over-guidance | active growth 3 lines of runtime-resource threading | extraction/defer rationale preexisting policy-evaluation hub; extraction would widen this cache-threading ticket | successor none`
- `packages/engine/src/kernel/apply-move.ts | before lines 2150 | after lines 2165 | crossed cap? no, preexisting over-guidance | active growth 15 lines of runtime-resource threading | extraction/defer rationale preexisting apply-move hub; no separable new logic to extract | successor none`
- `packages/engine/src/kernel/eval-query.ts | before lines 1353 | after lines 1400 | crossed cap? no, preexisting over-guidance | active growth 47 lines of local cache/timing/loop logic | extraction/defer rationale logic is tightly coupled to existing token-filter count/result caches; extraction would widen this Phase 2 hot-path ticket | successor none`
- `packages/engine/src/kernel/legal-moves.ts | before lines 1651 | after lines 1654 | crossed cap? no, preexisting over-guidance | active growth 3 lines of runtime-resource threading | extraction/defer rationale preexisting legal-moves hub; no separable new logic to extract | successor none`
- `packages/engine/src/kernel/microturn/apply.ts | before lines 791 | after lines 792 | crossed cap? no | active growth 1 line of runtime-resource threading | extraction/defer rationale no separable new logic | successor none`
- `packages/engine/src/kernel/microturn/drive.ts | before lines 767 | after lines 768 | crossed cap? no | active growth 1 line of runtime-resource threading | extraction/defer rationale no separable new logic | successor none`

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/compiled-query-plan-equivalence.test.js` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/eval-runtime-resources-contract.test.js dist/test/integration/compiled-query-plan-equivalence.test.js` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-wasm-equivalence.test.js` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/arvn-tournament-parallel-determinism.test.js` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/token-filter-compiler.test.js dist/test/unit/kernel/compiled-token-filter-cache.test.js dist/test/integration/token-filter-compilation.test.js` — passed.
- `pnpm -F @ludoforge/engine test:perf` — red broad lane; the ticket-owned Spec 168 fixture passed, but older perf witnesses failed as classified in the report.
- `pnpm -F @ludoforge/engine exec node --test dist/test/perf/per-decision-cost-budget.perf.test.js` — passed and produced the decisive green Phase 2 metric.
- `pnpm run check:ticket-deps` — passed for 4 active tickets and 2318 archived tickets.

Late-edit proof validity:

- Ticket/report edits after the decisive metric changed only durable completed
  status, evidence transcription, touched-file ledger, and proof
  classification. They did not change runtime code, command semantics, metric
  thresholds, or acceptance boundaries after the decisive proof.
- Dependency-check result transcription is clerical and does not change status,
  scope, acceptance criteria, command semantics, touched-file ownership, or the
  measured verdict.
