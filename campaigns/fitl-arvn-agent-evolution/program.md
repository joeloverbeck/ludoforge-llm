# Campaign: fitl-arvn-agent-evolution

## Bootstrap (run before starting the improvement loop)

If `92-agents.md` does not already contain an `arvn-evolved` profile, create one by
cloning the current `arvn-baseline` profile:

1. Copy the `arvn-baseline` profile definition verbatim as a new `arvn-evolved`
   profile in the `profiles:` section of `92-agents.md`.
2. Update the `bindings:` section: change `arvn: arvn-baseline` to `arvn: arvn-evolved`.
3. The `arvn-evolved` profile is the mutable target — the improvement loop modifies
   only this profile and its supporting library items.
4. The `arvn-baseline` profile and all other faction profiles remain unchanged as
   controls.

## Objective

Maximize the composite score of an evolved ARVN PolicyAgent playing
Fire in the Lake (FITL) 4-player COIN-series games. The evolved agent occupies
the ARVN seat against 3 baseline faction agents (US, VC, NVA).

ARVN victory formula: `COIN-Controlled Population + Patronage > 50`.
ARVN margin = `COIN-Controlled Population + Patronage - 50`.

The composite score combines the ARVN margin (continuous gradient signal) with a
win rate bonus (threshold-crossing reward):

```
compositeScore = avgMargin + 10 * winRate
```

Higher is better. Baseline expectation for an identical-to-baseline policy is
a compositeScore near 0 (margin near threshold distance, ~0% win rate).

## Campaign Completion

When the campaign ends, the evolved profile's strategy should be promoted to
baseline: update the `arvn-baseline` profile to use the evolved strategy, then
remove the `arvn-evolved` profile. This makes the winning strategy the new
standard for future campaigns and the browser-based game runner.

## Primary Metric

`compositeScore` = `avgMargin + 10 * winRate` — higher is better.

- `avgMargin`: average ARVN victory margin at game end across all seeds
- `winRate`: fraction of completed games where ARVN won (crossed threshold at Coup)
- Measurements within 0.05 composite points of each other are considered equal
  (deterministic fixed seeds — minimum detectable improvement is ~0.0667 per seed)

## Secondary Metric

`lines_delta` — net lines-of-code change across mutable files. Negative =
simplification = good.

## Mutable System

### Tier 1: Policy YAML (primary target)

- `data/games/fire-in-the-lake/92-agents.md` — agent library (features, pruning
  rules, score terms, aggregates, profiles, parameters, bindings)
  - Mutable: `arvn-evolved` profile and its supporting library items
  - Immutable within this file: `arvn-baseline` profile, `us-baseline`,
    `vc-baseline`, `nva-baseline` profiles, bindings for non-ARVN seats

### Tier 2: DSL Extension (when YAML expressiveness is the bottleneck)

- All files under `packages/engine/src/agents/` — policy evaluation, expression
  system, runtime surface, preview, diagnostics, IR
- Kernel types for agent policy: `packages/engine/src/kernel/types.ts` (agent
  policy types only — `AgentPolicyExpr`, `AgentPolicyOperator`,
  `CompiledAgentPolicyRef`, `CompiledAgentTieBreaker`, and related interfaces)
- Compiler agent section: `packages/engine/src/cnl/compile-agents.ts`
- Compiler agent validation: `packages/engine/src/cnl/validate-agents.ts`
- Game spec agent types: `packages/engine/src/cnl/game-spec-doc.ts` (agent-related
  interfaces only)
- Schema artifacts: `packages/engine/schemas/` (when type changes require it)

**Split-commit policy for Tier 2**: DSL infrastructure changes MUST be committed
in a separate commit from the policy YAML change that uses them. On REJECT, only
the policy YAML is rolled back; the DSL improvement persists if it:
  - Passes all engine tests
  - Aligns with `docs/FOUNDATIONS.md`
  - Is a genuine improvement (not just scaffolding for a failed experiment)

### Tier 3: Observability (always-commit regardless of experiment result)

- All files under `packages/engine/src/sim/` — simulator, trace, delta
  computation, enrichment
- Agent diagnostic/trace output in `packages/engine/src/agents/`

**Always-commit policy**: Trace and logging improvements are committed as
permanent infrastructure improvements regardless of whether the associated
agent experiment is accepted or rejected. These changes improve the OBSERVE
phase for all future experiments.

### Tier 4: GameSpec (when DSL extension requires new game-level declarations)

- Other `data/games/fire-in-the-lake/*.md` files — ONLY when a DSL extension
  requires new derived metrics, visibility declarations, or agent-surface
  configuration that cannot live in `92-agents.md`

**Expansion policy**: Focus primarily on Tier 1 (policy YAML). Escalate to
Tier 2 only when the DSL cannot express the needed strategy. Tier 3 changes
are always welcome. Tier 4 only when absolutely necessary.

## Immutable System

- `campaigns/fitl-arvn-agent-evolution/harness.sh` (seed count read from seed-tier.txt; do not modify harness logic)
- `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs`
- All test files under `packages/engine/test/` (except when DSL changes in
  Tier 2 require corresponding test updates)
- Non-agent kernel code: `packages/engine/src/kernel/` EXCEPT agent policy type
  definitions in `types.ts`
- Non-agent compiler code: `packages/engine/src/cnl/` EXCEPT `compile-agents.ts`,
  `validate-agents.ts`, and agent-related interfaces in `game-spec-doc.ts`
- Everything under `packages/runner/`
- All other game data (`data/games/texas-holdem/`)
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, and all build config
- `docs/FOUNDATIONS.md` (read for guidance, never modify)

## Constraints

1. All engine tests must pass (full suite gate). The harness enforces this.
2. The `arvn-baseline`, `us-baseline`, `vc-baseline`, and `nva-baseline` profiles
   must remain unchanged — they are controls.
3. No new runtime dependencies.
4. No changes to public kernel API signatures (non-agent APIs).
5. The game spec (all files except `92-agents.md`) must remain unchanged unless
   a DSL extension requires new agent-surface declarations (Tier 4).
6. New library items added for the evolved profile must not break existing profiles.
7. All engine code changes must align with `docs/FOUNDATIONS.md` — engine
   agnosticism, determinism, bounded computation, immutability.
8. DSL extensions must be game-agnostic (no ARVN-specific logic in engine code),
   deterministic, bounded, and immutable. The game-specific usage lives in the
   YAML, not the engine code.

## Accept/Reject Logic

```
IF harness fails (crash, build failure, test failure, runner failure):
    REJECT (allow up to 3 trivial-fix retries per experiment)

IF compositeScore improved by > 0.05 (noise tolerance):
    IF improvement > 50% relative AND lines_delta > +50:
        FLAG as suspicious — verify game traces show realistic play
        IF traces look realistic: ACCEPT with note
        ELSE: REJECT
    ELSE:
        ACCEPT

IF compositeScore within 0.05 of best (equal):
    IF lines_delta < 0 (fewer lines = simplification):
        ACCEPT
    ELSE:
        REJECT (near-miss → stash)

IF compositeScore worsened by > 0.05:
    REJECT
```

## Root Causes to Seed

Starting hypotheses for the first experiments:

1. **All ARVN actions weighted equally**: Train, Patrol, Sweep, Assault,
   Govern all get weight 1. ARVN's political engine (Govern → Patronage,
   Train → ARVN troops → COIN control) should dominate. Experiment: increase
   Govern and Train weights, decrease combat action weights.

2. **No Patronage awareness**: `resourceWeight=0.02` means resources barely
   factor in. ARVN should prioritize Govern when Patronage is low to build
   toward the 50-point threshold. Experiment: add conditional scoring —
   prefer Govern when Patronage < N.

3. **No victory formula decomposition**: The agent sees overall margin but
   can't distinguish "low because no COIN control" from "low because no
   Patronage." Different remedies needed for each. May require DSL extension
   for component-level aggregates.

4. **No conditional scoring**: Agent can't say "prefer Train when few ARVN
   troops" or "prefer Govern when Patronage is low." The `when` clause on
   scoreTerms enables this. Experiment: add conditional scoreTerms.

5. **No resource awareness**: ARVN needs resources to execute operations.
   Experiment: add conditional scoring when low on ARVN resources or US aid.

6. **No COIN-control synergy awareness**: ARVN benefits from spaces where
   COIN (US + ARVN) outnumbers insurgents. The agent doesn't distinguish
   actions that improve COIN-controlled population from those that don't.
   Experiment: add features targeting COIN-control improvement.

7. **Event cards treated equally**: All events get weight 1.5. Some events
   are much more valuable for ARVN. Experiment: tune eventWeight or add
   event-discriminating features.

8. **No spatial awareness in scoring**: Agent can't prefer actions in zones
   where COIN control is near-threshold (could flip with one more piece) or
   where Patronage-building actions are most efficient. May require DSL
   extension.

9. **Pass is only pruned action**: Many more bad actions could be pruned
   (e.g., actions that reduce COIN control or waste resources). Experiment:
   add pruning rules for counterproductive actions.

10. **Parameter tuning unexplored**: Even without new features, adjusting
    `projectedMarginWeight`, `eventWeight`, `resourceWeight` could improve
    performance. Experiment: systematic parameter sweep.

## Experiment Categories

- `action-priority`: Tuning weights for ARVN-specific actions (Train, Patrol,
  Sweep, Assault, Govern). Adjusting which actions are preferred and
  by how much.

- `resource-management`: Features for resource-aware decisions. Govern when
  Patronage is low, conserve resources when constrained, budget for multi-turn
  plans.

- `victory-pursuit`: Features targeting ARVN's specific victory formula
  (COIN-Controlled Population + Patronage > 50). Actions that directly increase
  COIN control or build Patronage.

- `pruning`: Rules to eliminate bad plays. Prune actions that reduce COIN
  control, waste resources on low-value targets, or undermine Patronage.

- `event-evaluation`: Better event card selection. Event-type discrimination,
  conditional event preference based on game state.

- `conditional-strategy`: Adding `when` clauses to scoreTerms for
  game-state-dependent priorities. Govern when Patronage is low, Train when
  few troops, Patrol to expand control territory.

- `dsl-extension`: New operators, features, intrinsics, or reference surfaces
  in the engine agent code. Required when YAML DSL cannot express needed
  strategy. MUST be paired with policy YAML change.

- `traceability`: Trace/logging improvements for OBSERVE phase analysis.
  Fill gaps in simulation traces. Always-commit regardless of experiment
  outcome.

- `combined`: Multi-category changes pairing features with pruning,
  conditional logic, or parameter tuning.

### Special Rules for Categories

- **dsl-extension** experiments use split-commit: infrastructure committed
  separately from policy. DSL improvements persist even if policy change is
  REJECTED (provided they pass tests and align with FOUNDATIONS.md).
- **traceability** experiments are always committed regardless of metric
  impact. Infrastructure-only traceability changes (no policy change) are
  acceptable and should be committed as separate improvements.
- All engine code changes must pass the full existing test suite (after any
  necessary test updates for API changes).
- During OBSERVE, read `last-trace.json` (saved by the harness at seed 1000)
  to understand game flow and inform hypothesis generation.

## Thresholds

```
NOISE_TOLERANCE = 0.05          # 0.05 composite points (deterministic fixed seeds — no stochastic noise)
PLATEAU_THRESHOLD = 5           # consecutive rejects before strategy shift
MAX_IMPROVEMENT_PCT = 50        # flag relative gains > 50% as suspicious
REGRESSION_CHECK_INTERVAL = 5   # re-verify baseline every 5 accepts
PIVOT_CHECK_INTERVAL = 10       # PROCEED/REFINE/PIVOT every 10 experiments
```

## Configuration

```
HARNESS_RUNS = 1                # single run per experiment
HARNESS_SEEDS = 1               # seeds handled internally by run-tournament.mjs (progressive)
meta_improvement = false        # meta-loop disabled for this campaign
METRIC_DIRECTION = higher-is-better  # maximize compositeScore
MAX_ITERATIONS = unlimited      # run until externally interrupted
CHECKS_TIMEOUT = 120            # 2 minutes for correctness checks
INITIAL_SEED_TIER = 1           # start with 1 seed; progressive protocol advances
```

## Progressive Seed Protocol

The campaign uses progressive seed expansion to keep early experiments fast.
FITL games can hit 500 turns when the agent is weak (~3-5 min per game).
Running 15 seeds from the start means 40+ minute experiments. Progressive
seeds keep early experiments under 5 minutes.

### Seed Tier State

- Current tier stored in `seed-tier.txt` (integer, default 1)
- Harness reads this file to determine SEED_COUNT
- Seeds are always 1000 through 1000+tier-1
- Tier NEVER drops back — it ratchets up only (REJECT/rollback preserves tier)

### Phase A: Win-Gated Ramp-Up (tier < 15)

During ramp-up, the standard `compositeScore` accept/reject logic is
**suspended**. Instead, use this two-case logic:

```
IF wins > best_wins:
    # More wins: use compositeScore as the arbiter.
    # compositeScore = avgMargin + 10 * winRate already encodes the
    # wins-vs-margin tradeoff (10x weight for wins vs 1x for margin).
    # Some margin regression is expected and acceptable when gaining wins.
    best_compositeScore = best_avgMargin + 10 * (best_wins / current_tier)
    new_compositeScore  = avgMargin + 10 * (wins / current_tier)
    IF new_compositeScore > best_compositeScore + NOISE_TOLERANCE:
        ACCEPT
    ELSE:
        REJECT

IF wins == best_wins AND avgMargin >= best_avgMargin - NOISE_TOLERANCE:
    ACCEPT

IF wins == best_wins AND avgMargin within NOISE_TOLERANCE of best (equal):
    IF lines_delta < 0: ACCEPT (simplification)
    ELSE: REJECT (near-miss)

IF wins < best_wins:
    REJECT
```

**Rationale**: The original rule (`wins >= best AND margin >= best - 0.05`)
treated "same wins" and "more wins" identically. This blocked clearly
beneficial changes where an extra win (+10/N compositeScore) was gained at
the cost of small margin regression (-0.4 compositeScore). The two-case
logic preserves margin protection when wins are unchanged but delegates to
compositeScore (which already weights wins 10x) when wins increase.

**Tier advance**: After an ACCEPT where `wins == current_tier` (all seeds
won), write `tier + 1` to `seed-tier.txt`. The next experiment runs at the
new tier. Re-measure `best_wins`, `best_avgMargin`, and
`best_compositeScore` at the new tier (baseline run at new tier before
continuing experiments).

**Unwinnable seed escape**: Some seeds may be structurally unwinnable due
to game conditions (e.g., ARVN gets only a few decisions before an opponent
wins on the first Coup). If a seed is identified as unwinnable after exhausting
experiments (hitting PLATEAU_THRESHOLD consecutive rejects at this tier
without improving wins), the agent should:
1. Document the unwinnable seed in musings.md with evidence (trace analysis)
2. Advance the tier anyway: write `tier + 1` to `seed-tier.txt`
3. The unwinnable seed remains in the seed set — it contributes a negative
   margin that the agent must overcome on other seeds
4. The accept logic (`wins >= best_wins`) naturally handles this: the
   unwinnable seed's loss is baked into `best_wins`

This prevents the campaign from getting stuck at a tier with a genuinely
unwinnable seed while still penalizing the agent for that loss in the
composite metric.

Simplification accepts (same wins, same margin, fewer lines) follow the
same logic as the standard protocol.

### Phase B: CompositeScore Optimization (tier == 15)

Once tier reaches 15, switch to the standard `compositeScore`-based
Accept/Reject Logic defined in the Accept/Reject Logic section above. This
is the fine-tuning phase where margins are maximized across all 15 diverse
seeds to prevent overfitting to early seeds.

## OBSERVE Phase Protocol (Trace-Driven)

During OBSERVE, the agent MUST:

1. Read `last-trace.json` to review ARVN's move-by-move decisions
2. Identify moves where ARVN's choice was clearly suboptimal:
   - Passed when could have Governed (Patronage low)
   - Swept when should have Trained (few ARVN troops)
   - Chose a low-impact action over a high-impact one
3. Check whether the needed strategy can be expressed in current YAML DSL
4. If not, plan a compound experiment: DSL extension (Tier 2) + policy change
5. Review `results.tsv` and `lessons.jsonl` for patterns in what works
6. Read `docs/agent-dsl-cookbook.md` to understand what the Agent DSL can express. Before proposing DSL extensions (Tier 2), verify the existing DSL surface cannot already achieve the needed strategy through Tier 1 YAML changes.

The agent SHOULD also:
- Check near-miss stashes (`git stash list`) for combinable ideas
- Read current ARVN margin breakdown to understand where ARVN is falling short
- Consider whether the bottleneck is offensive (not enough COIN control/Patronage)
  or defensive (opponents removing ARVN progress)

## Autonomy Directive

Once the loop begins, run indefinitely. Do NOT ask for permission to continue.
Do NOT stop when easy ideas run out — re-read files, combine near-misses, try
radical alternatives, consult lessons. Read `last-trace.json` during OBSERVE
for game-flow insights. The loop runs until externally interrupted.
