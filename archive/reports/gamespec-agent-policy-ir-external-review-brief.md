# GameSpec Agent Policy IR: External Review Brief

**Status**: COMPLETED

## Purpose

This report provides the context an external LLM reviewer would need to critique [`specs/15-gamespec-agent-policy-ir.md`](/home/joeloverbeck/projects/ludoforge-llm/specs/15-gamespec-agent-policy-ir.md), identify design flaws, propose improvements, and suggest missing features.

The goal is not code generation. The goal is architectural review.

## Repository Context

This repository is building a game-agnostic engine where:

- `GameSpecDoc` files carry game-specific, non-visual rules and data.
- `visual-config.yaml` files carry visual/presentation configuration only.
- `GameDef` is the compiled, game-agnostic runtime artifact.
- simulation and kernel logic must remain generic and reusable.

The repository currently contains two authored games:

- `data/games/fire-in-the-lake`
- `data/games/texas-holdem`

The long-term goal is to support many games and eventually evolve their AI agents automatically.

## Why This Spec Exists

The team previously attempted a universal MCTS game player. It failed badly on complex games, especially Fire in the Lake, where even a single turn could take roughly an hour.

That failure changed the architectural direction:

- game-specific AI should be data-authored, not hardcoded into engine logic,
- AI must be represented in `GameSpecDoc`,
- the engine must interpret a generic policy runtime,
- evolution must later mutate that policy runtime, not arbitrary engine code and not arbitrary unrestricted YAML.

This spec is the pre-evolution foundation for that direction.

## Current Architecture Snapshot

### What is already generic

- The simulator is generic and only calls `Agent.chooseMove(...)`.
- The terminal/victory logic is generic and already evaluates authored victory conditions from compiled game data.
- The trace system already records detailed move/effect/decision information.

### What is not yet generic enough

- `GameSpecDoc` currently has no first-class `agents` section.
- The engine agent layer is currently centered on external `random` and `greedy` agents.
- FITL bot behavior has historically been conceived as an external faction-specific agent rather than a compiled game-authored policy.
- The draft evolution spec assumes fixed external agents when evaluating games.

## Key Constraints

The reviewer should treat the following constraints as hard requirements:

1. `GameSpecDoc` owns game-specific, non-visual AI policy.
2. `visual-config.yaml` must not carry AI behavior.
3. `GameDef` and simulation must remain game-agnostic.
4. No backwards compatibility is required.
5. The architecture must optimize for cleanliness, robustness, and extensibility over short-term convenience.
6. Fire in the Lake is the proof target and is highly asymmetric by faction.
7. The eventual goal is policy evolution for every implemented game.

## Embedded Architecture Evidence

The reviewer should assume the following facts about the current codebase. These are distilled from the current implementation and existing internal specs so you do not need repo access to reason about them.

### 1. Simulator seam is already generic

The current simulation loop is conceptually:

```typescript
while (true) {
  if (terminalResult(def, state) !== null) break;
  const legal = legalMoves(def, state);
  const player = state.activePlayer;
  const selected = agents[player].chooseMove({
    def,
    state,
    playerId: player,
    legalMoves: legal,
    rng,
    runtime,
  });
  state = applyMove(def, state, selected.move).state;
  trace.push(...);
}
```

What this proves:

- simulation already has the correct generic ownership boundary,
- the simulator does not need game-specific branches to support authored policies,
- the right architectural insertion point is the `Agent` implementation layer and the compiled data it consumes.

### 2. Current `Agent` interface is small and generic

The current contract is effectively:

```typescript
interface Agent {
  chooseMove(input: {
    def: GameDef;
    state: GameState;
    playerId: PlayerId;
    legalMoves: readonly Move[];
    rng: Rng;
    runtime?: GameDefRuntime;
  }): { move: Move; rng: Rng };
}
```

What this proves:

- simulation already consumes agents generically,
- a future `PolicyAgent` can fit into the existing seam,
- the architectural challenge is policy representation, not simulator coupling.

### 3. Current built-in agents are only `random` and `greedy`

The current agent factory accepts only:

- `random`
- `greedy`

Anything else is rejected as an unknown agent type.

What this proves:

- the current architecture is still centered on generic developer/testing agents,
- there is no first-class notion of game-authored policy in the runtime,
- CLI and runner assumptions are currently too narrow for the long-term direction.

### 4. Current greedy evaluation is generic but shallow

The current greedy agent does this in essence:

1. expand candidate moves,
2. apply each candidate once,
3. score the resulting state with a generic evaluator,
4. choose the highest-scoring move,
5. break ties with RNG.

Its evaluator currently combines:

- terminal win/loss detection,
- optional `terminal.scoring` evaluation,
- normalized own per-player variable values,
- penalties for opponent per-player variable values.

What this proves:

- the engine already has a generic post-move scoring seam,
- but that seam is too shallow and too externalized to express strong asymmetric authored policies,
- moving policy into `GameSpecDoc` is an architectural generalization of an already-existing generic pattern.

### 5. `GameSpecDoc` currently has no AI section

The current top-level `GameSpecDoc` schema includes sections such as:

- `metadata`
- `constants`
- `dataAssets`
- `globalVars`
- `perPlayerVars`
- `zones`
- `tokenTypes`
- `setup`
- `turnStructure`
- `turnOrder`
- `actionPipelines`
- `derivedMetrics`
- `eventDecks`
- `terminal`
- `actions`
- `triggers`
- `effectMacros`
- `conditionMacros`
- `victoryStandings`
- `verbalization`

It does not currently include a first-class `agents` section.

What this proves:

- the spec is not filling an existing feature gap with a cosmetic rename,
- it is adding a genuinely missing authoring surface,
- the absence of `agents` is the clearest current architectural hole.

### 6. Current terminal and victory logic is already data-authored and generic

The runtime already supports:

- authored checkpoint-style victory conditions,
- authored seat-based victory margins,
- authored ranking direction and tie-break order,
- generic evaluation of those terminal conditions from compiled game data.

For Fire in the Lake specifically, the authored terminal data already encodes per-seat victory logic like:

- US victory based on support plus available pieces relative to threshold,
- ARVN victory based on controlled population plus patronage,
- NVA victory based on controlled population plus NVA bases,
- VC victory based on opposition plus VC bases,
- final-coup ranking by authored seat margins and authored tie-break order.

What this proves:

- game-specific victory logic is already successfully expressed as data rather than engine branches,
- authored AI optimizing against authored terminal margins is consistent with the existing architecture,
- the proposal extends an established design pattern rather than inventing a new one.

### 7. Existing FITL bot planning assumed an external bespoke agent

The earlier FITL bot plan assumed:

- a `Section8Agent` implemented in TypeScript,
- faction-specific priority tables in code,
- event evaluation logic in code,
- space targeting heuristics in code,
- piece selection logic in code,
- no kernel changes needed because the custom behavior would live at the agent layer.

What this proves:

- the repository already recognized that FITL needs asymmetric faction-aware decisioning,
- but the previous ownership decision put that asymmetry in code instead of authored game data,
- Spec 15 is intentionally reframing that choice rather than denying FITL’s asymmetry.

### 8. Existing evolution design assumes fixed external agents

The current evolution design assumes roughly this evaluation flow:

1. LLM generates or mutates a game spec.
2. Compiler produces a `GameDef`.
3. Simulator runs a fixed list of external agents.
4. Evaluator scores traces.
5. Evolution selects by fitness.

The evolution config assumes a field conceptually equivalent to:

```typescript
interface EvolutionConfig {
  simulationRuns: number;
  maxTurns: number;
  agents: readonly Agent[];
}
```

What this proves:

- the current evolution architecture treats agents as external fixtures,
- that is fine for generic game-generation experiments,
- but it is the wrong boundary for evolving game-specific asymmetric AI policies.

### 9. Existing improvement-loop design requires a bounded mutable artifact and a fixed harness

The current iterative-improvement design is built on these principles:

- a fixed evaluation harness must remain immutable,
- one bounded mutable system is changed each experiment,
- accept/reject is driven by quantitative measurement,
- experiments are logged and rolled back cleanly,
- the loop should not mutate the evaluator to game the metric.

What this proves for AI policy evolution:

- the mutable artifact should be the authored policy IR, not engine code,
- the evaluation harness should fix rules, scenarios, seeds, and metrics,
- the architecture must make policy mutation bounded and serializable.

## Why the New Spec Is a Response to This Evidence

The spec is trying to resolve the tension created by the evidence above:

- simulator is already generic enough,
- terminal evaluation is already data-authored,
- `GameSpecDoc` lacks an AI surface,
- current agents are too external and too narrow,
- FITL asymmetry is real and must be expressed somewhere,
- evolution needs a bounded mutable policy artifact.

The proposed answer is:

- add a first-class `agents` section to `GameSpecDoc`,
- compile it into a generic policy catalog in `GameDef`,
- interpret it with a generic `PolicyAgent`,
- later evolve that bounded policy IR instead of external bespoke agents.

## What the New Spec Proposes

The spec proposes:

1. A new `agents` section in `GameSpecDoc`.
2. A compiled `agents` catalog in `GameDef`.
3. A generic `PolicyAgent` runtime.
4. Candidate-based move selection:
   - enumerate legal moves,
   - optionally complete them into concrete candidates,
   - compute generic features,
   - apply filters,
   - score candidates,
   - resolve deterministic tie-breaks.
5. Seat-bound policy profiles so asymmetric games like FITL can define one profile per seat/faction.
6. Generic policy traces to explain decisions.
7. An evolution-ready bounded policy search space.

## Reviewer Ground Truth

Use the following as hard ground truth when critiquing the spec:

- The team does not want backwards compatibility.
- The team wants cleaner architecture over preserving current external-agent conventions.
- `GameSpecDoc` is the correct home for game-specific, non-visual AI behavior.
- `visual-config.yaml` must remain presentation-only.
- `GameDef` and simulation must remain generic.
- Fire in the Lake is the stress test and is strongly asymmetric by seat/faction.
- The final long-term goal is automatic evolution of authored game-specific policies.

## What Reviewers Should Evaluate

### 1. IR shape

Is the proposed policy IR expressive enough for:

- FITL event-vs-operation decisions,
- operation targeting,
- resource preservation,
- asymmetric long-term strategy,
- Texas Hold'em betting heuristics,

without becoming so expressive that mutation and validation become intractable?

### 2. Search-space discipline

Does the spec keep the future evolution search space bounded enough to be practical?

Reviewers should be alert for:

- unbounded free-form expressions,
- hidden coupling to engine internals,
- excessive dependence on post-move re-simulation,
- recursive or compositional complexity that will explode mutation cost.

### 3. Asymmetry handling

Is seat-bound policy binding the right abstraction for:

- fixed asymmetric factions,
- future games with different seat semantics,
- evolution per faction rather than one shared mirrored policy?

### 4. Determinism and traceability

Does the policy runtime remain:

- deterministic,
- reproducible,
- traceable,
- debuggable?

Reviewers should look for places where the spec is too vague on:

- candidate completion budgets,
- tie-break determinism,
- feature evaluation order,
- RNG usage boundaries.

### 5. Ownership boundaries

Does the proposed architecture keep responsibilities clean?

Reviewers should check whether the spec properly preserves:

- game-specific data in `GameSpecDoc`,
- generic runtime behavior in engine code,
- no visual leakage into AI policy,
- no game-specific branches in simulation or `GameDef`.

### 6. Evolution readiness

Even though evolution is out of scope for the spec, reviewers should assess whether the spec creates the right substrate for:

- iterative improvement loops,
- league evaluation,
- hall-of-fame/self-play evaluation,
- seat-specific coevolution,
- bounded YAML mutation.

## Fire in the Lake Specific Concerns

FITL is the proof target because it is exceptionally asymmetric and complex.

Reviewers should specifically test whether the policy IR seems capable of representing:

- event vs operation tradeoffs,
- different strategic priorities per faction,
- high-branching multi-space operations,
- highly faction-specific notions of progress,
- coup timing and victory-margin pressure,

without introducing FITL-specific runtime code.

If a reviewer believes FITL requires special-case engine logic, that is a major challenge to the spec and should be called out explicitly.

## Texas Hold'em Specific Concerns

The second game is Texas Hold'em. Reviewers should check whether the same policy IR can also represent simpler, non-COIN domains:

- fold/check/call/raise decisions,
- street-aware heuristics,
- pot-odds and hand-strength proxies,
- aggression thresholds,

without requiring a separate agent architecture.

If the IR only really works for FITL-like games, that is a design flaw.

## Questions the Reviewer Should Answer

1. Is the candidate-based policy model the right generic foundation, or is there a better bounded architecture?
2. Which parts of the IR are underspecified and likely to create ambiguity or implementation churn?
3. Which parts are overengineered for v1 and should be deferred?
4. What generic feature/reference surfaces are still missing for complex asymmetric games?
5. Should the first version support profile composition, or keep profiles flat?
6. Should the first version reserve any shallow rollout primitive, or strictly stay one-ply?
7. What failure modes could make future evolution ineffective even if this IR is implemented exactly as written?
8. Which validations are missing that would be critical before allowing automated mutation of policy YAML?
9. What changes should eventually be made to Spec 14 and Spec 30 to align the repo around this architecture?

## Reviewer Output Format Requested

Ask the reviewer to provide:

1. A short overall verdict on the spec’s viability.
2. A list of architectural risks ordered by severity.
3. Concrete changes to the spec text they would recommend.
4. Missing features or abstractions they believe should be added now.
5. Features they think should be explicitly deferred to keep v1 tractable.
6. Any concerns about performance, determinism, or evolution-readiness.
7. Any places where the spec accidentally leaks game-specific logic into generic layers.

## Bottom Line

This spec is intentionally trying to create a clean boundary:

- authored games define policies,
- engine interprets them generically,
- simulator remains unchanged,
- future evolution mutates bounded policy IR.

The external review should stress-test whether that boundary is the right one and whether the proposed IR is the right size and shape to make the long-term architecture cleaner instead of just moving complexity around.

## Outcome

Completed: 2026-04-02

- This external-review brief was exploited as upstream reference context for the GameSpec agent-policy IR work that has now been implemented and archived through the 15/102/103/104/105/107 series.
- Its role is complete; the live repository now contains the implemented policy authoring/runtime architecture and the archived ticket/spec trail that supersedes this review prompt as an active working artifact.
- Deviation from original plan: none; the document remained a review brief and was not converted into a normative spec.
- Verification result: downstream implementation and migration work completed with repo-wide verification passing via `pnpm turbo build`, `pnpm turbo test`, `pnpm turbo lint`, and `pnpm turbo typecheck`.
