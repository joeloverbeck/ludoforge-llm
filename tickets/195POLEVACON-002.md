# 195POLEVACON-002: Outer-state isolation architectural-invariant test for substructure-sharing wrapper

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-only addition under `packages/engine/test/architecture/`
**Deps**: `tickets/195POLEVACON-001.md`

## Problem

The substructure-sharing wrapper introduced in `tickets/195POLEVACON-001.md` reuses the outer `PolicyEvaluationContext`'s heavy immutable substructure — encoded state, layout, runtime providers, `cacheBinding`, and the 13 collection caches — by reference. Foundation #11 requires that the outer-context substructure remain read-only from the inner-evaluation perspective; the scoped-internal-mutation exception applies only to the inner's private working state. This guarantee is currently asserted only by code reasoning in the wrapper's documentation, not proven mechanically by test. Spec 195 §8 P2 mandates an architectural-invariant test that exercises the wrapper and proves the isolation guarantee — a snapshot/assertion mechanism that would fail if any future change accidentally allowed the inner to mutate the outer.

## Assumption Reassessment (2026-05-25)

1. The substructure-sharing wrapper API surface is finalized in `tickets/195POLEVACON-001.md`; this ticket consumes whichever shape lands (Option A `withInnerMicroturnOption` method or Option B `PolicyEvaluationScope` value object).
2. The `packages/engine/test/architecture/` directory is the canonical location for `@test-class: architectural-invariant` tests per `.claude/rules/testing.md`; verified during Spec 195 reassessment via sibling tests at `policy-evaluation-context-constructor-invariant.test.ts` and `policy-eval-cache-binding-dedup.test.ts`.
3. The trajectory-identity test (`test/integration/perf-baseline-trajectory-identity.test.ts`) and the determinism corpus prove *terminal-state outcome equivalence*; this ticket complements them by proving the *mechanism guarantee* — the wrapper does not mutate outer state, not just that the optimization doesn't change downstream outputs. Distinct proof obligation, distinct test class.
4. The test-fixture infrastructure used by sibling architectural tests (`withCompiledPolicyCatalog` helper, the `__compile_internal_for_tests` / `__featureTable_internal_for_tests` / `__layout_internal_for_tests` / `__view_internal_for_tests` test-only export ramps, the `createGameDefRuntime` / `initialState` constructors from `kernel/index.ts`) is reusable here — no new fixture infrastructure required.

## Architecture Check

1. **Foundation #11 corollary proof** — the test attempts to observe outer-state mutation via every available path after an inner-wrapper evaluation and asserts none is observable. This is the mechanical proof that the wrapper's substructure-sharing satisfies the scoped-internal-mutation exception (`docs/FOUNDATIONS.md` §11 lines 74-76): the inner's private working state is fully isolated; the shared substructure is read-only from the inner perspective. Without this test, the guarantee is documentation-only and could regress silently.
2. **Engine-agnostic** (Foundation #1): the test constructs a synthetic catalog + initial state via existing test fixtures, applies the substructure-sharing wrapper, and inspects outer-context fields. No game-specific behavior, no FITL/ARVN coupling.
3. **Architectural test class** per `.claude/rules/testing.md`: `architectural-invariant` is appropriate because the property must hold across every legitimate kernel evolution, not for a specific seed or profile. Sits alongside the existing PolicyEvaluationContext-level invariants in `test/architecture/`; no new test infrastructure required.
4. **No backwards-compat shims** (Foundation #14): test-only addition, no production-code surface introduced.

## What to Change

### 1. Author the architectural-invariant test file

Create `packages/engine/test/architecture/policy-evaluation-context-outer-state-isolation.test.ts` with:

- **File-top marker**: `// @test-class: architectural-invariant` on line 1, per `.claude/rules/testing.md`.
- **Top-of-file comment**: briefly cite the two sibling architectural tests this complements:
  - `policy-evaluation-context-constructor-invariant.test.ts` (static-build cache routing — proves first-touch-only allocation of layout/feature-table/bytecode/encoded-state)
  - `policy-eval-cache-binding-dedup.test.ts` (Spec 189 cache-binding structural witness — proves dedup across multiple contexts sharing the same runtime)
  This file is the third PolicyEvaluationContext-level architectural invariant; together they cover construction caching, cache-binding inheritance, and now outer-state isolation across the wrapper.
- **Imports**: mirror the sibling tests' import style (use the `__*_internal_for_tests` test-only exports for layout/feature-table/view internals, `withCompiledPolicyCatalog` helper, `createGameDefRuntime` and `initialState` from `kernel/index.ts`).
- **Fixture**: construct an outer `PolicyEvaluationContext` against a synthetic catalog. Reuse the catalog shape from the constructor-invariant test as the starting point (smallest viable surface that produces a non-trivial wrapper interaction).

### 2. Snapshot-and-compare assertion shape

The test must:

- **Pre-evaluation snapshot**: capture every outer-context caller-visible field that the wrapper inherits by reference — at minimum:
  - `encodedState`, `encodedStateLayout`, `encodedZoneIndexById` (assert identity equality before/after — same object reference).
  - `runtime` (identity equality).
  - `cacheBinding` (identity equality; reinforces the Spec 189 structural guarantee at the runtime level).
  - `runtimeProviders` (identity equality).
  - The 13 collection caches by identity AND by size (Map.size pre/post). The wrapper's per-cache sharing decision from `tickets/195POLEVACON-001.md`'s wrapper class comment dictates the expected size delta:
    - For caches the wrapper shares by reference: post-size may grow (the inner evaluation may populate the outer's cache as a legitimate cache fill, not as state mutation in the Foundation #11 sense). Assert identity equality and document that size growth is expected and is not a mutation violation.
    - For caches the wrapper isolates per-inner: assert outer size is unchanged AND identity is preserved.
  - This per-cache differentiation must be authored against the wrapper's documented sharing decisions from `tickets/195POLEVACON-001.md` What-to-Change §1, not invented here.
- **Inner evaluation**: spawn the wrapper via `outer.withInnerMicroturnOption(microturnOption, selectorItemKey)` (or the Option B equivalent), passing a synthetic `SelectorEvalMicroturnOption` with a key that differs from the outer's current option. Run `wrapper.evaluateCompiledExpr(expr, candidate)` to exercise the private working state.
- **Post-evaluation assertions**: every captured snapshot field passes the identity / size assertion per its sharing classification above. Any failure means the wrapper has accidentally allowed the inner to mutate caller-visible outer state — a Foundation #11 violation.
- **Dispose discipline assertion**: after `wrapper.dispose()`, assert the outer's collection caches retain their post-evaluation state (sizes unchanged, identity preserved). Wrapper disposal MUST NOT clear outer state per the dispose contract from `tickets/195POLEVACON-001.md` What-to-Change §3.

### 3. Optional extension: same-cacheBinding identity

Add a small `it('preserves cacheBinding identity across outer→inner', ...)` block asserting `wrapper.[inheritedCacheBindingAccessor] === outer.[inheritedCacheBindingAccessor]`. This complements `policy-eval-cache-binding-dedup.test.ts` by proving the inheritance path through the wrapper specifically, not just through direct construction.

## Files to Touch

- `packages/engine/test/architecture/policy-evaluation-context-outer-state-isolation.test.ts` (new)

## Out of Scope

- The wrapper implementation itself — owned by `tickets/195POLEVACON-001.md`.
- Replay-identity proof — owned by the determinism corpus + Spec 192 env-toggle test; this ticket proves the *mechanism*, not the *outcome*.
- Perf measurement — Spec 195 §8 P3, deferred per phase-gated decomposition.
- Modifications to the sibling architectural-invariant tests — this is an additive third file.
- Testing the deferred construction sites (`microturn-option-eval.ts:121`, `plan-proposal.ts:513`) — when those sites adopt the substructure-sharing mechanism in Spec 195-FOLLOWUP, equivalent isolation tests can be added then (or this test extended); not in scope here.

## Acceptance Criteria

### Tests That Must Pass

1. New test green: outer-context fields (encoded state, layout, zone-index map, runtime, cache-binding, runtime providers) identity-equal before and after inner-wrapper evaluation; per-cache size assertions match the wrapper's documented sharing decisions; wrapper `dispose()` does not clear outer caches.
2. Existing architectural invariants green: `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts`, `packages/engine/test/architecture/policy-eval-cache-binding-dedup.test.ts` — both must remain green to confirm this ticket does not regress the sibling guarantees.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Outer-context caller-visible substructure is byte-identical (by identity for shared-reference fields) before and after any inner-wrapper evaluation. (Foundation #11 corollary.)
2. Inner wrapper's `dispose()` does NOT clear outer collection caches. (Dispose discipline contract from `tickets/195POLEVACON-001.md`.)
3. The new test file carries the `// @test-class: architectural-invariant` marker on line 1 per `.claude/rules/testing.md`.
4. The wrapper's inherited `cacheBinding` is the same object as the outer's (Spec 189 structural guarantee preserved through the wrapper path).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/policy-evaluation-context-outer-state-isolation.test.ts` (new) — Foundation #11 corollary mechanical proof; pre/post snapshot of every outer caller-visible field with per-cache sharing classification; wrapper dispose-discipline assertion; optional cacheBinding-identity-through-wrapper check.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/policy-evaluation-context-outer-state-isolation.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/policy-eval-cache-binding-dedup.test.js packages/engine/dist/test/architecture/policy-evaluation-context-constructor-invariant.test.js` (sibling invariants regression sweep)
3. `pnpm turbo test --filter @ludoforge/engine`
4. `pnpm turbo lint --filter @ludoforge/engine`
