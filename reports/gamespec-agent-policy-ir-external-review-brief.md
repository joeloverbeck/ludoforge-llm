# GameSpec Agent Policy IR: External Review Brief

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

## Current Relevant Code/Docs

### Simulator seam

- [`packages/engine/src/sim/simulator.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/sim/simulator.ts)
- `runGame(...)` asks an `Agent` to choose a move each turn and otherwise stays generic.

### Agent interface

- [`packages/engine/src/kernel/types-core.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/types-core.ts)
- The `Agent` contract is generic and simple.

### Current built-in agents

- [`packages/engine/src/agents/factory.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/agents/factory.ts)
- [`packages/engine/src/agents/greedy-agent.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/agents/greedy-agent.ts)
- [`packages/engine/src/agents/random-agent.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/agents/random-agent.ts)

### Current evaluator heuristic

- [`packages/engine/src/agents/evaluate-state.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/agents/evaluate-state.ts)
- Important because it shows the current engine already has a generic scoring seam, but it is too shallow and too externalized for asymmetric authored AI.

### GameSpecDoc schema surface

- [`packages/engine/src/cnl/game-spec-doc.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/game-spec-doc.ts)
- Important because the spec proposes extending this file with a first-class `agents` section.

### Terminal / victory

- [`packages/engine/src/kernel/terminal.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/terminal.ts)
- [`data/games/fire-in-the-lake/90-terminal.md`](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/90-terminal.md)
- Important because authored AI should be able to optimize against authored victory margins and terminal conditions through generic runtime references.

### Existing FITL bot spec to supersede/reframe

- [`specs/30-fitl-non-player-ai.md`](/home/joeloverbeck/projects/ludoforge-llm/specs/30-fitl-non-player-ai.md)
- Important because it assumes an external `Section8Agent` instead of a first-class `GameSpecDoc` policy IR.

### Existing evolution spec that likely needs follow-up changes

- [`specs/14-evolution-pipeline.md`](/home/joeloverbeck/projects/ludoforge-llm/specs/14-evolution-pipeline.md)
- Important because it currently assumes fixed external agents during evaluation.

### Improvement-loop references

- [`reports/iterative-improvement-logic.md`](/home/joeloverbeck/projects/ludoforge-llm/reports/iterative-improvement-logic.md)
- [`.claude/skills/improve-loop/SKILL.md`](/home/joeloverbeck/projects/ludoforge-llm/.claude/skills/improve-loop/SKILL.md)
- Important because later evolution/improvement should mutate only the policy IR and keep the evaluation harness fixed.

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

