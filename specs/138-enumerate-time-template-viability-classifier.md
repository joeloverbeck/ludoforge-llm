# Spec 138: Enumerate-Time Template-Move Viability Classifier

**Status**: DRAFT
**Priority**: P0
**Complexity**: L
**Dependencies**: Spec 132 (retry-budget + probe unification, archived), Spec 134 (unified legality predicate, archived)
**Source**: `campaigns/fitl-arvn-agent-evolution` and `campaigns/fitl-vc-agent-evolution` HEAD re-run on 2026-04-19. arvn seeds 1002 and 1010 terminate with `stopReason=noPlayableMoveCompletion` after the NVA `march` template's `completeTemplateMove` returns `drawDeadEnd` across the full 10-attempt retry budget. vc seeds show no degeneracy in 1000–1019.

## Brainstorm Context

**Original request.** Investigate whether degenerate non-terminal / non-maxTurns endings still occur in the FITL evolution campaigns after the recent NVA March / Coup! encoding fixes, and — if so — research architectural solutions aligned with `docs/FOUNDATIONS.md` and produce specs.

**Verified state.** Under HEAD, seeds 1000–1019 across both campaigns at `max-turns=200`: 38 `maxTurns`, 2 `noPlayableMoveCompletion` (arvn seeds 1002 and 1010), 0 `noLegalMoves`, 0 `terminal`. Degeneracy rate 5% (arvn only). Root-caused via `campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs` to the NVA `march` free-operation template's `completeTemplateMove` dead-ending across a `chooseN{min:1, max:1, options:30}` first-choice domain. `probeMoveViability` reports `viable=true, complete=false`, but 10 uniform random draws over the 30-option head never land on a completable option.

**Prior art.** Spec 132 (archived) partially addressed this pattern by unifying enumerate/probe viability and extending the retry budget from 1 to 10. Spec 132's Investigation I2 — characterize the chooseN draw space and add an enumerate-time filter for dead-end draws — was never built. This spec operationalizes that deferred I2 as a first-class kernel component.

**Alternatives considered during brainstorm.** (1) Enumerate-time classifier — chosen. (2) Backtracking template completion — preserves current shape but deferred; cheaper fix per template but weaker on Foundation #5 because enumerate still emits non-completable templates. (3) Hybrid — deferred as follow-up if Phase 1 uncovers cases the classifier cannot forecast cheaply. (4) FITL-side spec patch — rejected; violates Spec 132's Non-Goal and Foundation #1.

## Overview

Build Spec 132's deferred Investigation I2 as a first-class kernel component: an **enumerate-time viability classifier for template moves**. For every candidate template move whose decision sequence begins with a `chooseN`, the classifier decides — before the move is emitted to `legalMoves` — whether at least one downstream completion path is playable in the current state. Templates with zero viable completions are filtered out. The retry cap in `attemptTemplateCompletion` becomes a soft diagnostic rather than a gate: when it fires, it is a kernel bug, not an accepted degeneracy.

## Problem Statement

### Current failure (HEAD, 2026-04-19, seeds 1000–1019, max-turns=200)

| Campaign | `maxTurns` | `noPlayableMoveCompletion` | `noLegalMoves` | `terminal` |
|---|---|---|---|---|
| arvn     | 18         | **2** (seeds 1002, 1010)   | 0              | 0          |
| vc       | 20         | 0                          | 0              | 0          |

### Diagnostic signature (both failing seeds)

Captured via `campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs`:

- Active player: NVA baseline profile.
- Legal moves: `[march(freeOp=true, params={})]` × N (N=1 on seed 1010, N=3 on seed 1002), all reporting `viability.viable=true`.
- `preparePlayableMoves` output: `completedMoves=0`, `stochasticMoves=0`, `templateCompletionAttempts=10`, `templateCompletionSuccesses=0`, outcome `"failed"`, rejection `"drawDeadEnd"`.
- `probeMoveViability` (post-Spec 134 unified predicate): `viable=true, complete=false, stochasticDecision=false`.
- `completeMoveDecisionSequence` with identity chooser: `complete=false, illegal=false, nextDecision={chooseN, min:1, max:1, optionCount:30}`.
- `completeTemplateMove` with random chooser, 10 attempts: all 10 draws over the 30-option first-choice domain trip `CHOICE_RUNTIME_VALIDATION_FAILED` or resolve to `illegal` at a later decision step.

### Root cause

The 30-option `chooseN` domain is **not uniformly completable**. Spec 132 assumed a widened retry budget would converge; in practice, the viable subset of the 30 options is either empty or small enough that 10 uniform random draws never land inside it. `probeMoveViability` cannot distinguish "template has ≥1 completable path" from "template has zero completable paths" because it only validates the head of the decision sequence, not the full tree. Enumeration therefore emits a move that looks legal at the head but is unplayable under any completion — a direct violation of Foundation #5 (one rules protocol, single source of truth for legality) and Foundation #10 (legal moves must be finitely listable and playable).

### Why Spec 132's fix is insufficient

Spec 132 extended the retry budget from 1 to 10 for `completionUnsatisfiable`/`drawDeadEnd` outcomes. It did not add an enumeration-time predicate that forecasts completability across the chooseN option domain. Under seeds where the viable subset is empty (or ≤2/30), retries never converge — we need the classifier, not more retries.

## Goals

- **G1** — Introduce a pure, deterministic function `classifyTemplateCompletionViability(def, state, move, runtime) → TemplateViabilityVerdict` that, for any template move whose decision sequence begins with a `chooseN`, reports whether at least one option in the first-choice domain has a completable downstream tree under the current state. The function MUST be side-effect-free and MUST NOT mutate `state`, `def`, or `runtime`.
- **G2** — `enumerateLegalMoves` routes template moves through this predicate before emission. Templates classified as having zero completable paths are filtered out; templates classified as having ≥1 completable path are emitted as today.
- **G3** — When the predicate reports ≥1 completable path, the `attemptTemplateCompletion` retry budget in `prepare-playable-moves.ts` MUST converge to a completion within its existing cap. The retry budget transitions from "gate that can legitimately fail" to "diagnostic oracle that, when exhausted, indicates a kernel bug" — an assertion-style tripwire emitting a structured warning, not an accepted terminal state.
- **G4** — The simulator stop reason `noPlayableMoveCompletion` becomes unreachable for any spec that passes compilation and validation. A new invariant test SHALL assert this over the FITL 1000–1019 seed corpus at HEAD and over the `convergence-witness` + `architectural-invariant` test corpora.
- **G5** — The predicate's time complexity MUST be bounded and documented. For a chooseN with N options and decision-tree depth D, worst-case classification work is O(N × D_effective). Any branching within D MUST itself be bounded (no general recursion — Foundation #10).

## Non-Goals

- No change to FITL spec data (`data/games/fire-in-the-lake/*`). Spec 132's non-goal stands: the defect reproduces on engine-agnostic surface, so FITL-specific patches would violate Foundation #1.
- No change to agent policy YAML (`92-agents.md`) or policy-profile weights. The fix is at the kernel/enumeration boundary, not at decision-scoring.
- No change to probe semantics beyond adding the new classifier as a dependency. `probeMoveViability` remains the predicate used for single-move legality audits; the new classifier is strictly a *completability* forecaster for template moves with `chooseN` heads.
- No change to `completeMoveDecisionSequence` or `completeTemplateMove` — they continue to produce concrete completions; the classifier only decides whether the template is emitted.
- No expansion of the campaign seed corpus. The 20-seed sweep is sufficient evidence.
- No retry-budget increase. If the classifier is correct, 10 retries are vast overkill; if the classifier is wrong, more retries don't help.
- No support for nested `chooseN` heads (chooseN whose options depend on the outcome of a prior chooseN within the same template). Phase 1 covers first-level chooseN only. Future work may extend if a real case surfaces.

## Required Investigation (Pre-Implementation)

Each investigation MUST produce either a checked-in fixture, a test file, or a measurement report referenced from the spec's ticket(s). No implementation work begins until I1 and I2 complete.

### I1 — Characterize the seed-1002 and seed-1010 draw spaces

For the failing NVA `march` template on each seed (at the pre-terminal state captured by `diagnose-agent-stuck.mjs`), enumerate the full 30-option `chooseN` first-choice domain. For every option, run `completeMoveDecisionSequence` with that option fixed and record the outcome: `completed`, `stochasticUnresolved`, `illegal`, `CHOICE_RUNTIME_VALIDATION_FAILED`, or `exceeded`. Output a table of the distribution per seed. This determines whether the viable subset is empty (classifier must reject the template) or non-empty (classifier narrows to the viable subset). Persist as a fixture under `packages/engine/test/fixtures/gamestate/` for reuse in invariant tests. *This is Spec 132's deferred I2.*

### I2 — Confirm the classifier does not miss cases on currently-passing seeds

Run the FITL 1000–1019 corpus for both campaigns with a prototype classifier in two modes: permissive (emits all templates unchanged) and strict (only emits templates with ≥1 verified completable path). Compare per-move `legalMoves` sets. The strict version SHALL be a subset of the permissive version at every ply; any ply where the strict version *adds* a move is a classifier bug. For currently-passing seeds, final-state `stateHash` under the strict version MUST match the permissive version for every seed where no classifier filtering occurred — this is the Foundation #8 replay-identity obligation.

### I3 — Inventory all template-move emission sites

Grep for every call into `enumerateLegalMoves` and for every downstream consumer of its output (simulator, runner worker bridge, agents, analytics). Confirm that the classifier change is transparent: consumers that just read `legalMoves` see a filtered list; consumers that inspect `viability.code` see a new code (`TEMPLATE_COMPLETION_UNREACHABLE`) that was previously impossible. Document this in the ticket and add migration notes for the runner side if any.

### I4 — Decide caching strategy

The classifier runs per enumeration call. For a decision-tree depth of D with N options at the head, worst-case cost is O(N × D). For FITL, N=30 and D ~3–5, so ~150 completion attempts per enumeration call on affected templates. Measure the wall-clock impact on the full 20-seed arvn sweep. If overhead is >25% of simulation time, design a memoization key — `(stateHash, actionId, relevantScopeHash)` — and add to the enumeration cache that already exists under `GameDefRuntime`. If overhead is ≤25%, defer caching as YAGNI.

## Design

### D1 — Classifier location

New module: `packages/engine/src/kernel/template-viability-classifier.ts`. Exports a single pure function `classifyTemplateCompletionViability(def, state, move, runtime) → TemplateViabilityVerdict`. Lives under `kernel/` (Foundation #12 — state-dependent semantics are kernel-owned). Imported by `kernel/legal-moves.ts` for enumeration-time routing.

### D2 — Verdict shape

```ts
type TemplateViabilityVerdict =
  | { kind: 'viable'; viableOptionCount: number; totalOptionCount: number }
  | { kind: 'unreachable'; totalOptionCount: number; rejectedReasons: Record<RejectionCode, number> };
```

`RejectionCode` is the closed union drawn from Investigation I1's outcome taxonomy: `illegalDownstream`, `choiceValidationFailed`, `budgetExceeded`, `decisionTreeMalformed`. The viable verdict carries the count (not the set) to avoid leaking chooser state into the emission API. The unreachable verdict's `rejectedReasons` map powers the diagnostic warning at G3.

### D3 — Algorithm

1. Call `probeMoveViability(def, state, move, runtime)`. If `viable=false`, return short-circuit `kind: 'unreachable'` — no template-level work required. The existing Spec 134 unified legality predicate already handles this case.
2. If `viable=true, complete=true`, return `kind: 'viable', viableOptionCount: 1, totalOptionCount: 1` — template already complete, no chooseN head.
3. If `viable=true, complete=false`, call `completeMoveDecisionSequence` with an identity chooser that returns `undefined` from `choose`. Inspect the returned `nextDecision`. If `nextDecision.type !== 'chooseN'` or `min > max || options.length === 0`, return `kind: 'unreachable'` with code `decisionTreeMalformed`.
4. For each option in `nextDecision.options`, invoke `completeMoveDecisionSequence` with a deterministic chooser that returns that option at the head and `undefined` for all downstream decisions. Classify the result per I1 taxonomy. Count viable and tally rejected reasons. Early-exit as soon as the first viable option is found — the classifier only needs to answer "≥1?" for G1.
5. Return `kind: 'viable'` with counts, or `kind: 'unreachable'` with reason histogram.

### D4 — Enumeration integration

In `kernel/legal-moves.ts`, after a template move passes the existing `probeMoveViability`-based filter, route it through `classifyTemplateCompletionViability`. If verdict is `unreachable`, drop the move and record a diagnostic in the enumeration result's `diagnostics` field (new structured entry: `{ actionId, verdict: 'templateCompletionUnreachable', rejectedReasons }`). If `viable`, emit the move unchanged.

### D5 — Retry budget becomes a tripwire

`prepare-playable-moves.ts` keeps its current 10-attempt loop. On exhaustion, it throws a new structured error `KernelClassifierMissError` (extends `Error`, carries `{ actionId, stateHash, attemptCount, lastOutcome }`). The simulator catches this error and emits `stopReason='kernelClassifierMiss'` — a new, distinct stop reason that is a **bug signal**, not an accepted degeneracy. Foundation #14 requires the old `noPlayableMoveCompletion` stop reason to be **deleted in the same change**, along with `NoPlayableMovesAfterPreparationError` — no compatibility shim.

### D6 — Boundedness (Foundation #10)

Classifier work is explicitly bounded per template: `N × D_effective` where N is the head chooseN's option count and D_effective is the residual decision-sequence length after one option selection. Neither is recursive; both are compile-time visible through the spec's macro-expansion artifacts. A hard ceiling constant `CLASSIFIER_MAX_PROBE_WORK = 1024` (product of N and D_effective) SHALL guard against pathological specs; exceeding it returns `kind: 'unreachable'` with code `budgetExceeded` and logs a structured warning. The ceiling is documented alongside `NOT_VIABLE_RETRY_CAP`.

### D7 — Determinism (Foundation #8)

Classifier option iteration order matches the order in `nextDecision.options`, which is already the deterministic kernel emission order. The classifier uses no RNG. Golden replay tests over currently-passing seeds SHALL assert byte-identical final `stateHash` before and after the classifier lands — a hard release gate.

### D8 — Caching (conditional on I4 measurement)

If I4 shows >25% wall-clock overhead, a classifier cache keyed by `(stateHash, actionId)` is added to `GameDefRuntime`. The cache is deterministic (same key → same verdict across runs), bounded (LRU with 4096 entries), and cleared at simulation boundaries. If overhead is ≤25%, no cache lands in Phase 1.

## Testing Strategy

### T1 — Minimal engine-agnostic fixture

Under `packages/engine/test/unit/kernel/template-viability-classifier.test.ts`, exercise the classifier on a minimal hand-authored GameDef (no FITL dependency). The fixture has one action `marchMini` with a `chooseN{min:1, max:1, options:3}` head where option 0 leads to a completable path, option 1 raises `CHOICE_RUNTIME_VALIDATION_FAILED`, option 2 resolves to `illegal`. Assert `kind: 'viable', viableOptionCount: 1, totalOptionCount: 3` when option 0 is reachable, and `kind: 'unreachable'` with the expected `rejectedReasons` histogram when options 1 and 2 are the only reachable set.

File-top marker: `// @test-class: architectural-invariant`.

### T2 — Enumeration-integration invariant

Under `packages/engine/test/integration/legal-moves-template-filtering.test.ts`, assert the property: for every `(def, state)` pair in a representative corpus (minimal fixture + FITL turn-2 states across arvn/vc), `enumerateLegalMoves` emits no template whose `classifyTemplateCompletionViability` would return `unreachable`. This is the Foundation #5 invariant.

File-top marker: `// @test-class: architectural-invariant`.

### T3 — Seed-corpus regression

Under `packages/engine/test/integration/fitl-seed-classifier-coverage.test.ts`, run FITL arvn seeds 1002 and 1010 through `runGame` at max-turns=200. Assert `trace.stopReason !== 'kernelClassifierMiss'` and `trace.stopReason !== 'noPlayableMoveCompletion'` (the latter SHALL no longer exist in the union per D5). Document the expected stop reason per seed based on I1 findings.

File-top marker: `// @test-class: convergence-witness`, `// @witness: spec-138-classifier-corpus`. Trajectory changes require Spec 137's distillation protocol before re-blessing.

### T4 — Replay-identity over passing corpus

A determinism test under `packages/engine/test/determinism/` runs each currently-passing seed in the FITL 1000–1019 corpus (arvn and vc) twice: once with the classifier disabled (behind a test-only flag that routes `enumerateLegalMoves` through the pre-classifier path), once enabled. For every seed where the classifier performs zero filtering during the run, assert byte-identical canonical serialized final state.

File-top marker: `// @test-class: architectural-invariant`.

### T5 — Classifier miss tripwire

A test constructs a pathological state where the classifier *would* incorrectly emit a template but the completion would subsequently fail (simulated by mocking the classifier). Assert that `runGame` surfaces `stopReason='kernelClassifierMiss'` with structured context.

### T6 — No FITL-specific logic in kernel

A lint-style test under `packages/engine/test/integration/engine-agnosticism.test.ts` greps `packages/engine/src/kernel/template-viability-classifier.ts` for FITL-specific identifiers and fails if any are present. Foundation #1 proof-by-assertion.

### Performance gate

CI runs the 20-seed arvn sweep and asserts classifier overhead < 25% of baseline sim time.

## Alignment With `docs/FOUNDATIONS.md`

| Foundation | How Spec 138 respects it |
|---|---|
| **#1 Engine Agnosticism** | Classifier lives in `kernel/`, zero FITL-specific identifiers (proof: T6). Works on any GameDef. |
| **#5 One Rules Protocol** | Enumerate, probe, and classifier converge on a single legality+completability verdict. `legalMoves` output is ground truth — no silent disagreement with downstream completion. |
| **#7 Specs Are Data** | No `eval`, no runtime callbacks, no plugin hooks. Classifier is pure code over generic DSL. |
| **#8 Determinism Is Sacred** | No RNG. Deterministic option iteration. Replay-identity gate (T4) over passing corpus. |
| **#10 Bounded Computation** | Classifier work bounded by `CLASSIFIER_MAX_PROBE_WORK = 1024`. No recursion. |
| **#11 Immutability** | Classifier signature `(def, state, move, runtime) → verdict`. No mutation; uses existing `completeMoveDecisionSequence`. |
| **#12 Compiler-Kernel Boundary** | State-dependent completability is kernel-owned. Compiler continues to validate static shape only. |
| **#14 No Backwards Compatibility** | `noPlayableMoveCompletion` stop reason and `NoPlayableMovesAfterPreparationError` class are **deleted** in the same change. `kernelClassifierMiss` replaces them. |
| **#15 Architectural Completeness** | Root cause fixed: enumerate produces completable moves. Not a retry-budget band-aid. |
| **#16 Testing as Proof** | Six test artifacts (T1–T6), covering invariants, regression, determinism, tripwire, and agnosticism. |

## Edge Cases & Open Questions

- **Templates with nested `chooseN`.** Phase 1 validates only the head. If a real case surfaces where the head's viability depends on a nested chooseN's viability, a Phase-2 ticket extends the classifier to recurse the decision tree (still bounded by `CLASSIFIER_MAX_PROBE_WORK`).
- **Stochastic-decision templates.** If `nextDecision.type === 'chooseStochastic'` (not `chooseN`), the classifier treats the template as viable without deeper inspection — stochastic resolution has its own completeness guarantees under Spec 17 §4. A comment in the classifier notes this explicitly.
- **Empty-option chooseN.** If a template reaches a `chooseN` with `options.length === 0`, this is a compiler invariant violation (caught pre-kernel) — classifier returns `unreachable` with `decisionTreeMalformed` as belt-and-suspenders.
- **Cache invalidation (D8).** If the classifier cache lands, it keys on `stateHash` which already incorporates all rule-authoritative state. Cross-run cache reuse is safe because `stateHash` is deterministic; per-run cache is cleared at simulation boundaries.
- **Retry budget removal.** Out of scope for Phase 1. Once G3 and T3 land, the 10-attempt loop is proven vestigial. A follow-up cleanup ticket can delete it.
