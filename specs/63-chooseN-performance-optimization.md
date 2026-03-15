# Spec 63 — chooseN Resolution and Interaction Performance

**Status**: Revised  
**Relationship to Spec 62**: Complementary, not a hard prerequisite

## 0. Executive Decision

This spec replaces the original "independent probing marks options legal" proposal.

The engine MUST NOT mark a chooseN option as `legal` unless it has an exact completion witness. Singleton probing is retained, but only as a fast filter and search seed.

The revised design has four parts:

1. Keep the current exhaustive combination enumerator as the exact path for small search spaces and as a test oracle.
2. Replace the current all-or-nothing 1024-combination fallback with a hybrid resolver:
   - static filtering
   - singleton probes using the discover-only path
   - budgeted witness search with memoization
   - per-option provisional results when the exact budget is exhausted
3. Add a worker-local chooseN session/resolver so add/remove recomputes the next pending state once instead of rerunning the full pipeline twice per toggle.
4. Add explicit resolution metadata so the UI can distinguish exact results from provisional ones.

## 1. Problem Statement

### 1.1 Current large-domain failure mode

`mapChooseNOptions()` currently enumerates every relevant completion combination until a hard cap is exceeded, then returns all options as `unknown`. This is acceptable for tiny domains and catastrophic for FITL-sized domains.

### 1.2 Current interactive failure mode

`advanceChooseN()` validates the current selection by rerunning the full chooseN discovery path, then reruns it again for the updated selection.

Because the worker already passes `GameDefRuntime`, adjacency-graph and runtime-table caching are mostly already handled. The real waste is duplicate discovery/effect execution and duplicate option probing on every toggle.

### 1.3 Correctness constraint

Current chooseN option legality is closer to:

- "does there exist at least one confirmable completion containing this option?"

than to:

- "does the singleton add immediately avoid a hard error?"

Those are not the same thing. Any optimization that collapses them into the same surface is a semantics change and must be explicit.

### 1.4 MCTS relationship

This spec does not claim a direct speedup for current Spec 62 rollout. Current MCTS uses the discover-only path and does not execute chooseN UI hint mapping. This spec mainly improves interactive chooseN and introduces hooks MCTS may reuse later.

## 2. Design Principles

1. Preserve exact results when cheap.
2. Never surface optimistic singleton feasibility as exact `legal`.
3. Remove the blanket all-unknown fallback.
4. Keep the engine deterministic: count-based budgets only, stable traversal order, no wall-clock cutoffs.
5. Keep the kernel stateless; interactive session state lives in the worker.
6. Fall back conservatively when a chooseN cannot be sessionized safely.

## 3. Semantics

### 3.1 Revised option surface

Extend chooseN option metadata with a resolution field:

    type ChooseNOptionResolution = 'exact' | 'provisional' | 'stochastic' | 'ambiguous';

Rules:

- `legality: 'legal'` means the engine found an exact witness: at least one confirmable completion exists containing this option.
- `legality: 'illegal'` means the engine proved the option cannot participate in any confirmable completion, or the option is statically blocked.
- `legality: 'unknown'` means the engine did not complete an exact proof for that option. Unknown options remain selectable.
- `resolution` explains why:
  - `exact`: exact proof completed
  - `provisional`: budget exhausted before proof completed
  - `stochastic`: probe passed through stochastic authority
  - `ambiguous`: probe passed through ambiguous authority / overlap surface

For backward compatibility, this spec does not replace the existing three-valued `legality` field. It adds `resolution` instead of inventing a new legality enum.

### 3.2 Rejected behavior

The engine MUST NOT mark an option `legal` solely because `[...currentSelected, option]` did not immediately fail. That is only local forward checking, not exact completion feasibility.

### 3.3 Confirm remains authoritative

`confirm` behavior does not change. The final submitted selection is still revalidated authoritatively before it is accepted.

### 3.4 UI interaction rule

The runner MUST continue to allow selecting chooseN options whose legality is `unknown`. Only `illegal` options are blocked.

This preserves playability on unresolved large domains while avoiding dishonest `legal` labels.

## 4. Hybrid chooseN resolution algorithm

`mapChooseNOptions()` becomes a strategy dispatcher instead of a single exhaustive enumerator.

### 4.1 Strategy order

1. Static filtering
2. Small-case exact enumeration
3. Singleton probe pass
4. Budgeted witness search for unresolved candidates
5. Per-option fallback to `unknown` instead of blanket all-unknown

### 4.2 Static filtering

Preserve the current fast rules from `buildChooseNPendingChoice()`:

- already selected -> `illegal`, `resolution: exact`
- at add capacity -> `illegal`, `resolution: exact`
- tier-blocked / qualifier-blocked -> `illegal`, `resolution: exact`

This remains the first pass and should run before any probe search.

### 4.3 Small-case exact enumeration

Do not delete the current combination enumerator immediately.

Rename the current cap concept and narrow its purpose:

    MAX_CHOOSE_N_EXACT_ENUMERATION_COMBINATIONS

Rules:

- If the exact completion count is at or below this threshold, use the current exhaustive algorithm unchanged.
- This path stays exact and doubles as the reference implementation for tests.
- This threshold is not a blanket fallback trigger. It only decides whether exhaustive exact enumeration is cheap enough to use.

This preserves simple exact behavior for tiny domains and removes risk from the rewrite.

### 4.4 Singleton probe pass

For options that survive static filtering and are not handled by small-case exact enumeration, run a single probe per candidate using the discover-only path:

    probeSelection(currentSelected + option, shouldEvaluateOptionLegality = false)

Probe classification:

- illegal -> option becomes `illegal`, `resolution: exact`
- satisfiable and already confirmable at this size -> option becomes `legal`, `resolution: exact`
- satisfiable but needs further picks -> option becomes unresolved root for witness search
- stochastic/ambiguous -> option becomes `unknown` with the corresponding resolution

Important:

- This probe path MUST NOT compute option hints recursively.
- The probe is a satisfiability check for a concrete selected set, not a request to map nested option legality.

### 4.5 Exact witness search

For unresolved roots from the singleton pass, search for one confirmable completion witness.

Definition:

A witness is any selection `S` such that:

- `currentSelected ⊆ S`
- the root option is in `S`
- `|S|` is within `[min, max]`
- probing `S` yields a legal completion surface: complete, next decision, or same chooseN pending with `canConfirm = true`

Rules:

- The search explores only as far as needed to find one witness.
- As soon as one witness is found for an option, that option is `legal`, `resolution: exact`.
- If the entire reachable subtree for that root is exhausted with no witness, that option is `illegal`, `resolution: exact`.
- If the deterministic search budget is exhausted first, that option remains `unknown`, `resolution: provisional`.

This search preserves the existing existential semantics without requiring full `C(n, k)` enumeration in every large case.

### 4.6 Search order and pruning

Search order MUST be deterministic.

Default ordering:

1. active tier order
2. smaller continuation domain first
3. normalized domain order as the final tie-breaker

At each search node:

- recompute remaining admissible options from the template
- drop statically illegal options immediately
- reuse cached probe summaries for previously seen selected sets
- stop descending when the selection is already confirmable and satisfiable

### 4.7 Removal invalidation and selected-sequence validation

Session recomputation and search MUST validate the current selected sequence itself, not only the remaining unselected options.

This is required for cases where removing an early-tier selection makes a later-tier selected item retroactively invalid.

Implementation requirement:

- Extract a pure validator for current chooseN selected sets from the chooseN effect path.
- This validator must run before recomputing remaining admissible options.
- `computeTierAdmissibility()` alone is not sufficient for this case.

### 4.8 Stochastic and ambiguous probes

If a probe crosses a stochastic decision boundary or an ambiguous authority surface:

- do not mark the option `legal`
- do not mark the option `illegal` unless illegality is independently proven
- return `unknown` with `resolution: 'stochastic'` or `'ambiguous'`

## 5. Probe budgets and determinism

The old all-or-nothing combination cap is removed.

Replace it with deterministic budget controls:

    MAX_CHOOSE_N_EXACT_ENUMERATION_COMBINATIONS
    MAX_CHOOSE_N_TOTAL_PROBE_BUDGET
    MAX_CHOOSE_N_TOTAL_WITNESS_NODES

Rules:

- budgets are counts, not milliseconds
- budgets are applied per pending-request evaluation
- if exact search exhausts budget, unresolved options stay `unknown`
- resolved options keep their exact result; the request never degrades wholesale to all-unknown because one threshold was exceeded

## 6. Worker-local chooseN session

### 6.1 Session ownership

The interactive chooseN session is worker-local and opaque to the store/UI. Do not serialize session objects across Comlink.

The bridge continues to return normal `ChoicePendingRequest` values. The worker stores the resolver/session internally.

### 6.2 Session contents

Introduce an internal resolver object:

    interface ChooseNSession {
      readonly revision: number;
      readonly decisionKey: DecisionKey;
      readonly template: ChooseNTemplate;
      readonly probeCache: Map<SelectionKey, ProbeSummary>;
      readonly legalityCache: Map<SelectionKey, readonly ChoiceOption[]>;
      currentSelected: readonly MoveParamScalar[];
      currentPending: ChoicePendingChooseNRequest;
    }

`ChooseNTemplate` is the extracted, selection-invariant data required to recompute a chooseN pending state:

- prepared context
- partial move / action identity
- normalized base domain
- domain index / stable option order
- cardinality bounds
- name / targetKinds
- prioritized tier metadata
- qualifier mode
- any other selection-invariant chooseN metadata needed to rebuild the pending request

### 6.3 Template eligibility

Create a session only when the pending chooseN can be reduced to a stable template.

A chooseN is session-eligible when:

- its base domain and metadata are selection-invariant
- only the following are selection-dependent:
  - selected membership
  - tier / qualifier admissibility
  - confirmability
  - exact/provisional legality resolution

If a chooseN depends on transient self-selection in any other way, or the extraction logic cannot prove eligibility, do not sessionize it. Fall back to the existing non-session path.

### 6.4 Revision-based staleness

Do not introduce a `GameState` hash requirement for this spec.

Use a simple worker-local revision counter:

- increment on any state mutation, action change, undo, reset, or move application
- store the current revision in the session
- discard the session when the revision mismatches

This is cheaper, easier, and sufficient for the interactive worker path.

### 6.5 Per-toggle flow

When a session exists:

1. validate the command against `session.currentPending`
2. compute `nextSelected`
3. recompute the next pending request once from the session template
4. update `session.currentSelected` and `session.currentPending`

This eliminates the current double full-path reevaluation on add/remove.

### 6.6 No direct public session API requirement

The existing public `advanceChooseN()` can remain as a stateless fallback.

The session-aware fast path is an internal runner/worker optimization:

- interactive path -> worker session
- non-interactive callers -> existing stateless API
- future MCTS work may add a separate in-process resolver if needed

## 7. Internal data structures

### 7.1 Canonical selection keys

Use a canonical set key for probe and witness caches.

Recommended implementation:

- derive a stable index for each normalized domain option
- use `bigint` bitsets for domains up to 63 or 64 options
- use `Uint32Array` or a stable string key above that

The canonical key is internal only. Public `selected` order is unchanged by this spec.

### 7.2 Cache layers

Use two caches:

1. `probeCache`: selected-set -> probe summary
2. `legalityCache`: selected-set -> resolved option surface for that set

The caches are session-local and cleared with the session.

### 7.3 Keep the exhaustive enumerator

Keep `countCombinationsCapped()` and `enumerateCombinations()` in one of two places:

- the tiny-domain exact path
- a test-only oracle helper

Do not lose the exact reference implementation until the new resolver has parity coverage.

## 8. Type and API changes

### 8.1 Choice option surface

Add an optional chooseN resolution field:

    interface ChoiceOption {
      value: MoveParamScalar;
      legality: 'legal' | 'illegal' | 'unknown';
      illegalReason: string | null;
      resolution?: 'exact' | 'provisional' | 'stochastic' | 'ambiguous';
    }

Rules:

- `resolution` is required on chooseN options
- `resolution` may default to `exact` for chooseOne or existing exact surfaces

### 8.2 No bridge session object

Do not add `ChooseNSession` to the public bridge/store API. The worker owns it.

### 8.3 Optional debug diagnostics

Add a debug-only diagnostics payload, gated behind a dev flag, for instrumentation:

    interface ChooseNDiagnostics {
      mode: 'exactEnumeration' | 'hybridSearch' | 'legacyFallback';
      exactOptionCount: number;
      provisionalOptionCount: number;
      singletonProbeCount: number;
      witnessNodeCount: number;
      probeCacheHits: number;
      sessionUsed: boolean;
    }

This is not required in production responses.

## 9. File plan

| File | Change |
| --- | --- |
| `packages/engine/src/kernel/legal-choices.ts` | Replace monolithic chooseN mapping with a strategy dispatcher. Add a discover-only probe helper that never computes nested option legality. |
| `packages/engine/src/kernel/advance-choose-n.ts` | Keep the existing stateless API as fallback. Add a thin session-aware recompute entry point if needed. |
| `packages/engine/src/kernel/effects-choice.ts` | Extract chooseN template creation and selected-sequence validation from the current chooseN effect path. |
| `packages/engine/src/kernel/prioritized-tier-legality.ts` | Reuse existing admissibility logic and add any helper needed for selected-sequence validation. |
| `packages/engine/src/kernel/choose-n-option-resolution.ts` | New file. Hybrid resolution, witness search, budgets, cache-aware probe orchestration. |
| `packages/engine/src/kernel/choose-n-session.ts` | New file or equivalent internal module. Session template, selection keys, caches. |
| `packages/runner/src/worker/game-worker-api.ts` | Create, hold, reuse, and invalidate worker-local chooseN sessions. |
| `packages/runner/src/store/game-store.ts` and chooseN UI components | Optional UI polish: surface `resolution` distinctly so provisional options are visibly different from exact legal ones. |

If you want to avoid new files, the same logic can live in `advance-choose-n.ts` and `legal-choices.ts`, but that will make both files worse. A dedicated resolver module is the cleaner option.

## 10. Implementation phases

### Phase A — Correctness-first hybrid resolver

Deliverables:

- add `resolution` surface
- keep tiny-domain exhaustive path
- add singleton probe pass
- add budgeted witness search
- remove blanket all-unknown fallback
- keep the stateless interactive path unchanged for now

Exit condition:

- exact labels match the old exhaustive oracle on small cases
- formerly capped large cases now return a mixed exact/provisional surface instead of blanket unknown

### Phase B — Worker-local session

Deliverables:

- extract `ChooseNTemplate`
- add worker-local `ChooseNSession`
- recompute next pending once per toggle
- add probe and legality caches
- revision-based invalidation

Exit condition:

- add/remove interactive path no longer reruns the current selection through the full pipeline twice

### Phase C — Diagnostics and UI

Deliverables:

- dev-only chooseN diagnostics
- UI distinction between exact and provisional options
- optional perf harness output for FITL scenarios
- if any lazy refinement is added, it must be input-modality-agnostic and batch-oriented, not hover-only

Exit condition:

- developers can see exact/provisional counts, probe counts, and cache hits on real scenarios

### Phase D — Optional future work

Not part of this spec, but enabled by it:

- MCTS hierarchical chooseN expansion instead of full-subset sampling
- progressive widening over chooseN add-actions
- declarative chooseN constraint hints in YAML for stronger exact propagators

## 11. Test plan

### 11.1 Exact oracle parity

For small domains where exhaustive enumeration is below the exact threshold:

- compare the new resolver against the exhaustive oracle
- assert:
  - every `legal` result from the new resolver is `legal` in the oracle
  - every `illegal` result from the new resolver is `illegal` in the oracle
  - with generous budgets, the full option surface matches exactly

This is the core correctness test.

### 11.2 Large-domain regression tests

Add fixtures that previously exceeded the old cap:

- 20 options, cardinality 1–3
- 20 options, cardinality 1–8
- 30 options, cardinality 1–5

Assert:

- no blanket all-unknown fallback
- some exact results are still returned
- unresolved options are marked `unknown` with `resolution: provisional`, not `legal`

### 11.3 Interaction-effect tests

Add explicit tests for non-tier interactions, because this is where the original spec was weakest:

- pairwise conflict: A and B cannot both be chosen
- quota / category constraint: exact counts by qualifier
- dependency: A requires one of `{B, C}`
- removal invalidation: remove early-tier selection and later-tier selected item becomes invalid
- `byQualifier` tier unlocking and relocking

### 11.4 Stochastic and ambiguous tests

Add chooseN probe fixtures that return:

- `pendingStochastic`
- ambiguous overlap / authority mismatch

Assert these resolve to `unknown` with the right `resolution` value.

### 11.5 Session equivalence tests

For any session-eligible chooseN:

- compare session recomputation against stateless recomputation for the same selected sets
- assert identical pending requests and identical exact/provisional option surfaces

### 11.6 Performance tests

Do not make wall-clock speedups a brittle CI assertion.

CI should assert:

- max probe counts
- max witness-node counts
- number of full pipeline reevaluations per toggle
- cache hit behavior on repeated add/remove cycles

Wall-clock benchmarking belongs in a dedicated perf harness, not a pass/fail unit test.

## 12. Success criteria

1. The engine no longer converts an entire large chooseN request to all-unknown solely because a combination threshold was exceeded.
2. Any option surfaced as `legal` or `illegal` is exact.
3. Large domains return a mixed exact/provisional surface instead of a blanket fallback.
4. The worker interactive path performs one recompute per add/remove when a session exists.
5. Small-domain exact parity is preserved against the exhaustive oracle.
6. FITL and synthetic stress fixtures show lower probe counts and fewer full-path reevaluations than the current implementation.
7. Existing chooseN gameplay behavior remains correct; `confirm` remains authoritative and unchanged.

## 13. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Provisional options may confuse users | Surface `resolution` explicitly in the UI; never lie with optimistic `legal`. |
| Some chooseN definitions may not be safely sessionizable | Use conservative eligibility checks and fall back to the stateless path. |
| Witness search can still blow up on adversarial generic constraints | Use deterministic budgets and degrade per-option to provisional, not blanket unknown. |
| Internal canonical set keys assume chooseN is a set-selection decision | Treat this as part of the chooseN contract; if order-sensitive selection is ever needed, it should be a different decision type. |
| Perf assertions can be flaky in CI | Assert counts and modes in CI; keep wall-clock measurements in a separate bench harness. |

## 14. Explicit corrections to the original spec

The following parts of the original spec are intentionally not carried forward:

- "mark singleton-probed options as `legal`" -> rejected
- "remove all caps entirely" -> rejected; replace with deterministic probe/node budgets
- "`stateHash` / Zobrist requirement" -> rejected for this spec; use worker revision
- "3–5x faster wall-clock benchmark in unit tests" -> rejected as a CI success criterion
- "direct MCTS rollout speedup today" -> rejected; this is mainly an interactive-path optimization right now

## 15. Follow-on spec worth writing next

A separate future spec should add optional declarative chooseN constraint hints in YAML, for example:

- independence
- mutual exclusion groups
- quotas by qualifier
- requires / forbids relationships

Those hints would let the engine install stronger exact propagators, reduce provisional results further, and give MCTS better priors. That is valuable, but it is a separate feature and should not be smuggled into this performance fix.