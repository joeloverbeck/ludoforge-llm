# Spec 154: Policy Bytecode Emitter / Evaluator Dispatch Completeness

**Status**: PROPOSED
**Priority**: P2 (medium — closes a recurring CI break shape introduced by Spec 149's F14 cut; modest scope; very high signal-to-noise — the bug class silently corrupts agent scores until a downstream test happens to notice)
**Complexity**: S (one defensive throw, one try/catch fallback, one enumeration test; ~30 lines + a focused unit test)
**Dependencies**:
- Spec 149 [fitl-evolution-readiness-numeric-substrate-bytecode-vm] (DRAFT in `specs/`) — its Phase 4 F14 cut at commit `5628cd41f` (`Implemented 149FITLEVNUMVM-016`) deleted the closure-tree fallback and replaced it with `requiresDirectLiteralSemantics`, creating the silent dispatch gap this spec closes. The architectural shape proposed here (try/catch + direct-evaluator fallback) replaces Spec 149's deleted closure-tree-as-safety-net with an equivalent post-F14 mechanism.
- Foundation 14 (No Backwards Compatibility) — the fix replaces `default: return undefined` with a defensive throw; no compatibility shim. Direct evaluator already exists as the in-tree fallback.
- Foundation 15 (Architectural Completeness) — the bytecode emitter and evaluator are paired contracts; this spec closes the gap that allowed them to drift silently.
- Foundation 16 (Testing as Proof) — the gap was caught only by a downstream test asserting `captures.length > 0`. A direct enumeration test, type-checked against an exported `FeatureRefKind` union, should be the proof.

**Source**:
- PR #239 commit `beb3c3993` `fix(agents): restore library-ref evaluation in policy bytecode VM fallback`. Surgical patch added explicit handlers in `resolveVmFallbackFeature` for `candidateFeature`, `stateFeature`, `candidateAggregate` — the three feature kinds the bytecode emitter (`featureRefForCompiledPolicyRef` in `packages/engine/src/cnl/policy-bytecode/feature-table.ts`) emits for `library:*` refs that the JS-side fallback (`resolveVmFallbackFeature` in `packages/engine/src/agents/policy-evaluation-core.ts`) was silently swallowing via a `default: return undefined` branch.
- The bug originated in PR #239 commit `5628cd41f Implemented 149FITLEVNUMVM-016`, which executed Spec 149's Phase 4 F14 cut: deleted the closure-tree fallback (`buildPolicyExprClosure`), removed the `LUDOFORGE_POLICY_VM` rollout switch, and replaced the catch-all closure-tree safety net with a `requiresDirectLiteralSemantics` gate that only routes `previewSurface` and `candidateTag` refs to the direct evaluator. Top-level `library:*` refs flowed through the bytecode VM, but neither the VM's `resolveBuiltInFeature` (in `packages/engine/src/agents/policy-vm/vm.ts`) nor the JS fallback had handlers for the three library-emitted kinds. They fell to the JS fallback's `default:` branch and returned `undefined`.
- Downstream impact: every `{ ref: feature.X }` consideration value collapsed to `unknownAs ?? 0`, FITL agents picked random tiebreaks, `previewSurface.resolveSurface` was never invoked (drives never fired), and game trajectories diverged. The CI failure was caught two hops downstream: `slow-parity-shard-b` (`drive-fingerprint-property.test.ts` asserts `captures.length > 0`) and `test:performance` (`spec-140-compound-turn-overhead.test.ts` asserts `totalCompoundTurns <= 600`; observed `671`).
- Local-only collateral: the same PR's two perf gates (`test/perf/agents/fitl-per-card-cost.perf.test.ts` and `test/perf/agents/preview-pipeline.perf.test.ts`) had been calibrated against the buggy fast path. With the bug fixed, both regress. They are not in CI but their stamped baselines are fictional.
- Reference: the recovered diagnosis and verification in this session is the canonical evidence; no separate `reports/ci-failures-pr-239-*.md` was written because the cluster cleared in one cycle.

## Brainstorm Context

**Original framing**. The policy bytecode pipeline is a paired-contract architecture:
1. **Emitter** (`featureRefForCompiledPolicyRef`) lowers `CompiledAgentPolicyRef` IR nodes to `FeatureRef` bytecode opcodes. Each `ref.kind` (and refKind sub-discriminator for `library:*`) maps to a specific bytecode `kind`.
2. **Evaluator** runs the bytecode against `EncodedState`. The VM core (`resolveBuiltInFeature`) handles a fixed set of kinds natively (typed-array reads); kinds it doesn't know about it dispatches to `context.resolveFeature`.
3. **JS fallback** (`resolveVmFallbackFeature`) is the bridge for kinds the VM can't satisfy from `EncodedState` alone — it calls back into `PolicyEvaluationContext` methods that walk the original IR / preview surface / runtime providers.

The contract: every kind the emitter produces MUST be resolvable by either (a) the VM core natively, or (b) the JS fallback, or (c) the emitter must emit a `dynamicRef` / `dynamicSurface` / `dynamicExpr` that the JS fallback resolves via in-IR lookup. The closure-tree path that Spec 149 deleted was the de facto safety net: the emitter could produce anything, and the closure-tree (which simply walked the original `CompiledPolicyExpr` IR via `resolveAgentPolicyRef`) would resolve it correctly because it didn't depend on the emitter's bytecode shape at all.

After the F14 cut, the safety net is gone. Three known kinds (`candidateFeature`, `stateFeature`, `candidateAggregate`) drifted into the gap immediately. PR #239's hot-fix patches those three, but nothing structurally prevents the next bytecode emitter change from re-opening the gap.

**Motivation**. Three reasons this is worth a spec rather than just shipping the hot-fix:

1. **The defect class is silent and downstream-detected.** The bug doesn't throw, doesn't lint-fail, doesn't typecheck-fail. `evaluateCompiledExpr` returns `undefined`; `evaluateConsideration` falls through to `unknownAs ?? 0`; the agent makes worse decisions; the game proceeds along a different trajectory. The only test that caught it was `drive-fingerprint-property.test.ts`'s `captures.length > 0` invariant — a circumstantial canary, not a direct contract test. The performance test's `totalCompoundTurns <= 600` likewise caught a downstream symptom. Spec 149's own perf gates *passed under the bug* because the fast-path skipped the work being measured. F#16 (Testing as Proof) calls for a direct invariant.

2. **The fix surface is shaped to recur.** `featureRefForCompiledPolicyRef` and `resolveBuiltInFeature` / `resolveVmFallbackFeature` evolve in three different files (compiler, VM core, evaluator). PR #239's hot-fix added three matched cases, but a future ticket adding a new `library:*` refKind, a new built-in feature kind, or a new IR ref kind has no checklist forcing all three sides to update together. The next instance of the bug would manifest the same way: a downstream test finally noticing scores collapsed.

3. **The architectural close is small and mechanical.** Two changes restore the safety-net semantics from main without resurrecting the closure-tree:
   - In `resolveVmFallbackFeature`, change `default: return undefined` to `throw new PolicyBytecodeVmUnsupportedError(...)`. This makes any unhandled kind a loud failure mode rather than a silent zero.
   - In `evaluateCompiledExprWithVm`, restore the `try { executeBytecode } catch (PolicyBytecodeVmUnsupportedError) { return evaluateCompiledExprDirect(expr, candidate); }` wrapper. This catches the loud failure and falls back to the direct evaluator, which uses the IR (not the bytecode shape) and handles every ref kind by definition.

This pair re-establishes the closure-tree-equivalent semantics: the bytecode VM is best-effort fast; the direct evaluator is the slow-but-complete fallback for anything the VM can't satisfy. The fix is conceptually identical to main's `try/catch/fallback` shape (Spec 149 §Phase 4 acceptance §1) but uses the new direct evaluator instead of the deleted closure-tree.

**Prior art surveyed**.
- **Spec 147 closure-tree pattern (archived)** — pre-149 architecture used a closure-tree compiled at evaluation time. Every IR node had a closure that resolved to the correct value via direct method dispatch on `PolicyEvaluationContext`. Slow but exhaustively correct because it operated on the IR shape, not the bytecode shape.
- **Spec 149 F14 cut (commit `5628cd41f`)** — removed the closure-tree under F14 (No Backwards Compatibility / no `_legacy` shim). Replaced the closure-tree fallback inside `evaluateCompiledExprWithVm`'s try/catch with a `requiresDirectLiteralSemantics` static gate. The gate's enumeration is incomplete: it only checks for `previewSurface` and `candidateTag` ref kinds (top-level) and a few other shapes. Library refs (`library:candidateFeature`, etc.) were not on the list because they were assumed to be VM-supported — but the VM's native dispatch table doesn't include them.
- **`PolicyBytecodeVmUnsupportedError`** — the typed error class already exists. Used by VM internals when a feature kind returns `UNSUPPORTED_FEATURE` (e.g., `previewSurface`-scoped `globalVar` that the encoded state doesn't materialize). The new code's `evaluateCompiledExprWithVm` no longer catches this error class — any throw propagates up. So the error class IS in use, but the catcher was removed.
- **Defensive enum-exhaustiveness in TypeScript** — `switch`-on-discriminated-union with `default:` falling through silently is a recurring TS pattern hazard. The standard mitigation is an `assertNever(value: never)` or an explicit throw in `default:`. The codebase already uses the explicit-throw pattern in adjacent code (e.g., `throw this.runtimeError(...)` in the policy evaluator's aggregate dispatch).

**Synthesis**. Three deliverables:

1. **Restore the safety-net architecture** in `policy-evaluation-core.ts`:
   - `resolveVmFallbackFeature`'s `default:` becomes a defensive throw.
   - `evaluateCompiledExprWithVm` wraps the `executeBytecode` call in a try/catch that falls back to `evaluateCompiledExprDirect` on `PolicyBytecodeVmUnsupportedError`.

2. **Defer the explicit-handler delete-vs-keep decision to a follow-on ticket.** With the safety net (Deliverable 1) in place, the explicit handlers for `candidateFeature` / `stateFeature` / `candidateAggregate` added in PR #239 commit `beb3c3993` become a duplicated fast-path: keeping both is safe but redundant; deleting them simplifies the dispatch table to "VM handles known-fast kinds; direct evaluator handles everything else." Choosing between the two requires perf measurement against the recalibrated per-card gate (see D5), which is sequencing-coupled to PR #239's pending follow-up. Rather than block this spec on that measurement, the safety-net architecture ships first (Deliverables 1 + 3); the explicit-handler decision becomes its own follow-on ticket once the safety net is stable and perf gates are recalibrated.

3. **Promote the dispatch contract into a typed registry, then add a direct enumeration test against it.** Two coupled changes:
   - In `packages/engine/src/cnl/policy-bytecode/types.ts`, introduce an exported `FEATURE_REF_KINDS` const-array and a `FeatureRefKind = (typeof FEATURE_REF_KINDS)[number]` union, and narrow `FeatureRef.kind` from `string` to `FeatureRefKind`. This turns the dispatch contract into a compile-time-checkable surface: a future emitter change that adds a new kind without registering it fails to type-check at the emitter site.
   - Add a direct enumeration test that asserts every kind in the registry resolves to a non-undefined value (or a documented-undefined value with explicit reason) in `evaluateCompiledExprWithVm` against a representative encoded state. The test's `KINDS_PRODUCED_BY_EMITTER satisfies readonly FeatureRefKind[]` clause type-checks the test against the registry; any new kind added to the registry that isn't covered by the test fails to compile.

   This is the F#16 "Testing as Proof" close: the bug manifests as `undefined`-from-VM; the test asserts the absence of that manifestation directly rather than relying on downstream agents to notice.

**Alternatives explicitly considered (and rejected)**.

- **Resurrect closure-tree as the universal fallback**. Restores main's exact semantics but violates F#14 (Spec 149's F14 cut explicitly deleted closure-tree as part of the architectural completeness commitment). Direct evaluator (`evaluateCompiledExprDirect`) is the post-F14 equivalent and already handles every IR ref kind. Rejected.
- **Add native VM handlers for `candidateFeature` / `stateFeature` / `candidateAggregate`**. Would let the VM resolve them without callback. Tempting for perf, but these kinds inherently require dispatching to per-context state (cached state-feature values, candidate aggregate computations, the cached expression tree). The VM is a stateless integer-arithmetic core; pushing context-aware lookups into it muddies the architecture and doesn't fit Spec 149 §Phase 1's "encoded-state is read-only typed-array view" principle. Rejected — the JS fallback is the right place.
- **Keep the explicit handlers from `beb3c3993` as the only fix and skip the safety net**. Closes the three known cases but leaves the silent-undefined trap waiting for the next emitter change. Treats the symptom rather than the class. Rejected — F#15 calls for the architectural close.
- **Delete `requiresDirectLiteralSemantics` entirely; route everything through the bytecode VM with the safety-net fallback**. Simplifies the dispatch decision. Tempting, but `requiresDirectLiteralSemantics` exists because some IR shapes (`adjacentTokenAgg`, `seatAgg`, certain literals) are KNOWN to be unsupported by the VM and routing them through the VM only to immediately fall back is wasted compilation. Keep the gate as a fast-path optimization; the safety net catches what the gate misses. Rejected — both layers are useful.

**User constraints reflected**. F#14 (no `_legacy` shim, no env switch, no closure-tree resurrection), F#15 (architectural completeness — close the gap that allowed emitter and evaluator to drift), F#16 (Testing as Proof — direct invariant test, not downstream canary). F#8 is preserved by the current code (replays are deterministic in either the buggy or fixed state); the bug class is an F#15 gap, not an F#8 violation.

## Overview

Three deliverables, all in `packages/engine/`:

1. **`packages/engine/src/agents/policy-evaluation-core.ts`** — change `resolveVmFallbackFeature`'s `default: return undefined` to a defensive throw, and re-add the `try/catch (PolicyBytecodeVmUnsupportedError) { return evaluateCompiledExprDirect(expr, candidate); }` wrapper in `evaluateCompiledExprWithVm`.

2. **`packages/engine/src/cnl/policy-bytecode/types.ts`** — introduce an exported `FEATURE_REF_KINDS` const-array and a `FeatureRefKind` union derived from it; narrow `FeatureRef.kind` from `string` to `FeatureRefKind` so the dispatch contract is compile-time-checkable.

3. **`packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts`** (new) — enumerates every kind in `FEATURE_REF_KINDS` (with a `KINDS_PRODUCED_BY_EMITTER satisfies readonly FeatureRefKind[]` type-check), constructs a minimal `PolicyEvaluationContext` and a representative `CompiledPolicyExpr` that uses each kind, and asserts that `evaluateCompiledExprWithVm` returns either a typed value OR throws `PolicyBytecodeVmUnsupportedError` (which the test catches and treats as "fallback path will handle it"). The assertion: for no kind does the VM silently return `undefined` while the IR-level evaluator would have produced a value.

The D3 explicit-handler delete-vs-keep decision (whether to remove the `candidateFeature` / `stateFeature` / `candidateAggregate` cases added in `beb3c3993` plus the `findLibraryRef` helper, or keep them as fast-paths) is deferred to a follow-on ticket — see §D3 and Follow-On Tickets below.

## Problem Statement

### Defect class: silent emitter/evaluator dispatch divergence

The policy bytecode pipeline has three independent dispatch tables:

```
Compiler IR (CompiledAgentPolicyRef)  →  emitter table  →  Bytecode FeatureRef.kind
                                                            │
                                                            ▼
                          ┌────────────────────────────────────────────────────────┐
                          │  resolveBuiltInFeature (vm.ts):                          │
                          │    - native handlers (typed-array reads)                 │
                          │    - UNSUPPORTED_FEATURE → throw                         │
                          │    - default → context.resolveFeature(...)               │
                          └────────────────────────────────────────────────────────┘
                                                            │
                                                            ▼
                          ┌────────────────────────────────────────────────────────┐
                          │  resolveVmFallbackFeature (policy-evaluation-core.ts):    │
                          │    - dynamicRef/dynamicSurface/dynamicExpr → IR lookup   │
                          │    - candidateTags / adjacentTokenAgg / seatAgg → ...    │
                          │    - default → return undefined  ← SILENT GAP            │
                          └────────────────────────────────────────────────────────┘
```

Each table evolves when its file evolves. PR #239's `5628cd41f` commit changed the emitter's library-ref encoding without correspondingly extending the JS fallback. The VM's `default:` (line 326-329 in vm.ts) correctly delegates to `context.resolveFeature`. The JS fallback's `default:` (line 706-707 in policy-evaluation-core.ts) silently returns `undefined`.

The three independent dispatch tables are not test-checked for completeness. There is no enumeration assertion. There is no compile-time exhaustiveness gate. The contract is "the author of any change must update all three sides", and that contract has now visibly failed.

### Why the existing tests didn't catch it

- `policy-bytecode-equivalence.test.ts` (`packages/engine/test/integration/policy-bytecode-equivalence.test.ts:430-465`) does not compare two distinct evaluator paths post-Spec-149. Its `captureDefaultScores` and `captureVmScores` both call the same `evaluatePolicyMoveCore` function with identical arguments — they exist as separate helpers for historical reasons (they predated the closure-tree deletion), but in the current code they go through the same VM path. Both sides produced the same buggy `unknownAs ?? 0` values, the `assert.deepEqual(vmScores, defaultScores, ...)` at line 443 passed vacuously, and the test gave no signal. (Verified: the test was modified in commit `5628cd41f` and passed in the buggy state.)
- `fitl-per-card-cost.perf.test.ts` (added in `5628cd41f`) measured per-card cost. It passed at 1492.96 ms — but that fast number was the buggy fast path (no real preview drives running). The author's commit message claimed the gate was green; it was, vacuously.
- `drive-fingerprint-property.test.ts` (in slow-parity-shard-b lane) asserts `captures.length > 0`. It noticed the bug, but only as a downstream symptom: "no drives happened". The diagnosis path from "captures.length === 0" back to "library refs return undefined" is several layers deep.
- `spec-140-compound-turn-overhead.test.ts` (in performance lane) asserts `totalCompoundTurns <= 600`. It also noticed downstream — agents making different decisions caused trajectories to bloat past budget.

A direct enumeration test would have caught the bug at the moment `5628cd41f` was authored, before any downstream test ran.

### Why a defensive throw + catch is the right shape

The closure-tree safety net in main was load-bearing precisely because it operated on the IR (the `CompiledAgentPolicyRef`/`CompiledPolicyExpr` discriminated union), not the bytecode (`FeatureRef`). The IR shape is the source of truth: it's what the compiler produces from the GameSpec, it's what the VM input is derived from, and it's what the direct evaluator already walks. The VM is a downstream optimization that operates on a re-encoding of the IR.

When the VM can't satisfy a request, falling back to the IR-level evaluator is the architecturally correct move. The `PolicyBytecodeVmUnsupportedError` already exists for this purpose and is already thrown from VM internals when `UNSUPPORTED_FEATURE` is returned; the only missing pieces are (a) `resolveVmFallbackFeature`'s `default:` throwing it instead of returning `undefined`, and (b) `evaluateCompiledExprWithVm` catching it and dispatching to `evaluateCompiledExprDirect`.

This shape was the pre-149 architecture (with closure-tree as the fallback). Spec 149's F14 cut deleted the closure-tree but should have kept the try/catch shape with the direct evaluator as the new fallback. The hot-fix in `beb3c3993` patched the three known holes; this spec restores the architectural shape that prevents future holes.

## Design

### D1. Restore the try/catch fallback in `evaluateCompiledExprWithVm`

In `packages/engine/src/agents/policy-evaluation-core.ts`, around line 503-531:

```ts
private evaluateCompiledExprWithVm(expr: CompiledPolicyExpr, candidate: PolicyEvaluationCandidate | undefined): PolicyValue {
  if (this.encodedState === undefined || this.requiresDirectLiteralSemantics(expr)) {
    return this.evaluateCompiledExprDirect(expr, candidate);
  }
  let bytecode = this.compiledExprBytecodeCache.get(expr);
  if (bytecode === undefined) {
    bytecode = compilePolicyBytecode(expr, this.input.def, this.encodedStateLayout);
    this.compiledExprBytecodeCache.set(expr, bytecode);
  }
  // ... vmContext setup unchanged ...
  try {
    const result = executeBytecode(bytecode, this.encodedState, vmContext);
    return result.value;
  } catch (error) {
    if (error instanceof PolicyBytecodeVmUnsupportedError) {
      return this.evaluateCompiledExprDirect(expr, candidate);
    }
    throw error;
  }
}
```

The catch is type-narrow: only `PolicyBytecodeVmUnsupportedError` falls back. Any other error propagates. This preserves the existing error-propagation contract for runtime errors (`RUNTIME_EVALUATION_ERROR`, division-by-zero, etc.).

### D2. Make `resolveVmFallbackFeature`'s default branch throw

In the same file, around line 706-709:

```ts
private resolveVmFallbackFeature(...): PolicyValue {
  switch (ref.kind) {
    case 'dynamicSurface': { ... }
    case 'dynamicRef': { ... }
    case 'dynamicExpr': { ... }
    // ... existing cases ...
    case 'adjacentTokenAgg':
    case 'seatAgg':
      throw new PolicyBytecodeVmUnsupportedError(`Policy bytecode feature "${ref.kind}" is not supported by the default bytecode evaluator.`);
    default:
      throw new PolicyBytecodeVmUnsupportedError(`Policy bytecode feature kind "${(ref as { kind: string }).kind}" has no handler in resolveVmFallbackFeature; falling back to direct evaluator.`);
  }
  // The break-then-throw at the bottom of the function (for dynamicSurface/dynamicRef/dynamicExpr
  // when the in-IR lookup fails) stays as-is; it's already correct.
}
```

The default-throw turns the silent gap into an audible signal. The try/catch in D1 catches it and falls back.

### D3. Defer the explicit-handler delete-vs-keep decision to a follow-on ticket

The hot-fix from `beb3c3993` added explicit cases in `resolveVmFallbackFeature` for `candidateFeature`, `stateFeature`, `candidateAggregate` plus a `findLibraryRef` helper. With D1 + D2 in place, those three handlers become a duplicated fast-path: the safety-net catch already routes any VM-unsupported throw to `evaluateCompiledExprDirect`, which resolves the same library refs via the IR.

Two valid resolutions exist:

- **Keep them as fast-paths**. Avoids the cost of falling back to `evaluateCompiledExprDirect` for the three most common library-ref shapes. For a simple top-level ref (`{ ref: feature.X }`) the fallback walks the expression and dispatches via `resolveAgentPolicyRef` → `evaluateCandidateFeature`; the explicit handler short-circuits this to one direct call.
- **Delete them; rely on the safety net.** Architecturally cleaner — the dispatch table reads "VM handles X, Y, Z natively; everything else falls back through the safety net". One source of truth. Removes the maintenance burden of keeping `findLibraryRef` in sync with future library refKinds.

Choosing between them requires a perf measurement against the per-card gate, and the per-card gate is itself pending recalibration as part of PR #239's follow-up (see D5). Sequencing this spec on outside work would block the safety-net architecture for no architectural reason. Therefore: **D3 is deferred to a follow-on ticket** under the namespace below. The safety net (D1) and registry + test (D2 + D4) ship first; the follow-on ticket measures the perf delta against the recalibrated gate and applies whichever resolution wins, with the measurement evidence documented in its commit body.

### D4. Promote the dispatch contract into a typed registry, then add an enumeration test

D4 has two coupled sub-deliverables. The registry sub-deliverable lands first because the test depends on the union it exports.

#### D4a. `FEATURE_REF_KINDS` registry in `types.ts`

Currently `FeatureRef.kind` is typed as plain `string` (`packages/engine/src/cnl/policy-bytecode/types.ts:78-82`):

```ts
export interface FeatureRef {
  readonly kind: string;
  readonly layoutIndex: number;
  readonly aux: readonly number[];
}
```

This is the structural-typing root cause of why the emitter and evaluator can drift silently: there's no compile-time surface anywhere that the two sides share. Replace with an exported registry:

```ts
export const FEATURE_REF_KINDS = [
  'globalVar', 'playerInt', 'globalMarker',
  'zoneProp', 'zoneTokenAgg', 'globalTokenAgg', 'globalZoneAgg',
  'candidateIntrinsic', 'candidateParam', 'candidateTag', 'candidateTags',
  'candidateFeature', 'stateFeature', 'candidateAggregate',
  'adjacentTokenAgg', 'seatAgg',
  'dynamicRef', 'dynamicSurface', 'dynamicExpr',
] as const;

export type FeatureRefKind = (typeof FEATURE_REF_KINDS)[number];

export interface FeatureRef {
  readonly kind: FeatureRefKind;
  readonly layoutIndex: number;
  readonly aux: readonly number[];
}
```

`featureRefForCompiledPolicyRef` (`packages/engine/src/cnl/policy-bytecode/feature-table.ts:187`) already produces only these 18 kinds; the narrower type assignment is a no-op for the emitter except that future emitter changes that introduce a new kind without registering it now fail to type-check at the construction site. The two consumers downstream (`resolveBuiltInFeature` in `vm.ts` and `resolveVmFallbackFeature` in `policy-evaluation-core.ts`) keep their existing switch shapes; adding a new kind to the registry would not by itself break their compilation, but the new test in D4b will fail until the kind is covered by one of the resolution paths.

#### D4b. Enumeration test

`packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` (new):

```ts
// @test-class: architectural-invariant
```

One assertion per kind in `FEATURE_REF_KINDS`. Each iteration:

1. Constructs a corresponding `CompiledAgentPolicyRef` (using direct IR construction — bypass the YAML compiler so the test is hermetic) for kinds that originate from a `CompiledAgentPolicyRef`. For kinds that originate as inner shapes of an aggregate or zoneProp expression, construct the surrounding `CompiledPolicyExpr` directly.
2. Wraps it in a minimal `CompiledPolicyExpr` envelope.
3. Constructs a minimal `PolicyEvaluationContext` with a small `GameDef` fixture (1-2 zones, 2-4 tokens, 2-3 player vars, 1 marker — just enough to exercise the kind).
4. Calls `evaluateCompiledExprWithVm` (or its public-facing alias `evaluateCompiledExpr`).
5. Asserts the result is either a typed `PolicyValue` (number / string / boolean / array, NOT bare `undefined`) OR a `PolicyBytecodeVmUnsupportedError` was thrown and caught (which D1's catch handles in production by falling back to the direct evaluator).

The kind-enumeration is type-checked against the registry:

```ts
const KINDS_PRODUCED_BY_EMITTER = [...FEATURE_REF_KINDS] as const;
// Type-level cross-check: if FEATURE_REF_KINDS gains a new member,
// the satisfies clause forces this list to be extended too, which forces
// the test loop body to handle the new kind.
KINDS_PRODUCED_BY_EMITTER satisfies readonly FeatureRefKind[];
```

The test serves three purposes:
- **Gate against the original bug recurring**: any kind that returns silent `undefined` from the bytecode path fails the test directly.
- **Gate against new emitter kinds without evaluator coverage**: when a future change adds a kind to `FEATURE_REF_KINDS`, the satisfies-clause forces this test's enumeration to include it, which forces the test author to construct a fixture exercising it, which surfaces the need for a corresponding evaluator handler.
- **Document the contract**: the test is a readable enumeration of "every kind the emitter produces, and the expected resolution path". Future authors can use it as the spec of the dispatch contract.

Not in scope for D4: assertion against specific values. The test is about the dispatch contract, not the per-kind semantic correctness (which is covered by the existing `policy-bytecode-equivalence.test.ts` and downstream integration tests).

### D5. Sequencing note on PR #239 perf gate recalibration (not a deliverable)

Two perf gates were calibrated against the buggy fast path in PR #239 and now under-fit reality:

- `test/perf/agents/fitl-per-card-cost.perf.test.ts` ceiling is 1800 ms (`PHASE4_RESET_CEILING_MS`, line 37); real cost with library refs evaluating correctly is ~2596 ms. Needs recalibration with a comment citing `beb3c3993`.
- `test/perf/agents/preview-pipeline.perf.test.ts` corpus parameters need adjustment so 50 ARVN action-selections fit in `maxTurns`.

These are NOT deliverables of Spec 154. They are PR #239 follow-up work and have their own ticket trail. If still unaddressed at this spec's implementation time, the implementing PR should not absorb them — open a separate ticket against PR #239's namespace and reference it from the Spec 154 implementing PR. The D3 follow-on ticket (per §D3) blocks on the recalibrated gate, not on Spec 154's main implementation; the safety net (D1) and registry + test (D4) can ship without the recalibration.

## Acceptance Criteria

1. **Defensive throw + try/catch in place**. `resolveVmFallbackFeature`'s `default:` branch throws `PolicyBytecodeVmUnsupportedError`. `evaluateCompiledExprWithVm` catches it and dispatches to `evaluateCompiledExprDirect`. Verified by reading the diff.
2. **`FeatureRefKind` registry in place**. `packages/engine/src/cnl/policy-bytecode/types.ts` exports `FEATURE_REF_KINDS` (const-array of the 18 emitter-produced kinds) and `FeatureRefKind` (union derived from it); `FeatureRef.kind` is typed as `FeatureRefKind`. The whole engine package type-checks (`pnpm -F @ludoforge/engine typecheck`) without changes to the emitter or VM dispatch sites.
3. **Enumeration test passes**. `policy-bytecode-fallback-completeness.test.ts` runs in `pnpm -F @ludoforge/engine test:unit` and passes for every kind in `FEATURE_REF_KINDS`. The `KINDS_PRODUCED_BY_EMITTER satisfies readonly FeatureRefKind[]` clause type-checks; the test file declares `// @test-class: architectural-invariant`.
4. **No regression on the original CI lanes**. `slow-parity-shard-b`, `test:performance`, and the engine default test lane stay green. Run locally.
5. **`policy-bytecode-equivalence.test.ts` continues to pass.** The existing equivalence test should not require changes — both sides of the test go through the same evaluator path (post-Spec-149), and that path now resolves library refs through the safety net rather than the silent gap.
6. **No new `PolicyBytecodeVmUnsupportedError` thrown out of `evaluatePolicyMove` in production runs.** Run the full engine test suite + a few representative profile-fitl-preview-drive script invocations; the catch in D1 should swallow every unsupported throw cleanly.
7. **D3 explicit-handler decision is NOT in this spec's scope.** The follow-on ticket (per Follow-On Tickets below) records the keep-vs-delete measurement and applies the chosen resolution.

## Risks

- **Direct-evaluator perf regression on uncommon paths**. If a kind that's currently never hit in production trajectories suddenly becomes common (e.g., a new FITL profile uses `seatAgg` heavily), the fallback to direct evaluator could be measurably slower than a hypothetical native VM handler. Mitigated by the existing `requiresDirectLiteralSemantics` gate, which already routes `seatAgg` and `adjacentTokenAgg` to direct evaluator BEFORE the VM is invoked — those don't even enter the VM. The fallback is only reached for VM-throwing cases, which by definition the VM can't handle.
- **`resolveVmFallbackFeature`'s `default:` change masks future genuine `undefined` returns**. The current default returns `undefined` for any kind not explicitly handled. If some kind legitimately should return `undefined` (e.g., a candidate-context-less query), changing default to throw would break that path. Mitigated by reviewing each existing case — none actually rely on the default path returning `undefined`; all explicit cases that legitimately return `undefined` do so via their case body returning `undefined` directly.
- **Test enumeration drift**. `KINDS_PRODUCED_BY_EMITTER` could go stale. Mitigated by the TypeScript type assertion in the test ensuring the array is `readonly FeatureRef['kind'][]`. Adding a new kind to `FeatureRef` without updating the test list produces a compile error.
- **Conflict with PR #239 perf recalibration timing**. If the perf gates are recalibrated before this spec lands, the recalibrated numbers reflect the explicit-handlers fast-path. If "delete" is then chosen for D3, the recalibration may need a second tweak. Mitigated by sequencing: measure D3 with the perf gates' new ceilings; if "delete" exceeds, keep the fast-paths.

## Out Of Scope

- Adding native VM handlers for `candidateFeature` / `stateFeature` / `candidateAggregate` (rejected in Brainstorm Context — wrong layer).
- Changes to the bytecode emitter (`featureRefForCompiledPolicyRef`) — the existing emitted shapes are correct; the gap is downstream. The registry in D4a narrows the type but does not change emitter behavior.
- Deciding whether to delete the explicit `candidateFeature` / `stateFeature` / `candidateAggregate` handlers added by `beb3c3993` (deferred to a follow-on ticket — see §D3 and Follow-On Tickets below).
- Recalibrating the per-card cost gate ceiling or the preview-pipeline corpus (PR #239 follow-up; the D3 follow-on ticket sequences after this).
- Reintroducing closure-tree (rejected per F#14).
- Cross-game changes (FITL-specific or Texas-specific) — the bug class is engine-generic; the fix is engine-generic.
- Changes to WASM scoring routing (`policy-wasm-score-routing.ts`) — the WASM route has its own dispatch model and is unaffected by this spec.

## Follow-On Tickets

Proposed namespace: `154POLBCDISP` (POLicy ByteCode DISPatch). Anticipated decomposition (final shape to be set by `/spec-to-tickets specs/154-policy-bytecode-emitter-evaluator-dispatch-completeness.md 154POLBCDISP`):

- **154POLBCDISP-001 — Safety-net restoration (D1)**. Change `resolveVmFallbackFeature`'s `default:` branch to throw `PolicyBytecodeVmUnsupportedError`; add the `try { executeBytecode } catch (PolicyBytecodeVmUnsupportedError) { evaluateCompiledExprDirect }` wrapper in `evaluateCompiledExprWithVm`. Acceptance: criterion 1 above.
- **154POLBCDISP-002 — `FeatureRefKind` registry + enumeration test (D4)**. Introduce `FEATURE_REF_KINDS` const-array and `FeatureRefKind` union in `types.ts`; narrow `FeatureRef.kind`. Add `policy-bytecode-fallback-completeness.test.ts` with the satisfies-clause and per-kind fixture coverage. Acceptance: criteria 2 and 3 above. Sequenced after `-001` so the safety-net catch is in place before the test exercises every kind.
- **154POLBCDISP-003 — Explicit-handler decision (D3 follow-on, sequenced after PR #239 perf-gate recalibration lands)**. Measure perf delta of `keep` vs `delete` for the `candidateFeature` / `stateFeature` / `candidateAggregate` explicit handlers (and the `findLibraryRef` helper) against the recalibrated `fitl-per-card-cost.perf.test.ts` ceiling. Apply the winning resolution; record evidence in the commit body. Acceptance: criterion 7 above.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-04:

- [`archive/tickets/154POLBCDISP-001.md`](../archive/tickets/154POLBCDISP-001.md) — Restore policy-bytecode safety-net fallback (covers D1 + D2)
- [`tickets/154POLBCDISP-002.md`](../tickets/154POLBCDISP-002.md) — Promote FeatureRef.kind into a typed registry + add enumeration completeness test (covers D4)
- [`tickets/154POLBCDISP-003.md`](../tickets/154POLBCDISP-003.md) — Explicit-handler delete-vs-keep decision (covers D3, deferred-execution)
