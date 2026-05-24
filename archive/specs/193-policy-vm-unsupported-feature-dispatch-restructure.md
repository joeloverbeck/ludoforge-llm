# Spec 193 — Policy VM Unsupported-Feature Dispatch Restructure

**Status**: COMPLETED
**Priority**: High — `PolicyBytecodeVmUnsupportedError` construction is 14.3–36.2% of CPU self-time across all six measured workloads at HEAD (`reports/fitl-perf-baseline-2026-05-24.md`). It is the single largest above-floor hot path the Spec 192 baseline named, and it fires per-evaluation, per-unsupported-feature, capturing a stack trace each time.
**Complexity**: M — engine change at the bytecode VM dispatch seam and its TS-evaluator fallback caller; behaviour-preserving (same fallback evaluator runs on the same predicates); no compiler/DSL changes.
**Date**: 2026-05-24
**Dependencies**:
- `archive/specs/154-policy-bytecode-emitter-evaluator-dispatch-completeness.md` (COMPLETED — established the paired-contract: bytecode VM throws on unsupported feature kinds; caller's `try/catch` falls back to the complete-coverage TS evaluator. This spec preserves that paired-contract guarantee at the architectural level while replacing its hot-path implementation).
- `archive/specs/192-fitl-perf-profiling-methodology.md` (COMPLETED — produced the baseline that named this finding).

**Trigger report**: `reports/fitl-perf-baseline-2026-05-24.md` §Findings Table, row 1 (`Dispatch-restructure` category, all-six lane scope, 14.3–36.2% contribution).

**Ticket namespace**: `193POLVMDISPRES` (proposed; finalize during ticket decomposition)

---

## 1. Goal

Replace the exception-based unsupported-feature signaling path between the bytecode VM and its TS-evaluator fallback with a typed non-throw verdict, eliminating the per-evaluation `Error` construction + stack-capture cost while preserving Spec 154's paired-contract dispatch-completeness guarantee.

Concretely:

1. **VM core return shape** — `executeBytecode` and helper functions (e.g., feature/ref resolvers) return a tagged discriminant `{ status: 'ok', value, scores, usedDynamicFallback } | { status: 'unsupported', feature, reason }` rather than throwing `PolicyBytecodeVmUnsupportedError`. The legacy `VMResult` interface is replaced entirely; its load-bearing fields (`value`, `scores`, `usedDynamicFallback`) migrate into the `'ok'` variant. The exception class is deleted in the same change (see §4.2 and §3 test blast radius).
2. **Caller branches on the tag** — `evaluateCompiledExprWithVm` in `policy-evaluation-core.ts` switches on `status`, invoking `evaluateCompiledExprDirect` on the `'unsupported'` branch instead of relying on a `try/catch` wrap.
3. **Optional negative cache** (P2) — once the tag-based dispatch is in place, the unsupported verdict for a given `(decisionKey, featureKind)` pair MAY be memoized so the same unsupported feature does not re-enter the VM on every evaluation. The cache is bounded, deterministic, and cleared on `GameDef` identity change (per Foundation #13).

The structural guarantee survives: an unsupported feature still cannot silently default to a fallback verdict (Foundation #15 architectural completeness). The discriminant tag enforces exhaustiveness at the type level — caller MUST handle `'unsupported'` — replacing the runtime throw as the unmissable signal.

## 2. Non-Goals

- **No expansion of the bytecode VM's supported feature set.** That is the `Bytecode-VM expansion` category in Spec 192 §4.4 and would be a separate spec if the remediation-spec measurement leaves residual headroom.
- **No removal of the TS-evaluator fallback.** Spec 154's paired-contract relies on the fallback's complete coverage; removing it would re-introduce the exact gap Spec 154 closed.
- **No change to bytecode emitter output.** The emitter's feature-kind table (`stablePayloadCode`, `stableStringCode`) and opcode set are unchanged.
- **No change to caller-visible policy evaluation results.** The same TS fallback runs on the same predicates; output values, ordering, and side effects are byte-identical.
- **No change to preview-ref status semantics** (Foundation #20). The unsupported verdict already feeds the existing preview-ref provenance pipeline; the typed verdict carries the same information.

## 3. Context (verified against codebase, 2026-05-24)

- **`PolicyBytecodeVmUnsupportedError`** is declared at `packages/engine/src/agents/policy-vm/vm.ts:35-40`:
  ```ts
  export class PolicyBytecodeVmUnsupportedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PolicyBytecodeVmUnsupportedError';
    }
  }
  ```
- **Thrown via two distinct mechanisms** — the fix must address both:
  - *Mechanism (a) — VM-core sentinel-to-throw conversion*: opcode handlers invoke the `resolveFeature` callback; when the callback returns the internal `UNSUPPORTED_FEATURE` sentinel (`vm.ts:33`), the VM-core converts it into a throw at `vm.ts:384` (LOAD_FEATURE) and `vm.ts:498` (RESOLVE_REF). The sentinel protocol already exists internally; only the conversion-to-throw is the hot path.
  - *Mechanism (b) — callback direct throws*: `resolveVmFallbackFeature` (`policy-evaluation-core.ts:1349`) throws `PolicyBytecodeVmUnsupportedError` directly at lines 1388, 1390-1391, 1394 instead of returning the sentinel. The callback's per-call throw is attributed in the profile as `resolveVmFallbackFeature` self-time (5.0s + 3.8s ≈ 5.6% on `parity-drive`).
- **Caught** at `policy-evaluation-core.ts:1183-1184` (within `evaluateCompiledExprWithVm`):
  ```ts
  if (error instanceof PolicyBytecodeVmUnsupportedError) {
    return this.evaluateCompiledExprDirect(expr, candidate);
  }
  ```
- **Current `executeBytecode` return shape**: `VMResult` interface at `packages/engine/src/agents/policy-vm/vm.ts:57-62` has four fields:
  ```ts
  export interface VMResult {
    readonly scores: readonly number[];
    readonly value?: PolicyValue;
    readonly pruned?: boolean;
    readonly usedDynamicFallback: boolean;
  }
  ```
  Load-bearing consumers: `value` (main caller at `policy-evaluation-core.ts:1181` + tests), `scores` (equivalence test at `policy-bytecode-equivalence.test.ts:436`), `usedDynamicFallback` (equivalence test at `policy-bytecode-equivalence.test.ts:469, 534`). `pruned` is declared but unread by any current `VMResult` consumer (out-of-scope cleanup opportunity).
- **Test blast radius for `executeBytecode` + `PolicyBytecodeVmUnsupportedError`** — ~13 sites across 4 files require migration when the typed verdict replaces `VMResult`:
  - `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` — ~5 sites (uses `result.scores`, `result.value`, `result.usedDynamicFallback`; catches the error at lines 475, 540).
  - `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` — ~4 sites (already `@test-class: architectural-invariant`; constructs unsupported via throws at lines 310, 312 as test fixtures; catches at line 356).
  - `packages/engine/test/unit/agents/policy-vm-core.test.ts` — ~3 opcode-level call sites.
  - `packages/engine/test/architecture/candidate-param-refs/candidate-params-runtime-tracing.test.ts` — 1 candidate-params trace site.
- **Profile evidence** (`reports/perf-baseline/parity-drive-8203b4d023.json`): two stack-attributed `PolicyBytecodeVmUnsupportedError` self-time entries totalling ~28s on a 157s median wall-clock (17.8% combined). `resolveVmFallbackFeature` adds 5.0s + 3.8s self-time (~5.6% combined). The cost is dominated by `Error` constructor stack-capture at high call rates, not by the dispatch logic itself.
- **Spec 154 paired-contract** (`archive/specs/154-policy-bytecode-emitter-evaluator-dispatch-completeness.md` §Goal/§Architecture): the bytecode emitter and TS evaluator are paired contracts; the VM throws `PolicyBytecodeVmUnsupportedError` on unsupported feature kinds and the caller falls back to the complete-coverage TS evaluator. The completeness guarantee is structural: every feature kind the emitter can produce must either be VM-supported or fall back through this paired path.

## 4. Architecture

### 4.1 Typed non-throw verdict

Replace the legacy `VMResult` interface with a discriminated union that carries the load-bearing fields on the `'ok'` variant:

```ts
type VmEvalResult =
  | { status: 'ok'; value: PolicyValue | undefined; scores: readonly number[]; usedDynamicFallback: boolean }
  | { status: 'unsupported'; feature: FeatureRef; reason: string };
```

`executeBytecode` returns `VmEvalResult` directly (no wrapper); all consumers destructure after the tag check. Per Foundation #14, the legacy `VMResult` interface is removed in the same change as the consumer migrations (see §3 test blast radius and §8 P1).

The fix addresses both throw mechanisms identified in §3:

**(a) VM-core sentinel-to-typed conversion** — opcode handlers continue to invoke callbacks via the internal `UNSUPPORTED_FEATURE` sentinel protocol (the sentinel is unchanged inside the VM). At the conversion points (`vm.ts:384` LOAD_FEATURE, `vm.ts:498` RESOLVE_REF), the throw is replaced with a typed early return: build the `{ status: 'unsupported', feature, reason }` variant and return it from `executeBytecode`. The partial-stack-state concern is resolved by returning *before* committing the side-effecting opcode to the stack; in opcodes where this is impractical, the VM's per-call stack is reset before return.

**(b) Callback typed-return discipline** — `resolveFeature`, `resolveRef`, and `resolveDynamic` callbacks continue to return `PolicyValue | typeof UNSUPPORTED_FEATURE` (preserving compatibility with the VM's existing internal sentinel protocol — the public boundary's conversion to `VmEvalResult` happens at `executeBytecode`'s return path). `resolveVmFallbackFeature` (`policy-evaluation-core.ts:1349`) is rewritten to return the `UNSUPPORTED_FEATURE` sentinel instead of throwing — the per-call throw cost (5.6% on `parity-drive`) is eliminated at its source.

**Design alternative considered**: extending the existing `UNSUPPORTED_FEATURE` sentinel protocol all the way to the public `executeBytecode` return boundary (make `executeBytecode` itself return `PolicyValue | typeof UNSUPPORTED_FEATURE` rather than a discriminated union). This is the minimal-blast-radius option. Rejected in favor of the discriminated union because tag-based exhaustiveness is a stronger compile-time guarantee than non-null-vs-symbol narrowing (Foundation #16), and the explicit `'unsupported'` variant carries `feature` + `reason` provenance the bare sentinel cannot.

`evaluateCompiledExprWithVm` consumes the return shape:

```ts
const result = executeBytecode(bytecode, this.encodedState, vmContext);
if (result.status === 'ok') return result.value;
// 'unsupported' — typed exhaustive branch, not a catch
return this.evaluateCompiledExprDirect(expr, candidate);
```

TypeScript exhaustiveness checking forces the caller to handle `'unsupported'` at every `executeBytecode` consumer site, replacing the runtime throw as the unmissable signal Spec 154 relies on.

### 4.2 `PolicyBytecodeVmUnsupportedError` disposition

Per Foundation #14 (no backwards compatibility), the class is deleted atomically with the consumer + test-fixture migrations. No compat shim is retained. Test fixtures that currently throw the class as part of unsupported-feature construction (`policy-bytecode-fallback-completeness.test.ts:310, 312`) are migrated to construct the `'unsupported'` variant directly. Test catch sites (`policy-bytecode-equivalence.test.ts:475, 540`; `policy-bytecode-fallback-completeness.test.ts:356`) are migrated to branch on `result.status === 'unsupported'` instead of `instanceof PolicyBytecodeVmUnsupportedError`. The deletion lands in the same change as the refactor — Foundation #14 is non-negotiable, and the migration surface is well-bounded (§3 test blast radius).

### 4.3 Negative cache (P2, conditional)

Once the typed-verdict refactor is in place and measured, P2 evaluates a bounded negative cache keyed on `(decisionKey, featureKind)`:

- On `'unsupported'` verdict for a `(decisionKey, featureKind)` pair, cache the verdict; next call short-circuits the VM entry entirely and routes to the TS fallback.
- Cache size bounded by an LRU cap (consistent with the existing Zobrist key cache pattern); cleared on `GameDef` identity change (`Foundation #13`); per-process, per-evaluation-context binding to match the existing `cacheBinding` discipline (Spec 189).
- Cache hit/miss telemetry emits via the eval-path counter pattern Spec 172 established (e.g., `policyEncodedStateCacheObjectHit`-style counters at the policy-eval layer), which the sim-level `ENGINE_PER_DECISION_PROFILE` hook (`packages/engine/src/sim/run-game-steps.ts:98`) aggregates and reports per-decision. The cache lives at the policy-eval layer; the hook lives at the sim layer; the emit-counter pattern is the existing layer-crossing convention.

The negative cache is P2 because P1's typed-verdict refactor alone may already eliminate the dominant cost (stack capture is the per-`Error` cost; the dispatch logic itself is cheap). P2 lands only if P1's measured gain falls short of the per-spec acceptance threshold (§8).

### 4.4 Spec 154 paired-contract preservation

The architectural invariant Spec 154 owns — every emitter-producible feature kind is either VM-supported or fallback-handled, never silently defaulted — is preserved by:

1. TypeScript exhaustiveness on the `VmEvalResult` discriminant (the `'unsupported'` branch MUST be handled by every caller; type-checking fails otherwise).
2. The existing architectural-invariant test at `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` (already `@test-class: architectural-invariant`, already enumerates `FEATURE_REF_KINDS` via `KINDS_PRODUCED_BY_EMITTER`) is shape-adapted to assert against the typed verdict: every emitter-producible feature kind, when evaluated by `executeBytecode`, returns either `{ status: 'ok' }` OR `{ status: 'unsupported' }` AND the `'unsupported'` branch is correctly routed to the TS fallback by `evaluateCompiledExprWithVm`. The existing test is migrated in place — no new test file is authored.

The structural completeness guarantee is strictly stronger after this spec: prior to it, the catch-handler could in principle be removed without compile-time error (the throw is dynamic); after it, removing the `'unsupported'` branch is a TypeScript exhaustiveness violation that blocks compilation.

## 5. Data flow / Process

`evaluatePolicyMoveCore` → `evaluateCompiledExprWithVm(expr, candidate)` → `executeBytecode(bytecode, encodedState, vmContext)` → returns `{ status: 'ok', value, scores, usedDynamicFallback }` (fast path, unchanged dispatch logic; load-bearing `VMResult` fields migrated into the variant) OR `{ status: 'unsupported', feature, reason }` (slow path, partial stack discarded, no throw) → caller branches on tag → `'unsupported'` routes to `evaluateCompiledExprDirect(expr, candidate)` (TS fallback, unchanged) → returns `PolicyValue`.

P2 with negative cache: caller checks `(decisionKey, featureKind)` negative cache before VM entry; cache hit skips VM and routes directly to TS fallback; cache miss runs VM and updates cache on `'unsupported'` verdict.

## 6. Determinism and replay (Foundations #8, #16)

The TS fallback evaluator runs on the same predicates with the same encoded state; observable evaluation results are byte-identical. The trajectory-identity proof obligation (Foundation #8) is the existing Spec 192 harness: every workload's `trace.finalState.stateHash` at terminal MUST be identical pre- and post-refactor.

P2's negative cache is keyed on already-deterministic inputs (`decisionKey` is the kernel's stable decision identifier; `featureKind` is a static enum); cache state itself never feeds into evaluation results (it's a pure short-circuit), so replay identity is preserved.

## 7. Edge cases

- **Nested unsupported features inside a single VM execution** — the first `'unsupported'` short-circuits the instruction loop; the verdict carries the first encountered feature; the TS fallback re-evaluates the full expression from scratch (matching today's `try/catch` semantics).
- **Partial-stack state at the unsupported point** — resolved by returning *before* committing the side-effecting opcode to the stack; in opcodes where this is impractical, the VM's internal stack is reset before return (the stack is per-call, not shared).
- **`PolicyBytecodeVmUnsupportedError` thrown by external (non-VM) code** — verified absent during P1; if discovered, retain the class as a public throw contract for that path and use the typed verdict only inside VM-internal dispatch.
- **Negative cache invalidation on `GameDef` identity change** — `cacheBinding`-style structural keying (Spec 189): the cache is bound to the evaluation context's `cacheBinding`, not a per-process global; rebuilding the context rebuilds the cache.
- **Feature kinds the VM later starts supporting** — when the bytecode VM is extended (a future `Bytecode-VM expansion` spec), the negative cache's `featureKind` entries for the newly-supported kind become stale-but-harmless (extra fallback calls until cache eviction); cache version-keying on bytecode-VM-version metadata (Foundation #13) eliminates even this transient.
- **WASM throw-contract parallel** — `packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` is the architectural-test analog for the WASM dispatch path. Spec 193's typed-verdict refactor does NOT touch the WASM throw-contract; analogous WASM restructuring is out-of-scope here per Spec 192 §4.4 `WASM expansion`. If a future WASM-throw-contract spec lands, it should mirror the discriminant approach for cross-dispatch consistency.

## 8. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Typed-verdict refactor in `policy-vm/vm.ts` + `policy-evaluation-core.ts` (§4.1, §4.2, §4.4), **plus migration of ~13 test sites across 4 files** (per §3 test blast radius) | `VmEvalResult` discriminated union replaces `VMResult` entirely (load-bearing fields on the `'ok'` variant); all VM-internal throws converted to typed returns; `resolveVmFallbackFeature` returns `UNSUPPORTED_FEATURE` sentinel instead of throwing; caller branches on tag; `PolicyBytecodeVmUnsupportedError` deleted; test fixtures and catch sites migrated to typed-verdict shape; the existing `policy-bytecode-fallback-completeness.test.ts` shape-adapted to the typed verdict (Spec 154 paired-contract architectural invariant preserved); trajectory-identity test (Spec 192) green across all six workloads; `pnpm -F @ludoforge/engine test` 100% pass | M |
| **P2** | Negative cache (§4.3) — *conditional on P1 measured gain* | Bounded LRU cache on `(decisionKey, featureKind)`; cache-binding structural per Spec 189; cleared on `cacheBinding` rebuild; cache telemetry through `ENGINE_PER_DECISION_PROFILE`; trajectory-identity preserved | S |
| **P3** | Perf witness re-capture | Re-run the Spec 192 baseline harness on `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, `arvn-tournament-parallel`; record measured gain in commit body and in `reports/perf-baseline/<workload>-<HEAD-sha>.json`; named gain target is **≥10% individual wall-clock reduction OR ≥10% combined reduction in `PolicyBytecodeVmUnsupportedError`-attributed self-time** across the five regressed workloads | S |

P1 alone may land green and meet the gain target; P2 is gated on P1's measured residual. P3's measurement determines whether further `Dispatch-restructure` work or escalation to `Bytecode-VM expansion` (Spec 192 §4.4) is warranted.

## 9. Test plan

- **Replay identity** (Foundation #8 proof): existing `packages/engine/test/integration/perf-baseline-trajectory-identity.test.ts` from Spec 192 covers all six workloads; runs unchanged and must remain green pre- and post-refactor.
- **Architectural-invariant** (Spec 154 paired-contract): the existing `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` (already `@test-class: architectural-invariant`, already enumerates `KINDS_PRODUCED_BY_EMITTER`) is shape-adapted to assert every emitter-producible feature kind, when evaluated by `executeBytecode`, returns `{ status: 'ok' }` OR `{ status: 'unsupported' }` AND the `'unsupported'` branch is correctly routed to the TS fallback by `evaluateCompiledExprWithVm`. No new test file is authored.
- **Type-level exhaustiveness**: TypeScript compilation fails if any caller of `executeBytecode` does not handle `status: 'unsupported'`. This is verified by the standard `pnpm turbo typecheck` gate, not a separate test.
- **Test migration scope** (P1 deliverable per §8): four test files require shape adaptation when `VMResult` is replaced — `packages/engine/test/integration/policy-bytecode-equivalence.test.ts`, `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts`, `packages/engine/test/unit/agents/policy-vm-core.test.ts`, `packages/engine/test/architecture/candidate-param-refs/candidate-params-runtime-tracing.test.ts`. The migration is mechanical (`result.value` → `result.status === 'ok' ? result.value : ...`; `instanceof PolicyBytecodeVmUnsupportedError` → `result.status === 'unsupported'`; test fixtures constructing the error → constructing the variant directly) but in-scope for P1, not deferred.
- **Perf witness**: Spec 192 harness re-captures on the five regressed workloads; results checked into `reports/perf-baseline/` per the §Phase P3 acceptance.
- **Determinism corpus**: `packages/engine/test/determinism/` (Foundation #16 appendix) runs unchanged; if any test fails post-refactor, the refactor has a determinism bug and must be fixed (not the test).

## 10. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| **#1** Engine Agnosticism | The dispatch reshape is a generic policy-evaluation infrastructure change; no game-specific code introduced. Applies equally to any GameDef whose authored policies trigger unsupported bytecode features. |
| **#8** Determinism Is Sacred | Same TS fallback evaluator runs on the same predicates with the same encoded state; observable results are byte-identical. Spec 192 trajectory-identity test is the proof gate. P2 negative cache is keyed on already-deterministic inputs and never feeds back into results. |
| **#11** Immutability | VM-internal stack is per-call (not shared); typed verdict carries no mutable references; P2 cache stores immutable verdict tuples. |
| **#13** Artifact Identity and Reproducibility | P2 cache keyed within `cacheBinding`'s structural binding (Spec 189) — rebuilding the binding rebuilds the cache; cache version-keys on bytecode-VM-version metadata so feature-kind support evolution doesn't strand stale cache entries. |
| **#14** No Backwards Compatibility | `PolicyBytecodeVmUnsupportedError` is deleted atomically with the test-fixture and consumer migrations; `VMResult` is replaced entirely by `VmEvalResult`; no compat shim is retained. The full migration (~13 test sites + 2 source files) lands in the same change per Foundation #14. |
| **#15** Architectural Completeness | Spec 154's paired-contract is preserved AND strengthened: the discriminated tag's TypeScript exhaustiveness check is a stronger structural guarantee than the prior dynamic `try/catch`. The architectural-invariant test enumerates the emitter's feature-kind table; no silent default is reachable. |
| **#16** Testing as Proof | Trajectory-identity + paired-contract architectural-invariant + type-level exhaustiveness are the three independent proof surfaces. |
| **#20** Preview Signal Integrity | The unsupported verdict's information content (feature, reason) is identical to the prior thrown-error message; preview-ref status mapping is unchanged. Re-validation via the policy-preview-parity workload's perf witness covers any preview-status-boundary regression risk. |

## 11. Reassessment of source proposal (`reports/fitl-perf-baseline-2026-05-24.md`)

**Adopted**:
- Finding row 1 (`Dispatch-restructure` category, 14.3–36.2% contribution, all-six lane scope) — adopted as the spec's central remediation target.
- Foundation-requirement set (#8 replay identity, #15 Spec 154 paired-contract preservation, #20 re-validation if preview-status-boundaries shift) — adopted verbatim.
- Goal sentence ("Replace hot unsupported-feature exception flow with a typed non-throw fallback verdict while preserving fail-closed dispatch completeness") — adopted as the §1 Goal.

**Adopted with adjustment**:
- The report's framing ("replace exception flow") is preserved, but the spec clarifies that the dominant cost is the `Error` constructor's stack capture at high call rates, not the exception-control-flow dispatch overhead per se. The typed verdict eliminates the stack capture; the dispatch logic itself is already cheap.

**Corrected** (during 2026-05-24 reassessment via `/reassess-spec`):
- The initial spec proposed `VmEvalResult = { status: 'ok'; value: PolicyValue } | { status: 'unsupported'; ... }` — structurally narrower than `VMResult` (which has `scores`, `value`, `pruned`, `usedDynamicFallback`). The reassessment surfaced that `scores` and `usedDynamicFallback` are load-bearing for downstream test consumers; the corrected variant carries them on the `'ok'` branch (option (a) per the FOUNDATIONS reassessment of the integration shape — chosen for #14/#15/#16 alignment over alternatives that wrapped `VMResult` or preserved it via an internal-only discriminant).
- The initial spec proposed a new architectural-invariant test at `packages/engine/test/architecture/policy-bytecode-dispatch-completeness.test.ts`. The reassessment surfaced that `packages/engine/test/unit/agents/policy-bytecode-fallback-completeness.test.ts` already exists with the same `@test-class: architectural-invariant` marker and the same `FEATURE_REF_KINDS` enumeration — the spec is corrected to shape-adapt the existing test rather than duplicate it.
- Test blast radius was undercounted in the initial spec (~13 sites across 4 files). The reassessment enumerates them in §3 and adds the migration to P1 deliverables.
- §4.2's contingent deletion ("if no external caller depends on it") was corrected to definite deletion per Foundation #14 — the test fixtures that throw/catch the class migrate in the same change, no compat shim.
- §3 was missing the two-distinct-throw-mechanisms distinction; §4.1 was missing the corresponding (a)/(b) split. Both are added so each throw path is explicitly remediated.

**Reassessment of source proposal applies to this spec's source report**: per the source-derived Reassessment-section discipline (`brainstorm` skill `references/output-artifacts.md`), the source for Spec 193 is `reports/fitl-perf-baseline-2026-05-24.md` — an internal decision-handoff report (not an external LLM proposal). The dispositions above document per-recommendation handling vis-à-vis that report's Finding row 1.

**Meta-decision**:
- The optional negative cache (P2) is the only remediation extension beyond the report's literal finding text. It is opt-in and gated on P1's measured residual; rationale recorded in §4.3.

**Deferred**:
- `Bytecode-VM expansion` for newly-hot unsupported feature kinds — deferred to a per-feature-kind follow-up spec if P3 measurement leaves residual headroom and the Spec 192 §4.5 escalation trigger fires.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-24:

- [`archive/tickets/193POLVMDISPRES-001.md`](../tickets/193POLVMDISPRES-001.md) — Typed-verdict refactor — replace VMResult + delete PolicyBytecodeVmUnsupportedError; migrate 4 test files (COMPLETED; covers §4.1, §4.2, §4.4, §8 P1)
- [`archive/tickets/193POLVMDISPRES-002.md`](../tickets/193POLVMDISPRES-002.md) — Perf witness re-capture across 5 regressed FITL workloads (COMPLETED; covers §8 P3)
- [`archive/tickets/193POLVMDISPRES-003.md`](../tickets/193POLVMDISPRES-003.md) — Optional negative cache for unsupported-feature verdicts (NOT IMPLEMENTED — declined because ticket 002 showed P1 met the per-spec threshold; covers §4.3, §8 P2 gate)

## Outcome

Completed: 2026-05-24

What changed:
- Ticket 001 replaced the exception-based VM unsupported-feature path with `VmEvalResult`, deleted `PolicyBytecodeVmUnsupportedError`, migrated the caller and affected tests, and preserved the Spec 154 paired-contract fallback invariant.
- Ticket 002 re-ran the Spec 192 baseline harness across the five regressed workloads and recorded the Spec 193 P3 measurement in `reports/fitl-perf-baseline-2026-05-24.md` plus durable JSON summaries under `reports/perf-baseline/`.
- Ticket 003 was closed as `NOT IMPLEMENTED` because ticket 002 proved the P1 typed-verdict refactor already met the per-spec threshold; no P2 negative cache was needed.

Deviations from original plan:
- The optional P2 negative cache was not implemented. The gate condition explicitly allowed close-decline when P1 met the threshold, and the P3 measurement showed every measured regressed workload exceeded the >=10% individual wall-clock reduction threshold with 100.0% unsupported-error self-time reduction.

Verification results:
- `pnpm -F @ludoforge/engine test` — passed in ticket 001.
- `pnpm turbo typecheck` — passed in ticket 001.
- Spec 192 baseline harness reruns for `parity-drive`, `bounded-termination-1002`, `diagnose-parity-runGame-1001`, `policy-preview-parity-arvn-1008`, and `arvn-tournament-parallel` — passed in ticket 002; the report records wall-clock reductions of 29.5%, 21.4%, 24.5%, 23.1%, and 20.4%.
- `pnpm run check:ticket-deps` — passed after ticket 003 archival and reference repair.
