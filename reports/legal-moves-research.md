# Proposed Changes: Make Constructibility Part of Legality

## Executive judgment

The current contract is wrong.

Right now the engine treats a move as “legal” when the classifier can prove that **some** completion exists somewhere in the decision tree. But the agent is then asked to find that completion by bounded random sampling. That creates pseudo-legal moves: moves that are satisfiable in theory but not constructible under the actual client protocol.

That is the bug.

Spec 138 fixed the first branch choice. The real fix is stricter: **client-visible legality must imply bounded constructibility**.

A move exposed to an agent must be one of these:

1. already complete;
2. explicitly stochastic in a kernel-owned stochastic node; or
3. incomplete, but accompanied by a kernel-produced completion certificate.

Anything else is not a legal move. It is an internal search state.

## What prior art says

Comparable systems cluster into three patterns.

### 1. Explicit legal action frontiers

Mainstream game/RL frameworks expose concrete legal actions or masks at the current state. They do not expose “there exists a completion; go sample it” objects.

### 2. Split composite turns into smaller kernel-owned decisions

For games where one human-visible turn contains multiple contingent choices, the strongest prior art is split moves: restructure the tree so those choices become first-class internal decision states. That keeps the protocol honest without requiring eager expansion of every end-of-turn concretization.

### 3. Witness-producing decision procedures

SAT/SMT and CP do not separate satisfiability from construction. A satisfiable search returns, or at least supports extraction of, a model/witness. CP then strengthens this with propagation, support maintenance, and nogood recording.

That is the right mental model for your classifier.

## Top recommendation

Adopt a **certificate-carrying legality contract** now, and treat **split decision states** as the long-term end-state architecture.

In plain English:

- the kernel may still enumerate templates;
- but an incomplete template is not client-visible legal unless the kernel can also provide a deterministic completion certificate produced by the same bounded search that established satisfiability;
- agent-side completion becomes optional optimization for diversity or policy quality, never the authority that determines whether the move is actually playable;
- any reachable `unknown` on a player-decision path is not admissible legality. It is either an engine defect, a budget defect, or a sign that the move must be reified as split kernel decisions.

This is the smallest principled change that actually closes the gap.

## Concrete architectural changes

### 1. Replace tri-state admission with constructible admission

Today the effective admission rule is:

- admit `complete`;
- admit `satisfiable`;
- admit `unknown`.

That is architecturally unsound for client-facing legality.

Change it to:

- admit `complete`;
- admit `stochastic` only when the stochastic continuation is explicit and kernel-owned;
- admit `template` only if `classification === satisfiable` **and** a `CompletionCertificate` exists;
- do not admit `unknown`.

`unknown` may remain an internal search result. It must not become a public legal-move verdict.

### 2. Extend Spec 138 from head guidance to full-path certification

Keep the useful part of Spec 138: the classifier already knows something the sampler does not.

But stop returning only `canonicalViableHeadSelection`. That artifact is too weak and too brittle. A single safe head says nothing about downstream policy choices.

Return a full path artifact instead:

- `fullWitness`: an ordered assignment for every decision needed to finish the move;
- later, optionally, `supportDag`: a pruned decision DAG containing only satisfiable continuations.

Phase 1 can be just `fullWitness`. That is enough to guarantee completion.
Phase 2 can generalize it into `supportDag` so policies still have meaningful choice inside the safe subspace.

### 3. Promote the kernel artifact, demote the sampler

Change the authority boundary.

- The classifier/searcher decides whether a template is constructible.
- The agent may try its own completion strategy first.
- On the first dead-end, the agent materializes the certificate-backed completion.
- The retry loop is no longer a correctness mechanism. At most it is a diversity mechanism.

Right now retries are pretending to be correctness. They are not.

### 4. Introduce `CompletionCertificate`

Give incomplete admitted moves a kernel-owned artifact with these semantics:

- canonical and RNG-free;
- derived from the same state/view used for legality;
- sufficient to materialize a fully bound `Move` without further search;
- replay-stable;
- serializable for deterministic tests and diagnostics.

Minimal version:

- decision sequence: ordered `[decisionKey -> selection]`;
- terminal bound move;
- budget/warning metadata.

Stronger version:

- supported selections per pending request;
- failed-prefix nogoods;
- child certificates or lazy child references.

### 5. Add memoization and nogood recording to search

The current classifier is still too close to blind DFS.

Borrow standard CP/SAT machinery:

- memoize `(projectedStateHash, actionId, normalized partial binding, pending-request fingerprint) -> sat/unsat/unknown/witness`;
- record failed prefixes as nogoods;
- reuse successful suffixes;
- short-circuit repeated subtrees.

Without this, full-path witness search will burn budget rediscovering the same dead prefixes.

### 6. Handle `chooseN` as a set-variable problem, not as raw subset enumeration

Your `chooseN{min:1,max:27,options:27}` case is exactly where raw subset enumeration becomes the wrong abstraction.

Treat `chooseN` as a bounded set variable:

- `lb`: elements that must be included;
- `ub`: elements that may still be included;
- cardinality constraint `min <= |S| <= max`.

Then run support tests and propagation:

- if “include x” has no support, remove `x` from `ub`;
- if “exclude x” has no support, add `x` to `lb`;
- propagate cardinality:
  - `|lb| > max` => unsat;
  - `|ub| < min` => unsat;
  - `|lb| == max` => exclude all others;
  - `|ub| == min` => include all others.

Only then branch.

This is where your existing `choose-n-option-resolution.ts` work becomes important: it already proves the team is comfortable with bounded witness search. Generalize that into full completion certification.

### 7. Respect hidden information by certifying against the same view that established legality

Do not let certificate generation peek behind the mask.

If legality is defined relative to a projected state, certificate search must use that same projected state. If a later contingent choice depends on a reveal/chance boundary or hidden information update, split there:

- explicit chance node;
- explicit reveal / observation update;
- then continue the decision chain.

Do not smuggle omniscience into the certificate.

### 8. Preserve replay identity for currently passing seeds

This part is straightforward if you are disciplined:

- certificate search must not advance `GameState` RNG;
- for already-passing seeds, keep the current first-attempt behavior;
- only invoke certificate materialization after the existing strategy hits a dead-end;
- therefore unaffected seeds remain byte-identical;
- failing seeds stop crashing and now deterministically use the fallback.

That is the right compatibility target under your foundations.

## Algorithm sketch

You need one deterministic bounded search that can return both a verdict and a witness.

    search(move, ctx):
      if budgetExceeded(ctx):
        return Unknown

      key = memoKey(ctx.projectedStateHash, move.actionId, normalize(move.params))
      if memo has key:
        return memo[key]

      probe = probeMoveViability(move, ctx)

      if probe is complete:
        result = Sat(certificate = [])
        memo[key] = result
        return result

      if probe is illegal:
        result = Unsat
        memo[key] = result
        return result

      if probe is stochasticPending:
        return ExplicitStochasticNode or Unknown

      request = probe.nextDecision
      supported = supportedSelections(request, move, ctx)

      if supported is empty:
        result = Unsat
        memo[key] = result
        return result

      for selection in canonicalOrder(supported):
        child = bind(move, request.decisionKey, selection)
        r = search(child, ctx.child())
        if r is Sat:
          result = Sat(certificate = [request.decisionKey -> selection] + r.certificate)
          memo[key] = result
          return result
        recordNogood(key, selection, r)

      result = foldChildrenIntoUnsatOrUnknown(...)
      memo[key] = result
      return result

For `chooseN`, `supportedSelections()` should not mean “enumerate every subset first”. It should mean:

1. initialize `lb` and `ub`;
2. run include/exclude support checks per option with memoization;
3. apply cardinality propagation;
4. branch on the most constrained remaining choice;
5. stop as soon as one full witness exists.

That gives you a full witness without demanding eager expansion of the full powerset.

## Direction-by-direction verdict

| Direction | Verdict | Why |
|---|---|---|
| A. Eager full enumeration | **Not viable** | Fine for chess-like action frontiers. Dead on arrival for large `chooseN` heads. |
| B. Witness-producing classifier | **Best near-term choice** | Matches solver practice and extends your current architecture with the smallest principled change. |
| C. Constraint propagation / forward checking | **Necessary technique, not the whole answer** | Use it inside B, especially for `chooseN`, but propagation alone does not guarantee a full completion. |
| D. SIR / proposal correction | **Not viable** | Still a probabilistic correctness story. Your foundations require guaranteed bounded constructibility, not “better odds”. |
| E. Always-emit-a-completion | **Viable only if interpreted as fallback certificate** | Good if the precomputed completion is a guaranteed fallback. Bad if it replaces all policy choice unconditionally. |
| F. Lazy enumeration + reservoir sampling | **Not viable as legality authority** | Acceptable only for non-authoritative sampling over an already safe space. |
| G. Split decision states (new direction) | **Best long-term architecture** | This is what the problem really wants. It removes the template/completion split entirely. |

## Anti-patterns to reject

- Raising retry caps and calling it fixed.
- Keeping fail-open admission for `unknown`.
- Extending head-only guidance to “a few more decisions” without defining a certificate contract.
- Using probabilistic correction as a legality guarantee.
- Reintroducing `noPlayableMoveCompletion` as the final answer.
- Swallowing failure into no-op / pass semantics.
- Dropping an external CP/SAT solver into the runtime hot path without proving determinism, boundedness, and replay identity across platforms and versions.

## Specific changes to `FOUNDATIONS.md`

The foundations are mostly right. The problem is that they omit one invariant they actually need.

### Amend #5 (`One Rules Protocol, Many Clients`)

Add an explicit constructibility clause:

> No client-visible legal action may require uncertified client-side search to become executable. A legal action exposed by the kernel must be either directly executable, explicitly stochastic, or accompanied by a kernel-produced completion certificate or split decision-state continuation.

That closes the exact gap your current architecture fell through.

### Amend #10 (`Bounded Computation`)

Clarify what must be finitely listable:

> The kernel must finitely enumerate the current executable decision frontier in stable deterministic order. A compound human-visible turn may be represented either as a fully bound move or as a bounded sequence of kernel-owned decision states. Finite listability does not require eager expansion of all end-of-turn concretizations when that expansion is combinatorially explosive.

Right now #10 can be read as pushing the design toward turn-level move enumeration even when the sane solution is split decision fronts.

### Add a new principle: `Constructibility Is Part of Legality`

Make this explicit:

> A move is not legal for clients unless it is constructible under the kernel’s bounded deterministic rules protocol. Existence without a construction artifact is insufficient.

That is the missing commandment.

## Implementation plan I would actually prototype

### Phase 1 - Smallest principled change

- Extend Spec 138’s witness from head-only to full-path.
- Add `CompletionCertificate` to incomplete admitted moves.
- Stop admitting `unknown`.
- Change agents so certificate materialization is the fallback after the first dead-end.
- Add deterministic memoization and failed-prefix caching.

This should fix your current failing seeds without rewriting the simulator.

### Phase 2 - Make `chooseN` sane

- Upgrade `chooseN` handling to set-variable propagation with support queries.
- Reuse and generalize the existing `choose-n-option-resolution.ts` witness search.
- Add supported-domain metadata so policies can explore only safe branches.

### Phase 3 - Architectural cleanup

- Reify pending decisions as kernel-owned split decision states / microturns.
- Make replay/event protocol understand “turn continuation” explicitly.
- At that point, template completion as an agent concern can disappear.

## Testing as proof

Add tests that prove the new invariant, not just the old seeds:

1. Every emitted incomplete legal move has a certificate.
2. Materializing a certificate always yields a complete legal move.
3. `preparePlayableMoves` never throws when `legalMoves.length > 0`.
4. `unknown` is never admitted to clients.
5. Existing replay-identity corpus stays byte-identical on seeds where current first-attempt completion already succeeds.
6. Current failing seeds `123`, `1002`, and `1010` pass with no new stop reason.
7. Property test: random projected states with nonempty legal frontiers never produce “could not derive a playable move”.
8. Hidden-information test: certificate generation on masked views never depends on invisible bindings.
9. Budget test: adversarial `chooseN` cases prove bounded exit as `sat/unsat/unknown`, and prove `unknown` is not client-visible legality.

## Final judgment

Do **not** keep trying to make random completion “good enough”. That road goes nowhere.

The right near-term fix is:

- **full kernel-produced completion certificates**
- **no client-visible legal template without a certificate**
- **`unknown` is not admissible legality**

The right long-term fix is:

- **split kernel-owned decision states for compound turns**

If you do Phase 1 correctly, you get the bug fix now and you lay the exact groundwork for Phase 3 later. That is the clean path.