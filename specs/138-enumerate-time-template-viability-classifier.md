# Spec 138: Guided Completion From Enumerate-Time Satisfiability

**Status**: DRAFT
**Priority**: P0
**Complexity**: M
**Dependencies**: Spec 132 [agent-stuck-viable-template-completion-mismatch] (archived), Spec 134 [unified-move-legality-predicate] (archived)
**Related**: Spec 87 [unified-viability-pipeline] (archived — established the shared probe path), Spec 91 [first-decision-domain-compilation] (archived — chooseN domain construction), Spec 135 [choosen-sampler-semantics] (archived — retry-bias and optional chooseN empty-draw handling), Spec 137 [convergence-witness-invariant-promotion] (archived — distillation protocol for T3)
**Source**: `campaigns/fitl-arvn-agent-evolution` and `campaigns/fitl-vc-agent-evolution` HEAD re-run on 2026-04-19. arvn seeds 1002 and 1010 terminate with `stopReason=noPlayableMoveCompletion` after the NVA `march` free-operation template's `completeTemplateMove` returns `drawDeadEnd` across the full `pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP = 3 + 7 = 10` retry budget. vc seeds show no degeneracy in 1000–1019. Pre-implementation investigation I0 (see `campaigns/fitl-arvn-agent-evolution/diagnose-existing-classifier.mjs`, checked in with this spec) established the actual root cause, which reshapes the approach below.

## Brainstorm Context

**Original request.** Investigate whether degenerate non-terminal / non-maxTurns endings still occur in the FITL evolution campaigns after the recent NVA March / Coup! encoding fixes, and — if so — research architectural solutions aligned with `docs/FOUNDATIONS.md` and produce specs.

**Verified state.** Under HEAD, seeds 1000–1019 across both campaigns at `max-turns=200`: 38 `maxTurns`, 2 `noPlayableMoveCompletion` (arvn seeds 1002 and 1010), 0 `noLegalMoves`, 0 `terminal`. Degeneracy rate 5% (arvn only). Root-caused via I0 (see Problem Statement below).

**Prior art.** Spec 132 (archived) made `drawDeadEnd` outcomes retry-eligible up to `NOT_VIABLE_RETRY_CAP=7`, producing an effective per-template retry budget of `completionsPerTemplate + NOT_VIABLE_RETRY_CAP = 3 + 7 = 10` under PolicyAgent defaults. Spec 132's Investigation I2 — characterize the chooseN draw space — was never built. An earlier draft of Spec 138 proposed a new enumerate-time viability classifier as a parallel engine component. I0 refuted that approach's premise (see Problem Statement § Root Cause), and this spec now operationalizes the bounded fix that landed: reuse the exhaustive satisfiability classifier to emit one canonical satisfiable head selection for a `chooseN` head, then consume that selection only after a sampled miss proves unguided completion landed off the legal surface.

**Alternatives considered.** (A) Full head-viable-subset extraction guiding the sampler — rejected after the live `chooseN{min:1,max:27}` witness, because exhaustive viable-combination extraction is not a bounded contract. (B) Canonical satisfiable head-selection extraction after a sampled miss — chosen. (C) Always-on head guidance from the first attempt — workable but weaker for replay-identity preservation on unaffected runs. (D) Enrich `ClassifiedMove.viability` with the guidance payload so all consumers see it — cleanest Foundation #5 alignment but unnecessary blast radius through the runner worker bridge. (E) A new parallel `classifyTemplateCompletionViability` module — rejected by I0: duplicates work the existing classifier already performs. (F) FITL-side spec patch — rejected; violates Spec 132's Non-Goal and Foundation #1.

## Overview

The existing exhaustive decision-sequence satisfiability classifier at `packages/engine/src/kernel/decision-sequence-satisfiability.ts` already runs for every admitted free-operation template during enumeration (wired in `packages/engine/src/kernel/legal-moves.ts:545` and `:705` through `classifyMoveDecisionSequenceAdmissionForLegalMove`). Today it returns a scalar verdict `'satisfiable' | 'unsatisfiable' | 'unknown'` and then discards the per-option data it traversed.

This spec extends that classifier with an opt-in canonical-head-selection mode that, for the first `chooseN` head of the decision tree, returns the first satisfiable full head selection found by the existing exhaustive recursion. `preparePlayableMoves` does not force that guidance from attempt 1; it samples once under the existing chooser policy and, after a sampled `drawDeadEnd` / `notViable` miss on a `chooseN` head, consumes the canonical head selection as a guided `choose` callback on retries. Downstream decisions remain under the current random/deterministic policy. The retry budget in `attemptTemplateCompletion` becomes a tripwire: once guided, any residual miss is a kernel bug, not an accepted degeneracy.

## Boundary Correction (2026-04-19)

Live implementation of `138ENUTIMTEM-003` invalidated the draft's Phase 1 assumption that the failing heads could be modeled as true single-pick `chooseN` requests. On 2026-04-19, re-running `node campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs --seed 1010 --max-turns 200` showed the still-failing `march` template's first pending head as `chooseN{min:1,max:27,optionCount:27}`. That means the scalar `viableHeadSubset` contract from `138ENUTIMTEM-002` is sufficient only for genuine single-pick heads; it is not expressive enough for the live multi-pick witness.

As a result:
- `tickets/138ENUTIMTEM-003.md` is now a blocked historical draft record, not the active implementation path.
- `tickets/138ENUTIMTEM-006.md` owns the corrected redesign of the classifier/sampler contract for multi-pick `chooseN` heads.
- Any text below that still describes a flat scalar subset as the final architecture should be read as draft history, not the current active boundary.

## Problem Statement

### Current failure (HEAD, 2026-04-19, seeds 1000–1019, max-turns=200)

| Campaign | `maxTurns` | `noPlayableMoveCompletion` | `noLegalMoves` | `terminal` |
|---|---|---|---|---|
| arvn     | 18         | **2** (seeds 1002, 1010)   | 0              | 0          |
| vc       | 20         | 0                          | 0              | 0          |

### Diagnostic signature (both failing seeds)

Captured via `campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs`:

- Active player: NVA baseline profile.
- Legal moves: `[march(freeOp=true, params={})]` × N (N=1 on seed 1010, N=3 on seed 1002), all reporting `viability.viable=true, complete=false`.
- `preparePlayableMoves` output: `completedMoves=0`, `stochasticMoves=0`, `templateCompletionAttempts=10`, `templateCompletionSuccesses=0`, outcome `"failed"`, rejection `"drawDeadEnd"`.
- `probeMoveViability` (post-Spec 134 unified predicate): `viable=true, complete=false, stochasticDecision=false`.
- `completeMoveDecisionSequence` with identity chooser: `complete=false, illegal=false`, with the first pending head resolving to `chooseN`; the live boundary witness on seed 1010 is `min:1, max:27, optionCount:27`.
- `completeTemplateMove` with random chooser, 10 attempts: all 10 draws over the first-choice domain trip `CHOICE_RUNTIME_VALIDATION_FAILED` or resolve to `illegal` at a later decision step.

### I0 finding — existing classifier's verdict

`campaigns/fitl-arvn-agent-evolution/diagnose-existing-classifier.mjs` calls `classifyMoveDecisionSequenceAdmissionForLegalMove` directly on each failing template at the captured pre-terminal state:

| Seed | march templates | Existing-classifier verdict | Probe warnings | Head chooseN |
|---|---|---|---|---|
| 1002 | 3 | **satisfiable** × 3 | 0 | min:1, max:1, options:44 |
| 1010 | 1 | **satisfiable** × 1 | 0 | min:1, max:1, options:30 |

The existing exhaustive classifier ran within `DEFAULT_MOVE_ENUMERATION_BUDGETS.maxDecisionProbeSteps = 128` and confirmed that ≥1 option in the head chooseN leads to a legal completion. No `MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED` or related budget warnings were emitted. The move was correctly admitted by enumeration.

### Root cause

The `noPlayableMoveCompletion` degeneracy is **not** an enumerate-emits-unreachable-templates bug. It is an **enumerate-vs-sampler mismatch**:

1. `classifyDecisionSequenceSatisfiability` proves that at least one head selection is completable, returning `'satisfiable'`.
2. `enumerateLegalMoves` admits the move.
3. `preparePlayableMoves` calls `completeTemplateMove` with a uniform random chooser over the full head domain. The viable surface is sparse enough that 10 uniform random draws can miss it entirely.
4. The agent throws `NoPlayableMovesAfterPreparationError`; the simulator surfaces `stopReason='noPlayableMoveCompletion'`.

This violates Foundation #5 (one rules protocol, single source of truth for legality): the exhaustive classifier and the random sampler disagree about which head options are playable, with no shared channel between them. The classifier's per-option data is computed and then discarded, leaving the sampler to rediscover it by chance.

### Why Spec 132's fix is insufficient

Spec 132 made `drawDeadEnd` outcomes retry-eligible so the random sampler gets more tries. It did not address the underlying information asymmetry. When the viable surface is sparse enough, even 10 uniform draws are insufficient. The architecturally complete fix is to guide the sampler using information the classifier already computes, not to extend the retry budget further (which would re-frame a Foundation #10 bounded-computation concern as a probabilistic one).

## Goals

- **G1** — Extend `classifyDecisionSequenceSatisfiability` with an opt-in mode that, when the decision tree begins with a `chooseN`, returns a canonical satisfiable head selection alongside the scalar verdict. The extension MUST be pure and side-effect-free, MUST NOT mutate `state`, `def`, or `runtime`, and MUST stay within the existing `MoveEnumerationBudgets` family.
- **G2** — `preparePlayableMoves` (and its callers in `policy-agent.ts`) route free-operation templates with incomplete viability through the canonical-selection mode after a sampled `drawDeadEnd` / `notViable` miss on a `chooseN` head, then pass the result as a guided `choose` callback to `completeTemplateMove`. Downstream decisions retain the current random/deterministic policy.
- **G3** — When the guided chooser is used, `attemptTemplateCompletion` converges within its existing retry budget for any template the exhaustive classifier has marked `'satisfiable'`. The retry budget transitions from "gate that can legitimately fail" to "diagnostic oracle that, when exhausted, indicates a kernel bug" — a `RuntimeWarning` with code `GUIDED_COMPLETION_UNEXPECTED_MISS`, not an accepted terminal state.
- **G4** — The simulator stop reason `noPlayableMoveCompletion`, the `NoPlayableMovesAfterPreparationError` class, and the `DegeneracyFlag.NO_PLAYABLE_MOVE_COMPLETION` enum value become unreachable for any spec that passes compilation and validation. Per Foundation #14 they are deleted in the same change.
- **G5** — Canonical-head-selection extraction cost MUST be bounded. The implementation may reuse the existing exhaustive recursion to find the first satisfiable head selection, but it MUST avoid exhaustive viable-combination enumeration for multi-pick heads. No new budget constant is introduced.
- **G6** — Final canonical serialized state MUST be bit-identical to the pre-spec trajectory for every seed where guided completion never activates, or where the unguided first attempt already lands on the same legal path. Seeds that previously failed with `noPlayableMoveCompletion` converge deterministically via the canonical guided head selection once the sampled miss occurs.

## Non-Goals

- No change to FITL spec data (`data/games/fire-in-the-lake/*`). Spec 132's non-goal stands: the defect reproduces on engine-agnostic surface, so FITL-specific patches would violate Foundation #1.
- No change to agent policy YAML (`92-agents.md`) or policy-profile weights. The fix is at the kernel/agent-sampler boundary, not at decision-scoring.
- No change to `probeMoveViability` semantics or the unified legality predicate from Spec 134.
- No change to `completeMoveDecisionSequence` or `completeTemplateMove` control flow — they continue to produce concrete completions; the extension only enriches the decision space the guided chooser exposes.
- No expansion of the campaign seed corpus. The 20-seed sweep is sufficient evidence.
- No retry-budget increase. If the guided sampler is correct, 10 retries are vast overkill; if it is wrong, more retries don't help.
- No new module under `kernel/`. The canonical-selection extraction is a surgical extension to `decision-sequence-satisfiability.ts`.
- No new `diagnostics` field on `LegalMoveEnumerationResult`. The existing `warnings: readonly RuntimeWarning[]` stream covers the observability need.
- No support for nested-chooseN-aware exhaustive viability surfaces. The landed contract covers the first `chooseN` head via one canonical satisfiable head selection. Future work may extend if a real case surfaces.

## Required Investigation (Pre-Implementation)

Each investigation MUST produce either a checked-in fixture, a test file, or a measurement report referenced from the spec's ticket(s). No implementation work begins until I1 and I2 complete. I0 is already complete — see Problem Statement § I0 finding and `campaigns/fitl-arvn-agent-evolution/diagnose-existing-classifier.mjs`.

### I1 — Characterize the seed-1002 and seed-1010 draw spaces

For the failing NVA `march` template on each seed (at the pre-terminal state captured by `diagnose-agent-stuck.mjs`), enumerate the full head `chooseN` decision surface and record the downstream outcome distribution. This confirms how sparse the legal completion surface is and provides the fixture basis for the bounded guided-completion proof.

### I2 — Replay-identity over the passing corpus

Run the FITL passing corpus twice: once with the guided sampler disabled (behind a test-only flag that routes `attemptTemplateCompletion` through the pre-spec path), once enabled. For seeds where guided completion never activates, assert byte-identical canonical serialized final state. For seeds that previously failed with `noPlayableMoveCompletion`, document the new bounded stop reason under the guided path.

### I3 — Inventory all free-operation template-move consumers

Grep for every consumer of `enumerateLegalMoves` and every call site of `preparePlayableMoves`. Confirm the guided-chooser change is transparent at the type level: `LegalMoveEnumerationResult` shape is unchanged; `attemptTemplateCompletion` adds an internal guided-choose path. Document runner worker bridge impact (`packages/runner/src/worker/game-worker-api.ts`, `packages/runner/test/worker/clone-compat.test.ts`) — expect zero public-type changes, verify in the ticket.

### I4 — Decide caching strategy

The canonical-head-selection pass runs on the sampler retry path rather than every enumeration. Measure the wall-clock impact on the affected FITL sweep. If overhead is >25% of simulation time, add a memoization slot keyed by `(stateHash, actionId)` to `GameDefRuntime` storing the canonical head-selection payload. If overhead is ≤25%, defer caching as YAGNI.

## Design

### D1 — Classifier extension location

Modify `packages/engine/src/kernel/decision-sequence-satisfiability.ts` in-place. Add an opt-in options field `emitCanonicalViableHeadSelection?: boolean` to `DecisionSequenceSatisfiabilityOptions`, and extend `DecisionSequenceSatisfiabilityResult` with an optional `canonicalViableHeadSelection?: MoveParamValue` populated only when the flag is set and the tree begins with a `chooseN`. No new module. No public-API change at call sites that don't opt in.

### D2 — Result shape

```ts
export interface DecisionSequenceSatisfiabilityResult {
  readonly classification: DecisionSequenceSatisfiability; // unchanged
  readonly warnings: readonly RuntimeWarning[];            // unchanged
  readonly canonicalViableHeadSelection?: MoveParamValue;  // NEW: present iff emitCanonicalViableHeadSelection && head is chooseN
}
```

`canonicalViableHeadSelection` is the first satisfiable full head selection proven to lead to at least one legal completion under the current state. Canonical order follows the existing deterministic kernel emission order. Absence means the classifier could not prove a head selection within the current bounded pass.

### D3 — Algorithm

When `emitCanonicalViableHeadSelection` is set:

1. Perform the existing classification traversal.
2. When the head is `chooseN`, search in canonical order for the first head selection whose downstream recursion returns `'satisfiable'`.
3. Return that selection as `canonicalViableHeadSelection` and stop. Do not attempt to enumerate every viable combination.
4. If no satisfiable head selection is found within the current bounded pass, return the scalar classification and warnings exactly as the classifier already would.
5. Downstream decisions below the head retain the existing exhaustive recursion and budget semantics.

When `emitCanonicalViableHeadSelection` is not set, behavior is byte-identical to today: the existing early-exit on first satisfiable outcome stays.

### D4 — Enumeration path unchanged

`kernel/legal-moves.ts` continues to call `classifyMoveDecisionSequenceAdmissionForLegalMove` **without** `emitCanonicalViableHeadSelection` for admission filtering. Enumeration stays fast (early-exit preserved). The canonical selection is only computed on the sampler's request path.

### D5 — Sampler-side guided chooser

In `packages/engine/src/agents/prepare-playable-moves.ts`, when a legal move reaches the pending-template-completion branch, the sampler first attempts completion using the existing chooser policy. After a sampled `drawDeadEnd` / `notViable` miss on a `chooseN` head, it calls a thin helper that:

1. Invokes `classifyDecisionSequenceSatisfiability` with `emitCanonicalViableHeadSelection: true`.
2. If `canonicalViableHeadSelection` is present, builds a `choose` callback that, on the first matching `chooseN` request, forces that full head selection and defers to the caller-provided `choose` or random for all other decisions.
3. Passes the guided callback into `evaluatePlayableMoveCandidate`.

The guided callback composes with the existing `choose` option on `TemplateMoveCompletionOptions` — the head restriction is additive, not replacing. If the classifier returns no canonical selection, the callback admits all head options as today; the retry budget behaves as today.

### D6 — Retry budget becomes a tripwire

`attemptTemplateCompletion` keeps its current retry loop. When the guided chooser is active and the retry budget is nonetheless exhausted, emit a `RuntimeWarning` with code `GUIDED_COMPLETION_UNEXPECTED_MISS` carrying `{actionId, stateHash, attemptCount, subsetSize}` and proceed as today (template dropped from the playable set). The warning is a bug signal; it does not stop the simulation.

With the guided sampler in place, `NoPlayableMovesAfterPreparationError` becomes unreachable. Per Foundation #14, delete it and `noPlayableMoveCompletion` in the same change. Deletion sites:

- `packages/engine/src/kernel/types-core.ts:1731` (`SimulationStopReason` union — drop `'noPlayableMoveCompletion'`).
- `packages/engine/src/kernel/schemas-core.ts:1605` (`SimulationStopReasonSchema`).
- `packages/engine/src/kernel/diagnostics.ts:39` (`DegeneracyFlag.NO_PLAYABLE_MOVE_COMPLETION`).
- `packages/engine/src/sim/simulator.ts:130-135` (catch + stopReason assignment).
- `packages/engine/src/sim/trace-eval.ts:244-245` (flag mapping).
- `packages/engine/src/agents/no-playable-move.ts` (delete class `NoPlayableMovesAfterPreparationError` + helper `isNoPlayableMovesAfterPreparationError`; module becomes just `BuiltinAgentId` — fold into `agents/index.ts` or delete if the type can live closer to its consumers).
- `packages/engine/schemas/Trace.schema.json:5136` and `packages/engine/schemas/EvalReport.schema.json:54, 89, 136`.
- Tests: `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts:14, 32`, `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts`, `packages/engine/test/unit/schemas-top-level.test.ts:1613`, `packages/engine/test/unit/types-foundation.test.ts:49`, and any `ALLOWED_STOP_REASONS` occurrences in FITL seed regression tests surfaced by I3 (e.g., `fitl-seed-1002-regression.test.ts`, `fitl-seed-1005-1010-1013-regression.test.ts`).

Each site is migrated in the same change with no compatibility shim.

### D7 — Boundedness and determinism

**Boundedness (Foundation #10).** Canonical-head-selection extraction reuses `MoveEnumerationBudgets.maxDecisionProbeSteps` and `maxParamExpansions`. It does not widen into exhaustive viable-combination enumeration for multi-pick heads. Downstream decisions below the head still early-exit on first satisfiable outcome.

**Determinism (Foundation #8).** Option iteration order matches the canonical `nextDecision.options` order emitted by the existing deterministic kernel. Guided completion activates only after an unguided miss on a `chooseN` head, then forces the canonical satisfiable head selection while leaving downstream choices alone. Seeds whose unguided path never activates guidance produce byte-identical final state; seeds that would have missed now converge on the canonical guided head selection (I2 replay-identity gate).

**Optional caching (Foundation #13).** If I4 triggers caching, the cache key `(stateHash, actionId)` is deterministic because `stateHash` already incorporates all rule-authoritative state. The cache is LRU-bounded (target 4096 entries), lives on `GameDefRuntime`, and is cleared at simulation boundaries.

## Testing Strategy

### T1 — Minimal engine-agnostic fixture

Under `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts` (extending the existing file), exercise `classifyDecisionSequenceSatisfiability` with `emitCanonicalViableHeadSelection: true` on both a single-pick and a multi-pick hand-authored GameDef. Assert the result returns the expected canonical satisfiable head selection and preserves scalar classification behavior when no guidance emission is requested.

File-top marker: `// @test-class: architectural-invariant`.

### T2 — Sampler convergence invariant

Under `packages/engine/test/integration/prepare-playable-moves-guided-convergence.test.ts`, assert the property on a bounded synthetic witness: there exists a seed where unguided completion misses a sparse multi-pick legal surface while the guided path converges by forcing the canonical satisfiable head selection within the existing retry budget.

File-top marker: `// @test-class: architectural-invariant`.

### T3 — Seed-corpus bounded termination

Under `packages/engine/test/integration/fitl-seed-guided-classifier-coverage.test.ts`, run FITL arvn seeds 1002 and 1010 through `runGame` at max-turns=200. Assert `trace.stopReason ∈ {terminal, maxTurns, noLegalMoves}` and `trace.moves.length > 0`. The assertion remains property-form.

File-top marker: `// @test-class: architectural-invariant`. No `@witness:` — the assertion holds across any legitimate trajectory per Spec 137.

### T4 — Replay-identity over passing corpus

A determinism test under `packages/engine/test/determinism/` runs an unaffected passing seed twice: once with the guided sampler disabled (behind a test-only flag that routes `attemptTemplateCompletion` through the pre-spec path), once enabled. Assert byte-identical canonical serialized final state.

File-top marker: `// @test-class: architectural-invariant`.

### T5 — Guided-miss tripwire warning

Under `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` (extending the existing file), add a unit test that hand-constructs a `(def, state, move)` tuple where `canonicalViableHeadSelection` is present but the guided callback is forced (via injection) to exhaust the retry budget without completing. Assert that `attemptTemplateCompletion` emits a `RuntimeWarning` with code `GUIDED_COMPLETION_UNEXPECTED_MISS` carrying the expected `{actionId, stateHash, attemptCount, subsetSize}` shape. Do not mock the kernel; the injection boundary is the `choose` callback seam already exposed by `TemplateMoveCompletionOptions`.

File-top marker: `// @test-class: architectural-invariant`.

### Performance gate

CI runs the affected FITL sweep and asserts guided-classifier overhead < 25% of baseline simulation time (the cutoff at which I4's caching would have landed). The gate validates the I4 decision in production conditions.

## Alignment With `docs/FOUNDATIONS.md`

| Foundation | How Spec 138 respects it |
|---|---|
| **#1 Engine Agnosticism** | Modification is surgical to `decision-sequence-satisfiability.ts` and `prepare-playable-moves.ts`. Zero FITL-specific identifiers. Works on any GameDef. |
| **#5 One Rules Protocol** | Enumerate (admission filter), classifier (canonical head-selection proof), and sampler (guided chooser) converge on a single legality verdict via the shared classifier output. The head-proof data the classifier already computes is surfaced to the sampler instead of discarded. |
| **#7 Specs Are Data** | No `eval`, no runtime callbacks, no plugin hooks. Extension is pure code over generic DSL. |
| **#8 Determinism Is Sacred** | No RNG in the classifier. Canonical option iteration order preserved. Replay-identity gate (T4) over passing corpus. |
| **#10 Bounded Computation** | Canonical-head-selection extraction reuses `MoveEnumerationBudgets.maxDecisionProbeSteps` and `maxParamExpansions`. No new constant. The implementation avoids exhaustive viable-combination enumeration for multi-pick heads. |
| **#11 Immutability** | Extension signature `(def, state, move, runtime, options) → result`. No mutation; `GameDefRuntime` cache (if I4 triggers) uses the existing scoped-mutation pattern already accepted under Foundation #11's exception clause. |
| **#12 Compiler-Kernel Boundary** | State-dependent completability is kernel-owned (already is). Compiler continues to validate static shape only. |
| **#13 Artifact Identity** | `(stateHash, actionId)` cache key (if I4 triggers) is deterministic and reproducible. |
| **#14 No Backwards Compatibility** | `noPlayableMoveCompletion` stop reason, `NoPlayableMovesAfterPreparationError` class, `DegeneracyFlag.NO_PLAYABLE_MOVE_COMPLETION` enum, and all test fixtures referencing them are deleted in the same change. Full site list in D6. |
| **#15 Architectural Completeness** | Root cause fixed: enumerate-vs-sampler information asymmetry is closed by sharing the classifier's head-proof result. Not a retry-budget band-aid; not a parallel classifier. |
| **#16 Testing as Proof** | Five test artifacts (T1–T5), covering invariants, regression, determinism, and tripwire. T3 distilled to property form per Spec 137. |

## Edge Cases & Open Questions

- **Templates whose head is not a `chooseN`.** When the decision tree begins with a `chooseOne`, canonical-head-selection extraction is a no-op; `canonicalViableHeadSelection` is not populated. The existing exhaustive satisfiability already covers `chooseOne` semantics via per-option recursion. Non-chooseN heads retain current behavior.
- **Stochastic decisions.** `ChoiceStochasticPendingRequest` surfaces via the separate `stochasticDecision` field on `resolveMoveDecisionSequence` output, not via `nextDecision.type`. The guided chooser never restricts stochastic outcomes — they have their own completeness guarantees under Spec 17 §4. The canonical-head-selection path is entered only when the first non-stochastic pending decision is a `chooseN`.
- **Empty-option chooseN.** If the head is a `chooseN` with `options.length === 0`, this is a compiler invariant violation caught pre-kernel. The classifier returns `'unsatisfiable'` as belt-and-suspenders; the template is filtered at enumeration.
- **No emitted head selection.** When the bounded pass cannot prove a canonical head selection, the guided path is skipped and behavior remains the same as today's fail-open admission policy.
- **Cache invalidation (I4).** If the cache lands, it keys on `stateHash` which already incorporates all rule-authoritative state. Cross-run cache reuse is safe because `stateHash` is deterministic; per-run cache is cleared at simulation boundaries.
- **Retry-budget removal.** Out of scope for this spec. Once G3 and T3 land, the `pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP` loop is proven vestigial on the guided path. A follow-up cleanup spec can reduce or delete it.
- **Nested-chooseN head dependencies.** The landed contract handles only the first `chooseN` head. If a real case surfaces where the head's legal surface depends on a later `chooseN` beyond what downstream recursion already captures, a follow-up ticket extends the extraction to that nesting level.

## Tickets

- `tickets/138ENUTIMTEM-001.md` — Characterize failing-seed chooseN draw space and check in I1 fixture
- `tickets/138ENUTIMTEM-002.md` — Extend decision-sequence classifier with opt-in head-guidance emission mode
- `tickets/138ENUTIMTEM-003.md` — Blocked historical single-pick guided-chooser draft
- `tickets/138ENUTIMTEM-006.md` — Redesign guided completion for multi-pick chooseN heads
- `tickets/138ENUTIMTEM-004.md` — Delete noPlayableMoveCompletion stop reason and error class (Foundation 14 atomic cut)
- `tickets/138ENUTIMTEM-005.md` — Caching gate and CI performance assertion for guided-classifier overhead
