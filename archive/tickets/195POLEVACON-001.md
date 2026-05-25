# 195POLEVACON-001: Inner-selector substructure-sharing wrapper at policy-evaluation-core.ts:2040

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-evaluation-core.ts` (introduce substructure-sharing wrapper; route the inner-selector fall-through through it)
**Deps**: `specs/195-policy-evaluation-context-allocation-reduction.md`

## Problem

`PolicyEvaluationContext` construction at `policy-evaluation-core.ts:2040` (the inner-selector different-microturn-option fall-through) re-allocates the full heavy substructure — 13 collection caches, runtime providers, the zoneId Map, plus calls to `getPolicyEncodedStateLayout`, `resolvePolicyEvalCacheBinding`, and `createPolicyRuntimeProviders` — even though every input except `completion.optionValue/optionIndex` and `selectorItemKey` is inherited unchanged from `this.input`. Constructor cost contributes 4.4s / 2.8% self-time on the `parity-drive` workload, with high adjacent GC pressure (17.4s / 11.1%). The existing fast path at lines 2026-2038 already reuses `this` for the same-microturn-option case; this ticket extends substructure reuse to the fall-through case.

## Assumption Reassessment (2026-05-25)

1. Inner construction site confirmed at line 2040 (verified during Spec 195 reassessment; spec §3 quotes the actual gating condition at lines 2026-2029).
2. Fast path at lines 2026-2038 already short-circuits the same-microturn-option case via `return this.evaluateCompiledExpr(...)` — no construction at all in that path. The fall-through at line 2040 fires only when `microturnOption.key !== this.currentMicroturnOptionKey()`.
3. Inherited fields at the call site (`this.input.def`, `this.activeState`, `this.input.playerId/seatId/catalog/parameterValues/trustedMoveIndex`, `this.input.cacheBinding`, plus `this.currentCandidates` at line 2063) are passed unchanged; only `completion.optionValue/optionIndex` and `selectorItemKey` vary. Verified against the spec's §3 enumeration.
4. Spec 189's structural `cacheBinding` contract is in place (commit `bcef2e0b6`) and tested by `packages/engine/test/architecture/policy-eval-cache-binding-dedup.test.ts`; this ticket preserves the contract by inheritance, not by re-resolution.
5. Spec 172's runtime-owned caching of static structures means `getPolicyEncodedStateLayout` is amortized per-`def`; the residual per-construction cost is the field-default-initializations + `createPolicyRuntimeProviders` + the zoneId Map.

## Architecture Check

1. **Extends the existing fast path**: the current code at lines 2026-2038 already implements substructure reuse for the same-microturn-option case via `return this.evaluateCompiledExpr(...)`. This ticket adds a third path between "reuse `this`" and "full per-call construction" — a wrapper that shares heavy substructure with `this` while overriding only the per-inner private state. Architecturally continuous with the existing optimization rather than a parallel mechanism.
2. **Engine-agnostic** (Foundation #1): substructure-sharing applies to any GameDef whose authored policies use nested selectors with per-microturn-option completion variants. No game-specific identifiers, no per-game branching.
3. **Preserves Spec 189's structural `cacheBinding` contract** (§4.3): inner inherits the outer's `cacheBinding` directly — no `resolvePolicyEvalCacheBinding` re-call. The silent-degradation class Spec 189 closed remains closed: if the outer binding is wrong, the inner inherits the wrong binding; the compile-time requirement gates both.
4. **Foundation #11 immutability**: outer-context substructure is shared by reference but read-only from the inner perspective. Inner's private working state (overridden `completion`, scoped `currentSelectorItemKey`, any per-inner score accumulator) is allocated fresh per evaluation and disposed when the evaluation returns. The dispose discipline is asymmetric: inner disposes its private state only; outer disposal remains the responsibility of `policy-eval.ts:691`. Architectural-invariant test proving the isolation guarantee is archived in `archive/tickets/195POLEVACON-002.md`.
5. **No backwards-compat shims** (Foundation #14): the new wrapper path is additive. Existing call sites continue to work; the fall-through to per-call construction is preserved as the safe path for any future `cacheBinding`-mismatch case (none currently observed, but architecturally available per §7).

## What to Change

### 1. Introduce the substructure-sharing wrapper

Decide between Option A and Option B during prototyping. Option A is the default; Option B only if the wrapper would need to vary fields beyond `completion` + `selectorItemKey` (not required for the line 2040 site alone — the deferred sites at `microturn-option-eval.ts:121` and `plan-proposal.ts:513` may require Option B per §4.6, but those are out of scope here).

**Option A — `withInnerMicroturnOption(microturnOption, selectorItemKey)` method on `PolicyEvaluationContext`**:

- Returns a lightweight wrapper instance (or a `PolicyEvaluationContext` subclass instance constructed via a private-factory path) sharing the outer's substructure by reference.
- Shared by reference: `encodedState`, `encodedStateLayout`, `encodedZoneIndexById`, `runtime`, `cacheBinding`, `runtimeProviders`, and the 13 collection caches (`rootStateFeatureCache`, `candidateFeatureCache`, `aggregateCache`, `selectorCache`, `strategyModuleActivationCache`, `strategyModuleEvaluationCache`, `guardrailWhenCache`, `turnShapeEvaluationCache`, `strategicConditionCache`, `relationshipCache`, `fallbackPolicyBytecodeCache`, `resolvedPreviewRefValues`, `schedulePartialsDuringValue`). The cache-sharing decision must be made explicitly during prototyping: sharing the caches is correct when the inner evaluation should see the outer's already-computed values (typical for sub-feature evaluation), but may need per-inner isolation for caches whose keys overlap and produce different values across microturn options. Document the per-cache decision in the wrapper class comment.
- Overridden per call: a synthetic `input` object presenting `this.input`'s fields with `completion: { request: this.input.completion.request, optionValue: microturnOption.value, optionIndex: microturnOption.index }`; a scoped `currentSelectorItemKey` set to the parameter; any per-inner score accumulator.
- Implements at minimum `evaluateCompiledExpr(expr, candidate)` so the existing call-site shape `return context.evaluateCompiledExpr(expr, candidate)` works uniformly.

**Option B — `PolicyEvaluationScope` value object**:

- Extract the heavy immutable substructure (encoded-state layout, zone-index map, runtime providers, `cacheBinding`, the collection caches) into a separate object held by both outer and inner contexts via reference.
- The `PolicyEvaluationContext` constructor accepts an optional `scope` parameter; when present, it adopts the scope's substructure instead of allocating fresh.
- Inner construction passes the outer's `scope` plus per-inner overrides.

Decision criterion: Option A unless the prototyping reveals that the wrapper needs to override multiple structurally distinct fields (e.g., the per-completion capture maps that the deferred `microturn-option-eval.ts:121` site uses). For the line 2040 site, Option A is sufficient.

### 2. Route the line 2040 fall-through through the wrapper

In `evaluateSelectorItemExpr` (currently at line 2020, fall-through branch starting at line 2040):

- Replace the `const context = new PolicyEvaluationContext({...}, this.currentCandidates)` block with `const context = this.withInnerMicroturnOption(microturnOption, selectorItemKey)` (Option A) or the equivalent factory call (Option B).
- Preserve the `try { return context.evaluateCompiledExpr(expr, candidate); } finally { context.dispose(); }` shape so wrapper disposal cleans up only the inner's private state.
- The fall-through to per-call construction for any future `cacheBinding`-mismatch case is preserved as the structural safety net per §7. Implement as an `if` guard at the call site (e.g., compare `this.input.cacheBinding` to the inner's required binding); if they differ, fall through to the existing `new PolicyEvaluationContext(...)` path. Today's code always inherits, so the guard is dead-code at runtime but architecturally honest.

### 3. Wrapper dispose discipline

The wrapper's `dispose()` MUST clear only its private working state — never the inherited substructure's Maps. Document this contract on the wrapper class/method with a comment explaining:

- The inherited substructure is owned by the outer context; its lifecycle is the outer's responsibility (cleared in the outer's `dispose()` at `policy-eval.ts:691`'s context teardown).
- The wrapper's `dispose()` is a no-op for the inherited substructure; it only resets any per-inner private fields (scoped `currentSelectorItemKey` if not already restored, the overridden `input` synthetic, any score accumulator).
- Calling `wrapper.dispose()` multiple times must be idempotent (no double-clear of any state).

The architectural-invariant test in `archive/tickets/195POLEVACON-002.md` proves the dispose discipline mechanically.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — introduce the wrapper (Option A method or Option B value object); route line 2040 through it.

## Out of Scope

- Migration of `packages/engine/src/agents/microturn-option-eval.ts:121` (per-completion-option scoring) and `packages/engine/src/agents/plan-proposal.ts:513` (plan-posture evaluation) to the substructure-sharing mechanism — deferred to Spec 195-FOLLOWUP per §4.6 unless promoted at P3 measurement time.
- Outer construction at `packages/engine/src/agents/policy-eval.ts:691` — cannot share substructure (it IS the outer).
- Object pool / free-list pattern — gated on P3 measurement per §2 Non-Goals.
- The architectural-invariant outer-state isolation test — archived in `archive/tickets/195POLEVACON-002.md`.
- Perf measurement re-capture (Spec 195 §8 P3) — deferred per the phase-gated decomposition; will be authored as a follow-up ticket once this ticket lands and real numbers are available.
- Tightening or modifying any existing perf gate — no perf threshold changes in this ticket.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/determinism/` corpus green — replay-identity proof; terminal state hashes pinned across the optimization (Foundation #8).
2. `packages/engine/test/architecture/policy-eval-cache-binding-dedup.test.ts` green — Spec 189 POLEVALCACHE witness; cache-binding inheritance preserves the structural guarantee.
3. `packages/engine/test/architecture/policy-evaluation-context-constructor-invariant.test.ts` green — static-build invariant counters (`buildEncodedStateLayoutCount`, `buildFeatureTableCount`, `buildExpressionFeatureTableCount`, `buildEncodedStateCount`) remain at expected steady-state values.
4. `packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts` green — env-toggle property unaffected.
5. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Inner evaluation via the wrapper produces byte-identical results to per-call construction — same encoded state, layout, runtime providers, `cacheBinding`. (Foundation #8 replay identity; proven transitively by the determinism corpus.)
2. Outer-context substructure is read-only from the inner-evaluation perspective — no observable mutation through any wrapper path. (Foundation #11; full mechanical proof in `archive/tickets/195POLEVACON-002.md`.)
3. `cacheBinding` is the same object across outer and inner — inherited by reference, not re-resolved via `resolvePolicyEvalCacheBinding`. (Spec 189 structural guarantee.)
4. The wrapper's `dispose()` does NOT clear the outer's collection caches. (Dispose discipline contract.)

## Test Plan

### New/Modified Tests

None new in this ticket — the optimization is covered transitively by the determinism corpus + existing architectural-invariant tests per the spec's §8 phase split. The dedicated outer-state isolation invariant is archived in `archive/tickets/195POLEVACON-002.md`.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/determinism/`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/policy-eval-cache-binding-dedup.test.js`
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/architecture/policy-evaluation-context-constructor-invariant.test.js`
4. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/perf-baseline-trajectory-identity.test.js`
5. `pnpm turbo test --filter @ludoforge/engine`
6. `pnpm turbo typecheck --filter @ludoforge/engine`
7. `pnpm turbo lint --filter @ludoforge/engine`

## Outcome

Completed on 2026-05-25.

Implemented the P1 inner-selector allocation reduction in
`packages/engine/src/agents/policy-evaluation-core.ts`:

- Added `withInnerMicroturnOption(...)` and a shared-infrastructure constructor
  path for the different-microturn-option selector fall-through.
- Reused invariant runtime infrastructure by reference: encoded state layout,
  encoded state, zone index map, runtime, `cacheBinding`, and non-completion
  runtime provider surfaces.
- Preserved completion correctness by creating a fresh completion provider for
  the inner option, because the completion provider captures the option value
  and option index.
- Kept semantic caches private and lazy per context. During implementation, the
  live code proved their keys do not encode every microturn-option field, so
  sharing them by reference would risk cross-option contamination. This follows
  the ticket's explicit per-cache decision clause while still eliminating the
  heavy encoded-state/runtime-provider/zone-index allocation path.
- Preserved wrapper disposal discipline: inner wrappers do not dispose shared
  provider infrastructure; only owning outer contexts dispose their runtime
  providers.

Source-size deviation: `policy-evaluation-core.ts` was already over the
repository guideline cap at 2872 lines and ended at 3007 lines. Per the 1-3-1
checkpoint, the user approved recommended option 1: keep the tightly coupled
implementation in the file for this ticket and record the source-size deferral
instead of forcing a broader extraction into the P1 mechanism ticket.

Command substitution: the literal ticket command
`node --test packages/engine/dist/test/determinism/` failed because Node treated
the directory as a module and raised `MODULE_NOT_FOUND`. The deterministic corpus
was verified with the equivalent compiled-file glob
`node --test packages/engine/dist/test/determinism/*.test.js`.

Verification:

- `pnpm -F @ludoforge/engine build` — passed after final source edit.
- `node --test packages/engine/dist/test/architecture/policy-eval-cache-binding-dedup.test.js` — passed, 2 tests.
- `node --test packages/engine/dist/test/architecture/policy-evaluation-context-constructor-invariant.test.js` — passed, 1 test.
- `node --test packages/engine/dist/test/integration/perf-baseline-trajectory-identity.test.js` — passed, 6 tests.
- `node --test packages/engine/dist/test/determinism/*.test.js` — passed, 97 tests across 34 suites.
- `pnpm -F @ludoforge/engine test` — passed, 170/170 files.
- `pnpm turbo typecheck --filter @ludoforge/engine` — passed.
- `pnpm turbo lint --filter @ludoforge/engine` — passed.

Untracked proof byproducts from the perf-baseline harness smoke were left
unstaged under `reports/perf-baseline/`.
