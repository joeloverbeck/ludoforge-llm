# Spec 66: Bounded Multi-Turn Margin Projection

**Status**: NOT IMPLEMENTED
**Priority**: P3
**Complexity**: XL
**Dependencies**: Spec 63 (observability, for evaluation), Spec 64
  (decomposed metrics, for per-component projection)
**Source**: ARVN agent evolution campaign ceiling analysis (2026-04-11)

## Overview

The current preview system evaluates the game state 1 move ahead (or 1
event + 1 granted operation via phase1 preview). For factions whose
victory depends on multi-turn accumulation (e.g., ARVN building
Patronage through repeated Govern, or any faction that invests resources
now for later payoff), the 1-move horizon creates a structural bias
toward actions with immediate margin improvement, even when deferred-
payoff strategies are strictly better.

This spec proposes a bounded N-turn projection that extends the preview
horizon while staying within FOUNDATIONS constraints on determinism,
bounded computation, and engine agnosticism.

## Problem Statement

In the ARVN campaign, every decision where the agent chose Govern had a
NEGATIVE projected margin (Govern costs resources, immediate margin
worsens). Govern was selected only because it was "least bad" --- not
because the agent understood that Govern-now leads to Patronage
accumulation over 3-5 turns. The preview can't see this because it
evaluates a single action in isolation.

The limitation manifests in two ways:

1. **Action undervaluation**: Actions that invest for future payoff
   (Govern, Train) are undervalued relative to actions with neutral
   margin impact (pass-equivalents, defensive moves).

2. **No planning horizon**: The agent evaluates each decision
   independently. It has no concept of "I should Govern 3 times, then
   Train twice" as a coherent strategy with compound value.

### Evidence

Seed 1000 (won): Decisions 0-2 all have Govern as the top unpruned
candidate with negative projected margin (-2.67, -2, 0.27). The agent
chooses Govern because alternatives are even worse --- not because it
values Patronage accumulation.

## Proposed Design

### Approach: Self-Play Rollout Projection

Simulate N turns of self-play using the SAME policy profile, starting
from the post-move state. The projected margin is the margin at the end
of the N-turn rollout. This captures the compound effect of the agent's
own strategy over multiple turns without requiring a separate planning
system.

```yaml
profiles:
  arvn-evolved:
    preview:
      mode: exactWorld
      phase1: true
      rollout:
        turns: 3
        policy: self       # use the same profile for rollout
        opponentPolicy: pass  # opponents pass during rollout (simplification)
```

### Key design constraints

1. **Bounded computation** (FOUNDATIONS #10): The rollout is capped at
   N turns (configurable, default 3). Each turn produces at most M
   legal moves (bounded by the game definition). The total computation
   is O(N * M * evaluation_cost_per_move). With N=3 and M~20, this is
   ~60x the current 1-move preview cost per candidate.

2. **Determinism** (FOUNDATIONS #8): The rollout uses the same PRNG
   seeded from the candidate's identity (stableMoveKey hash). Same
   candidate + same state = same rollout. No ambient state dependency.

3. **Engine agnosticism** (FOUNDATIONS #1): The rollout infrastructure
   is generic --- it takes a GameDef, a state, a policy profile, and a
   turn count. No game-specific logic. Any game with a PolicyAgent
   profile can use rollouts.

4. **Specs are data** (FOUNDATIONS #7): The rollout configuration lives
   in the profile's `preview` section, not in executable code.

### Performance considerations

At N=3 turns and ~20 candidates per decision, the rollout costs ~60x
per decision. For ARVN with 6 strategic decisions, this is ~360
evaluations per game. At ~10ms per evaluation (current preview cost),
that's ~3.6 seconds of additional computation per game.

For redeployment decisions (58+ per game with 16-17 candidates each),
rollouts would be prohibitively expensive (~30K evaluations). Rollouts
should only apply to strategic decisions, not tactical ones. The
`rollout` config should support scope restrictions:

```yaml
rollout:
  turns: 3
  policy: self
  opponentPolicy: pass
  scopes: [move]  # only for move-scoped decisions, not completions
  actionFilter:
    exclude: [coupPacify*, coupRedeploy*, coup*]  # skip Coup phases
```

### Opponent modeling

The simplest opponent model is "pass" (opponents do nothing during the
rollout). This overestimates the agent's margin but captures the
compound value of its own strategy. More realistic models:

- **Baseline**: opponents use their assigned baseline profiles
- **Static**: opponents maintain current board state (no actions)
- **Adversarial**: opponents use a simple heuristic (e.g., maximize
  their own margin)

The initial implementation should support `pass` and `baseline`. The
profile configuration selects the model.

## Alternative Approaches Considered

### A. Discount factor on margin signal

Add a `discount: 0.9` parameter that estimates multi-turn value as
`margin + discount * future_estimate`. The future estimate could be a
simple heuristic (e.g., "Govern adds ~2 Patronage per turn"). This is
simpler but game-specific and fragile.

**Rejected**: Violates #1 (engine agnosticism) unless the heuristic is
expressed in the generic DSL.

### B. Strategic conditions with proximity

Use `strategicConditions` to define "nearVictory" or "patronageLow"
with proximity metrics, and weight actions based on how much they
improve the proximity. This is already supported by the DSL but
doesn't solve the multi-turn compound value problem --- it only
provides a single-turn signal about distance to a threshold.

**Not rejected but insufficient**: Strategic conditions complement
rollouts; they don't replace them.

### C. Value function learning

Train a value function (neural net or linear approximation) that
estimates the N-turn margin from a state. The evolution pipeline
updates the value function across games. This is the most powerful
approach but requires substantial infrastructure.

**Deferred**: Too complex for the current evolution pipeline maturity.
Could be revisited after Spec 14 (evolution pipeline).

## FOUNDATIONS Alignment

- **#1 Engine Agnosticism**: Rollout infrastructure is generic. No
  game-specific logic in the engine.
- **#7 Specs Are Data**: Rollout configuration is declarative YAML
  in the profile, not executable code.
- **#8 Determinism**: Rollout uses deterministic PRNG seeded from
  candidate identity. Same inputs = same projection.
- **#10 Bounded Computation**: Rollout capped at N turns with
  configurable bound. Total cost is O(N * M * eval_cost).
- **#11 Immutability**: Rollout operates on copies of state, never
  mutating the original.

## Acceptance Criteria

1. Profiles can declare `preview.rollout` with `turns`, `policy`,
   `opponentPolicy`, and `actionFilter`.
2. The rollout produces a projected margin that replaces the 1-move
   preview margin when configured.
3. Rollout results are deterministic (same candidate + same state =
   same projection).
4. Rollout cost is bounded: at most N * M evaluations per candidate.
5. Rollouts only apply to decisions matching the `actionFilter` scope.
6. ARVN campaign achieves higher compositeScore with rollout preview
   than with 1-move preview.

## Open Questions

1. Should the rollout operate on the FULL game state (all players
   taking turns) or just the evolved seat's turns? Full-game rollout
   is more accurate but much more expensive.
2. How should stochastic outcomes in the rollout be handled?
   `tolerateStochastic` mode takes the first outcome; `exactWorld`
   skips candidates with stochastic paths. Neither is ideal for
   multi-turn rollouts.
3. Should rollout results be cached across candidates that share the
   same action template but differ in parameters? (Template-level
   caching could reduce the 60x cost significantly.)
