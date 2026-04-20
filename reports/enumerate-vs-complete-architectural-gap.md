# Architectural Gap: Enumeration Admits Moves the Sampler Cannot Complete

**Date**: 2026-04-19
**Status**: Active CI blocker on PR #221 (branch `implemented-spec-138`)
**Audience**: External LLM (ChatGPT Pro) for online research / prior-art survey
**Repository**: `joeloverbeck/ludoforge-llm` (TypeScript, GPL-3.0)

---

## 0. How To Read This Report

You (the external LLM) **do not have access to the codebase**. This document is intended to be self-contained:

- All code excerpts, types, and call paths are inlined.
- All FOUNDATIONS principles cited are quoted.
- All previously attempted fixes (Spec 132, Spec 138) are summarised inline.
- The "ask" at the end (§ 11) is what we want from you: a survey of prior art, alternative architectures, and concrete patterns from comparable systems (general-game-playing engines, Monte Carlo Tree Search libraries, constraint-satisfaction-based move generators, hidden-information game engines, etc.).

**You should treat this as a request for `state of the art` literature + open-source patterns**, not a request to write code we will paste in directly. We will integrate your findings ourselves against the actual codebase.

---

## 1. Executive Summary

LudoForge-LLM is a deterministic kernel engine that runs board/card games whose rules are encoded as YAML and compiled to a generic GameDef JSON. AI agents (`PolicyAgent`, `RandomAgent`, `GreedyAgent`) and a deterministic simulator interact with the kernel through a single contract: enumerate the legal moves in the current state, then pick one.

**The contract is broken in a specific corner**:

1. The kernel's **enumerator** (`enumerateLegalMoves`) emits a *classified move* `{ move, viability }`, where `viability.viable === true` and `viability.complete === false` for **template moves** that need additional decisions to be fully bound.
2. The kernel's **decision-sequence satisfiability classifier** (`classifyDecisionSequenceSatisfiability`) certifies the template as `satisfiable` (i.e., "at least one legal completion exists in the current state").
3. The agent's **sampler** (`preparePlayableMoves` → `evaluatePlayableMoveCandidate` → `completeTemplateMove`) draws a random completion and applies the policy's `choose` callback for guided downstream decisions, with a bounded retry budget (default `pendingTemplateCompletions + NOT_VIABLE_RETRY_CAP = 3 + 7 = 10` for `PolicyAgent`).
4. **For some `(state, move)` pairs the sampler exhausts its retries without finding a completion the classifier proved exists.** The agent throws an error. The simulator no longer catches it. The game ends with an uncaught exception.

In production this manifests as: a human player playing against an authored AI policy can have the entire match end mid-turn because the AI "could not derive a playable move" — even though the kernel says one exists.

**Two prior specs (132 and 138) addressed parts of this** but the gap persists. **The architectural question is**: what is the right pattern for guaranteeing that **every move enumerated as legal is constructible by the agent within a bounded number of operations**, without either (a) enumerating a combinatorial explosion of fully-bound moves up front, or (b) allowing random sampling failure to terminate the game?

---

## 2. Architectural Constraints (FOUNDATIONS.md, full quotes of relevant principles)

The repository ships with `docs/FOUNDATIONS.md` — **17 commandments** every spec, ticket, and implementation must align with. The relevant ones for this problem are quoted verbatim:

> **#1 Engine Agnosticism** — The kernel, compiler, and runtime SHALL NOT contain game-specific logic. All game behavior is encoded in GameSpecDoc YAML and compiled to GameDef JSON. The engine is a universal interpreter — it executes any well-formed GameDef without knowing what game it represents. **No hardcoded game-specific identifiers, branches, rule handlers, map definitions, scenario setup, or card payloads in engine code.**

> **#5 One Rules Protocol, Many Clients** — The simulator, web runner, and AI agents MUST all use the same action, legality, and event protocol. The kernel is the single source of truth for legal actions and state transitions. UI gestures map to generic actions; agents choose from the same legal action set; simulations advance through the same apply-action pipeline. **No UI-only rule paths, no simulation-only shortcuts, and no duplicated legality logic outside the kernel.**

> **#8 Determinism Is Sacred** — Same GameDef + same initial state + same seed + same actions = identical result. Always. No exceptions. The kernel is a pure, deterministic state machine. PRNG state lives in GameState and uses a specified exact algorithm. Execution MUST NOT depend on wall-clock time, system locale, object key order, hash-map/set iteration order, or any other ambient process state. All rule-authoritative numeric operations MUST be exact. State serialization round-trips must be canonical and bit-identical.

> **#10 Bounded Computation** — All iteration MUST be bounded. No general recursion. All choices MUST be finite and enumerable. `forEach` operates over finite collections. `repeat N` uses compile-time or validated runtime bounds. Trigger chains, reaction windows, and similar cascades are capped by configurable budgets. **Legal moves must be finitely listable and emitted in stable deterministic order — no free-text moves, no unbounded generation.** Mechanics emerge from composition of a small instruction set, not bespoke primitives.

> **#11 Immutability** — All state transitions MUST return new objects. Never mutate. Kernel effect handlers receive state and return new state. Use spread operators and immutable update patterns. The previous state is never modified — this enables determinism verification, undo/replay, and safe parallel reasoning about state.

> **#14 No Backwards Compatibility** — Do not keep compatibility shims in production code. When a change breaks existing contracts, migrate all owned artifacts in the same change and test thoroughly. No alias paths, deprecated fallbacks, compatibility wrappers, or `_legacy` suffixes in runtime or compiler code.

> **#15 Architectural Completeness** — Every change MUST be architecturally comprehensive. No hacks, no patches, no shortcuts. Solutions address root causes, not symptoms. If a problem reveals a design gap, the design is fixed — not papered over with a workaround.

> **#16 Testing as Proof** — Architectural properties MUST be proven through automated tests, not assumed. Compiler determinism is proven by compiling the same GameSpecDoc twice and asserting byte-identical GameDef. Runtime determinism is proven by replay tests that assert canonical serialized state equality. **Bugs are fixed through TDD: write the failing test first, then fix the code. Never adapt tests to preserve a bug.**

The Appendix in FOUNDATIONS adds:

> The determinism commandment (#8) is proven by the `packages/engine/test/determinism/` corpus: every test there asserts only engine-level invariants such as replay identity and bounded execution. **Failures in that corpus are engine bugs and block CI.** Convergence claims tied to a specific policy-profile variant are not engine invariants.

These principles **forbid** several "easy" fixes:

- Adding a FITL-specific predicate to filter the failing template (#1, #15).
- Increasing retry budgets to "make the failure rare" (#10, #15 — symptomatic).
- Adding a `try/catch` that swallows the error and returns a no-op move (#5, #15).
- Adding a deprecated stop reason for "agent gave up" (#5 — that violates the single-rules-protocol contract since enumeration claimed the move was legal).

---

## 3. The Pipeline End-to-End

There are three relevant subsystems. All are pure, deterministic, side-effect-free TypeScript. All live in `packages/engine/src/`.

### 3.1 Enumeration: `enumerateLegalMoves`

**File**: `packages/engine/src/kernel/legal-moves.ts`

Emits an array of `ClassifiedMove`:

```ts
interface ClassifiedMove {
  readonly move: Move;                        // The move (possibly partially-bound template)
  readonly viability: MoveViabilityProbeResult;
  readonly trustedMove?: TrustedExecutableMove; // Present only when viability.complete or stochastic
}
```

`viability` comes from `probeMoveViability(def, state, move, runtime)` and has shape:

```ts
type MoveViabilityProbeResult =
  | { viable: true; complete: true; move: Move; warnings: RuntimeWarning[]; ... }
  | { viable: true; complete: false; move: Move;
      nextDecision?: ChoicePendingRequest;     // The next pending decision in the sequence
      stochasticDecision?: ChoiceStochasticPendingRequest;
      warnings: RuntimeWarning[]; ... }
  | { viable: false; code: string; warnings: RuntimeWarning[]; ... }
```

For a "template move" (a free-operation like FITL's `march`) the typical case is `{viable: true, complete: false, nextDecision: chooseN{...}}`. The `chooseN` represents *"the player must pick between `min` and `max` items from a list of `options`."*

Inside `enumerateLegalMoves` there is also a **decision-sequence admission filter** at `legal-moves.ts:710`:

```ts
const decisionSequenceClassification = classifyMoveDecisionSequenceAdmissionForLegalMove(
  def, candidateState, candidateMove,
  MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE,
  { budgets: enumeration.budgets, onWarning: ..., profiler: ... },
);
if (decisionSequenceClassification === 'unsatisfiable') return false;
// 'satisfiable' or 'unknown' → admit
```

`'unknown'` (caused by budget exhaustion in the classifier) **admits** the move. Only `'unsatisfiable'` rejects it. This is a deliberate fail-open policy.

### 3.2 Classification: `classifyDecisionSequenceSatisfiability`

**File**: `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (323 lines, full file)

Recursive enumerative search over the decision tree. Returns:

```ts
type DecisionSequenceSatisfiability = 'satisfiable' | 'unsatisfiable' | 'unknown';

interface DecisionSequenceSatisfiabilityResult {
  readonly classification: DecisionSequenceSatisfiability;
  readonly warnings: readonly RuntimeWarning[];
  readonly canonicalViableHeadSelection?: MoveParamValue;  // Spec 138 addition
}
```

Algorithm (simplified):

```ts
function classifyFromMove(move: Move): DecisionSequenceSatisfiability {
  if (decisionProbeSteps >= budgets.maxDecisionProbeSteps) {
    emitWarning('MOVE_ENUM_DECISION_PROBE_STEP_BUDGET_EXCEEDED');
    return 'unknown';
  }
  decisionProbeSteps += 1;
  const request = discoverChoices(move);
  if (request.kind === 'complete')   return 'satisfiable';
  if (request.kind === 'illegal')    return 'unsatisfiable';
  if (request.kind === 'pendingStochastic') return 'unknown';
  return classifyFromRequest(move, request);
}

function classifyFromRequest(move: Move, request: ChoicePendingRequest) {
  let branchOutcome: DecisionSequenceSatisfiability = 'unsatisfiable';
  forEachDecisionSelection(request, selection => {
    paramExpansions += 1;
    if (paramExpansions > budgets.maxParamExpansions) {
      emitWarning('MOVE_ENUM_PARAM_EXPANSION_BUDGET_EXCEEDED');
      return false;  // Stop iteration
    }
    const outcome = classifyFromMove({...move, params: {...move.params, [request.decisionKey]: selection}});
    if (outcome === 'satisfiable') { branchOutcome = 'satisfiable'; return false; }
    if (outcome === 'unknown')     { branchOutcome = 'unknown';     return false; }
    return true;  // 'unsatisfiable' → keep searching
  });
  return branchOutcome;  // Or 'unknown' if param expansion exhausted
}
```

`forEachDecisionSelection` enumerates every legal selection for the request:

- **`chooseOne`**: each `value` in `request.options`.
- **`chooseN`**: every subset of `request.options` of size `[min, max]`. **This is combinatorial: `Σ_{k=min..max} C(|options|, k)`.**

Default budgets:

```ts
DEFAULT_MOVE_ENUMERATION_BUDGETS = {
  maxTemplates: 10_000,
  maxParamExpansions: 100_000,
  maxDecisionProbeSteps: 128,
  maxDeferredPredicates: 1_024,
  maxCompletionDecisions: 256,
};
```

Note `maxDecisionProbeSteps = 128`: the classifier visits at most 128 *nodes* in the decision tree before returning `'unknown'`. For deep trees (multiple sequential `chooseN` decisions), this is easily exhausted.

### 3.3 Completion: `completeTemplateMove`

**File**: `packages/engine/src/kernel/move-completion.ts` (389 lines)

Single-pass random sampler. Returns:

```ts
type TemplateCompletionResult =
  | { kind: 'completed'; move: Move; rng: Rng; firstOptionalChooseN?: ... }
  | { kind: 'structurallyUnsatisfiable' }
  | { kind: 'drawDeadEnd'; rng: Rng; optionalChooseN: ... }    // Same template, different RNG might succeed
  | { kind: 'stochasticUnresolved'; move: Move; rng: Rng; ... };
```

Algorithm:

```ts
function completeTemplateMoveInternal(...) {
  let cursor = rng;
  const choose = (request: ChoicePendingRequest) => {
    if (++iterations > maxDecisions) { exceeded = true; return undefined; }
    const guidedSelection = options?.choose?.(request);  // Policy or external chooser
    if (guidedSelection !== undefined) return guidedSelection;
    return chooseAtRandom(request);                       // Uniform random over options
  };
  const result = completeMoveDecisionSequence(def, state, templateMove, { choose, chooseStochastic }, runtime);
  // → returns `complete: true`, `nextDecision: ...`, `illegal: ...`, etc.
  // → throws CHOICE_RUNTIME_VALIDATION_FAILED if a randomly chosen value is rejected by validation
}
```

If the random draw produces a value that is per-option legal but violates a downstream invariant, the kernel throws `CHOICE_RUNTIME_VALIDATION_FAILED`. The completion catches this and returns `kind: 'drawDeadEnd'`.

### 3.4 Agent Sampler: `preparePlayableMoves`

**File**: `packages/engine/src/agents/prepare-playable-moves.ts` (476 lines)

Orchestrates retries:

```ts
function attemptTemplateCompletion(...) {
  for (let attempt = 0; attempt < pendingTemplateCompletions + notViableRetries; attempt++) {
    const [attemptRng, retryRng] = fork(currentRng);
    const attemptChoose = guidedSelection
      ? buildCanonicalGuidedChoose(guidedDecisionKey, guidedSelection, choose)  // Spec 138
      : choose;
    const result = evaluatePlayableMoveCandidate(def, state, move, attemptRng, runtime, {
      ...(attemptChoose && { choose: attemptChoose }),
      ...(retryBiasNonEmpty && { retryBiasNonEmpty: true }),
    });
    if (result.kind === 'playableComplete') { /* success */ break; }
    if (result.kind === 'playableStochastic') { /* success */ break; }
    rejection = result.rejection;  // 'notViable' | 'drawDeadEnd' | 'structurallyUnsatisfiable' | 'notDecisionComplete'
    if (rejection === 'notViable' || rejection === 'drawDeadEnd') {
      maybeActivateGuidance();   // Calls classifier with emitCanonicalViableHeadSelection: true
    }
    if (rejection === 'structurallyUnsatisfiable') break;
    if ((rejection === 'notViable' || rejection === 'drawDeadEnd') &&
        notViableRetries < NOT_VIABLE_RETRY_CAP /* = 7 */) {
      notViableRetries += 1;
    }
  }
}
```

If all retries fail and no guided head selection helped, `completedMoves` and `stochasticMoves` are both empty. The agent then throws:

```ts
// random-agent.ts:30
throw new Error(
  `RandomAgent could not derive a playable move from ${input.legalMoves.length} classified legal move(s).`,
);
// policy-agent.ts:134
throw new Error(
  `PolicyAgent could not derive a playable move from ${input.legalMoves.length} classified legal move(s).`,
);
```

The simulator (`packages/engine/src/sim/simulator.ts`) **does not catch this error** — Spec 138 deleted the catch as part of its "the failure is unreachable" claim. The error propagates to the test runner, the runtime, the worker bridge.

---

## 4. The Concrete CI Failures (2026-04-19)

Branch `implemented-spec-138`, PR #221. Two CI workflows fail:

### 4.1 `Engine Determinism Parity`

**Test**: `packages/engine/test/determinism/zobrist-incremental-parity.test.ts`

```ts
describe('Zobrist incremental parity — FITL', () => {
  const FITL_SEEDS = [42, 123];
  for (const seed of FITL_SEEDS) {
    it(`seed=${seed}: incremental hash matches full recompute every move`, () => {
      const agents = createRandomAgents(4);  // 4 × RandomAgent
      const trace = runGame(def, seed, agents, 200, 4, { kernel: { verifyIncrementalHash: true } }, runtime);
      assert.ok(trace.moves.length > 0, ...);
    });
  }
});
```

**Failure on seed 123**: `Error: RandomAgent could not derive a playable move from 1 classified legal move(s).`

### 4.2 `Engine FITL Rules`

**Test**: `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts`

```ts
const CANARY_SEEDS = [1002, 1005, 1010, 1013];
const POLICY_PROFILE_VARIANTS = [
  ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'],
  ['us-baseline', 'arvn-evolved',  'nva-baseline', 'vc-baseline'],
];
const ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'noLegalMoves']);
// for each (profiles, seed):
//   const agents = profiles.map(id => new PolicyAgent({profileId: id, traceLevel: 'summary'}));
//   const trace = runGame(...);
//   assert.ok(ALLOWED_STOP_REASONS.has(trace.stopReason), ...);
```

**Failures**:
- `profiles=us-baseline,arvn-evolved,nva-baseline,vc-baseline seed=1002`: `Error: PolicyAgent could not derive a playable move from 3 classified legal move(s).`
- `profiles=us-baseline,arvn-evolved,nva-baseline,vc-baseline seed=1010`: `Error: PolicyAgent could not derive a playable move from 1 classified legal move(s).`

The `arvn-baseline` profile passes; `arvn-evolved` fails. Same seed, different policy weights. This shows the failure depends on the **interaction** between policy weights and random sampler, not just on the kernel state.

### 4.3 What the previous behaviour was

Before Spec 138 (on `main`):

- The agent threw a typed `NoPlayableMovesAfterPreparationError`.
- The simulator caught it and set `stopReason = 'noPlayableMoveCompletion'`.
- Tests accepted that as a valid bounded outcome.
- A `DegeneracyFlag.NO_PLAYABLE_MOVE_COMPLETION` was emitted in evaluation reports.

Spec 138 deleted all four of those (the typed error, the catch, the union member, the flag). Its goal G4 stated: *"The simulator stop reason `noPlayableMoveCompletion`, the `NoPlayableMovesAfterPreparationError` class, and the `DegeneracyFlag.NO_PLAYABLE_MOVE_COMPLETION` enum value become unreachable for any spec that passes compilation and validation. Per Foundation #14 they are deleted in the same change."*

That goal is **empirically false**: the path is still reachable. Restoring the stop reason was rejected by the user as defeating the spec's purpose — **the architectural problem must be solved, not labeled.**

---

## 5. Detailed Diagnostic of the Failing Cases (Spec 138 § Problem Statement)

For FITL seeds 1002 and 1010 (NVA `march` template), Spec 138's investigation captured:

```
Active player: NVA baseline profile
Legal moves: [march(freeOp=true, params={})] × N (N=1 on seed 1010, N=3 on seed 1002)
            all reporting viability.viable=true, complete=false
preparePlayableMoves output:
   completedMoves=0, stochasticMoves=0, templateCompletionAttempts=10,
   templateCompletionSuccesses=0, outcome="failed", rejection="drawDeadEnd"
probeMoveViability:
   viable=true, complete=false, stochasticDecision=false
completeMoveDecisionSequence with identity chooser:
   complete=false, illegal=false, first pending head = chooseN{min:1, max:27, optionCount:27}
completeTemplateMove with random chooser, 10 attempts:
   all 10 trip CHOICE_RUNTIME_VALIDATION_FAILED or resolve to 'illegal' at a later decision step
classifyMoveDecisionSequenceAdmissionForLegalMove:
   verdict = "satisfiable" × 3, no probe-step warnings
```

So:

- **Enumeration says the move is legal.**
- **The classifier proves at least one head selection leads to a complete legal trajectory (within the 128-step probe-step budget).**
- **Random sampling over `chooseN{min:1, max:27}` × downstream decisions misses the legal subset entirely in 10 attempts.**

The combinatorial size of the head: `Σ_{k=1..27} C(27, k) = 2^27 − 1 ≈ 134 million selections`. The legal subset is *some* subset of that. We do not know its size, but the random sampler's effective coverage in 10 attempts is `10 / 134M ≈ 7.5e-8`. If the legal subset is, say, 1000 selections, the hit probability per attempt is `7.5e-6`; in 10 attempts, ~`7.5e-5`. The miss is not a low-probability tail event — it is the modal outcome.

---

## 6. Spec 132 (First Attempt, Archived 2026-04-17)

**Title**: *Reconcile Viable-Move Enumeration With Template-Completion Outcomes*

**Diagnosis**: For some `(state, move)` pairs, `enumerateLegalMoves` returned `viable=true` while `probeMoveViability` (called fresh on the same inputs) returned `viable=false, code=ILLEGAL_MOVE`. The two viability paths disagreed.

**Fixes landed**:
1. **S1**: Unified the viability predicate into a single shared function so enumeration and probe always agree.
2. **S2**: Split the previous monolithic `completionUnsatisfiable` rejection into:
   - `structurallyUnsatisfiable`: empty options at top level, `min > max`, or budget exhausted → terminates retry loop.
   - `drawDeadEnd`: a randomly chosen path was illegal downstream → retry-eligible up to `NOT_VIABLE_RETRY_CAP = 7`.
3. **S3**: Deleted the `'agentStuck'` stop reason since the new contract was supposed to make it unreachable.
4. Replaced it with `'noPlayableMoveCompletion'` for residual cases, which Spec 138 then deleted.

**Why Spec 132 was insufficient**: It addressed the *enumerate-vs-probe* disagreement (the kernel's two viability paths) but did **not** address the *enumerate-vs-sample* disagreement (the kernel's "satisfiable" verdict vs. the sampler's miss). The retry budget extension helps when the legal subset is dense; it does not help when the subset is sparse in a combinatorially large head.

---

## 7. Spec 138 (Second Attempt, This PR, Archived 2026-04-19)

**Title**: *Guided Completion From Enumerate-Time Satisfiability*

**Diagnosis**: The classifier proves a satisfying head selection exists but throws away the witness. The sampler then re-discovers it by chance. Foundation #5 (one rules protocol) is violated because two algorithms compute the same property and disagree.

**Fix landed**:
1. **D1–D4**: Extended `classifyDecisionSequenceSatisfiability` with an opt-in `emitCanonicalViableHeadSelection: true` mode. When the head is a `chooseN`, the classifier walks options in canonical order and remembers the first selection whose downstream recursion returns `'satisfiable'`. Result shape adds:
    ```ts
    canonicalViableHeadSelection?: MoveParamValue;
    ```
2. **D5**: After a sampled `drawDeadEnd` / `notViable` miss in the agent's retry loop, `attemptTemplateCompletion` re-invokes the classifier with `emitCanonicalViableHeadSelection: true`. If a head selection is returned, subsequent retries use a `buildCanonicalGuidedChoose` callback that **forces the head to that selection** but leaves all downstream decisions to the existing chooser (random or policy-driven).
3. **D6**: Renamed any residual failure as a `RuntimeWarning` with code `GUIDED_COMPLETION_UNEXPECTED_MISS` carrying `{actionId, stateHash, attemptCount, subsetSize}`. Per the spec, this was supposed to be a *bug signal*, not a recoverable game state.
4. **G4**: Deleted `noPlayableMoveCompletion` stop reason, `NoPlayableMovesAfterPreparationError`, `DegeneracyFlag.NO_PLAYABLE_MOVE_COMPLETION`, and the simulator catch — all in the same change. Spec 138 stated these became *"unreachable for any spec that passes compilation and validation."*

**Boundary correction in Spec 138** (verbatim, important):

> Live implementation of `138ENUTIMTEM-003` invalidated the draft's Phase 1 assumption that the failing heads could be modeled as true single-pick `chooseN` requests. On 2026-04-19, re-running [the diagnostic] showed the still-failing `march` template's first pending head as `chooseN{min:1, max:27, optionCount:27}`. That means the scalar `viableHeadSubset` contract from `138ENUTIMTEM-002` is sufficient only for genuine single-pick heads; it is not expressive enough for the live multi-pick witness.

So the spec-138 author already knew the head was `min:1, max:27`. The implemented "canonical satisfiable head selection" returns *one* selection (e.g., the first option chosen alone — `[option_0]`). The sampler's downstream decisions remain random.

**Why Spec 138 is insufficient**:

- For `arvn-baseline` profile: the canonical head selection happens to lead to a legal completion under the policy's downstream chooser. Tests pass.
- For `arvn-evolved` profile: the canonical head selection does NOT lead to a legal completion under the *evolved* policy's downstream chooser. The guided retry still misses. The agent throws.
- For `RandomAgent` (no policy chooser): the head is fixed but downstream is fully random; for sparse downstream legal subsets, this still misses. (FITL seed 123 case.)

**The unresolved gap is**: guidance must extend to the FULL completion path, not just the first decision — but extending it must respect Foundation #10 (bounded computation) and Foundation #8 (determinism, including replay-identity for unaffected seeds).

---

## 8. The Architectural Question (the actual ask)

> **How does a generic, deterministic, game-agnostic kernel guarantee that every move it admits as legal is constructible by an agent within a bounded number of operations, when "legality" is decided by a recursive decision-tree satisfiability classifier and "construction" is currently done by random sampling with bounded retries?**

The system has these properties that constrain the design space:

| Constraint | Source | Implication |
|---|---|---|
| Engine-agnostic | Foundation #1 | No FITL/Texas-specific code in fix |
| One source of truth for legality | Foundation #5 | Enumerator, probe, classifier, sampler must agree |
| Deterministic | Foundation #8 | No wall-clock, no hash-iteration order; same `(state, seed) → same result` |
| Bounded computation | Foundation #10 | No unbounded retries, no "raise the budget until it works" |
| Replay-identity must hold | Spec 138 G6 | Seeds whose unguided path already succeeds MUST produce byte-identical traces |
| Multi-pick chooseN in scope | Spec 138 boundary correction | Head can be `chooseN{min:1, max:27, options:27}`, downstream can also have chooseN |
| Policies are extensible | Agent system | Solution must work for `RandomAgent`, `PolicyAgent` (scoring-based), and future agents |
| Hidden-information ready | Foundation #4 | Solution must work when agent's state view is masked |

### 8.1 Possible architectural directions (we want your evaluation of each + others)

We have brainstormed but not committed to any of these. Please survey the literature and assess each, propose alternatives, and identify which (if any) match production patterns from comparable systems.

**Direction A — Eager full enumeration**: At enumeration time, expand each template to a finite list of fully-bound concrete moves. The agent never sees a template; it picks from concrete moves. This is what classical chess/checkers/go engines do.
- **Pros**: Trivially constructible. Sampler unnecessary.
- **Cons**: For multi-pick chooseN with `max=27, options=27`, the expansion is `2^27 ≈ 134M`. Catastrophic memory. Foundation #10 budgets force truncation, which silently drops legal moves.
- **Open question**: Is there a *symbolic* representation of the move set that defers enumeration but supports random + uniform-distributed access?

**Direction B — Witness-producing classifier**: Make the classifier emit a *full* completion witness (the entire decision-path assignment), not just the head. The agent uses the witness as a guaranteed-fallback.
- **Pros**: Closes Foundation #5 (classifier and sampler share a single artifact). Spec 138 already does this for the head; the gap is extending it downstream.
- **Cons**: Witness extraction may itself blow the `maxParamExpansions` budget if the legal trajectory threads many narrow branches. Witness becomes the de facto "policy" for that turn, eliminating sampling diversity.
- **Open question**: What patterns exist in the *constraint-satisfaction* / *SAT-modulo-theories* world for witness-producing decision procedures with partial-witness fallback?

**Direction C — Constraint propagation / forward checking**: Before emission, apply AC-3 / forward-checking to the decision tree to reduce per-decision domains to legality-consistent subsets. The sampler then samples uniformly from arc-consistent subsets.
- **Pros**: Random sampling becomes correct-by-construction once domains are arc-consistent.
- **Cons**: Implementation complexity. Each `chooseN` decision has structurally complex options (zone properties, predicate filters, cross-decision bindings). Arc consistency over this is nontrivial.
- **Open question**: Are there general-game-playing engines (e.g., GDL, Ludii) that use CSP-style move generators in production?

**Direction D — Sampling-importance-resampling (SIR) / proposal-correction**: The sampler proposes a completion uniformly; if rejected, re-weight and resample with an importance distribution biased toward legal subspaces. Use the classifier's per-option legality marks as the importance weights.
- **Pros**: Probabilistic guarantee of convergence (in expectation).
- **Cons**: Foundation #8 needs *exact* determinism, not "almost surely." Importance-weighted retry is still random retry, just smarter — Foundation #10 cap remains.
- **Open question**: Can a deterministic SIR variant work here? What does the MCTS literature say about deterministic, bounded, complete move generation?

**Direction E — Always-emit-a-completion contract**: Every emitted `ClassifiedMove` carries a precomputed complete `Move` (not just a viability verdict). The agent can refuse the precomputed completion and try its own, but a default always exists.
- **Pros**: Foundation #5 satisfied trivially. Foundation #10 honored because the precomputation reuses the classifier's bounded recursion.
- **Cons**: Same downstream-budget issue as B. May change determinism for currently-passing seeds (the precomputed completion replaces the previous random first-attempt, even when that random first-attempt would have succeeded and produced a different bound move — Spec 138 G6 violation).
- **Open question**: Is there a way to compute the witness without consuming the agent's RNG? (Yes — the classifier is RNG-free. But the agent currently reads RNG even on success, so making the witness deterministic *and* preserving replay-identity is subtle.)

**Direction F — Lazy enumeration with reservoir sampling**: Treat the implicit move set as an iterator; the agent draws via reservoir sampling. The kernel guarantees the iterator yields at least one element if the classifier says satisfiable.
- **Pros**: Memory-bounded. Random access via reservoir is uniform. Pairs naturally with classifier's existing recursion.
- **Cons**: Same budget concern; the iterator's `next()` may itself exhaust budget before yielding.

### 8.2 What we want from you, the external research

For each direction (and others you propose):

1. **Prior art**: production systems that use this pattern. We are particularly interested in:
   - General Game Playing engines (Ludii, Deep Game Engine, GGP-Base).
   - Open-source board game engines for asymmetric/CDG (card-driven games) like *Fire in the Lake* itself, *Twilight Struggle* engines, or *Wars of the Roses* engines.
   - Constraint-based move generators in puzzle solvers (Sudoku, Picross, Slitherlink) with multi-choice constraints.
   - SAT/SMT solvers with witness production (Z3, CVC5, MiniSAT).
   - Lazy / streaming move generators in MCTS frameworks.
2. **Theoretical framing**: which formalisms apply (CSP, constraint programming, game-tree search, witness-producing decision procedures, partial-information games)?
3. **Trade-off analysis**: under our constraints (bounded recursion, byte-identical replay, no game-specific code), which directions are viable?
4. **Concrete patterns** (pseudo-code or paper references) we should consider implementing.
5. **Anti-patterns**: things that look attractive but are known to fail in similar systems.

---

## 9. Reproduction & File Map

The repository is at `https://github.com/joeloverbeck/ludoforge-llm`. Branch with the failures: `implemented-spec-138`. PR: `#221`.

### 9.1 Reproducing the failure locally

```bash
pnpm install
pnpm turbo build
node --test --test-timeout=600000 \
  packages/engine/dist/test/determinism/zobrist-incremental-parity.test.js
# ✖ Zobrist incremental parity — FITL → seed=123: RandomAgent could not derive a playable move from 1 classified legal move(s).

node --test --test-timeout=600000 \
  packages/engine/dist/test/integration/fitl-canary-bounded-termination.test.js
# ✖ profiles=...,arvn-evolved,...  seed=1002 / seed=1010: PolicyAgent could not derive a playable move
```

For deeper diagnostic of the FITL `march` template:

```bash
node campaigns/fitl-arvn-agent-evolution/diagnose-existing-classifier.mjs --seed 1010 --max-turns 200
node campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs --seed 1010 --max-turns 200
```

### 9.2 File map (key implementations)

```
packages/engine/src/
├── kernel/
│   ├── legal-moves.ts                        ─ Enumerator (1461 lines). Calls probeMoveViability + classifier.
│   ├── decision-sequence-satisfiability.ts   ─ Classifier (323 lines). Recursive enumerative search.
│   ├── move-decision-sequence.ts             ─ Wraps the classifier with state context (238 lines).
│   ├── move-completion.ts                    ─ Sampler entry (389 lines). completeTemplateMove + retry adapters.
│   ├── move-decision-completion.ts           ─ Lower-level: completeMoveDecisionSequence (request-by-request).
│   ├── move-legality-predicate.ts            ─ Shared viability predicate from Spec 132 (136 lines).
│   ├── playable-candidate.ts                 ─ evaluatePlayableMoveCandidate: combines completer + admissibility.
│   ├── move-enumeration-budgets.ts           ─ Budget constants.
│   └── choose-n-option-resolution.ts         ─ Existing per-option witness search for chooseN labelling.
├── agents/
│   ├── prepare-playable-moves.ts             ─ The retry loop + maybeActivateGuidance (476 lines).
│   ├── random-agent.ts                       ─ Throws on empty completedMoves (47 lines).
│   ├── policy-agent.ts                       ─ Throws on empty playableMoves (332 lines).
│   ├── greedy-agent.ts                       ─ Same throw shape.
│   └── completion-guidance-choice.ts         ─ Policy-driven chooser (used by PolicyAgent) (124 lines).
└── sim/
    └── simulator.ts                          ─ runGame loop. No catch around agent.chooseMove.
```

### 9.3 Foundation tests that block CI

```
packages/engine/test/determinism/zobrist-incremental-parity.test.ts
packages/engine/test/integration/fitl-canary-bounded-termination.test.ts
```

### 9.4 Adjacent tests for context

```
packages/engine/test/integration/prepare-playable-moves-guided-convergence.test.ts
packages/engine/test/integration/fitl-seed-guided-classifier-coverage.test.ts
packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts
packages/engine/test/performance/spec-138-guided-classifier-overhead.test.ts
```

---

## 10. Glossary (terms used here, with their kernel meaning)

| Term | Meaning |
|---|---|
| **GameDef** | Compiled, immutable, validated rule artifact (JSON). |
| **GameState** | Pure data: zones, tokens, markers, RNG state, turn-flow state, hash. |
| **Move** | A partially-or-fully bound action invocation: `{actionId, params, ...}`. |
| **Template move** | A `Move` whose `params` are not yet fully bound; needs additional decisions. |
| **`viability`** | Result of `probeMoveViability`. Tells you if the move is legal AND complete. |
| **`complete`** | Move is fully bound; can be applied directly. |
| **`viable, !complete`** | Move is legal in principle but needs more decisions. Has a `nextDecision`. |
| **`ChoicePendingRequest`** | A request from the kernel for the agent/sampler to make a decision. Variants: `chooseOne` (pick 1 from a list), `chooseN{min, max}` (pick a subset). |
| **`chooseN{min:1, max:27, options:27}`** | Pick between 1 and 27 elements from a list of 27. Combinatorial space `2^27`. |
| **decision tree** | The full recursion of pending decisions: each `chooseN`/`chooseOne` may unlock further pending decisions, conditional on the choice. |
| **Satisfiability classifier** | Pure function: given `(def, state, move)`, returns whether at least one fully-bound legal completion exists. |
| **`canonicalViableHeadSelection`** | Spec 138: the first head selection found by the classifier whose downstream subtree is `satisfiable`. |
| **Sampler / completer** | Agent-side function that draws a random completion. |
| **`drawDeadEnd`** | Sampler outcome: this random path was illegal, but a different draw might succeed. Retry-eligible. |
| **`structurallyUnsatisfiable`** | Sampler outcome: provably no legal completion. Terminate retry. |
| **`NOT_VIABLE_RETRY_CAP = 7`** | Hard cap on extra sampler retries beyond the policy's `pendingTemplateCompletions`. |
| **Foundation #N** | Reference to numbered commandment in `docs/FOUNDATIONS.md` (quoted verbatim in §2 above). |

---

## 11. Concrete Asks (deliverables we want from you)

A. **Survey of prior art**: 5–10 citations of how comparable systems (game engines, CSP solvers, MCTS frameworks, GDL/GGP runtimes) handle the *enumerate-emits-templates / sampler-resolves-templates* pattern. For each, note whether they use (i) eager full enumeration, (ii) witness-producing classification, (iii) constraint propagation, (iv) lazy iteration, or (v) something else.

B. **Cross-section of design choices**: for each of directions A–F (and any you propose), evaluate against our constraints in §8 and assign a viability rating with reasoning. Identify which direction the literature most strongly supports for our specific shape (deterministic, bounded, generic, replay-stable, multi-pick `chooseN`-heavy decision trees).

C. **Specific implementation patterns**: pseudocode or paper references for the most promising direction. We want concrete *algorithms*, not just architecture talk. Examples: AC-3 with non-binary constraints; bounded best-first search with witness caching; the SAT solver "model extraction" pattern after a satisfiability check; deterministic reservoir sampling with rejection bounds.

D. **Failure modes in production**: for each pattern, what goes wrong in real systems? E.g., AC-3 and large CSP propagation cost; eager enumeration and combinatorial explosion in card-driven games; witness extraction and Foundation-#10-style budget exhaustion.

E. **A recommended path forward**: given (A)–(D), a single top recommendation we should prototype, with the smallest-possible-change architectural sketch that fits our pipeline (§3) and respects FOUNDATIONS (§2).

---

## 12. Notes for Your Research

- The repo's primary test game is *Fire in the Lake* (a 4-player COIN-series counterinsurgency wargame with cards, asymmetric factions, and complex per-faction operations). The other test game is Texas Hold'em. Both are encoded entirely in YAML compiled to GameDef. The engine itself contains zero game-specific identifiers (Foundation #1).
- The kernel's PRNG is deterministic (xoshiro-family). RNG state lives inside `GameState`. Sampler RNG advance is part of the canonical state hash. Any solution that consumes RNG for completion changes the byte-identical replay contract for currently-passing seeds (Spec 138 G6).
- We cannot use `eval`, plugins, or runtime-generated code (Foundation #7).
- We cannot use generic recursion in the kernel; iteration must be bounded (Foundation #10).
- The spec-138 work that landed includes useful infrastructure (the opt-in `emitCanonicalViableHeadSelection` mode in the classifier, the `buildCanonicalGuidedChoose` callback in the sampler, `GUIDED_COMPLETION_UNEXPECTED_MISS` runtime warnings). A successful direction probably *extends* this rather than replacing it.
- Existing in-repo precedent: `packages/engine/src/kernel/choose-n-option-resolution.ts` already implements a *bounded witness search* (`runWitnessSearch`) but at the per-option labelling level (deciding whether each individual option in a `chooseN` is "legal in some completion") — not at the full template-completion level. This shows the team is comfortable with bounded DFS witness search; the gap is composing per-option witnesses into a full-completion witness while respecting budgets.

---

## 13. Appendix: Verbatim error messages from CI

```
Engine Determinism Parity / determinism / Run pnpm -F @ludoforge/engine test:determinism

  ▶ Zobrist incremental parity — FITL
    ✔ seed=42: incremental hash matches full recompute every move (6005ms)
    ✖ seed=123: incremental hash matches full recompute every move (6442ms)
  ✖ Zobrist incremental parity — FITL (12448ms)

  Error: RandomAgent could not derive a playable move from 1 classified legal move(s).
       at RandomAgent.chooseMove (random-agent.js:24:19)
       at runGame (simulator.js:74:30)
       at TestContext (zobrist-incremental-parity.test.js:55:27)
```

```
Engine FITL Rules / engine-fitl-rules / Run pnpm -F @ludoforge/engine test:integration:fitl-rules

  ✖ profiles=us-baseline,arvn-evolved,nva-baseline,vc-baseline seed=1002:
      bounded stop and population-0 neutrality (48533ms)
    Error: PolicyAgent could not derive a playable move from 3 classified legal move(s).
         at PolicyAgent.chooseMove (policy-agent.js:99:19)
         at runGame (simulator.js:74:30)
         at TestContext (fitl-canary-bounded-termination.test.js:47:31)

  ✖ profiles=us-baseline,arvn-evolved,nva-baseline,vc-baseline seed=1010:
      bounded stop and population-0 neutrality (26081ms)
    Error: PolicyAgent could not derive a playable move from 1 classified legal move(s).
         at PolicyAgent.chooseMove (policy-agent.js:99:19)
         at runGame (simulator.js:74:30)
         at TestContext (fitl-canary-bounded-termination.test.js:47:31)
```

— end of report —
