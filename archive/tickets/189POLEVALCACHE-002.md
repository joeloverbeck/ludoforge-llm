# 189POLEVALCACHE-002: Distilled cache-dedup architectural-invariant test + isolated-binding negative test

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/189POLEVALCACHE-001.md`

## Problem

The only guard against the silent cache-bypass that Spec 189 closes is the convergence-witness `172POLEVASTA-001` — a heavy 4-profile preview-drive perf-lane workload that asserts an *aggregate* `duplicateEncodedStateRebuilds === 0`. It localizes "something rebuilt too much" but not "which call site," and it is too slow and coarse to serve as the primary regression guard for the new `cacheBinding` contract.

Spec 189 §6 calls for distilling the duplicate-rebuild half of `172POLEVASTA-001` into a small, fast architectural-invariant unit test that does not need the full perf workload, plus a negative test proving the explicit uncached path remains reachable. Once 189POLEVALCACHE-001 makes cache participation a structural property, this test proves the property directly at the construction-contract level.

## Assumption Reassessment (2026-05-22)

1. Depends on `archive/tickets/189POLEVALCACHE-001.md`, which introduces `PolicyEvalCacheBinding` and the required `cacheBinding` input — this test asserts the contract that ticket establishes.
2. `tryBuildEncodedState` (`policy-evaluation-core.ts:92`) is the encoded-state builder; `compilePolicyBytecode` (`packages/engine/src/cnl/policy-bytecode/compile.ts:39`) compiles bytecode. The shared caches live on `GameDefRuntime` (`packages/engine/src/kernel/gamedef-runtime.ts`): `policyEncodedStateCache`, `policyBytecodeCache`. Confirmed this session via `/reassess-spec`.
3. An existing architectural-invariant test already covers the constructor: `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts`. The new dedup/negative assertions are distinct (they prove the *caching contract*, not constructor field handling), so a dedicated sibling file under `test/architecture/` matches the established placement convention for architectural-invariant tests.
4. The existing `policy-encoded-state-cache.test.ts` and `policy-bytecode-cache.test.ts` (unit/agents) test the caches in isolation; this test proves the higher-level guarantee that a `runtime` binding deduplicates across two `PolicyEvaluationContext` constructions on the same state.

## Architecture Check

1. **Distillation over re-bless** (per `.claude/rules/testing.md`). The duplicate-rebuild property holds across any legitimate construction, not just the witness trajectory — so it belongs as an `architectural-invariant`, restated as a property assertion, rather than a trajectory-pinned `convergence-witness`. This permanently removes the detection-distance tax of the aggregate perf witness for this defect class.
2. **Engine-agnostic** (Foundation 1). The test exercises generic agent-layer construction with a synthetic/compiled GameDef; no game-specific assumptions.
3. **Testing as proof** (Foundation 16). The structural cache-eligibility property claimed by Spec 189 is proven by an automated test, not assumed. The negative test proves the uncached path is still reachable (so the contract did not over-constrain).
4. No backwards-compatibility shims; test-only addition.

## What to Change

### 1. Add a cache-dedup architectural-invariant test

Construct two `PolicyEvaluationContext` instances with `{ kind: 'runtime', runtime }` and the same `state`, then assert exactly one `tryBuildEncodedState` invocation and one bytecode compile per unique compiled expr occurs across both — by instrumenting via spy/counter on the build/compile entry points (or asserting cache-hit identity: the second construction returns the cached `EncodedState` reference and reuses `runtime.policyBytecodeCache` entries). Mirror the metric the perf witness counts (`duplicateEncodedStateRebuilds`) at unit granularity.

### 2. Add an isolated-binding negative test

Construct a context with `{ kind: 'isolated' }` and assert it evaluates correctly (same scalar/result as the runtime-bound context) while building encoded state directly (uncached) — guards that the uncached path remains reachable after the contract change.

Mark the file `// @test-class: architectural-invariant` per `.claude/rules/testing.md`.

## Files to Touch

- `packages/engine/test/architecture/policy-eval-cache-binding-dedup.test.ts` (new)

## Out of Scope

- The contract change and construction-site migration — owned by `archive/tickets/189POLEVALCACHE-001.md`.
- Modifying or removing the `172POLEVASTA-001` perf witness — it remains as the cross-profile aggregate guard; this ticket adds a fast unit-level complement, it does not supersede the perf lane.

## Acceptance Criteria

### Tests That Must Pass

1. The new test asserts a runtime-bound double construction on the same state produces exactly one encoded-state build and one bytecode compile per unique expr.
2. The new test asserts an `isolated`-bound context evaluates to results identical to the runtime-bound context (correctness preserved on the uncached path).
3. Targeted run: `node --test packages/engine/dist/test/architecture/policy-eval-cache-binding-dedup.test.js`.

### Invariants

1. The dedup assertion fails if a future change reintroduces per-construction encoded-state rebuilds or per-context bytecode recompiles when a `runtime` binding is supplied.
2. The test contains no game-specific identifiers (Foundation 1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/policy-eval-cache-binding-dedup.test.ts` — new architectural-invariant proving the duplicate-rebuild guarantee at unit granularity (distilled from `172POLEVASTA-001`) plus the isolated-path negative.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/architecture/policy-eval-cache-binding-dedup.test.js`
2. `pnpm -F @ludoforge/engine test:all`

## Outcome

Completed: 2026-05-22

What changed:
- Added `packages/engine/test/architecture/policy-eval-cache-binding-dedup.test.ts`.
- The new architectural-invariant test constructs two runtime-bound `PolicyEvaluationContext` instances over the same `GameState` and asserts the second context does not trigger another encoded-state build, feature-table build, or expression feature-table/bytecode compile.
- The same file constructs an explicit isolated-binding context and proves it returns the same value as the runtime-bound context while taking the uncached encoded-state and per-context bytecode path.

Deviations:
- None for the ticket-owned test surface.
- The broad `pnpm -F @ludoforge/engine test:all` lane is not green in the current repo snapshot. The failures reproduce in focused reruns and are outside this test-only change:
  - `node --test packages/engine/dist/test/integration/policy-bytecode-equivalence.test.js` fails because `profile arvn-baseline should have supported move considerations`.
  - `node --test packages/engine/dist/test/integration/diagnose-parity-runGame.test.js` fails on diagnostic/direct runGame state-hash parity for seeds `1001`, `1020`, `1049`, and `1054`.

Verification:
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/architecture/policy-eval-cache-binding-dedup.test.js` — passed, 2 tests.
- `pnpm -F @ludoforge/engine test:all` — red, 957/959 pass; ticket-owned new architecture test passed inside the lane; residual failures listed above.
- Source-size ledger: `packages/engine/test/architecture/policy-eval-cache-binding-dedup.test.ts` is 218 lines; no source-size cap issue.
