# Spec 139: Constructibility-Certificate Legality Contract

**Status**: COMPLETED
**Priority**: P0 (active CI blocker on PR #221)
**Complexity**: L
**Dependencies**: Spec 138 [enumerate-time-template-viability-classifier] (archived — partial implementation that this spec completes), Spec 132 [agent-stuck-viable-template-completion-mismatch] (archived — established the unified viability predicate this spec composes with), Spec 134 [unified-move-legality-predicate] (archived), Spec 137 [convergence-witness-invariant-promotion] (archived — distillation protocol used in T-series tests below)
**Source**: External research synthesis in `reports/legal-moves-research.md` (2026-04-19), built on top of the architectural-gap analysis in `reports/enumerate-vs-complete-architectural-gap.md` (2026-04-19). PR #221 CI failures: `Engine Determinism Parity` (FITL seed=123, RandomAgent) and `Engine FITL Rules` (seeds 1002 and 1010 with `arvn-evolved` profile, PolicyAgent).

## Brainstorm Context

**Original framing (spec 138).** Spec 138 framed the failure as an *enumerate-vs-sampler information asymmetry* and surfaced one canonical satisfiable head selection from the existing classifier. That fix is sound but partial: it constrains only the first `chooseN` head and leaves all downstream decisions to the existing chooser. For multi-pick heads with sparse downstream legal subsets — empirically `chooseN{min:1, max:27, options:27}` on the failing FITL `march` template — head guidance alone does not produce a complete completion.

**Reframed root cause (research).** The real gap is in the legality contract itself: today the kernel admits a move as legal whenever the classifier proves *some* completion exists in the decision tree, but the agent is then required to *find* that completion by bounded random sampling. That makes legal-but-unconstructible moves a representable state, which Foundation #5 (one rules protocol) implicitly forbids and Foundation #15 (architectural completeness) demands we close.

**Verified state on `implemented-spec-138` HEAD (2026-04-19).**

| Test | Seed / Variant | Symptom |
|---|---|---|
| `zobrist-incremental-parity.test.ts` | FITL seed 123, `RandomAgent` | `RandomAgent could not derive a playable move from 1 classified legal move(s).` |
| `fitl-canary-bounded-termination.test.ts` | seed 1002, profile set including `arvn-evolved` | `PolicyAgent could not derive a playable move from 3 classified legal move(s).` |
| `fitl-canary-bounded-termination.test.ts` | seed 1010, profile set including `arvn-evolved` | `PolicyAgent could not derive a playable move from 1 classified legal move(s).` |

The simulator does not catch the throw (Spec 138 deleted the catch). The PR is blocked.

**Prior art surveyed.** The research report inventoried prior art across SAT/SMT solvers (witness-producing decision procedures), constraint-programming engines (set-variable propagation, support tests), general-game-playing engines (split decision states for compound turns), and MCTS frameworks. The synthesis: SAT/SMT-style witness-producing classification + CP-style set-variable propagation for `chooseN` is the smallest principled change that closes the gap. Split decision states / microturns are the right *long-term* architecture but a substantially larger change touching simulator, replay protocol, and runner worker bridge.

**Alternatives explicitly considered (and rejected).**

- **Restore `noPlayableMoveCompletion` as a stop reason.** Rejected by the user and by the research. It is a symptom-level workaround that re-introduces the broken contract. Foundation #15.
- **Raise retry caps / loosen budgets.** Rejected. Probabilistic correctness is not correctness. Foundation #10.
- **Eager full enumeration of fully-bound moves.** Rejected. `2^27` powerset on the live witness is catastrophic. Foundation #10.
- **Sampling-importance-resampling / proposal correction.** Rejected. Still probabilistic. Foundation #8 + Foundation #10.
- **External CP/SAT solver in the runtime hot path.** Rejected. Determinism, boundedness, and replay identity guarantees are the kernel's, not a third-party library's. Foundation #1 + Foundation #8 + Foundation #13.
- **Defer to Phase 3 (split decision states) immediately.** Rejected as an immediate fix. Phase 3 is the right end-state but requires simulator/replay/worker-bridge changes that exceed the scope needed to unblock the PR. This spec lays the groundwork without blocking on Phase 3.

## Overview

This spec adopts a **certificate-carrying legality contract**: client-visible legality requires constructibility, certified by the kernel. Every legal move emitted to clients is one of:

1. **Complete** — already fully bound (today's `viability.complete === true` case).
2. **Stochastic** — has an explicit kernel-owned stochastic continuation (today's `viability.stochasticDecision !== undefined` case, classified as `'explicitStochastic'` by the admission classifier under the new contract — distinct from `'unknown'`).
3. **Template-with-certificate** — incomplete, but accompanied by a kernel-produced `CompletionCertificate` that deterministically materializes a fully-bound legal move without further search.

`'unknown'` from the satisfiability classifier becomes an internal search state, never a public legal-move verdict. `'explicitStochastic'` is a first-class public admission verdict — admitted without a certificate because the stochastic continuation is itself kernel-owned and handled by the existing `chooseStochastic` machinery. Random sampling becomes an *optional optimization for diversity or policy quality*, never the authority that decides whether the move is playable.

The kernel's existing per-`chooseN`-option witness search infrastructure (`packages/engine/src/kernel/choose-n-option-resolution.ts`) is generalized: instead of labelling each option `legal | illegal | unknown`, the same machinery composes per-option witnesses into full-template completion certificates. Memoization and failed-prefix nogoods make the search bounded in practice as well as in theory.

The change is engine-agnostic: it touches the kernel admission contract, the satisfiability classifier, the agent sampler, and the type system. No FITL- or Texas-specific code is added.

This spec also amends `docs/FOUNDATIONS.md` with one new principle and two clarifications. See § Design D7.

## Problem Statement

### Current contract (broken)

`packages/engine/src/kernel/legal-moves.ts:710` admits a move whenever `decisionSequenceClassification ∈ {satisfiable, unknown}`. Only `unsatisfiable` rejects. The agent then receives the move as `viability.viable === true, complete === false` and must construct a completion by random sampling with a bounded retry budget (`pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP = 3 + 7 = 10` for `PolicyAgent`).

For sparse multi-pick `chooseN` heads (`min:1, max:27`, powerset `~134M`), 10 random draws with downstream-random binding miss the legal subset modally, not exceptionally. Spec 138 added head guidance but downstream binding stayed random.

The breakage manifests as agents throwing `Error('… could not derive a playable move from N classified legal move(s).')`. The simulator (post-Spec 138) does not catch this; PR CI fails.

### Why Spec 138's fix is insufficient

Spec 138 G4 stated `noPlayableMoveCompletion` would become unreachable. Empirically it is reachable because:

1. The classifier returns `'unknown'` (budget exhaustion) without emitting `canonicalViableHeadSelection`. Today this admits the move; the sampler then misses.
2. The classifier returns `'satisfiable'` with `canonicalViableHeadSelection` but the head guidance does not constrain downstream `chooseN` / `chooseOne` decisions. Random or policy-driven downstream binding still misses on sparse legal surfaces.
3. The `arvn-evolved` policy profile happens to score downstream options differently than `arvn-baseline`; the head guidance composes well with `baseline` but not with `evolved`.

### What "constructible" means precisely

A move `m` is **constructible** in state `s` under definition `d` and runtime `r` iff there exists a deterministic, bounded, RNG-free procedure `materialize(d, s, r, m, certificate) → Move'` such that:

- `Move'` is fully bound (no pending decisions).
- `Move'` satisfies the unified legality predicate (`evaluateMoveLegality` from Spec 132/134).
- The procedure terminates within `MoveEnumerationBudgets`.
- Identical inputs produce identical `Move'` (Foundation #8).

Today the kernel can prove existence of `Move'` (the classifier) but does not produce the witness. This spec produces it.

## Goals

- **G1 — Certificate type.** Introduce `CompletionCertificate`, a kernel-owned RNG-free serializable artifact carrying enough information to materialize a fully-bound legal move from a template without further search. See Design D1.
- **G2 — Full-path witness from the classifier.** Extend `classifyDecisionSequenceSatisfiability` to emit a complete-path completion certificate for templates whose decision tree is satisfiable, replacing Spec 138's head-only `canonicalViableHeadSelection`. The extension MUST be pure, side-effect-free, RNG-free, and stay within the existing `MoveEnumerationBudgets` family. See Design D2.
- **G3 — `chooseN` as a bounded set variable.** Replace raw subset enumeration over `chooseN{min, max}` heads with set-variable propagation (lower bound `lb`, upper bound `ub`, cardinality constraint `min ≤ |S| ≤ max`) plus per-option support tests. Reuse and generalize the existing `runWitnessSearch` infrastructure in `packages/engine/src/kernel/choose-n-option-resolution.ts`. See Design D3.
- **G4 — Memoization + nogood recording.** Add per-classification-call memoization keyed on `(projectedStateHash, actionId, normalized-partial-binding, pending-request-fingerprint) → sat | unsat | unknown | witness`. Failed prefixes are recorded as nogoods so repeated subtrees short-circuit. The cache lives only for the duration of a single classification invocation; no cross-call mutable state. Foundation #11. See Design D4.
- **G5 — Constructible admission.** Replace the current tri-state admission at `packages/engine/src/kernel/legal-moves.ts:710` with the new contract: admit `complete`, admit explicit-stochastic, admit template-only-when-certificate. Reject `unknown` from public legal moves. See Design D5.
- **G6 — Agent sampler downgrade.** `preparePlayableMoves` retries continue as a *diversity / policy-quality* mechanism, not a correctness mechanism. After the existing first-attempt strategy hits a dead-end, the agent materializes the certificate-backed completion as a guaranteed fallback. The retry budget no longer gates correctness. See Design D6.
- **G7 — Replay identity preservation.** For seeds whose unguided first attempt already succeeds today, certificate materialization MUST NOT activate, the agent's RNG MUST NOT be advanced by certificate generation, and the canonical serialized final state MUST remain byte-identical (Spec 138 G6 carried forward). For seeds that previously failed with the uncaught throw, the new path produces a deterministic completion via the certificate.
- **G8 — `unknown` becomes an internal-only result.** Per Foundation #14, the public type surface representing classifier results MUST distinguish "internal-search verdict" from "client-visible-admission verdict" so `unknown` cannot accidentally leak. See Design D5.
- **G9 — Foundation amendments.** Apply the three FOUNDATIONS changes in § Design D7 in the same change as the implementation. The implementation must satisfy the amended Foundations as proven invariants; not the other way around.
- **G10 — Phase 3 enabling, not blocking.** This spec MUST NOT lock in template/completion as the long-term architecture. The certificate contract is the immediate fix; split decision states / microturns (Phase 3) remain available as a future architectural simplification. See § Future Work.

## Non-Goals

- **No FITL-specific or Texas-specific code.** The defect surfaces on engine-agnostic infrastructure; any per-game patch violates Foundation #1.
- **No simulator/replay/worker-bridge change required.** The certificate is invisible at the runner worker bridge boundary because `LegalMoveEnumerationResult.moves[]` retains its existing public shape; the certificate is internal to admission and the agent's fallback path. (Spec 138 I3 already verified the worker-bridge contract; this spec preserves it.)
- **No retry-budget increase.** The existing `pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP = 10` budget remains untouched. With certificate fallback, retries are no longer a correctness mechanism.
- **No new agent type.** `RandomAgent`, `GreedyAgent`, `PolicyAgent` remain. Their `chooseMove` body changes only in the dead-end fallback path.
- **No external CP/SAT solver.** All search machinery stays in-tree, deterministic, bounded.
- **No rewrite of the stochastic resolution machinery.** The existing `chooseStochastic` pipeline in `move-completion.ts` continues to resolve stochastic outcomes downstream of `'explicitStochastic'`-classified moves unchanged. This spec formalizes only the admission verdict for stochastic-frontier moves, not their resolution.
- **No GameDef YAML / `data/games/*` change.** Foundation #1.
- **No `noPlayableMoveCompletion` revival.** Spec 138's deletion stands. With the certificate contract, the failure mode it represented is structurally absent — not caught and renamed.
- **No Phase 3 implementation.** Split decision states / microturns are out of scope. § Future Work captures the deferred direction.

## Required Investigation (Pre-Implementation)

Each investigation MUST produce either a checked-in fixture, a test file, or a measurement report referenced from the spec's tickets. No implementation work begins until I1, I2, and I3 complete.

### I1 — Inventory all admission call sites that consume `'unknown'`

Grep every consumer of `classifyMoveDecisionSequenceAdmissionForLegalMove`, `classifyMoveDecisionSequenceSatisfiability`, `isMoveDecisionSequenceAdmittedForLegalMove`, and `isMoveDecisionSequenceSatisfiable`. For each call site, document whether the current `'unknown' → admit` behavior is load-bearing for any currently-passing seed/scenario. If yes, record the case, the budget at which `'unknown'` arises, and the smallest budget that resolves the move to `satisfiable` or `unsatisfiable`. Output: a table in the ticket plus a kernel-only fixture test that demonstrates the case.

This is a Foundation #15 prerequisite: closing the fail-open admission must not silently drop legitimate moves.

### I2 — Characterize the failing draw spaces with the new search algorithm

For FITL seeds 1002, 1010 (NVA `march`, `arvn-evolved` profile interaction) and seed 123 (RandomAgent FITL), trace the new memoized DFS + set-variable-propagation algorithm step-by-step on a truthful repo-owned witness. Where a reconstructable historical pre-failure state is unavailable, capture the first current replay witness that reaches the certificate-search seam instead. Record: probe steps consumed, memo hits, nogood records, terminal verdict, generated certificate. Output: checked-in diagnostic transcript under `campaigns/fitl-arvn-agent-evolution/diagnose-certificate-search.mjs` plus an engine-agnostic fixture test that reproduces the same shape with synthetic data. For the owned synthetic adversarial witness, require bounded certificate production and positive nogood recording; retain memo-hit counts as reported diagnostics without requiring them to be positive on that exact shape.

Validates that the algorithm respects `MoveEnumerationBudgets` on the live witness and produces a usable certificate.

### I3 — Replay-identity sweep over the passing corpus

Run the FITL passing corpus (seeds where the current first-attempt sampler already succeeds) twice: once with certificate fallback wired but never activated (because first-attempt succeeds), once with the unmodified pre-spec path. Assert byte-identical canonical serialized final state across the corpus. Output: a determinism test under `packages/engine/test/determinism/spec-139-replay-identity.test.ts`.

Carries Spec 138 G6 forward.

### I4 — Worker-bridge type surface verification

Audit `packages/runner/src/worker/game-worker-api.ts` and `packages/runner/test/worker/clone-compat.test.ts` for any consumer of the classified-move shape that would need to know about `CompletionCertificate`. Expectation: zero. The certificate is internal to admission and agent-side fallback; the worker bridge sees only the existing `LegalMoveEnumerationResult` shape.

If I4 surfaces a public-shape leak, the spec is amended before implementation begins to keep the certificate strictly internal.

## Design

### D1 — `CompletionCertificate` type

New kernel-owned value type. Located in `packages/engine/src/kernel/completion-certificate.ts` (new file).

```ts
export interface CompletionCertificate {
  /**
   * Ordered assignment of decision values, one entry per pending decision
   * in the canonical decision sequence. Assignment is RNG-free and produced
   * by the deterministic memoized DFS in classifier search.
   */
  readonly assignments: readonly CompletionCertificateAssignment[];

  /**
   * Deterministic fingerprint over `(projectedStateHash, actionId,
   * normalized-base-params, ordered-assignments)`. Used as the memoization
   * key when other classifier calls in the same invocation encounter the
   * same prefix, and as a serialization handle for diagnostics/tests.
   */
  readonly fingerprint: string;

  /**
   * Optional metadata: nodes visited, memo hits, nogood records consumed.
   * For diagnostics and the Spec 138-style performance gate. Not part of
   * the materialization contract.
   */
  readonly diagnostics?: CompletionCertificateDiagnostics;
}

export interface CompletionCertificateAssignment {
  readonly decisionKey: DecisionKey;
  readonly value: MoveParamValue;            // The bound value (chooseOne) or selected subset (chooseN)
  readonly requestType: 'chooseOne' | 'chooseN';
}

export interface CompletionCertificateDiagnostics {
  readonly probeStepsConsumed: number;
  readonly paramExpansionsConsumed: number;
  readonly memoHits: number;
  readonly nogoodsRecorded: number;
}
```

Materialization is a pure function:

```ts
export const materializeCompletionCertificate = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  certificate: CompletionCertificate,
  runtime: GameDefRuntime,
): Move => /* … applies assignments in order via the existing
              completeMoveDecisionSequence with a guided chooser
              that consumes the certificate … */;
```

The materialization MUST yield a fully-bound `Move` whose `evaluateMoveLegality` verdict is `legal`. Failure to materialize is a kernel invariant violation (G3 of Spec 138 reframed for the new contract).

### D2 — Classifier extension to emit full-path certificate

Modify `packages/engine/src/kernel/decision-sequence-satisfiability.ts` in place. Three coordinated changes:

**D2.1 — Expand the result union with `'explicitStochastic'`.** Today the classifier returns `'unknown'` for `pendingStochastic` request kinds (line 141), which under fail-open admission silently admits the move. Under the new contract `'unknown'` is rejected, so `pendingStochastic` needs its own positive verdict. The spec adopts a first-class verdict rather than an empty-certificate encoding so the three-category amendment in D7.1 is type-enforced inside the single kernel artifact that owns admission (Foundation #5, Foundation #18):

```ts
export type DecisionSequenceSatisfiability =
  | 'satisfiable'
  | 'unsatisfiable'
  | 'unknown'
  | 'explicitStochastic';
```

Wrapper booleans in `packages/engine/src/kernel/move-decision-sequence.ts` are updated so `isMoveDecisionSequenceSatisfiable` (line 170) and `isMoveDecisionSequenceAdmittedForLegalMove` (line 203) return `true` for the new verdict — stochastic-frontier moves remain admissible.

**D2.2 — Replace the Spec 138 head-only opt-in with a full-path certificate opt-in.** The `emitCanonicalViableHeadSelection` option and the `canonicalViableHeadSelection` result field are **deleted** in the same change (Foundation #14):

```ts
export interface DecisionSequenceSatisfiabilityOptions {
  // … existing fields …
  /** When true, on `satisfiable` verdict, return a full-path completion
   *  certificate. No certificate is produced for `'explicitStochastic'` —
   *  those moves admit without one. */
  readonly emitCompletionCertificate?: boolean;
}

export interface DecisionSequenceSatisfiabilityResult {
  readonly classification: DecisionSequenceSatisfiability;
  readonly warnings: readonly RuntimeWarning[];
  readonly certificate?: CompletionCertificate;  // present iff classification === 'satisfiable'
                                                 //         && emitCompletionCertificate === true
}
```

**D2.3 — Memoized DFS algorithm.** Full sketch, from `reports/legal-moves-research.md` § Algorithm sketch, adapted to the kernel's existing types and the expanded verdict union:

```text
search(move, ctx):
  if budgetExceeded(ctx):
    return Unknown

  key = memoKey(ctx.projectedStateHash, move.actionId, normalize(move.params))
  if memo has key:
    return memo[key]                           // Sat(witness), Unsat, Unknown, ExplicitStochastic

  request = discoverChoices(move)

  if request.kind == 'complete':
    result = Sat(certificate = [])
    memo[key] = result
    return result

  if request.kind == 'illegal':
    result = Unsat
    memo[key] = result
    return result

  if request.kind == 'pendingStochastic':
    result = ExplicitStochastic               // distinct from Unknown; admitted via stochastic path
    memo[key] = result                         // no certificate produced
    return result

  supported = supportedSelections(request, move, ctx)   // see D3 for chooseN

  if supported is empty:
    result = Unsat
    memo[key] = result
    return result

  for selection in canonicalOrder(supported):
    child = bind(move, request.decisionKey, selection)
    r = search(child, ctx.child())
    if r is Sat:
      result = Sat(certificate = [{decisionKey, value: selection, requestType}, …r.certificate])
      memo[key] = result
      return result
    if r is ExplicitStochastic:
      // Mid-sequence stochastic boundary reached via this binding.
      // Emit the partial certificate up to this point; downstream
      // stochastic resolution runs via chooseStochastic (see Edge Cases).
      result = Sat(certificate = [{decisionKey, value: selection, requestType}])
      memo[key] = result
      return result
    if r is Unsat:
      recordNogood(key, selection)             // failed-prefix; pruned in future iterations

  result = aggregateChildren(...)              // Unsat if all children Unsat; else Unknown
  memo[key] = result
  return result
```

`canonicalOrder` matches the existing deterministic kernel emission order so the certificate is reproducible across runs (Foundation #8). When a child binding reaches an `ExplicitStochastic` frontier, the parent returns `Sat` with a certificate that binds the pre-stochastic decisions only — the move is admitted via the `'satisfiable'` path with a partial certificate, and downstream stochastic outcomes are resolved by `chooseStochastic` per the Edge Cases entry on stochastic continuations.

A root-level `pendingStochastic` on `baseMove` (no pre-stochastic decisions to bind) yields `'explicitStochastic'` at the outer result, not `'satisfiable'` — the D5 admission switch handles it in a dedicated arm.

### D3 — `chooseN` as set-variable propagation

For `chooseN{min, max, options}`, raw subset enumeration is the wrong abstraction. Replace `enumerateChooseNSelections` (currently in `decision-sequence-satisfiability.ts`) with set-variable propagation:

1. Initialize the set variable: `lb = {}`, `ub = options`. Cardinality constraint: `min ≤ |S| ≤ max`.
2. Run *include* and *exclude* support tests per option (reusing the per-option witness search machinery from `packages/engine/src/kernel/choose-n-option-resolution.ts:runWitnessSearch`):
   - If "include `x`" has no support (no completion exists with `x ∈ S`), remove `x` from `ub`.
   - If "exclude `x`" has no support (no completion exists with `x ∉ S`), add `x` to `lb`.
3. Cardinality propagation:
   - `|lb| > max` → `Unsat`.
   - `|ub| < min` → `Unsat`.
   - `|lb| == max` → finalize selection as `lb` (exclude all others).
   - `|ub| == min` → finalize selection as `ub` (include all others).
4. If the set variable is not yet fully determined, branch on the **most constrained remaining choice** (smallest residual `ub \ lb`). Try inclusion first in canonical order; on `Unsat`, try exclusion; otherwise propagate further.
5. Stop the search as soon as one full satisfying selection is found.

This generalizes the existing `runWitnessSearch` (which today resolves per-option legality labels) into a full-template-completion certifier. The existing `WitnessSearchBudget`, `ChooseNDiagnosticsAccumulator`, and probe-cache infrastructure are reused.

The reused machinery is engine-agnostic (Foundation #1), already deterministic (Foundation #8), already bounded (Foundation #10), and already pure (Foundation #11).

### D4 — Memoization + nogood recording

Per-classification-call memo. Key shape:

```ts
type MemoKey = `${string}:${string}:${string}:${string}`;
//                 ^projectedStateHash : actionId : normalized-partial-binding : pending-request-fingerprint
```

Cache lifetime: one invocation of `classifyDecisionSequenceSatisfiability`. The map is created at the start of the call and discarded at the end. **No cross-call cache.** Foundation #11 immutability of caller-visible state is preserved; the classifier's internal scratch space is allowed under Foundation #11's "Scoped internal mutation" exception, with the same isolation requirements (no aliasing escape, no observation before finalization).

`normalize(move.params)` produces a canonical string by sorting keys lexicographically and serializing values via the same canonical encoding the state hash uses. `pending-request-fingerprint` includes request type, decision key, options-list hash, and `(min, max)` for `chooseN`.

Nogoods: when a child branch returns `Unsat`, record `(parent memo key, selection)` so the parent's iteration skips that selection if it is encountered again under a different traversal order. Nogoods live in the same per-call memo and are discarded with it.

`maxParamExpansions` and `maxDecisionProbeSteps` continue to bound the total work. Memo hits are accounted as zero new probe steps (already-paid work).

### D5 — Constructible admission

Modify `packages/engine/src/kernel/legal-moves.ts:710`. The existing post-`'satisfiable'` outcome-grant validation at lines 727-759 (free-operation grant resolution, `completionPolicy === 'required'` handling, `phase === 'ready'` transitions, and the terminal `transitionReadyGrantForCandidateMove` call) **MUST be preserved inside the `'satisfiable'` arm of the new switch**. The switch replaces only the classification-handling prologue; the downstream free-operation admission logic is unchanged.

New admission rule:

```ts
const decisionSequenceResult = classifyMoveDecisionSequenceSatisfiabilityForLegalMove(
  def, candidateState, candidateMove, MISSING_BINDING_POLICY_CONTEXTS....,
  { budgets: enumeration.budgets, onWarning: ..., emitCompletionCertificate: true, ... },
);

switch (decisionSequenceResult.classification) {
  case 'unsatisfiable':
    return false;

  case 'explicitStochastic':
    // First-class admission verdict: move has a kernel-owned stochastic
    // continuation at the decision frontier. No certificate is attached
    // (the stochastic path is not certified; it is resolved by chooseStochastic
    // downstream). Foundation #5 amendment D7.1: "explicitly stochastic with a
    // kernel-owned stochastic continuation" is one of the three admissible shapes.
    // Outcome-grant post-validation (below) still applies to stochastic-frontier
    // moves per today's behaviour.
    break;  // fall through to outcome-grant validation

  case 'satisfiable':
    if (decisionSequenceResult.certificate === undefined) {
      // Defensive: classifier promises certificate when satisfiable + opt-in.
      // Treat as engine bug: emit warning, drop the move.
      emitEnumerationWarning(enumeration, {
        code: 'CONSTRUCTIBILITY_INVARIANT_VIOLATION',
        message: 'Classifier returned satisfiable but did not emit a certificate.',
        context: { actionId: ..., stateHash: ... },
      });
      return false;
    }
    /* attach certificate to the classified move via a kernel-internal
       side-channel — see D5.1 below */
    break;  // fall through to outcome-grant validation

  case 'unknown':
    // CONTRACT CHANGE: unknown is no longer client-visible legality.
    // Per FOUNDATIONS amendment (D7), this is either an engine defect, a
    // budget defect, or a sign that the move must be reified as split
    // decision states (Phase 3, future work). Today: drop, warn.
    emitEnumerationWarning(enumeration, {
      code: 'CLASSIFIER_UNKNOWN_VERDICT_DROPPED',
      message: 'Decision-sequence classifier returned unknown; move not admitted as legal.',
      context: { actionId: ..., stateHash: ... },
    });
    return false;
}

// === Existing outcome-grant post-validation preserved verbatim from lines 727-759 ===
// The switch arms above fall through to this block for 'satisfiable' and
// 'explicitStochastic' verdicts. 'unsatisfiable' and 'unknown' short-circuit
// with an explicit `return false`.
//
// This block handles: turnOrderState.type === 'cardDriven' with
// pendingFreeOperationGrants having outcomePolicy === 'mustChangeGameplayState',
// resolveStrongestRequiredFreeOperationOutcomeGrant, completionPolicy === 'required',
// phase === 'ready' transitions, and transitionReadyGrantForCandidateMove.
// No logic change in this block — only the prologue classification handling
// changes. Implementation preserves lines 727-759 in place.
```

#### D5.1 — Where the certificate lives

The public `LegalMoveEnumerationResult.moves[]` shape (consumed by the runner worker bridge — see I4) is unchanged. The certificate is attached to a kernel-internal index keyed by the move's stable identity key and looked up by the agent's fallback path. The index lives on the `LegalMoveEnumerationResult` itself as a non-public, non-serialized field:

```ts
export interface LegalMoveEnumerationResult {
  readonly moves: readonly ClassifiedMove[];
  readonly warnings: readonly RuntimeWarning[];
  // NEW: internal-only side index. Not serialized, not part of worker-bridge contract.
  readonly certificateIndex?: ReadonlyMap<string, CompletionCertificate>;
}
```

**Key derivation.** The index key is produced by the existing `toMoveIdentityKey(def, move)` function from `packages/engine/src/kernel/move-identity.ts` — the same function `preparePlayableMoves` already uses for `emittedPlayableMoveKey` (prepare-playable-moves.ts:106). Both producer (D5, enumeration side) and consumer (D6, agent side) MUST use this identical function so the lookup is well-defined. `'explicitStochastic'`-admitted moves have no entry in the index.

Tests in I4 confirm the `certificateIndex` field stays out of the worker-bridge clone-compat contract.

### D6 — Agent sampler change: certificate as fallback

Modify `packages/engine/src/agents/prepare-playable-moves.ts`. The current `attemptTemplateCompletion` retry loop is preserved as a *diversity* mechanism: PolicyAgent and other policy-driven agents may legitimately want multiple distinct completions per template for ranking. The change is in the dead-end branch:

```ts
// Existing retry loop runs first attempts via the existing chooser policy.
// If after the existing retry budget the loop has not produced a completion,
// the certificate-backed completion is materialized as a guaranteed fallback.

if (
  !sawCompletedMove
  && stochasticCount === 0
  && duplicateOutputOutcome === undefined
) {
  const stableMoveKey = toMoveIdentityKey(input.def, move);          // Same function as D5.1
  const certificate = input.legalMoves.certificateIndex?.get(stableMoveKey);
  if (certificate !== undefined) {
    const certifiedMove = materializeCompletionCertificate(
      input.def, input.state, move, certificate, input.runtime,
    );
    /* admit certifiedMove as a complete playable move; advance no RNG */
  } else {
    // Per D5, a satisfiable-classified move MUST have a certificate.
    // Reaching this branch is a kernel-invariant violation. Emit warning;
    // do not throw; the move is dropped.
    warnings.push({
      code: 'CONSTRUCTIBILITY_INVARIANT_VIOLATION',
      message: 'Admitted incomplete legal move had no certificate at agent fallback time.',
      context: { actionId: ..., stateHash: ... },
    });
  }
}
```

**Stochastic-frontier moves do not trigger the certificate fallback.** A move whose classifier verdict was `'explicitStochastic'` has no entry in `certificateIndex` and is expected to flow through the existing `stochasticCount`/`stochasticMoves` collection during the retry loop itself (via `evaluatePlayableMoveCandidate` producing a `playableStochastic` result). The dead-end branch above is guarded by `stochasticCount === 0`, so a stochastic move that successfully resolves via `chooseStochastic` never reaches the certificate lookup. If a stochastic-frontier move somehow produces neither a completed nor a stochastic result after the retry budget, the absent-certificate branch fires a `CONSTRUCTIBILITY_INVARIANT_VIOLATION` warning and the move is dropped — same invariant surface as any other admission without a materializable completion.

Spec 138's `buildCanonicalGuidedChoose` is **deleted** (Foundation #14). The Spec 138 `GUIDED_COMPLETION_UNEXPECTED_MISS` warning code is also deleted; under the new contract, "guided still misses" is impossible (the certificate is the witness, not a hint).

The `RandomAgent` / `PolicyAgent` / `GreedyAgent` `Error('… could not derive a playable move …')` throws are **deleted**. Per D5 + D6, that condition is structurally unreachable. If the certificate fallback fails, that's a kernel invariant violation surfaced as a warning with code `CONSTRUCTIBILITY_INVARIANT_VIOLATION` and the move is dropped — but the agent does not throw. (The simulator's dead-letter is `'noLegalMoves'` if the playable set ends up empty after all certificates are dropped, which itself would be a kernel bug worth a separate follow-up.)

### D7 — `FOUNDATIONS.md` amendments

Three edits to `docs/FOUNDATIONS.md`. All are applied in the same change as the implementation; tests prove the invariants. Foundation #16.

#### D7.1 — Amend Foundation #5 (`One Rules Protocol, Many Clients`)

Append to the existing principle:

> **Constructibility clause**: No client-visible legal action may require uncertified client-side search to become executable. A legal action exposed by the kernel must be either directly executable, explicitly stochastic with a kernel-owned stochastic continuation, or accompanied by a kernel-produced completion certificate or a split decision-state continuation.

#### D7.2 — Amend Foundation #10 (`Bounded Computation`)

Replace the sentence "Legal moves must be finitely listable and emitted in stable deterministic order — no free-text moves, no unbounded generation." with:

> The kernel must finitely enumerate the current executable decision frontier in stable deterministic order. A compound human-visible turn may be represented either as a fully bound move, an explicitly stochastic continuation, or a bounded sequence of kernel-owned decision states. Finite listability does not require eager expansion of all end-of-turn concretizations when that expansion is combinatorially explosive; instead, the kernel produces a per-move completion certificate or split decision-state continuation that is itself bounded and deterministic.

#### D7.3 — Add Foundation #18 (`Constructibility Is Part of Legality`)

Append a new principle after #17 (Strongly Typed Domain Identifiers):

> ## 18. Constructibility Is Part of Legality
>
> **A move is not legal for clients unless it is constructible under the kernel's bounded deterministic rules protocol. Existence without a construction artifact is insufficient.**
>
> Legality and constructibility are a single property exposed by a single kernel artifact. Client-visible incomplete moves carry a kernel-produced completion certificate; client-visible stochastic moves carry an explicit stochastic continuation; everything else is fully bound. Internal search states with `unknown` verdicts MUST NOT be exposed as legal actions. Failure to certify a structurally satisfiable move within bounded computation is an engine defect, not a recoverable game state.

The Appendix is updated to reference Spec 139 alongside the existing Spec 136 reference.

### D8 — Documentation

`docs/architecture.md` is updated to describe the new admission contract and the certificate flow at the same level of detail as the existing pipeline description. The kernel DSL reference under `docs/architecture.md` § Kernel DSL is unaffected — the contract change is at the admission layer, not the DSL.

## Testing Strategy

All tests follow Spec 137's classification taxonomy. File-top markers and witness-id conventions per `.claude/rules/testing.md`.

### T0 — Migration of Spec 138 test artifacts (Foundation #14)

D6 and D2.2 delete Spec 138's `buildCanonicalGuidedChoose`, `emitCanonicalViableHeadSelection`, `canonicalViableHeadSelection`, `GUIDED_COMPLETION_UNEXPECTED_MISS`, and the three agent `Error('… could not derive a playable move …')` throws. Per Foundation #14, every test that exercises these artifacts is migrated or deleted in the same change. Dispositions:

| File | Disposition | Reason |
|---|---|---|
| `packages/engine/test/integration/prepare-playable-moves-guided-convergence.test.ts` | **Delete** | Exercises head-guidance convergence; superseded by T4 (certificate fallback) + T5 (global no-throw). |
| `packages/engine/test/integration/fitl-seed-guided-classifier-coverage.test.ts` | **Delete** | Exercises head-only opt-in classifier shape; obsoleted when `emitCanonicalViableHeadSelection` is removed. |
| `packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts` | **Delete** | Spec 138 replay-identity gate; superseded by T7 (Spec 139 replay-identity). |
| `packages/engine/test/performance/spec-138-guided-classifier-overhead.test.ts` | **Delete** | Spec 138 overhead gate at `1.25x`; superseded by T9 at `1.50x` under the new contract. |
| `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` | **Migrate** | Retains its retry-budget assertions; drops the `GUIDED_COMPLETION_UNEXPECTED_MISS` assertion and any residual head-guidance expectations. |
| `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts` | **Migrate** | Replace `canonicalViableHeadSelection` assertions with `certificate` coverage. Add `'explicitStochastic'` verdict coverage for `pendingStochastic` request kinds. |

Migration work lands in the same commit as the D2/D5/D6 source changes. No Spec 138 test file survives with references to the deleted symbols after the change.

### T1 — Certificate type and materialization (architectural-invariant)

Under `packages/engine/test/unit/kernel/completion-certificate.test.ts`:

- Construct a hand-authored synthetic GameDef whose `march`-equivalent template has a `chooseN{min:1, max:3, options:5}` head and a downstream `chooseOne` per selected option.
- For a state where exactly one combination is legal end-to-end, assert `classifyDecisionSequenceSatisfiability(... { emitCompletionCertificate: true })` returns `satisfiable` with a certificate.
- Assert `materializeCompletionCertificate(def, state, baseMove, certificate, runtime)` returns a `Move` whose `evaluateMoveLegality` verdict is `legal`.
- Assert two consecutive calls produce byte-identical certificates and byte-identical materialized moves (Foundation #8).

File-top marker: `// @test-class: architectural-invariant`.

### T2 — Set-variable propagation invariants (architectural-invariant)

Under `packages/engine/test/unit/kernel/choose-n-set-variable-propagation.test.ts`:

- For a `chooseN{min:1, max:max}` head with various `(lb, ub)` witnesses, assert propagation rules (D3 steps 2–3) produce the expected reductions.
- Adversarial case: `chooseN{min:1, max:27, options:27}` mirroring the FITL `march` shape on a hand-authored synthetic GameDef. Assert the search returns a certificate within `MoveEnumerationBudgets` and does not exhaust `maxParamExpansions`.

File-top marker: `// @test-class: architectural-invariant`.

### T3 — Constructible admission contract (architectural-invariant)

Under `packages/engine/test/unit/kernel/legal-moves-constructible-admission.test.ts`:

- For a synthetic GameDef where the classifier returns `'unknown'` (forced via tight budget injection), assert `enumerateLegalMoves` does NOT include the move and emits the `CLASSIFIER_UNKNOWN_VERDICT_DROPPED` warning.
- For the same GameDef with sufficient budget, assert the move IS included and a certificate is attached to `LegalMoveEnumerationResult.certificateIndex`.
- For a synthetic GameDef whose first pending decision is `pendingStochastic`, assert the classifier returns `'explicitStochastic'`, the move IS admitted by `enumerateLegalMoves`, and `certificateIndex.has(toMoveIdentityKey(def, move)) === false` — stochastic-frontier moves admit without a certificate entry.
- Assert `LegalMoveEnumerationResult.moves[]` shape is unchanged (worker-bridge contract preserved).

File-top marker: `// @test-class: architectural-invariant`.

### T4 — Agent sampler invariant (architectural-invariant)

Under `packages/engine/test/unit/agents/prepare-playable-moves-certificate-fallback.test.ts`:

- Mock or hand-construct a state with one classified-legal incomplete template carrying a certificate.
- Force the existing retry path to dead-end (inject a chooser that always returns illegal selections).
- Assert the fallback materializes the certificate and `preparePlayableMoves` returns a non-empty `completedMoves`.
- Assert no `Error` is thrown.

File-top marker: `// @test-class: architectural-invariant`.

### T5 — Global no-throw property (architectural-invariant)

Under `packages/engine/test/integration/agents-never-throw-with-nonempty-legal-moves.test.ts`:

- Property test: for a corpus of synthetic GameDef × state × seed × agent triples (RandomAgent, PolicyAgent baseline, PolicyAgent evolved), assert that whenever `enumerateLegalMoves` returns a non-empty `moves[]`, the agent's `chooseMove` returns a result and does not throw.
- Corpus includes adversarial sparse-`chooseN` cases derived from T2.

File-top marker: `// @test-class: architectural-invariant`. This is the global invariant that closes the bug class.

### T6 — Failing-seed regression (architectural-invariant; replaces witness pinning)

Under `packages/engine/test/integration/spec-139-failing-seeds-regression.test.ts`:

- FITL seed 123 with 4 × `RandomAgent` at max-turns 200: `runGame` does not throw; `trace.stopReason ∈ {terminal, maxTurns, noLegalMoves}`; `trace.moves.length > 0`.
- FITL seed 1002 with profiles `[us-baseline, arvn-evolved, nva-baseline, vc-baseline]`: same assertions.
- FITL seed 1010 with the same profile set: same assertions.

File-top marker: `// @test-class: architectural-invariant`. No `@witness:` — the assertion holds across any legitimate trajectory per Spec 137.

### T7 — Replay-identity preservation (architectural-invariant)

Under `packages/engine/test/determinism/spec-139-replay-identity.test.ts` (created in I3):

- For each seed in the FITL passing corpus where the current first-attempt sampler succeeds, run `runGame` twice with the new admission contract and assert byte-identical canonical serialized final state.
- For Texas Hold'em, run the existing `draft-state-determinism-parity.test.ts` corpus under the new contract and assert byte-identical final state.

File-top marker: `// @test-class: architectural-invariant`.

### T8 — Hidden-information safety (architectural-invariant)

Under `packages/engine/test/integration/spec-139-hidden-information-safety.test.ts`:

- For a Texas-Hold'em state with hidden hole cards, assert the completion semantics generated for any classified-legal move depend only on the projected state available to the active seat.
- Assert two states that differ only in masked bindings produce certificates with identical ordered assignments and identical materialized move/frontier behavior (where the unmasked bindings are equal), even though certificate fingerprints still compose the authoritative `stateHash`.

File-top marker: `// @test-class: architectural-invariant`. This proves the research's § 7 ("Respect hidden information…") invariant.

### T9 — Performance gate (deterministic probe-step proxy)

Under `packages/engine/test/performance/spec-139-certificate-overhead.test.ts`:

- Reuse Spec 138's deterministic probe-step gate methodology. Assert certificate-emitting classifier overhead on the stable 17-seed comparable FITL corpus stays below `1.50x` of the disable-certificate baseline at the lower-level decision-sequence classifier seam that actually owns `emitCompletionCertificate`. Threshold is wider than Spec 138's `1.25x` to accommodate full-path search; tighter bounds may be set later if observed performance is better.

File-top marker: `// @test-class: architectural-invariant`.

### T10 — Foundation #18 conformance (architectural-invariant)

Under `packages/engine/test/integration/spec-139-foundation-18-conformance.test.ts`:

- Across the FITL canary corpus and the Texas Hold'em determinism corpus, for every emitted classified move whose `viability.complete === false`:
  - If the classifier verdict was `'satisfiable'`, assert a corresponding certificate is present in `certificateIndex`.
  - If the classifier verdict was `'explicitStochastic'`, assert **no** certificate entry is present for that move (absence is correct — the stochastic path is resolved by `chooseStochastic`, not by certificate materialization).
- Assert zero incomplete classified moves exist whose verdict was `'unknown'` (the contract rejects them before admission).

The three-category invariant (D7.1 amendment) is type-enforced via the `DecisionSequenceSatisfiability` union; this test asserts the runtime counterpart: every admitted incomplete move corresponds to one of the two certificate-presence states (present for `'satisfiable'`, absent for `'explicitStochastic'`), and nothing else.

File-top marker: `// @test-class: architectural-invariant`. This is the test counterpart of the new Foundation #18.

## Alignment With `docs/FOUNDATIONS.md`

| Foundation | How Spec 139 respects it |
|---|---|
| **#1 Engine Agnosticism** | The certificate type, the search algorithm, the propagation rules, the admission contract change, and the agent fallback are all engine-agnostic. Zero per-game identifiers. Worker-bridge contract preserved. |
| **#5 One Rules Protocol** | The admission contract becomes the single source of truth for both legality and constructibility. The certificate is the shared artifact between classifier and sampler. The amendment in D7.1 makes this invariant explicit. |
| **#7 Specs Are Data** | Certificate is pure data. No `eval`, no plugins, no runtime callbacks. The materialization function is generic kernel code. |
| **#8 Determinism** | Certificate generation is RNG-free. Canonical option order is preserved. Replay-identity gate (T7) covers the unaffected corpus. Failing seeds converge deterministically via the certificate. |
| **#10 Bounded Computation** | Search reuses `MoveEnumerationBudgets`. No new constant. Memoization reduces work; nogoods prune redundant branches. The amendment in D7.2 clarifies what "finite listability" requires. |
| **#11 Immutability** | Certificate is a frozen value. Memo cache is per-call scratch under Foundation #11's scoped-internal-mutation exception, with isolation guarantees enforced by tests. |
| **#12 Compiler-Kernel Boundary** | State-dependent constructibility is kernel-owned. Compiler validates static shape only. |
| **#13 Artifact Identity** | Certificate fingerprint composes deterministically with `stateHash` and `actionId`. Trace serialization includes certificates when present (for diagnostics; the spec wires this in T1). |
| **#14 No Backwards Compatibility** | Spec 138's head-only `canonicalViableHeadSelection` field, the `buildCanonicalGuidedChoose` callback, the `GUIDED_COMPLETION_UNEXPECTED_MISS` warning, and the agent throws are all deleted in the same change. The fail-open `'unknown' → admit` admission rule is deleted. No shims. |
| **#15 Architectural Completeness** | Root cause closed: the legality contract now requires constructibility. Not a retry-budget patch, not a stop-reason restoration, not a per-game predicate. The amended Foundations make the new contract explicit. |
| **#16 Testing as Proof** | Ten test artifacts (T1–T10), covering certificate invariants, set-variable propagation, admission contract, agent sampler, global no-throw property, failing-seed regression, replay-identity, hidden-information safety, performance gate, and Foundation #18 conformance. T5 is the global property test that proves the bug class is closed. |
| **#17 Strongly Typed Domain Identifiers** | Certificate uses the existing `DecisionKey` and `MoveParamValue` branded types; no raw strings. |
| **#18 Constructibility Is Part of Legality** *(new — D7.3)* | The new principle. Spec 139 is its first proving implementation. Constructibility via certificate applies to `'satisfiable'` templates; `'explicitStochastic'` is a parallel, certificate-free admission path per D7.1's three-category amendment — not a loophole around #18, but the explicit stochastic case the amendment names. `'unknown'` is excluded from client-visible legality. |

## Edge Cases & Open Questions

- **Stochastic continuations.** A template whose first non-stochastic pending decision is followed by an explicit kernel-owned stochastic node (e.g., a deck draw) is admitted via the stochastic path, not the certificate path. The certificate path stops at the stochastic boundary; downstream stochastic outcomes are resolved by the existing `chooseStochastic` machinery in `move-completion.ts`. Foundation #4 (authoritative state and observer views) is preserved because the stochastic boundary is an explicit kernel concept.
- **Empty-option `chooseN` heads.** `chooseN{min:0, max:N, options:0}` → certificate is `[selection: []]`. `chooseN{min:1, max:N, options:0}` → `Unsat`. Existing compiler invariants catch the structurally-impossible cases pre-kernel.
- **Certificate caching across enumeration calls.** Out of scope. The per-call memo is sufficient for the failing seeds and respects Foundation #11. Cross-call caching with `(stateHash, actionId)` keys (as Spec 138's I4 anticipated) remains a future optimization with no behavioural impact under the new contract.
- **Worker-bridge serialization.** The certificate is internal; the worker bridge sees the same `LegalMoveEnumerationResult.moves[]` shape it sees today (verified in I4). Worker-side agent variants (if any) get certificates via the same in-process index — agents always run alongside the kernel, never across the worker bridge with a degraded view.
- **`PolicyAgent` Phase-1 preview path.** Today's preview pass (`policy-agent.ts:200 buildPhase1ActionPreviewIndex`) calls `preparePlayableMoves` per action; under the new contract this still works because the certificate is already attached to each classified move and the preview pass just needs at least one playable move per action. No change required.
- **`PolicyAgent` per-template diversity.** PolicyAgent currently asks for `pendingTemplateCompletions = 3` distinct random completions per template for ranking. Under the new contract: the first completion is the random first attempt (unchanged); on dead-end, the certificate provides the second; further attempts use the existing retry loop with biased rerolling. Diversity is preserved when the random first attempt and the certificate differ; when they coincide, only one playable move emerges (acceptable, not a regression — today it would be zero or one).
- **Performance degradation from certificate emission.** T9 caps overhead at `1.50x`. If observed overhead is materially higher, the optional cross-call cache (above) becomes a follow-up optimization. The first-attempt random-sampling path is unchanged for currently-passing seeds; certificate emission only fires after a dead-end.
- **`unknown` becoming a bug-signal warning channel.** When the classifier returns `'unknown'` and the move is dropped per D5, the `CLASSIFIER_UNKNOWN_VERDICT_DROPPED` warning is the operator's signal to investigate budgets or split the offending decision into kernel-owned states (Phase 3). Tests in T3 verify the warning is emitted; runtime telemetry in evaluation reports may aggregate it.
- **Testing taxonomy interaction with Spec 137.** All ten tests are `architectural-invariant`. None are convergence-witnesses. T6 asserts the failing seeds reach a bounded outcome but does not pin a specific trajectory; per Spec 137's distillation rule, the property "agent does not throw on classified-legal input" is a true invariant.

## Future Work (Phase 3)

The certificate contract is the right *immediate* fix and the right groundwork for Phase 3. It is **not** the long-term architecture.

The end-state architecture, briefly: **reify pending decisions as kernel-owned split decision states / microturns.** Each pending `chooseN` / `chooseOne` becomes a first-class kernel state where the active seat sees only the immediate decision frontier (not a template + sampler). The simulator advances state-by-state instead of move-by-move. The runner worker bridge transports microturn states. The replay/event protocol gains a "turn continuation" record. At that point, template completion as an agent concern disappears entirely; the sampler is gone; the certificate is no longer needed because every legal action is already complete-in-its-own-microturn.

Phase 3 is a separate spec (to be written when Spec 139 lands and the next gap is observed in practice). It will likely depend on:

- Simulator changes to advance microturn-by-microturn.
- Worker-bridge protocol additions for microturn states.
- Replay event additions for turn continuation.
- Runner UI changes to render microturn frontiers (already partially supported by the existing decision-point snapshot infrastructure from Spec 97).
- Migration of agent contracts to choose from microturn frontiers, not templates.

Spec 139 must NOT preclude any of these. Specifically:

- The certificate's `assignments` shape is a flat ordered list — the same shape a microturn replay record would have. No representational lock-in.
- The admission contract change does not couple templates to client-visible legality; it makes them an *implementation choice* of the kernel that may later be replaced by microturns without changing the agent contract.

## Tickets

Generated via `/spec-to-tickets` on 2026-04-19:

- [`tickets/139CCONLEGCONT-001.md`](../tickets/139CCONLEGCONT-001.md) — `CompletionCertificate` type + materialization function + T1 (G1)
- [`tickets/139CCONLEGCONT-002.md`](../tickets/139CCONLEGCONT-002.md) — `chooseN` set-variable propagation (D3) + T2 (G3)
- [`tickets/139CCONLEGCONT-003.md`](../tickets/139CCONLEGCONT-003.md) — Classifier full-path certificate + memoization + `'explicitStochastic'` verdict + Spec 138 Foundation #14 atomic cut (G2 + G4 + D2.1)
- [`tickets/139CCONLEGCONT-004.md`](../tickets/139CCONLEGCONT-004.md) — Constructible admission rule + `certificateIndex` + I1 inventory + I4 worker-bridge audit + T3 (G5 + G8)
- [`tickets/139CCONLEGCONT-005.md`](../tickets/139CCONLEGCONT-005.md) — Agent certificate fallback + agent throw deletion + T4 + T5 + T6 (G6)
- [`tickets/139CCONLEGCONT-006.md`](../tickets/139CCONLEGCONT-006.md) — FOUNDATIONS.md amendments + `docs/architecture.md` update + T10 (G9)
- [`tickets/139CCONLEGCONT-007.md`](../tickets/139CCONLEGCONT-007.md) — Replay-identity sweep (I3) + T7 (G7)
- [`tickets/139CCONLEGCONT-008.md`](../tickets/139CCONLEGCONT-008.md) — Hidden-info safety (T8) + performance gate (T9) + I2 diagnostic transcript

Implementation waves (parallel groups):
- **Wave 1**: 001, 002 (both roots — cite this spec, independent).
- **Wave 2**: 003 (after 001 + 002).
- **Wave 3**: 004 (after 003).
- **Wave 4**: 005 (after 004). This is the ticket that closes the PR #221 CI failures.
- **Wave 5**: 006, 007, 008 (parallel — all after 005; documentation + replay-identity + perf/hidden-info).

Key deviation from the spec's earlier suggested decomposition: ticket 003 absorbs the full Foundation #14 atomic cut for Spec 138 artifacts (deletes `emitCanonicalViableHeadSelection`, `canonicalViableHeadSelection`, `buildCanonicalGuidedChoose`, `GUIDED_COMPLETION_UNEXPECTED_MISS` across all consumers in the same change). Ticket 005 is therefore Medium rather than Large and focuses on the certificate-fallback + agent-throw deletion + T4/T5/T6.

## Outcome

- Completion date: 2026-04-20
- What actually changed:
  - implemented the certificate-carrying legality contract across the kernel and agents, including `CompletionCertificate`, full-path certificate emission, constructible admission, and deterministic agent fallback
  - landed the `docs/FOUNDATIONS.md` amendments and the matching `docs/architecture.md` admission-flow documentation required by the spec
  - completed and archived all eight implementation tickets: `139CCONLEGCONT-001` through `139CCONLEGCONT-008`
  - checked in the planned validation artifacts, including the failing-seed regressions, replay-identity proof, Foundation #18 conformance coverage, hidden-information safety coverage, performance gate, and I2 diagnostic transcripts
- Deviations from original plan:
  - the implementation widened beyond the initially proposed seams where needed to make the live admission/publication contract correct end-to-end, including classifier/admission fixes and a few supporting test/fixture updates discovered during acceptance
  - replay-identity verification was updated to the live contract boundary rather than comparing against a stale pre-Spec-139 compatibility path
- Verification results:
  - broad gates recorded across the archived ticket outcomes include `pnpm turbo lint`, `pnpm turbo typecheck`, and `pnpm turbo test`
  - targeted engine verification recorded across the archived ticket outcomes includes `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine test:unit`, `pnpm -F @ludoforge/engine test:determinism`, focused `node --test` runs for the Spec 139 proof files, and the required I2 diagnostic transcript generation for seeds `123`, `1002`, and `1010`
