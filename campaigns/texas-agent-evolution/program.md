# Campaign: texas-agent-evolution

## Bootstrap (run before starting the improvement loop)

If `92-agents.md` does not already contain an `evolved` profile, create one by
cloning the current `baseline` profile:

1. Copy the `baseline` profile definition verbatim as a new `evolved` profile
   in the `profiles:` section of `92-agents.md`.
2. The `evolved` profile is the mutable target — the improvement loop modifies
   only this profile and its supporting library items.
3. The `baseline` profile remains unchanged as the control (opponents use it).

This ensures a fresh campaign always starts from the current best baseline and
evolves against it.

## Objective

Maximize the win rate of an evolved PolicyAgent playing Texas Hold'em No-Limit
tournaments. The evolved agent occupies seat 0 in 4-player tournaments against
3 baseline PolicyAgent opponents.

Win rate = fraction of completed games where the evolved agent finishes 1st
(highest chipStack when all others are eliminated).

Higher is better. Baseline expectation for an identical-to-baseline policy is
~0.25 (25%).

## Campaign Completion

When the campaign ends, the evolved profile's strategy should be promoted to
baseline: update the `baseline` profile to use the evolved strategy's score
terms, then remove the `evolved` profile. This makes the winning strategy the
new standard for future campaigns and for the browser-based game runner (which
uses the `baseline` profile via seat bindings).

## Primary Metric

`win_rate` — higher is better. Measured over 50 tournament seeds. Values range
from 0.0 to 1.0. Measurements within 2 percentage points (0.02) of each other
are considered equal (noise tolerance due to stochastic game outcomes).

## Secondary Metric

`lines_delta` — net lines-of-code change across mutable files. Negative =
simplification = good.

## Mutable System

### Policy YAML (primary target)

- `data/games/texas-holdem/92-agents.md` — agent library (features, pruning
  rules, score terms, aggregates, profiles, bindings)

### Engine Agent Code (advanced — when DSL expressiveness is the bottleneck)

- All files under `packages/engine/src/agents/` — policy evaluation, expression
  system, runtime surface, preview, diagnostics, IR

### Agent DSL Infrastructure (advanced — when new expression types, intrinsics,
  or operators are needed to express a strategy the current DSL cannot)

- Kernel types for agent policy: `packages/engine/src/kernel/types.ts` (agent
  policy types only — `AgentPolicyExpr`, `AgentPolicyOperator`,
  `CompiledAgentPolicyRef`, `CompiledAgentTieBreaker`, and related unions/interfaces)
- Compiler agent section: `packages/engine/src/cnl/compile-agents.ts`
- Compiler agent validation: `packages/engine/src/cnl/validate-agents.ts`
- Game spec agent types: `packages/engine/src/cnl/game-spec-doc.ts` (agent-related
  interfaces only)
- Schema artifacts: `packages/engine/schemas/` (when type changes require schema
  updates)

### Trace Infrastructure (advanced — when observability is insufficient)

- All files under `packages/engine/src/sim/` — simulator, trace, delta
  computation, enrichment

### GameSpec Agent Section (when new DSL features need game-level declarations)

- `data/games/texas-holdem/92-agents.md` — agent library AND visibility config
- Other GameSpec files under `data/games/texas-holdem/` — ONLY when a DSL
  extension requires new derived metrics, visibility declarations, or agent-
  surface configuration that cannot live in 92-agents.md

**Expansion policy**: Focus primarily on the policy YAML (adding features,
pruning rules, score terms to the `evolved` profile). Extend to engine agent
code only when the DSL cannot express the needed strategy. Extend to kernel
types, compiler, and game spec only when a new DSL primitive (operator,
intrinsic, ref family) is needed — and only touch the agent-policy-related
type surfaces, not unrelated kernel logic. Extend to trace code only when
trace output is insufficient for diagnosing agent behavior.

## Immutable System

- `campaigns/texas-agent-evolution/harness.sh`
- `campaigns/texas-agent-evolution/run-tournament.mjs`
- All test files under `packages/engine/test/`
- All test helpers under `packages/engine/test/helpers/`
- Non-agent kernel code: `packages/engine/src/kernel/` EXCEPT agent policy type
  definitions in `types.ts` (game engine logic, state transitions, eval, effects,
  spatial — all immutable)
- Non-agent compiler code: `packages/engine/src/cnl/` EXCEPT `compile-agents.ts`,
  `validate-agents.ts`, and agent-related interfaces in `game-spec-doc.ts`
- Everything under `packages/runner/` (the UI runner)
- All game data except `data/games/texas-holdem/92-agents.md` (and other game
  spec files only when DSL extensions require new declarations)
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, and all build config
- `docs/FOUNDATIONS.md` (architectural commandments — read for guidance, never modify)

## Constraints

1. All engine tests must pass (full suite gate). The harness enforces this.
2. The `baseline` profile in 92-agents.md must remain unchanged — it is the
   control. Only the `evolved` profile and its supporting library items may be
   added or modified.
3. No new runtime dependencies.
4. No changes to public kernel API signatures (non-agent APIs).
5. The game spec (all files except 92-agents.md) must remain unchanged — the
   game rules are fixed. Exception: DSL extensions may add new agent-surface
   declarations (derived metrics, visibility config) to game spec files when
   a new primitive requires it.
6. New library items (features, pruning rules, score terms, aggregates) added
   for the evolved profile must not break existing profiles.
7. All engine code changes must align with `docs/FOUNDATIONS.md` — engine
   agnosticism, determinism, bounded computation, immutability.
8. DSL extensions (new operators, intrinsics, ref families) must fully align
   with `docs/FOUNDATIONS.md`: game-agnostic (no game-specific logic in engine
   code), deterministic (same inputs = same outputs), bounded computation (no
   unbounded iteration), and immutable (no state mutation). Extensions add
   general capabilities (e.g., "aggregate over tokens in a zone"), not
   game-specific logic (e.g., "compute poker hand rank"). The game-specific
   usage lives in the YAML, not the engine code. Read FOUNDATIONS.md before
   designing any DSL extension.

## Accept/Reject Logic

```
IF harness fails (crash, build failure, test failure, runner failure):
    REJECT (allow up to 3 trivial-fix retries per experiment)

IF win_rate improved by >0.02 (>2 percentage points):
    IF improvement <0.03 AND lines_delta > +30:
        REJECT (not worth the complexity)
    ELSE:
        ACCEPT

IF win_rate within 0.02 of best (equal):
    IF lines_delta < 0 (fewer lines = simplification):
        ACCEPT
    ELSE:
        REJECT

IF win_rate worsened by >0.02:
    REJECT
```

## Root Causes to Seed

Starting hypotheses for the first experiments:

1. **Baseline is position-blind**: No awareness of betting position (early,
   middle, late, dealer). Late position should play more aggressively.
2. **No pot odds awareness**: No feature computes pot-to-bet ratio. A rational
   agent should call when pot odds justify it and fold when they don't.
3. **No hand strength signal**: Score terms only look at action type (check >
   call > raise > allIn > fold), not at any property of the actual cards. Even
   a crude proxy (high card rank via perPlayerVar) would be informative.
4. **Never folds strategically**: `avoidFold` weight -100 means fold is always
   last resort. But folding weak hands pre-flop is optimal poker strategy.
5. **Raise sizing is backwards**: `preferSmallerRaise` weight -0.001 penalizes
   larger raises. But larger raises with strong hands extract more value.
6. **No aggression modulation**: Baseline always prefers passive play (check >
   call > raise). Selective aggression with strong hands is a winning strategy.
7. **No opponent chip stack awareness**: Decisions should vary based on whether
   opponents are short-stacked or deep-stacked.
8. **No tournament survival pressure**: Near the bubble (2-3 players left),
   strategy should shift toward survival over chip accumulation.

## Experiment Categories

- `hand-evaluation`: Features for assessing hand strength (card rank in hand,
  pair detection, community card correlation, high-card proxy)
- `pot-odds`: Features for pot odds / expected value (pot size vs bet required,
  stack-to-pot ratio, implied odds)
- `position-play`: Position-based strategy (distance from dealer, early/middle/
  late flags, blind position awareness)
- `pruning`: Rules to eliminate bad plays (fold weak hands pre-flop, don't raise
  with nothing, conditional fold thresholds)
- `aggression`: Raise/all-in strategy tuning (raise with strong hands, value
  betting, sizing based on strength)
- `opponent-modeling`: Opponent behavior features (chip stack distribution,
  number of active opponents, tournament stage proxy)
- `dsl-extension`: New operators, features, intrinsics, or preview capabilities
  in the engine agent code
- `traceability`: Improvements to trace output for better observability during
  the OBSERVE phase
- `combined`: Multi-category changes that pair features with pruning or
  aggression tuning

### Special Rules for Categories

- **dsl-extension** and **traceability** experiments MUST be paired with a
  policy YAML change that uses the new capability. Infrastructure-only changes
  with no policy impact will show no metric improvement and will be REJECTED.
- All engine code changes (`packages/engine/src/agents/`,
  `packages/engine/src/sim/`) must pass the full existing test suite.
- During OBSERVE, read `last-trace.json` (saved by the harness at seed 1000)
  to understand game flow and inform hypothesis generation.

## Thresholds

```
NOISE_TOLERANCE = 0.02          # 2 percentage points
EARLY_ABORT_THRESHOLD = 0.10    # abort if 10pp worse than best (mid-experiment)
PLATEAU_THRESHOLD = 5           # consecutive rejects before strategy shift
MAX_IMPROVEMENT_PCT = 50        # suspicion gate — flag relative gains >50%
REGRESSION_CHECK_INTERVAL = 5   # re-verify every 5 accepts
PIVOT_CHECK_INTERVAL = 10       # PROCEED/REFINE/PIVOT every 10 experiments
```

## Configuration

```
HARNESS_RUNS = 1                # single run per experiment (50 seeds already averages variance)
HARNESS_SEEDS = 1               # no multi-seed harness re-runs (seeds handled internally)
meta_improvement = false        # meta-loop disabled for this campaign
METRIC_DIRECTION = higher-is-better  # maximize win_rate
```

## OBSERVE Phase Enhancement

During OBSERVE, the agent SHOULD:

1. Read `last-trace.json` to review evolved agent's move-by-move decisions
2. Identify moves where the evolved agent's choice was suboptimal (e.g., folded
   when pot odds favored calling, checked when strong hand warranted raising)
3. Check whether the needed strategy can be expressed in the current YAML DSL
4. If not, plan a compound experiment: DSL extension + policy change
5. Review `results.tsv` and `lessons.jsonl` for patterns in what works

## Autonomy Directive

Once the loop begins, run indefinitely. Do NOT ask for permission to continue.
Do NOT stop when easy ideas run out — re-read files, combine near-misses, try
radical alternatives, consult lessons. Read `last-trace.json` during OBSERVE
for game-flow insights. The loop runs until externally interrupted.
